async function executeDueAgentTasks(env) {
  if (!env.SCHEDULER_ENDPOINT || !env.SCHEDULER_HEALTH_TOKEN) return []
  const response = await fetch(env.SCHEDULER_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SCHEDULER_HEALTH_TOKEN}` },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || `Scheduler endpoint failed (${response.status})`)
  return Array.isArray(payload.results) ? payload.results : []
}

export default {
  async scheduled(_controller, env, context) {
    context.waitUntil(executeDueAgentTasks(env))
  },

  async fetch(request, env) {
    const expected = env.SCHEDULER_HEALTH_TOKEN || ''
    const supplied = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || ''
    if (!expected || supplied !== expected) return new Response('Not found', { status: 404 })
    const results = await executeDueAgentTasks(env)
    return Response.json({ ok: true, processed: results.length, results }, { headers: { 'Cache-Control': 'no-store' } })
  },
}
