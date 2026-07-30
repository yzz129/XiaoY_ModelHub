import { resolveProviderCredentials } from './_secure_keys.js'

const allowedHosts = {
  agnes: new Set(['apihub.agnes-ai.com']),
  ark: new Set(['ark.cn-beijing.volces.com']),
  cloudflare: new Set(['api.cloudflare.com']),
  pollinations: new Set(['gen.pollinations.ai']),
  siliconflow: new Set(['api.siliconflow.cn']),
}

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
  return `服务商请求失败（${status}）`
}

function base64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}))
    const provider = typeof body.provider === 'string' ? body.provider : ''
    const method = body.method === 'GET' ? 'GET' : 'POST'
    const responseType = body.responseType === 'binary' ? 'binary' : 'json'
    const credentials = await resolveProviderCredentials(env, request, provider)
    if (!credentials.apiKey) throw new Error('请先配置个人 API Key，或联系管理员配置全局 Key')

    let target = typeof body.url === 'string' ? body.url : ''
    if (provider === 'cloudflare') {
      if (!credentials.accountId) throw new Error('Cloudflare Workers AI 还需要配置 Account ID')
      target = target.replace('__ACCOUNT_ID__', encodeURIComponent(credentials.accountId))
    }
    const url = new URL(target)
    if (url.protocol !== 'https:' || !allowedHosts[provider]?.has(url.hostname)) {
      throw new Error('服务商请求地址不在允许列表中')
    }

    const headers = {
      Authorization: `Bearer ${credentials.apiKey}`,
      Accept: responseType === 'binary' ? 'video/mp4,video/*;q=0.9,application/json;q=0.5' : 'application/json',
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    }
    const upstream = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(body.payload && typeof body.payload === 'object' ? body.payload : {}) : undefined,
    })

    if (responseType === 'binary' && upstream.ok) {
      const buffer = await upstream.arrayBuffer()
      if (buffer.byteLength > 40 * 1024 * 1024) throw new Error('生成视频超过 40MB，暂时无法通过服务端返回')
      return json({
        dataBase64: base64(buffer),
        contentType: upstream.headers.get('content-type') || 'video/mp4',
      })
    }

    const responseText = await upstream.text()
    let payload
    try {
      payload = responseText ? JSON.parse(responseText) : {}
    } catch {
      payload = { message: responseText.slice(0, 2_000) }
    }
    if (!upstream.ok) return json({ error: upstreamError(payload, upstream.status) }, upstream.status)
    return json(payload)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '生成请求失败' }, 400)
  }
}
