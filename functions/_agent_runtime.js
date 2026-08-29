import { resolveProviderCredentialsForUser } from './_secure_keys.js'

const FREE_PRICING = new Set(['free', 'daily-refresh', 'free-quota'])
const MEMORY_KINDS = new Set(['preference', 'profile', 'instruction', 'project'])
const CHAT_ENDPOINTS = {
  agnes: 'https://apihub.agnes-ai.com/v1/chat/completions',
  alibaba: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  ark: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  baidu: 'https://qianfan.baidubce.com/v2/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  cohere: 'https://api.cohere.com/compatibility/v1/chat/completions',
  deepinfra: 'https://api.deepinfra.com/v1/openai/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  fireworks: 'https://api.fireworks.ai/inference/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  hyperbolic: 'https://api.hyperbolic.xyz/v1/chat/completions',
  minimax: 'https://api.minimaxi.com/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  modelscope: 'https://api-inference.modelscope.cn/v1/chat/completions',
  moonshot: 'https://api.moonshot.cn/v1/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  perplexity: 'https://api.perplexity.ai/chat/completions',
  pollinations: 'https://gen.pollinations.ai/v1/chat/completions',
  sambanova: 'https://api.sambanova.ai/v1/chat/completions',
  scaleway: 'https://api.scaleway.ai/v1/chat/completions',
  siliconflow: 'https://api.siliconflow.cn/v1/chat/completions',
  stepfun: 'https://api.stepfun.com/v1/chat/completions',
  together: 'https://api.together.xyz/v1/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  novita: 'https://api.novita.ai/openai/v1/chat/completions',
  aimlapi: 'https://api.aimlapi.com/v1/chat/completions',
}

function text(value, max = 4_000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function safeJson(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

export function normalizeModels(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  return raw.slice(0, 80).flatMap((item) => {
    const providerId = text(item?.providerId, 60).toLowerCase()
    const apiModel = text(item?.apiModel, 240)
    const pricing = text(item?.pricing, 32)
    if (!CHAT_ENDPOINTS[providerId] || !apiModel || !FREE_PRICING.has(pricing)) return []
    const key = `${providerId}:${apiModel}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{
      id: text(item.id, 240) || key,
      apiModel,
      name: text(item.name, 160) || apiModel,
      providerId,
      provider: text(item.provider, 120) || providerId,
      pricing,
    }]
  })
}

function normalizeAttachments(raw) {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 5).flatMap((item) => {
    const type = text(item?.type, 120).toLowerCase()
    const name = text(item?.name, 180) || '附件'
    if (type.startsWith('image/') && /^data:image\/(?:png|jpeg|webp);base64,/.test(item?.dataUrl || '')) {
      return [{ id: text(item.id, 80), name, type, size: Number(item.size) || 0, dataUrl: item.dataUrl.slice(0, 8_000_000) }]
    }
    const attachmentText = text(item?.text, 20_000)
    return attachmentText ? [{ id: text(item.id, 80), name, type: type || 'text/plain', size: Number(item.size) || 0, text: attachmentText }] : []
  })
}

function responseContent(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) return content.map((item) => typeof item === 'string' ? item : item?.text || '').join('\n').trim()
  return ''
}

function upstreamError(payload, status) {
  return text(payload?.error?.message || payload?.error || payload?.message, 500) || `服务商请求失败（${status}）`
}

function messageContent(content, attachments = []) {
  const images = attachments.filter((item) => item.dataUrl)
  const documents = attachments.filter((item) => item.text)
  const withDocuments = [content, ...documents.map((item) => `\n\n<attachment name="${item.name}">\n${item.text}\n</attachment>`)].join('')
  if (!images.length) return withDocuments
  return [
    { type: 'text', text: withDocuments },
    ...images.map((item) => ({ type: 'image_url', image_url: { url: item.dataUrl } })),
  ]
}

async function modelStats(env, userId) {
  const rows = await env.DB.prepare(`
    SELECT provider_id, model_id, success_count, failure_count, total_latency_ms, quality_score
    FROM agent_model_stats WHERE user_id = ?
  `).bind(userId).all()
  return new Map((rows.results || []).map((row) => [`${row.provider_id}:${row.model_id}`, row]))
}

async function recordModelAttempt(env, userId, model, success, elapsedMs) {
  await env.DB.prepare(`
    INSERT INTO agent_model_stats (
      user_id, provider_id, model_id, success_count, failure_count, total_latency_ms, quality_score, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(user_id, provider_id, model_id) DO UPDATE SET
      success_count = success_count + excluded.success_count,
      failure_count = failure_count + excluded.failure_count,
      total_latency_ms = total_latency_ms + excluded.total_latency_ms,
      updated_at = excluded.updated_at
  `).bind(userId, model.providerId, model.apiModel, success ? 1 : 0, success ? 0 : 1, Math.max(0, elapsedMs), Date.now()).run()
}

export async function orderedConfiguredModels(env, userId, rawModels) {
  const models = normalizeModels(rawModels)
  const stats = await modelStats(env, userId)
  const configured = []
  for (const model of models) {
    const credentials = await resolveProviderCredentialsForUser(env, userId, model.providerId)
    if (credentials.apiKey) configured.push({ ...model, credentials })
  }
  return configured.sort((left, right) => {
    const a = stats.get(`${left.providerId}:${left.apiModel}`) || {}
    const b = stats.get(`${right.providerId}:${right.apiModel}`) || {}
    const score = (row) => {
      const total = (row.success_count || 0) + (row.failure_count || 0)
      const reliability = total ? (row.success_count || 0) / total : 0.5
      const latencyPenalty = total ? Math.min(1, (row.total_latency_ms || 0) / total / 30_000) : 0
      return reliability * 100 + (row.quality_score || 0) * 8 - latencyPenalty * 8
    }
    return score(b) - score(a)
  })
}

export async function callModel(env, userId, model, messages, systemPrompt, signal) {
  const started = Date.now()
  try {
    const response = await fetch(CHAT_ENDPOINTS[model.providerId], {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${model.credentials.apiKey}`,
        'Content-Type': 'application/json',
        ...(model.providerId === 'openrouter' ? { 'HTTP-Referer': 'https://xiaoymodelhub.yzzwnw.asia', 'X-Title': 'XiaoY_ModelHub Agent' } : {}),
      },
      body: JSON.stringify({
        model: model.apiModel,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.35,
        stream: false,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(upstreamError(payload, response.status))
    const content = responseContent(payload)
    if (!content) throw new Error('模型未返回文本内容')
    await recordModelAttempt(env, userId, model, true, Date.now() - started)
    return content
  } catch (error) {
    await recordModelAttempt(env, userId, model, false, Date.now() - started)
    throw error
  }
}

function decodeToolText(value) {
  return String(value || '')
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

function parseToolArgument(value) {
  const decoded = decodeToolText(value)
  return safeJson(decoded, decoded)
}

function parseXmlToolCall(value) {
  const block = value.match(/<tool_call(?:\s[^>]*)?>([\s\S]*?)<\/tool_call>/i)?.[1]
    || value.match(/<function=([a-zA-Z0-9_-]+)>([\s\S]*?)<\/function>/i)?.[0]
  if (!block) return undefined

  const functionMatch = block.match(/<function=([a-zA-Z0-9_-]+)>([\s\S]*?)<\/function>/i)
  const body = functionMatch ? functionMatch[2] : block
  const parsed = safeJson(decodeToolText(body), undefined)
  if (parsed && typeof parsed === 'object') {
    const tool = text(parsed.tool || parsed.name || parsed.function?.name, 80)
    const args = parsed.arguments || parsed.parameters || parsed.function?.arguments || {}
    if (tool) return { type: 'tool', tool, arguments: typeof args === 'string' ? safeJson(args, {}) : args, reason: text(parsed.reason, 300) }
  }

  const argumentsObject = {}
  const pairPattern = /<arg_key>\s*([\s\S]*?)\s*<\/arg_key>\s*<arg_value>\s*([\s\S]*?)\s*<\/arg_value>/gi
  for (const match of body.matchAll(pairPattern)) {
    const key = decodeToolText(match[1])
    if (/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(key)) argumentsObject[key] = parseToolArgument(match[2])
  }
  const parameterPattern = /<parameter\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/parameter>/gi
  for (const match of body.matchAll(parameterPattern)) {
    const key = decodeToolText(match[1])
    if (/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(key)) argumentsObject[key] = parseToolArgument(match[2])
  }

  const withoutArguments = body
    .replace(pairPattern, '')
    .replace(parameterPattern, '')
    .replace(/<[^>]+>/g, '')
    .trim()
  const tool = text(functionMatch?.[1] || withoutArguments.match(/^([a-zA-Z][a-zA-Z0-9_-]{0,79})/)?.[1], 80)
  return tool ? { type: 'tool', tool, arguments: argumentsObject, reason: '模型请求调用工具' } : undefined
}

function parseDecision(value) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = safeJson(cleaned, undefined)
  if (parsed?.type === 'tool' && typeof parsed.tool === 'string') return parsed
  if (parsed?.type === 'final' && typeof parsed.content === 'string') return parsed
  const xmlTool = parseXmlToolCall(cleaned)
  if (xmlTool) return xmlTool
  if (/<\/?(?:tool_call|arg_key|arg_value|tool_result)\b|<function=/i.test(cleaned)) {
    return { type: 'invalid_tool_protocol' }
  }
  return { type: 'final', content: value }
}

async function tavilySearch(env, query) {
  if (!env.TAVILY_API_KEY) throw new Error('服务端尚未配置 Tavily 联网搜索')
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.TAVILY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: text(query, 400), search_depth: 'basic', max_results: 5, include_answer: false, include_raw_content: false }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(text(payload?.detail?.error || payload?.detail || payload?.message, 500) || `联网搜索失败（${response.status}）`)
  return (payload.results || []).slice(0, 5).map((item) => ({
    title: text(item.title, 300), url: text(item.url, 2_000), content: text(item.content, 1_500), score: Number(item.score) || 0,
  })).filter((item) => /^https?:\/\//.test(item.url))
}

async function recallMemories(env, userId, query = '') {
  const words = text(query, 200).split(/\s+/).filter(Boolean).slice(0, 5)
  const where = words.length ? `AND (${words.map(() => 'content LIKE ?').join(' OR ')})` : ''
  const rows = await env.DB.prepare(`
    SELECT id, kind, content, tags_json, importance, updated_at
    FROM agent_memories WHERE user_id = ? ${where}
    ORDER BY importance DESC, updated_at DESC LIMIT 12
  `).bind(userId, ...words.map((word) => `%${word}%`)).all()
  const ids = (rows.results || []).map((row) => row.id)
  if (ids.length) await env.DB.prepare(`UPDATE agent_memories SET last_used_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`).bind(Date.now(), ...ids).run()
  return (rows.results || []).map((row) => ({ ...row, tags: safeJson(row.tags_json, []), tags_json: undefined }))
}

async function saveMemory(env, userId, args) {
  const content = text(args?.content, 1_000)
  if (!content || /(?:api[_ -]?key|password|密码|密钥|token)\s*[:：]/i.test(content)) throw new Error('记忆为空或疑似包含敏感凭据')
  const kind = MEMORY_KINDS.has(args?.kind) ? args.kind : 'preference'
  const tags = Array.isArray(args?.tags) ? args.tags.map((tag) => text(tag, 30)).filter(Boolean).slice(0, 8) : []
  const importance = Math.max(1, Math.min(5, Number(args?.importance) || 3))
  const now = Date.now()
  const existing = await env.DB.prepare('SELECT id FROM agent_memories WHERE user_id = ? AND content = ?').bind(userId, content).first()
  const id = existing?.id || crypto.randomUUID()
  await env.DB.prepare(`
    INSERT INTO agent_memories (id, user_id, kind, content, tags_json, importance, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, tags_json = excluded.tags_json,
      importance = excluded.importance, updated_at = excluded.updated_at
  `).bind(id, userId, kind, content, JSON.stringify(tags), importance, now, now).run()
  return { id, kind, content, tags, importance }
}

function cronFieldMatches(field, value) {
  return field.split(',').some((part) => {
    if (part === '*') return true
    if (/^\*\/\d+$/.test(part)) return value % Number(part.slice(2)) === 0
    if (/^\d+$/.test(part)) return value === Number(part)
    const range = part.match(/^(\d+)-(\d+)$/)
    return range ? value >= Number(range[1]) && value <= Number(range[2]) : false
  })
}

function validateCron(expression) {
  const fields = text(expression, 100).split(/\s+/)
  if (fields.length !== 5 || fields.some((field) => !/^(?:\*|\*\/\d+|\d+|\d+-\d+)(?:,(?:\*|\*\/\d+|\d+|\d+-\d+))*$/.test(field))) {
    throw new Error('Cron 表达式必须是安全的 5 段格式')
  }
  return fields.join(' ')
}

function nextCronAt(expression, after = Date.now()) {
  const fields = validateCron(expression).split(' ')
  const cursor = new Date(after - (after % 60_000) + 60_000)
  for (let index = 0; index < 43_200; index += 1) {
    if (cronFieldMatches(fields[0], cursor.getUTCMinutes())
      && cronFieldMatches(fields[1], cursor.getUTCHours())
      && cronFieldMatches(fields[2], cursor.getUTCDate())
      && cronFieldMatches(fields[3], cursor.getUTCMonth() + 1)
      && cronFieldMatches(fields[4], cursor.getUTCDay())) return cursor.getTime()
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1)
  }
  throw new Error('未来 30 天内没有匹配的 Cron 执行时间')
}

async function createTask(env, userId, args, models, mode) {
  const title = text(args?.title, 160)
  const prompt = text(args?.prompt, 8_000)
  const scheduleType = ['once', 'interval', 'cron'].includes(args?.scheduleType) ? args.scheduleType : 'once'
  if (!title || !prompt) throw new Error('任务标题和执行内容不能为空')
  const now = Date.now()
  let scheduledAt = Number(args?.scheduledAt) || null
  let intervalMinutes = Number(args?.intervalMinutes) || null
  let cronExpression = null
  let nextRunAt
  if (scheduleType === 'once') {
    if (!scheduledAt || scheduledAt < now + 30_000) throw new Error('单次任务时间必须至少在 30 秒之后')
    nextRunAt = scheduledAt
  } else if (scheduleType === 'interval') {
    intervalMinutes = Math.max(5, Math.min(43_200, Math.round(intervalMinutes || 0)))
    nextRunAt = now + intervalMinutes * 60_000
  } else {
    cronExpression = validateCron(args?.cronExpression)
    nextRunAt = nextCronAt(cronExpression, now)
  }
  const id = crypto.randomUUID()
  await env.DB.prepare(`
    INSERT INTO agent_tasks (
      id, user_id, title, prompt, mode, models_json, schedule_type, scheduled_at,
      interval_minutes, cron_expression, status, next_run_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).bind(id, userId, title, prompt, text(mode, 20) || 'chat', JSON.stringify(normalizeModels(models)), scheduleType, scheduledAt, intervalMinutes, cronExpression, nextRunAt, now, now).run()
  return { id, title, scheduleType, nextRunAt }
}

async function listTasks(env, userId) {
  const rows = await env.DB.prepare(`
    SELECT id, title, prompt, mode, schedule_type, scheduled_at, interval_minutes,
      cron_expression, status, result, error, last_run_at, next_run_at, created_at, updated_at
    FROM agent_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).bind(userId).all()
  return rows.results || []
}

async function executeTool(env, userId, decision, context) {
  const args = decision.arguments && typeof decision.arguments === 'object' ? decision.arguments : {}
  switch (decision.tool) {
    case 'web_search': {
      const results = await tavilySearch(env, args.query || context.userPrompt)
      context.sources.push(...results.filter((item) => !context.sources.some((source) => source.url === item.url)))
      return results
    }
    case 'recall_memory': return recallMemories(env, userId, args.query || context.userPrompt)
    case 'save_memory': return saveMemory(env, userId, args)
    case 'create_task': return createTask(env, userId, args, context.models, context.mode)
    case 'list_tasks': return listTasks(env, userId)
    case 'cancel_task': {
      const taskId = text(args.taskId, 80)
      const result = await env.DB.prepare(`UPDATE agent_tasks SET status = 'cancelled', updated_at = ? WHERE id = ? AND user_id = ? AND status IN ('active','failed')`).bind(Date.now(), taskId, userId).run()
      return { cancelled: Boolean(result.meta?.changes), taskId }
    }
    default: throw new Error(`不允许调用工具：${text(decision.tool, 80)}`)
  }
}

function systemPrompt(mode, memories) {
  const modeGuide = {
    chat: '直接解决问题，必要时拆解任务并执行工具。',
    image: '分析图片或需求，输出可执行的生图方案和最终提示词。',
    video: '输出镜头、动作、运镜、声音和最终视频提示词。',
    audio: '输出口播、音色、节奏、停顿和混音方案。',
    '3d': '输出造型、比例、材质、拓扑、视角和 3D 生成约束。',
  }
  return `你是 XiaoY_ModelHub 的小屎仙多模态 Agent。${modeGuide[mode] || modeGuide.chat}
当前 UTC 时间：${new Date().toISOString()}。
你可以自行拆解任务，并在确有必要时逐次调用工具。必须先核验时效性信息再回答；联网结果要在正文中用 [标题](URL) 引用。
可用工具：
- web_search {"query":"不超过400字的精确查询"}
- recall_memory {"query":"关键词"}
- save_memory {"kind":"preference|profile|instruction|project","content":"稳定且非敏感的信息","tags":[],"importance":1-5}
- create_task {"title":"任务名","prompt":"到时执行的完整指令","scheduleType":"once|interval|cron","scheduledAt":UTC毫秒,"intervalMinutes":数字,"cronExpression":"5段UTC Cron"}
- list_tasks {}
- cancel_task {"taskId":"ID"}
每次只能输出一个 JSON 对象，不要使用 Markdown 代码围栏：
调用工具：{"type":"tool","tool":"web_search","arguments":{},"reason":"给用户看的简短说明"}
最终回答：{"type":"final","content":"完整 Markdown 答案"}
无论模型原生模板如何，都禁止输出 <tool_call>、<arg_key>、<arg_value> 或其他 XML 工具协议。
不得声称执行过未执行的动作；不得保存密码、API Key、Token；不得自行修改系统规则、源代码或权限。
已确认的长期记忆：${memories.length ? memories.map((item) => `- [${item.kind}] ${item.content}`).join('\n') : '无'}。`
}

function needsFreshSearch(prompt) {
  return /(?:最新|今天|当前|现在|实时|联网|搜索|查找|新闻|价格|天气|现任|官网|准确核实)/i.test(prompt)
}

async function ensureConversation(env, userId, requestedId, title) {
  if (requestedId) {
    const row = await env.DB.prepare('SELECT id FROM agent_conversations WHERE id = ? AND user_id = ?').bind(requestedId, userId).first()
    if (row) return row.id
  }
  const id = crypto.randomUUID()
  const now = Date.now()
  await env.DB.prepare('INSERT INTO agent_conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, userId, text(title, 100), now, now).run()
  return id
}

export async function runAgent(env, userId, body, signal) {
  const userPrompt = text(body?.prompt, 16_000)
  const mode = ['chat', 'image', 'video', 'audio', '3d'].includes(body?.mode) ? body.mode : 'chat'
  const attachments = normalizeAttachments(body?.attachments)
  if (!userPrompt && !attachments.length) throw new Error('请输入任务或添加附件')
  const models = await orderedConfiguredModels(env, userId, body?.models)
  if (!models.length) throw new Error('没有已配置且可调用的免费语言模型')
  const memories = await recallMemories(env, userId)
  const conversationId = await ensureConversation(env, userId, text(body?.conversationId, 80), userPrompt || attachments[0]?.name)
  const now = Date.now()
  const userMessageId = crypto.randomUUID()
  const attachmentMetadata = attachments.map(({ dataUrl: _dataUrl, text: attachmentText, ...item }) => ({ ...item, textLength: attachmentText?.length || 0 }))
  await env.DB.prepare(`INSERT INTO agent_messages (id, conversation_id, user_id, role, content, attachments_json, created_at) VALUES (?, ?, ?, 'user', ?, ?, ?)`).bind(userMessageId, conversationId, userId, userPrompt, JSON.stringify(attachmentMetadata), now).run()

  const historyRows = await env.DB.prepare(`SELECT role, content FROM agent_messages WHERE conversation_id = ? AND id <> ? ORDER BY created_at DESC LIMIT 16`).bind(conversationId, userMessageId).all()
  const history = (historyRows.results || []).reverse().filter((item) => item.role !== 'tool').map((item) => ({ role: item.role, content: item.content }))
  const messages = [...history, { role: 'user', content: messageContent(userPrompt, attachments) }]
  const trace = []
  const sources = []
  const context = { userPrompt, mode, models, sources }
  let modelIndex = 0
  let lastError = ''

  if (needsFreshSearch(userPrompt) && env.TAVILY_API_KEY) {
    const started = Date.now()
    try {
      const result = await executeTool(env, userId, { tool: 'web_search', arguments: { query: userPrompt } }, context)
      trace.push({ tool: 'web_search', reason: '问题包含时效性信息，先联网核验', status: 'success', elapsedMs: Date.now() - started })
      messages.push({ role: 'assistant', content: JSON.stringify({ type: 'tool', tool: 'web_search', arguments: { query: userPrompt } }) })
      messages.push({ role: 'user', content: `<tool_result name="web_search">${JSON.stringify(result)}</tool_result>` })
    } catch (error) {
      trace.push({ tool: 'web_search', reason: '问题包含时效性信息，先联网核验', status: 'failed', error: error instanceof Error ? error.message : '搜索失败' })
    }
  }

  let finalContent = ''
  let selectedModel
  for (let step = 0; step < 6 && !finalContent; step += 1) {
    let raw = ''
    let usedModel
    for (let attempts = 0; attempts < models.length; attempts += 1) {
      const model = models[(modelIndex + attempts) % models.length]
      try {
        raw = await callModel(env, userId, model, messages, systemPrompt(mode, memories), signal)
        usedModel = model
        modelIndex = (modelIndex + attempts) % models.length
        break
      } catch (error) {
        lastError = error instanceof Error ? error.message : '模型调用失败'
        trace.push({ tool: 'model', model: model.name, provider: model.provider, status: 'failed', error: lastError })
      }
    }
    if (!usedModel) throw new Error(`${lastError || '模型调用失败'}。已轮询 ${models.length} 个免费模型。`)
    selectedModel = usedModel
    const decision = parseDecision(raw)
    if (decision.type === 'invalid_tool_protocol') {
      trace.push({ tool: 'tool_protocol', reason: '模型返回了无法解析的内部工具协议，已隐藏并要求重试', status: 'failed', error: 'invalid_tool_protocol' })
      messages.push({ role: 'assistant', content: '[内部工具协议格式无效，未向用户展示]' })
      messages.push({ role: 'user', content: '请严格按系统要求只输出一个 JSON 对象，重新决定调用工具或给出最终回答。' })
      continue
    }
    if (decision.type === 'final') {
      finalContent = text(decision.content, 100_000)
      break
    }
    const started = Date.now()
    try {
      const result = await executeTool(env, userId, decision, context)
      trace.push({ tool: decision.tool, reason: text(decision.reason, 300), status: 'success', elapsedMs: Date.now() - started })
      messages.push({ role: 'assistant', content: JSON.stringify(decision) })
      messages.push({ role: 'user', content: `<tool_result name="${decision.tool}">${JSON.stringify(result)}</tool_result>` })
    } catch (error) {
      const message = error instanceof Error ? error.message : '工具执行失败'
      trace.push({ tool: decision.tool, reason: text(decision.reason, 300), status: 'failed', error: message, elapsedMs: Date.now() - started })
      messages.push({ role: 'assistant', content: JSON.stringify(decision) })
      messages.push({ role: 'user', content: `<tool_result name="${decision.tool}" error="true">${message}</tool_result>` })
    }
  }
  if (!finalContent) finalContent = '任务已达到本轮工具调用上限。请缩小范围后重试。'
  const assistantMessageId = crypto.randomUUID()
  await env.DB.prepare(`
    INSERT INTO agent_messages (
      id, conversation_id, user_id, role, content, provider_id, model_id, trace_json, sources_json, created_at
    ) VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?)
  `).bind(assistantMessageId, conversationId, userId, finalContent, selectedModel?.providerId || null, selectedModel?.apiModel || null, JSON.stringify(trace), JSON.stringify(sources), Date.now()).run()
  await env.DB.prepare('UPDATE agent_conversations SET updated_at = ? WHERE id = ?').bind(Date.now(), conversationId).run()
  return {
    conversationId,
    userMessageId,
    message: { id: assistantMessageId, content: finalContent, createdAt: Date.now() },
    model: selectedModel ? { id: selectedModel.id, apiModel: selectedModel.apiModel, name: selectedModel.name, provider: selectedModel.provider, providerId: selectedModel.providerId, pricing: selectedModel.pricing } : null,
    trace,
    sources,
  }
}

export async function agentState(env, userId) {
  const conversation = await env.DB.prepare('SELECT id, title, updated_at FROM agent_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1').bind(userId).first()
  let messages = []
  if (conversation) {
    const rows = await env.DB.prepare(`SELECT id, role, content, attachments_json, provider_id, model_id, trace_json, sources_json, created_at FROM agent_messages WHERE conversation_id = ? AND role <> 'tool' ORDER BY created_at DESC LIMIT 30`).bind(conversation.id).all()
    messages = (rows.results || []).reverse().map((row) => ({
      id: row.id, role: row.role, content: row.content, attachments: safeJson(row.attachments_json, []),
      providerId: row.provider_id, modelId: row.model_id, trace: safeJson(row.trace_json, []), sources: safeJson(row.sources_json, []), createdAt: row.created_at,
    }))
  }
  return { conversation, messages, memories: await recallMemories(env, userId), tasks: await listTasks(env, userId) }
}

export async function deleteConversation(env, userId, conversationId) {
  await env.DB.prepare('DELETE FROM agent_conversations WHERE id = ? AND user_id = ?').bind(conversationId, userId).run()
}

export async function deleteMemory(env, userId, memoryId) {
  await env.DB.prepare('DELETE FROM agent_memories WHERE id = ? AND user_id = ?').bind(memoryId, userId).run()
}

export async function cancelTask(env, userId, taskId) {
  await env.DB.prepare(`UPDATE agent_tasks SET status = 'cancelled', updated_at = ? WHERE id = ? AND user_id = ?`).bind(Date.now(), taskId, userId).run()
}

export async function saveFeedback(env, userId, body) {
  const messageId = text(body?.messageId, 80)
  const rating = Number(body?.rating) === 1 ? 1 : Number(body?.rating) === -1 ? -1 : 0
  if (!messageId || !rating) throw new Error('反馈参数无效')
  const message = await env.DB.prepare(`SELECT provider_id, model_id FROM agent_messages WHERE id = ? AND user_id = ? AND role = 'assistant'`).bind(messageId, userId).first()
  if (!message) throw new Error('消息不存在')
  await env.DB.prepare(`
    INSERT INTO agent_feedback (id, user_id, message_id, rating, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, message_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, created_at = excluded.created_at
  `).bind(crypto.randomUUID(), userId, messageId, rating, text(body?.comment, 500), Date.now()).run()
  if (message.provider_id && message.model_id) {
    await env.DB.prepare(`UPDATE agent_model_stats SET quality_score = quality_score + ?, updated_at = ? WHERE user_id = ? AND provider_id = ? AND model_id = ?`).bind(rating, Date.now(), userId, message.provider_id, message.model_id).run()
  }
  return { ok: true }
}

export async function executeDueAgentTasks(env) {
  const due = await env.DB.prepare(`SELECT * FROM agent_tasks WHERE status = 'active' AND next_run_at <= ? ORDER BY next_run_at LIMIT 20`).bind(Date.now()).all()
  const results = []
  for (const task of due.results || []) {
    const claim = await env.DB.prepare(`UPDATE agent_tasks SET status = 'running', updated_at = ? WHERE id = ? AND status = 'active'`).bind(Date.now(), task.id).run()
    if (!claim.meta?.changes) continue
    try {
      const output = await runAgent(env, task.user_id, { prompt: task.prompt, mode: task.mode, models: safeJson(task.models_json, []) })
      const now = Date.now()
      const nextRunAt = task.schedule_type === 'interval'
        ? now + task.interval_minutes * 60_000
        : task.schedule_type === 'cron' ? nextCronAt(task.cron_expression, now) : null
      await env.DB.prepare(`UPDATE agent_tasks SET status = ?, result = ?, error = NULL, last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?`).bind(nextRunAt ? 'active' : 'completed', output.message.content.slice(0, 100_000), now, nextRunAt, now, task.id).run()
      results.push({ id: task.id, status: 'success' })
    } catch (error) {
      const now = Date.now()
      const retryAt = task.schedule_type === 'once' ? null : now + 15 * 60_000
      await env.DB.prepare(`UPDATE agent_tasks SET status = ?, error = ?, last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?`).bind(retryAt ? 'active' : 'failed', text(error instanceof Error ? error.message : '执行失败', 2_000), now, retryAt, now, task.id).run()
      results.push({ id: task.id, status: 'failed' })
    }
  }
  return results
}
