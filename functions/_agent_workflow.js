import { callModel, normalizeModels, orderedConfiguredModels } from './_agent_runtime.js'
import { injectedSkillPrompt, publicSkillRegistry, skillsForStage } from './_agent_skill_registry.js'

const STAGES = ['moodboard', 'script', 'character', 'scene', 'storyboard', 'image', 'audio', 'video', 'editing']
const CLIENT_STAGES = new Set(['image', 'audio', 'video'])
const STAGE_LABELS = {
  moodboard: '需求与情绪板', script: '剧本', character: '角色设定', scene: '场景美术',
  storyboard: '分镜', image: '关键帧图片', audio: '配音', video: '视频镜头', editing: '剪辑决定表',
}

function text(value, max = 100_000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function safeJson(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

function stripFence(value) {
  return text(value).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

function parseReview(value) {
  const parsed = safeJson(stripFence(value), {})
  const score = Math.max(0, Math.min(100, Number(parsed.score) || 0))
  return {
    pass: parsed.pass === true && score >= 80,
    score,
    summary: text(parsed.summary, 1_000),
    issues: Array.isArray(parsed.issues) ? parsed.issues.map((item) => text(item, 500)).filter(Boolean).slice(0, 12) : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map((item) => text(item, 500)).filter(Boolean).slice(0, 12) : [],
  }
}

export function validateClientArtifact(stage, output) {
  const value = output && typeof output === 'object' ? output : {}
  const issues = []
  if (stage === 'image') {
    const assets = Array.isArray(value.assets) ? value.assets : []
    if (!assets.length || assets.some((asset) => !text(asset?.url, 8_000))) issues.push('图片任务没有返回可用的作品地址')
  } else if (stage === 'audio') {
    if (value.generated !== true || Number(value.bytes) < 100) issues.push('语音任务没有返回有效音频数据')
    if (!text(value.modelId, 300)) issues.push('语音任务缺少模型标识')
  } else if (stage === 'video') {
    if (!text(value.url, 8_000) && !text(value.taskId, 300)) issues.push('视频任务没有返回作品地址或远程任务标识')
  } else {
    issues.push('不支持的页面产物类型')
  }
  return { pass: issues.length === 0, issues }
}

async function event(env, workflowId, stepId, eventType, payload = {}) {
  await env.DB.prepare('INSERT INTO agent_workflow_events (id, workflow_id, step_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), workflowId, stepId || null, eventType, JSON.stringify(payload), Date.now()).run()
}

function publicStep(row) {
  return {
    id: row.id, workflowId: row.workflow_id, stage: row.stage, label: STAGE_LABELS[row.stage] || row.stage,
    version: row.version, parentStepId: row.parent_step_id, status: row.status,
    skills: safeJson(row.skill_ids_json, []), input: safeJson(row.input_json, {}),
    output: safeJson(row.output_json, {}), review: safeJson(row.review_json, {}),
    command: safeJson(row.command_json, {}), attempt: row.attempt,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

async function workflowState(env, userId, workflowId) {
  const workflow = await env.DB.prepare('SELECT * FROM agent_workflows WHERE id = ? AND user_id = ?').bind(workflowId, userId).first()
  if (!workflow) throw new Error('生产工作流不存在或无权访问')
  const rows = await env.DB.prepare('SELECT * FROM agent_workflow_steps WHERE workflow_id = ? AND user_id = ? ORDER BY created_at ASC, version ASC').bind(workflowId, userId).all()
  const steps = (rows.results || []).map(publicStep)
  return {
    id: workflow.id, title: workflow.title, brief: workflow.brief, status: workflow.status,
    currentStage: workflow.current_stage, currentStageLabel: STAGE_LABELS[workflow.current_stage] || workflow.current_stage,
    autoApprove: Boolean(workflow.auto_approve), aspectRatio: workflow.aspect_ratio, visualStyle: workflow.visual_style,
    stages: STAGES.map((stage) => ({ id: stage, label: STAGE_LABELS[stage] })),
    skills: publicSkillRegistry(), steps, createdAt: workflow.created_at, updatedAt: workflow.updated_at,
    pendingCommand: [...steps].reverse().find((step) => step.status === 'waiting_client')?.command || null,
  }
}

export async function listProductionWorkflows(env, userId) {
  const rows = await env.DB.prepare('SELECT id FROM agent_workflows WHERE user_id = ? ORDER BY updated_at DESC LIMIT 12').bind(userId).all()
  const states = []
  for (const row of rows.results || []) states.push(await workflowState(env, userId, row.id))
  return states
}

export async function getProductionWorkflow(env, userId, workflowId) {
  return workflowState(env, userId, workflowId)
}

export async function createProductionWorkflow(env, userId, body) {
  const brief = text(body?.brief, 16_000)
  if (!brief) throw new Error('请先说明要制作的内容')
  const models = normalizeModels(body?.models)
  if (!models.length) throw new Error('没有可用于工作流的免费语言模型')
  const now = Date.now()
  const id = crypto.randomUUID()
  const title = text(body?.title, 120) || brief.slice(0, 40)
  const aspectRatio = ['16:9', '9:16', '1:1', '4:3', '3:4'].includes(body?.aspectRatio) ? body.aspectRatio : '16:9'
  const autoApprove = body?.autoApprove === true
  await env.DB.prepare(`INSERT INTO agent_workflows
    (id, user_id, title, brief, status, current_stage, auto_approve, aspect_ratio, visual_style, models_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'running', 'moodboard', ?, ?, ?, ?, ?, ?)`)
    .bind(id, userId, title, brief, autoApprove ? 1 : 0, aspectRatio, text(body?.visualStyle, 500), JSON.stringify(models), now, now).run()
  await event(env, id, null, 'workflow_created', { autoApprove, aspectRatio, skills: publicSkillRegistry().map((item) => item.id) })
  return workflowState(env, userId, id)
}

function stageTask(stage, workflow, context) {
  const common = `项目需求：${workflow.brief}\n画幅：${workflow.aspect_ratio}\n视觉风格：${workflow.visual_style || '根据需求确定'}\n\n已有成果：\n${context || '无'}`
  const tasks = {
    moodboard: '输出可执行的文字情绪板，包括目标、受众、媒介、核心情绪、视觉语言、色彩、材质、画幅、禁用方向和验收标准。',
    script: '基于情绪板写出可制作的完整短片剧本，包含人物、场次、节拍、动作、对白、声音和预计时长。',
    character: '输出所有主要角色的固定 DNA、服装道具、三视图/表情设定和可直接用于生图的中文提示词与负面词。',
    scene: '输出主要场景的叙事功能、空间、材质、年代、色彩、光线、镜头方向，以及可直接用于场景概念图的提示词与负面词。',
    storyboard: '把剧本拆成可生成可剪辑的镜头表；每镜包含编号、时长、景别、机位、画面、动作、运镜、对白/声音、承接关系和关键帧提示词。',
    image: '从分镜选择最重要的首个关键帧，输出一条完整、可直接生图的提示词。不要解释，只输出提示词。',
    audio: '基于剧本输出首个可制作段落的配音正文。不要标题、表格或解释，只输出要朗读的台词/旁白。',
    video: '基于分镜与已有关键帧，输出首个不超过 15 秒的 Seedance 视频提示词，严格使用六字段与固定约束。',
    editing: '基于全部已有成果输出剪辑决定表（EDL）：镜头顺序、预计入出点、画面来源、声音来源、转场、字幕、节奏、缺失素材、导出设置与最终质检。明确哪些镜头仍需补做。',
  }
  return `${common}\n\n当前任务：${tasks[stage]}`
}

function reviewerPrompt(stage) {
  const rubrics = skillsForStage(stage).map((skill) => skill.review).join('；') || '检查完整性、准确性与可执行性。'
  return `你是独立制片审查员。只输出 JSON：{"pass":true,"score":0-100,"summary":"...","issues":[],"suggestions":[]}。80 分以上且没有阻断问题才可 pass。审查标准：${rubrics}`
}

async function previousContext(env, workflowId) {
  const rows = await env.DB.prepare(`SELECT stage, output_json, review_json FROM agent_workflow_steps
    WHERE workflow_id = ? AND status IN ('completed','approved') ORDER BY created_at ASC`).bind(workflowId).all()
  return (rows.results || []).map((row) => {
    const output = safeJson(row.output_json, {})
    const review = safeJson(row.review_json, {})
    return `## ${STAGE_LABELS[row.stage] || row.stage}\n${text(output.content || output.url || JSON.stringify(output), 12_000)}\n审查：${review.score ?? '-'} / ${review.summary || ''}`
  }).join('\n\n').slice(-60_000)
}

async function latestStageVersion(env, workflowId, stage) {
  const row = await env.DB.prepare('SELECT MAX(version) AS version FROM agent_workflow_steps WHERE workflow_id = ? AND stage = ?').bind(workflowId, stage).first()
  return (Number(row?.version) || 0) + 1
}

async function runTextStage(env, userId, workflow, stage, signal) {
  const models = await orderedConfiguredModels(env, userId, safeJson(workflow.models_json, []))
  if (!models.length) throw new Error('当前没有已配置并可调用的免费语言模型')
  const context = await previousContext(env, workflow.id)
  const skillPrompt = injectedSkillPrompt(stage)
  const task = stageTask(stage, workflow, context)
  const attempts = []
  const routedCall = async (messages, prompt, preferredIndex = 0) => {
    let lastError
    for (let offset = 0; offset < models.length; offset += 1) {
      const model = models[(preferredIndex + offset) % models.length]
      try {
        const value = await callModel(env, userId, model, messages, prompt, signal)
        attempts.push({ modelId: model.id, provider: model.provider, status: 'success' })
        return { value, model }
      } catch (error) {
        lastError = error
        attempts.push({ modelId: model.id, provider: model.provider, status: 'failed', error: error instanceof Error ? error.message : '模型调用失败' })
      }
    }
    throw lastError || new Error('所有免费模型均调用失败')
  }
  let generated = await routedCall([{ role: 'user', content: task }], `你是 XiaoY_ModelHub 影视生产 Agent。当前只完成一个阶段。\n\n${skillPrompt}`)
  let content = generated.value
  let reviewed = await routedCall([{ role: 'user', content: `阶段：${STAGE_LABELS[stage]}\n\n待审成果：\n${content}` }], reviewerPrompt(stage), Math.min(1, models.length - 1))
  let review = parseReview(reviewed.value)
  let attempt = 1
  if (!review.pass) {
    attempt = 2
    generated = await routedCall([{ role: 'user', content: `${task}\n\n上一版审查未通过：\n${JSON.stringify(review)}\n\n请完整重写并解决全部阻断问题。` }], `你是 XiaoY_ModelHub 影视生产 Agent。\n\n${skillPrompt}`)
    content = generated.value
    reviewed = await routedCall([{ role: 'user', content: `阶段：${STAGE_LABELS[stage]}\n\n修订成果：\n${content}` }], reviewerPrompt(stage), Math.min(1, models.length - 1))
    review = { ...parseReview(reviewed.value), repaired: true }
  }
  return { content, review, attempt, attempts, model: { id: generated.model.id, name: generated.model.name, provider: generated.model.provider } }
}

function clientCommand(workflow, stepId, stage, content) {
  const base = { id: crypto.randomUUID(), workflowId: workflow.id, stepId, kind: stage, label: STAGE_LABELS[stage] }
  if (stage === 'image') return { ...base, payload: { prompt: text(content, 12_000), ratio: workflow.aspect_ratio, count: 1 } }
  if (stage === 'audio') return { ...base, payload: { text: text(content, 8_000) } }
  return { ...base, payload: { prompt: text(content, 16_000), ratio: workflow.aspect_ratio, duration: 15 } }
}

export async function advanceProductionWorkflow(env, userId, workflowId, signal) {
  const workflow = await env.DB.prepare('SELECT * FROM agent_workflows WHERE id = ? AND user_id = ?').bind(workflowId, userId).first()
  if (!workflow) throw new Error('生产工作流不存在或无权访问')
  if (workflow.status !== 'running') return workflowState(env, userId, workflowId)
  const pending = await env.DB.prepare("SELECT id FROM agent_workflow_steps WHERE workflow_id = ? AND status IN ('waiting_client','waiting_approval') ORDER BY created_at DESC LIMIT 1").bind(workflowId).first()
  if (pending) return workflowState(env, userId, workflowId)
  const acquired = await env.DB.prepare("UPDATE agent_workflows SET status = 'advancing', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'running'")
    .bind(Date.now(), workflowId, userId).run()
  if (!acquired.meta?.changes) return workflowState(env, userId, workflowId)
  const stage = workflow.current_stage
  const stageIndex = STAGES.indexOf(stage)
  if (stageIndex < 0) throw new Error('工作流阶段无效')
  const now = Date.now()
  const stepId = crypto.randomUUID()
  const version = await latestStageVersion(env, workflowId, stage)
  const parent = await env.DB.prepare('SELECT id FROM agent_workflow_steps WHERE workflow_id = ? AND stage = ? ORDER BY version DESC LIMIT 1').bind(workflowId, stage).first()
  await env.DB.prepare(`INSERT INTO agent_workflow_steps
    (id, workflow_id, user_id, stage, version, parent_step_id, status, skill_ids_json, input_json, output_json, review_json, command_json, attempt, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, '{}', '{}', '{}', 1, ?, ?)`)
    .bind(stepId, workflowId, userId, stage, version, parent?.id || null, JSON.stringify(skillsForStage(stage).map((item) => item.id)), JSON.stringify({ brief: workflow.brief }), now, now).run()
  await event(env, workflowId, stepId, 'stage_started', { stage, version })
  try {
    const result = await runTextStage(env, userId, workflow, stage, signal)
    const command = CLIENT_STAGES.has(stage) ? clientCommand(workflow, stepId, stage, result.content) : {}
    const status = CLIENT_STAGES.has(stage)
      ? 'waiting_client'
      : (stage === 'moodboard' && !workflow.auto_approve ? 'waiting_approval' : (result.review.pass ? 'completed' : 'needs_attention'))
    await env.DB.prepare('UPDATE agent_workflow_steps SET status = ?, output_json = ?, review_json = ?, command_json = ?, attempt = ?, updated_at = ? WHERE id = ?')
      .bind(status, JSON.stringify({ content: result.content, model: result.model, routingAttempts: result.attempts }), JSON.stringify(result.review), JSON.stringify(command), result.attempt, Date.now(), stepId).run()
    await event(env, workflowId, stepId, 'stage_reviewed', { stage, status, review: result.review })
    if ((status === 'needs_attention' || stage === 'moodboard') && !workflow.auto_approve) {
      await env.DB.prepare("UPDATE agent_workflows SET status = 'waiting_approval', updated_at = ? WHERE id = ?").bind(Date.now(), workflowId).run()
    } else if (!CLIENT_STAGES.has(stage)) {
      const next = STAGES[stageIndex + 1]
      if (next) await env.DB.prepare("UPDATE agent_workflows SET current_stage = ?, status = 'running', updated_at = ? WHERE id = ?").bind(next, Date.now(), workflowId).run()
      else await env.DB.prepare("UPDATE agent_workflows SET status = 'completed', updated_at = ? WHERE id = ?").bind(Date.now(), workflowId).run()
    } else {
      await env.DB.prepare("UPDATE agent_workflows SET status = 'waiting_client', updated_at = ? WHERE id = ?").bind(Date.now(), workflowId).run()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '阶段执行失败'
    await env.DB.prepare("UPDATE agent_workflow_steps SET status = 'failed', review_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify({ pass: false, score: 0, summary: message, issues: [message] }), Date.now(), stepId).run()
    await env.DB.prepare("UPDATE agent_workflows SET status = 'failed', updated_at = ? WHERE id = ?").bind(Date.now(), workflowId).run()
    await event(env, workflowId, stepId, 'stage_failed', { stage, error: message })
    throw error
  }
  return workflowState(env, userId, workflowId)
}

export async function reportProductionCommand(env, userId, workflowId, body) {
  const workflow = await env.DB.prepare('SELECT * FROM agent_workflows WHERE id = ? AND user_id = ?').bind(workflowId, userId).first()
  if (!workflow) throw new Error('生产工作流不存在或无权访问')
  const stepId = text(body?.stepId, 80)
  const commandId = text(body?.commandId, 80)
  const step = await env.DB.prepare("SELECT * FROM agent_workflow_steps WHERE id = ? AND workflow_id = ? AND user_id = ? AND status = 'waiting_client'").bind(stepId, workflowId, userId).first()
  if (!step) {
    const existing = await env.DB.prepare("SELECT status, command_json FROM agent_workflow_steps WHERE id = ? AND workflow_id = ? AND user_id = ?").bind(stepId, workflowId, userId).first()
    const existingCommand = safeJson(existing?.command_json, {})
    if (existing && existingCommand.id === commandId && ['completed', 'failed'].includes(existing.status)) return workflowState(env, userId, workflowId)
    throw new Error('页面命令已完成、已回退或不存在')
  }
  const command = safeJson(step.command_json, {})
  if (!commandId || command.id !== commandId) throw new Error('页面命令标识不匹配')
  const ok = body?.ok === true
  const output = body?.output && typeof body.output === 'object' ? body.output : {}
  const error = text(body?.error, 1_000)
  const artifactValidation = ok ? validateClientArtifact(step.stage, output) : { pass: false, issues: [error || '页面生成命令失败'] }
  const accepted = ok && artifactValidation.pass
  const review = accepted
    ? { pass: true, score: 85, summary: '页面生成命令执行成功，已校验产物地址、数据大小和任务元数据。', issues: [], suggestions: ['进入剪辑阶段后继续检查跨素材视听一致性。'], automated: true }
    : { pass: false, score: 0, summary: error || artifactValidation.issues.join('；') || '页面生成命令失败', issues: artifactValidation.issues, suggestions: ['修复模型配置或参数后重试。'], automated: true }
  await env.DB.prepare('UPDATE agent_workflow_steps SET status = ?, output_json = ?, review_json = ?, updated_at = ? WHERE id = ?')
    .bind(accepted ? 'completed' : 'failed', JSON.stringify({ ...safeJson(step.output_json, {}), artifact: output }), JSON.stringify(review), Date.now(), stepId).run()
  await event(env, workflowId, stepId, accepted ? 'client_command_completed' : 'client_command_failed', { commandId, output, error, validation: artifactValidation })
  if (accepted) {
    const index = STAGES.indexOf(step.stage)
    const next = STAGES[index + 1]
    await env.DB.prepare("UPDATE agent_workflows SET current_stage = ?, status = ?, updated_at = ? WHERE id = ?")
      .bind(next || step.stage, next ? 'running' : 'completed', Date.now(), workflowId).run()
  } else {
    await env.DB.prepare("UPDATE agent_workflows SET status = 'failed', updated_at = ? WHERE id = ?").bind(Date.now(), workflowId).run()
  }
  return workflowState(env, userId, workflowId)
}

export async function approveProductionWorkflow(env, userId, workflowId) {
  const workflow = await env.DB.prepare('SELECT id FROM agent_workflows WHERE id = ? AND user_id = ?').bind(workflowId, userId).first()
  if (!workflow) throw new Error('生产工作流不存在或无权访问')
  const step = await env.DB.prepare("SELECT id, stage FROM agent_workflow_steps WHERE workflow_id = ? AND status IN ('needs_attention','waiting_approval') ORDER BY created_at DESC LIMIT 1").bind(workflowId).first()
  if (step) {
    await env.DB.prepare("UPDATE agent_workflow_steps SET status = 'approved', updated_at = ? WHERE id = ?").bind(Date.now(), step.id).run()
    const next = STAGES[STAGES.indexOf(step.stage) + 1]
    await env.DB.prepare("UPDATE agent_workflows SET current_stage = ?, status = ?, updated_at = ? WHERE id = ?").bind(next || step.stage, next ? 'running' : 'completed', Date.now(), workflowId).run()
  }
  return workflowState(env, userId, workflowId)
}

export async function rollbackProductionWorkflow(env, userId, workflowId, stepId) {
  const target = await env.DB.prepare('SELECT * FROM agent_workflow_steps WHERE id = ? AND workflow_id = ? AND user_id = ?').bind(stepId, workflowId, userId).first()
  if (!target) throw new Error('回退目标不存在或无权访问')
  await env.DB.prepare("UPDATE agent_workflow_steps SET status = 'superseded', updated_at = ? WHERE workflow_id = ? AND created_at >= ? AND id <> ? AND status <> 'superseded'")
    .bind(Date.now(), workflowId, target.created_at, stepId).run()
  await env.DB.prepare("UPDATE agent_workflows SET current_stage = ?, status = 'running', updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(target.stage, Date.now(), workflowId, userId).run()
  await event(env, workflowId, stepId, 'workflow_rolled_back', { stage: target.stage, version: target.version })
  return workflowState(env, userId, workflowId)
}
