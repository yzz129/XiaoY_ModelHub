const ROLE_LIMITS = { goal: 500, stepTitle: 240, issue: 500 }

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function jsonObject(value) {
  const cleaned = cleanText(value, 120_000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function shouldUseFullOrchestration(prompt, attachments = []) {
  const value = cleanText(prompt, 16_000)
  const actions = value.match(/搜索|核验|分析|比较|整理|总结|规划|创建|生成|保存|安排|执行|修改|评估|review|search|compare|plan|create|build|analy[sz]e/gi) || []
  const connectors = value.match(/然后|并且|同时|之后|最后|以及|再|and then|after that|finally/gi) || []
  return value.length >= 180 || actions.length >= 2 || connectors.length >= 2 || attachments.length >= 2
}

export function plannerSystemPrompt() {
  return `你是 XiaoY_ModelHub 的 Planner Agent。只负责规划，不执行工具、不回答用户。
只输出 JSON：{"goal":"可验证目标","steps":[{"id":"step-1","title":"具体步骤"}]}。
输出 2-8 个有先后关系、可以判定完成的步骤；不要加入寒暄、重复步骤、外部平台教程或超出用户授权的动作。`
}

export function plannerTask({ prompt, mode, memories = [], existingPlan = null }) {
  return `模式：${cleanText(mode, 20)}
用户任务：${cleanText(prompt, 16_000)}
相关长期记忆：${JSON.stringify(memories.slice(0, 8).map((item) => ({ kind: item.kind, content: item.content })))}
已有计划：${existingPlan ? JSON.stringify(existingPlan) : '无'}
请生成最小但完整的执行计划。`
}

export function parsePlannerOutput(value) {
  const parsed = jsonObject(value)
  const goal = cleanText(parsed?.goal, ROLE_LIMITS.goal)
  if (!goal || !Array.isArray(parsed?.steps) || parsed.steps.length < 2) return null
  const seen = new Set()
  const steps = parsed.steps.slice(0, 8).flatMap((step, index) => {
    const title = cleanText(step?.title, ROLE_LIMITS.stepTitle)
    if (!title) return []
    let id = cleanText(step?.id, 60).replace(/[^a-zA-Z0-9_-]/g, '') || `step-${index + 1}`
    if (seen.has(id)) id = `step-${index + 1}`
    seen.add(id)
    return [{ id, title }]
  })
  return steps.length >= 2 ? { goal, steps } : null
}

export function criticSystemPrompt() {
  return `你是独立 Critic Agent，负责判断执行结果是否真实完成用户任务。
重点检查：事实依据、是否遗漏要求、是否声称未执行动作、工具失败是否被掩盖、引用是否来自真实来源、计划步骤是否有完成证据。
只输出 JSON：{"pass":true,"score":0-100,"summary":"结论","issues":[],"completedStepIds":[],"blockedStepIds":[]}。
不重写答案，不调用工具。存在实质性遗漏或虚构执行时 pass 必须为 false。`
}

export function criticTask({ prompt, answer, plan, trace = [], sources = [] }) {
  return `用户任务：${cleanText(prompt, 16_000)}
执行计划：${plan ? JSON.stringify(plan) : '无'}
工具轨迹：${JSON.stringify(trace.slice(-20))}
来源：${JSON.stringify(sources.slice(0, 8).map((item) => ({ title: item.title, url: item.url })))}
候选答案：
${cleanText(answer, 100_000)}

请给出独立审查结果。`
}

export function parseCriticOutput(value, plan) {
  const parsed = jsonObject(value)
  if (!parsed || typeof parsed.pass !== 'boolean') return null
  const validIds = new Set((plan?.steps || []).map((step) => step.id))
  const ids = (input) => Array.isArray(input) ? [...new Set(input.map((item) => cleanText(item, 60)).filter((item) => validIds.has(item)))] : []
  return {
    pass: parsed.pass,
    score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0))),
    summary: cleanText(parsed.summary, 1_000),
    issues: Array.isArray(parsed.issues) ? parsed.issues.map((item) => cleanText(item, ROLE_LIMITS.issue)).filter(Boolean).slice(0, 8) : [],
    completedStepIds: ids(parsed.completedStepIds),
    blockedStepIds: ids(parsed.blockedStepIds),
  }
}

export function repairSystemPrompt() {
  return `你是 XiaoY_ModelHub 的 Repair Agent。根据独立审查意见修复候选答案。
不得虚构工具调用、来源、生成结果或完成状态；无法补足的内容必须明确说明阻断原因。
只输出 JSON：{"type":"final","content":"修复后的完整 Markdown 答案"}，不要调用工具。`
}

export function repairTask({ prompt, answer, review }) {
  return `用户任务：${cleanText(prompt, 16_000)}
候选答案：${cleanText(answer, 100_000)}
审查结果：${JSON.stringify(review)}
请修复全部问题并输出最终答案。`
}
