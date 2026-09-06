const TOOL_POLICIES = Object.freeze({
  web_search: { risk: 'read', sideEffect: false, approval: 'never', retry: 'safe' },
  recall_memory: { risk: 'read', sideEffect: false, approval: 'never', retry: 'safe' },
  get_plan: { risk: 'read', sideEffect: false, approval: 'never', retry: 'safe' },
  list_tasks: { risk: 'read', sideEffect: false, approval: 'never', retry: 'safe' },
  save_memory: { risk: 'write', sideEffect: true, approval: 'explicit', retry: 'idempotent' },
  set_plan: { risk: 'internal', sideEffect: true, approval: 'never', retry: 'idempotent' },
  update_plan: { risk: 'internal', sideEffect: true, approval: 'never', retry: 'idempotent' },
  create_task: { risk: 'write', sideEffect: true, approval: 'explicit', retry: 'idempotent' },
  cancel_task: { risk: 'destructive', sideEffect: true, approval: 'always', retry: 'idempotent' },
})

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

export function toolPolicy(tool) {
  return TOOL_POLICIES[tool] || { risk: 'unknown', sideEffect: true, approval: 'always', retry: 'unsafe' }
}

function explicitlyAuthorized(prompt, tool) {
  const value = String(prompt || '')
  if (tool === 'create_task') return /(?:提醒|定时|每隔|每天|每日|每周|每月|巡检|cron|schedule|remind)/i.test(value)
  if (tool === 'save_memory') return /(?:记住|保存.{0,8}(?:偏好|记忆|资料)|remember|save.{0,8}memory)/i.test(value)
  return false
}

export function evaluateToolCall({ tool, prompt }) {
  const policy = toolPolicy(tool)
  const authorized = explicitlyAuthorized(prompt, tool)
  const requiresApproval = policy.approval === 'always' || (policy.approval === 'explicit' && !authorized)
  return {
    ...policy,
    authorized,
    requiresApproval,
    reason: requiresApproval
      ? (policy.risk === 'destructive' ? '该操作会取消或删除现有资源' : '该操作会写入持久数据，但用户没有明确授权')
      : '',
  }
}

export async function toolFingerprint(tool, args) {
  const bytes = new TextEncoder().encode(`${tool}:${stableJson(args || {})}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function normalizeModelUsage(payload) {
  const usage = payload?.usage || {}
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens) || 0
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens) || 0
  const totalTokens = Number(usage.total_tokens) || inputTokens + outputTokens
  const cachedTokens = Number(usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens) || 0
  const rawCost = Number(usage.cost ?? payload?.cost)
  return {
    inputTokens: Math.max(0, Math.round(inputTokens)),
    outputTokens: Math.max(0, Math.round(outputTokens)),
    totalTokens: Math.max(0, Math.round(totalTokens)),
    cachedTokens: Math.max(0, Math.round(cachedTokens)),
    costMicrousd: Number.isFinite(rawCost) && rawCost >= 0 ? Math.round(rawCost * 1_000_000) : 0,
  }
}

export const AGENT_TOOL_POLICIES = TOOL_POLICIES
