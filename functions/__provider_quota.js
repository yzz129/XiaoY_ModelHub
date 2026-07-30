import { resolveProviderCredentials } from './_secure_keys.js'

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function upstreamError(payload, status) {
  const error = payload && typeof payload === 'object' ? payload.error : undefined
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message
  if (payload && typeof payload === 'object' && typeof payload.message === 'string') return payload.message
  return `额度查询失败（${status}）`
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers: { Accept: 'application/json', ...headers } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(upstreamError(payload, response.status))
  return payload
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}))
    const provider = typeof body.provider === 'string' ? body.provider : ''
    const credentials = await resolveProviderCredentials(env, request, provider)
    if (!credentials.apiKey) throw new Error('请先配置个人 API Key，或联系管理员配置全局 Key')

    if (provider === 'openrouter') {
      const payload = await fetchJson('https://openrouter.ai/api/v1/credits', {
        Authorization: `Bearer ${credentials.apiKey}`,
      })
      const total = payload?.data?.total_credits
      const used = payload?.data?.total_usage
      const remaining = typeof total === 'number' && typeof used === 'number' ? Math.max(0, total - used) : undefined
      return json({
        summary: remaining === undefined ? '已连接，但接口未返回可用余额' : `剩余 $${remaining.toFixed(4)}`,
        detail: typeof used === 'number' ? `累计已用 $${used.toFixed(4)}` : undefined,
      })
    }

    if (provider === 'pollinations') {
      const payload = await fetchJson('https://gen.pollinations.ai/account/balance', {
        Authorization: `Bearer ${credentials.apiKey}`,
      })
      const balance = payload?.balance
      return json({
        summary: typeof balance === 'number' ? `剩余 ${balance.toFixed(4)} Pollen` : '已连接，但接口未返回 Pollen 余额',
        detail: '包含任务赠送额度与已充值余额',
      })
    }

    if (provider === 'elevenlabs') {
      const payload = await fetchJson('https://api.elevenlabs.io/v1/user/subscription', {
        'xi-api-key': credentials.apiKey,
      })
      const used = payload?.character_count
      const limit = payload?.character_limit
      const remaining = typeof limit === 'number' && typeof used === 'number' ? Math.max(0, limit - used) : undefined
      return json({
        summary: remaining === undefined ? '已连接，但接口未返回字符余额' : `剩余 ${remaining.toLocaleString('en-US')} 字符`,
        detail: typeof used === 'number' && typeof limit === 'number'
          ? `已用 ${used.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')} · ${payload.tier ?? '当前套餐'}`
          : payload?.tier,
      })
    }

    return json({ error: '该平台暂不支持自动额度查询' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '额度查询失败' }, 400)
  }
}
