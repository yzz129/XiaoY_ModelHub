import { request as httpsRequest } from 'node:https'
import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const proxyPath = '/__asset_proxy'
const savePath = '/__save_generated_asset'
const outputPath = '/__generated_output/'
const generationJobPath = '/__generation_jobs'
const providerQuotaPath = '/__provider_quota'
const creativeAiPath = '/__creative_ai'
const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const outputRoot = resolve(projectRoot, 'output')
const generationRequestTimeoutMs = 25 * 60 * 1000
const maxGenerationResponseBytes = 100 * 1024 * 1024
const forwardedHeaders = ['accept-ranges', 'cache-control', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified']
const outputFolders = { image: 'images', video: 'videos', '3d': 'models' } as const
const fallbackExtensions = { image: '.png', video: '.mp4', '3d': '.glb' } as const
const contentTypeExtensions: Record<string, string> = {
  'image/avif': '.avif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'model/gltf-binary': '.glb',
  'model/gltf+json': '.gltf',
}
const extensionContentTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
}

function isAllowedAssetUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.endsWith('.volces.com') && url.hostname.includes('.tos-')
  } catch {
    return false
  }
}

function isHttpsUrl(value: string) {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

function isAllowedGenerationUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (
      url.hostname.endsWith('.volces.com')
      || url.hostname === 'apihub.agnes-ai.com'
      || url.hostname === 'api.siliconflow.cn'
      || url.hostname === 'api.cloudflare.com'
    )
  } catch {
    return false
  }
}

function safeAssetId(value: unknown) {
  const normalized = typeof value === 'string' ? value.replace(/[^a-zA-Z0-9_-]/g, '') : ''
  return normalized.slice(0, 80) || crypto.randomUUID()
}

function timestampLabel(value: unknown) {
  const date = new Date(typeof value === 'number' && Number.isFinite(value) ? value : Date.now())
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[:T]/g, '-')
}

function chooseExtension(kind: keyof typeof outputFolders, contentType: string, sourceUrl: string) {
  const normalizedContentType = contentType.split(';', 1)[0].trim().toLowerCase()
  const fromContentType = contentTypeExtensions[normalizedContentType]
  if (fromContentType) return fromContentType
  try {
    const fromUrl = extname(new URL(sourceUrl).pathname).toLowerCase()
    if (extensionContentTypes[fromUrl]) return fromUrl
  } catch { /* A data URL does not have a pathname. */ }
  return fallbackExtensions[kind]
}

async function readRequestJson(request: Parameters<Connect.NextHandleFunction>[0]) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 100 * 1024 * 1024) throw new Error('Save request is larger than 100 MB')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

async function downloadAsset(sourceUrl: string, target: string, allowExternalHttps = false) {
  const temporary = `${target}.${crypto.randomUUID()}.part`
  try {
    if (sourceUrl.startsWith('data:')) {
      const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(sourceUrl)
      if (!match) throw new Error('Unsupported data URL')
      const data = match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]))
      await writeFile(temporary, data)
      await copyFile(temporary, target)
      return match[1] ?? 'application/octet-stream'
    }
    if (!isAllowedAssetUrl(sourceUrl) && !(allowExternalHttps && isHttpsUrl(sourceUrl))) throw new Error('Unsupported asset URL')
    const upstream = await fetch(sourceUrl)
    if (!upstream.ok || !upstream.body) throw new Error(`Asset download failed (${upstream.status})`)
    if (!isAllowedAssetUrl(upstream.url) && !(allowExternalHttps && isHttpsUrl(upstream.url))) throw new Error('Asset download redirected to an unsupported URL')
    await pipeline(upstream.body, createWriteStream(temporary))
    await copyFile(temporary, target)
    return upstream.headers.get('content-type') ?? 'application/octet-stream'
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}

interface DurableGenerationJob {
  id: string
  status: 'running' | 'completed' | 'failed'
  result?: unknown
  error?: string
  errorCode?: string
  statusCode?: number
  updatedAt: number
}

const durableGenerationJobs = new Map<string, DurableGenerationJob>()

function pruneDurableGenerationJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000
  for (const [id, job] of durableGenerationJobs) {
    if (job.updatedAt < cutoff) durableGenerationJobs.delete(id)
  }
}

function upstreamError(payload: unknown, status: number) {
  if (payload && typeof payload === 'object') {
    const value = payload as { error?: { message?: string } | string; message?: string }
    if (typeof value.error === 'string') return value.error
    if (value.error?.message) return value.error.message
    if (value.message) return value.message
  }
  return `Generation request failed (${status})`
}

function generationNetworkError(error: unknown, target: string) {
  const direct = error instanceof Error ? error : new Error('Unknown upstream network error')
  const withCause = direct as Error & { code?: string; cause?: unknown }
  const cause = withCause.cause && typeof withCause.cause === 'object' ? withCause.cause as { code?: string; message?: string } : undefined
  const code = cause?.code ?? withCause.code ?? 'UPSTREAM_NETWORK_ERROR'
  const detail = cause?.message ?? direct.message
  const provider = new URL(target).hostname === 'apihub.agnes-ai.com' ? 'Agnes AI' : '火山方舟'
  const descriptions: Record<string, string> = {
    ECONNRESET: `${provider} 在结果返回完成前关闭了连接`,
    ETIMEDOUT: `连接 ${provider} 超时`,
    UPSTREAM_TIMEOUT: `等待 ${provider} 生成结果超过 25 分钟`,
    ENOTFOUND: `无法解析 ${provider} 的服务器地址`,
    EAI_AGAIN: `解析 ${provider} 的服务器地址暂时失败`,
    ECONNREFUSED: `${provider} 拒绝了网络连接`,
    CERT_HAS_EXPIRED: `${provider} 返回的 TLS 证书已过期`,
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: `无法验证 ${provider} 的 TLS 证书`,
  }
  const summary = descriptions[code] ?? `连接 ${provider} 时发生网络异常`
  return { code, message: `${summary}（${code}：${detail}）。远端可能已经收到请求，为避免重复计费，系统没有自动重试。` }
}

function postGenerationJson(target: string, apiKey: string, payload: Record<string, unknown>) {
  return new Promise<{ statusCode: number; result: unknown }>((resolve, reject) => {
    const targetUrl = new URL(target)
    const requestBody = Buffer.from(JSON.stringify(payload))
    let settled = false
    const timeoutHandle: { current?: ReturnType<typeof setTimeout> } = {}
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      if (timeoutHandle.current) clearTimeout(timeoutHandle.current)
      action()
    }
    const upstreamRequest = httpsRequest({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || 443,
      method: 'POST',
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': String(requestBody.length),
        Accept: 'application/json',
      },
    }, (upstream) => {
      const chunks: Buffer[] = []
      let size = 0
      upstream.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buffer.length
        if (size > maxGenerationResponseBytes) {
          upstream.destroy(Object.assign(new Error('Generation response is larger than 100 MB'), { code: 'UPSTREAM_RESPONSE_TOO_LARGE' }))
          return
        }
        chunks.push(buffer)
      })
      upstream.on('aborted', () => finish(() => reject(Object.assign(new Error('Upstream response was aborted'), { code: 'ECONNRESET' }))))
      upstream.on('error', (error) => finish(() => reject(error)))
      upstream.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let result: unknown
        try { result = text ? JSON.parse(text) : {} } catch { result = { message: text.slice(0, 2000) } }
        finish(() => resolve({ statusCode: upstream.statusCode ?? 502, result }))
      })
    })
    timeoutHandle.current = setTimeout(() => {
      upstreamRequest.destroy(Object.assign(new Error('Upstream generation request exceeded 25 minutes'), { code: 'UPSTREAM_TIMEOUT' }))
    }, generationRequestTimeoutMs)
    upstreamRequest.on('error', (error) => finish(() => reject(error)))
    upstreamRequest.end(requestBody)
  })
}

function getProviderQuotaJson(target: string, headers: Record<string, string>) {
  return new Promise<{ statusCode: number; result: unknown }>((resolve, reject) => {
    const targetUrl = new URL(target)
    const upstreamRequest = httpsRequest({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || 443,
      method: 'GET',
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers: { Accept: 'application/json', ...headers },
    }, (upstream) => {
      const chunks: Buffer[] = []
      upstream.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      upstream.on('error', reject)
      upstream.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let result: unknown
        try { result = text ? JSON.parse(text) : {} } catch { result = { message: text.slice(0, 2000) } }
        resolve({ statusCode: upstream.statusCode ?? 502, result })
      })
    })
    upstreamRequest.setTimeout(15_000, () => upstreamRequest.destroy(new Error('Quota request timed out')))
    upstreamRequest.on('error', reject)
    upstreamRequest.end()
  })
}

const chatProviderEndpoints: Record<string, string> = {
  siliconflow: 'https://api.siliconflow.cn/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
}
const allowedSpeechVoices = new Set(['JBFqnCBsd6RMkjVDRZzb', '21m00Tcm4TlvDq8ikWAM', 'pNInz6obpgDQGcFmaJgB'])

function responseTextContent(payload: unknown) {
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.flatMap((item) => {
      if (typeof item === 'string') return [item]
      if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') return [item.text]
      return []
    }).join('\n')
  }
  return ''
}

const creativeAiMiddleware: Connect.NextHandleFunction = async (request, response, next) => {
  if (!request.url?.startsWith(creativeAiPath)) return next()
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }
  try {
    const body = await readRequestJson(request)
    const task = typeof body.task === 'string' ? body.task : ''
    const provider = typeof body.provider === 'string' ? body.provider : ''
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey : ''
    const model = typeof body.model === 'string' ? body.model : ''
    if (!apiKey) throw new Error('请先配置当前服务商的 API Key')
    if (!model) throw new Error('缺少模型 ID')

    if (task === 'chat') {
      const endpoint = chatProviderEndpoints[provider]
      if (!endpoint) throw new Error('该语言模型服务商尚未接入')
      const messages = Array.isArray(body.messages)
        ? body.messages.slice(-20).flatMap((message) => {
          if (!message || typeof message !== 'object') return []
          const role = 'role' in message && (message.role === 'user' || message.role === 'assistant') ? message.role : undefined
          const content = 'content' in message && typeof message.content === 'string' ? message.content.slice(0, 32_000) : ''
          return role && content ? [{ role, content }] : []
        })
        : []
      if (!messages.length) throw new Error('请输入对话内容')
      const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.slice(0, 2_000) : ''
      const temperature = typeof body.temperature === 'number' && Number.isFinite(body.temperature)
        ? Math.max(0, Math.min(1.5, body.temperature))
        : 0.7
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(provider === 'openrouter' ? { 'HTTP-Referer': 'http://127.0.0.1:43129', 'X-Title': '小Y中转站' } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), ...messages],
          temperature,
          stream: false,
        }),
        signal: AbortSignal.timeout(120_000),
      })
      const result = await upstream.json().catch(() => ({}))
      if (!upstream.ok) throw new Error(upstreamError(result, upstream.status))
      const content = responseTextContent(result)
      if (!content) throw new Error('模型未返回文本内容')
      response.statusCode = 200
      response.end(JSON.stringify({ content }))
      return
    }

    if (task === 'tts') {
      if (provider !== 'elevenlabs') throw new Error('该文字转语音服务商尚未接入')
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 5_000) : ''
      const voiceId = typeof body.voiceId === 'string' && allowedSpeechVoices.has(body.voiceId) ? body.voiceId : ''
      if (!text) throw new Error('请输入需要朗读的文字')
      if (!voiceId) throw new Error('不支持当前声音')
      const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: model }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!upstream.ok) {
        const result = await upstream.json().catch(() => ({}))
        throw new Error(upstreamError(result, upstream.status))
      }
      const audio = Buffer.from(await upstream.arrayBuffer())
      response.statusCode = 200
      response.end(JSON.stringify({
        audioBase64: audio.toString('base64'),
        contentType: upstream.headers.get('content-type') ?? 'audio/mpeg',
        characterCost: upstream.headers.get('character-cost') ?? undefined,
      }))
      return
    }

    if (task === 'stt') {
      if (provider !== 'groq') throw new Error('该语音转文字服务商尚未接入')
      const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : ''
      const fileName = typeof body.fileName === 'string' ? body.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) : 'audio.mp3'
      const mimeType = typeof body.mimeType === 'string' && body.mimeType.startsWith('audio/') ? body.mimeType : 'audio/mpeg'
      const audio = Buffer.from(audioBase64, 'base64')
      if (!audio.length) throw new Error('音频文件为空')
      if (audio.length > 25 * 1024 * 1024) throw new Error('免费档单个音频文件不能超过 25MB')
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), fileName)
      form.append('model', model)
      form.append('response_format', 'json')
      const upstream = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(120_000),
      })
      const result = await upstream.json().catch(() => ({})) as { text?: string }
      if (!upstream.ok) throw new Error(upstreamError(result, upstream.status))
      if (!result.text) throw new Error('模型未识别出文本')
      response.statusCode = 200
      response.end(JSON.stringify({ text: result.text }))
      return
    }

    throw new Error('不支持的创作任务')
  } catch (error) {
    response.statusCode = 502
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Creative AI request failed' }))
  }
}

const providerQuotaMiddleware: Connect.NextHandleFunction = async (request, response, next) => {
  if (!request.url?.startsWith(providerQuotaPath)) return next()
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }
  try {
    const body = await readRequestJson(request)
    const provider = typeof body.provider === 'string' ? body.provider : ''
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey : ''
    if (!apiKey) throw new Error('Missing API Key')

    if (provider === 'openrouter') {
      const upstream = await getProviderQuotaJson('https://openrouter.ai/api/v1/credits', { Authorization: `Bearer ${apiKey}` })
      if (upstream.statusCode < 200 || upstream.statusCode >= 300) throw new Error(upstreamError(upstream.result, upstream.statusCode))
      const data = (upstream.result as { data?: { total_credits?: number; total_usage?: number } }).data
      const total = data?.total_credits
      const used = data?.total_usage
      const remaining = typeof total === 'number' && typeof used === 'number' ? Math.max(0, total - used) : undefined
      response.statusCode = 200
      response.end(JSON.stringify({
        summary: remaining === undefined ? '已连接，但接口未返回可用余额' : `剩余 $${remaining.toFixed(4)}`,
        detail: typeof used === 'number' ? `累计已用 $${used.toFixed(4)}` : undefined,
      }))
      return
    }

    if (provider === 'elevenlabs') {
      const upstream = await getProviderQuotaJson('https://api.elevenlabs.io/v1/user/subscription', { 'xi-api-key': apiKey })
      if (upstream.statusCode < 200 || upstream.statusCode >= 300) throw new Error(upstreamError(upstream.result, upstream.statusCode))
      const data = upstream.result as { character_count?: number; character_limit?: number; tier?: string }
      const used = data.character_count
      const limit = data.character_limit
      const remaining = typeof limit === 'number' && typeof used === 'number' ? Math.max(0, limit - used) : undefined
      response.statusCode = 200
      response.end(JSON.stringify({
        summary: remaining === undefined ? '已连接，但接口未返回字符余额' : `剩余 ${remaining.toLocaleString('en-US')} 字符`,
        detail: typeof used === 'number' && typeof limit === 'number' ? `已用 ${used.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')} · ${data.tier ?? '当前套餐'}` : data.tier,
      }))
      return
    }

    response.statusCode = 400
    response.end(JSON.stringify({ error: '该平台暂不支持自动额度查询' }))
  } catch (error) {
    response.statusCode = 502
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Quota query failed' }))
  }
}

const durableGenerationMiddleware: Connect.NextHandleFunction = async (request, response, next) => {
  if (!request.url?.startsWith(generationJobPath)) return next()
  pruneDurableGenerationJobs()
  const requestUrl = new URL(request.url, 'http://localhost')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (request.method === 'POST' && requestUrl.pathname === generationJobPath) {
    try {
      const body = await readRequestJson(request)
      const id = safeAssetId(body.id)
      const target = typeof body.url === 'string' ? body.url : ''
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey : ''
      const payload = body.payload
      if (!isAllowedGenerationUrl(target)) throw new Error('Unsupported generation endpoint')
      if (!apiKey) throw new Error('Missing API Key')
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Missing generation payload')

      let job = durableGenerationJobs.get(id)
      if (!job) {
        job = { id, status: 'running', updatedAt: Date.now() }
        durableGenerationJobs.set(id, job)
        void (async () => {
          try {
            const upstream = await postGenerationJson(target, apiKey, payload as Record<string, unknown>)
            const current = durableGenerationJobs.get(id)
            if (!current) return
            if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
              durableGenerationJobs.set(id, { ...current, status: 'failed', statusCode: upstream.statusCode, error: upstreamError(upstream.result, upstream.statusCode), updatedAt: Date.now() })
              return
            }
            durableGenerationJobs.set(id, { ...current, status: 'completed', result: upstream.result, updatedAt: Date.now() })
          } catch (error) {
            const current = durableGenerationJobs.get(id)
            if (current) {
              const failure = generationNetworkError(error, target)
              durableGenerationJobs.set(id, { ...current, status: 'failed', error: failure.message, errorCode: failure.code, updatedAt: Date.now() })
            }
          }
        })()
      }
      response.statusCode = 202
      response.end(JSON.stringify({ id: job.id, status: job.status }))
    } catch (error) {
      response.statusCode = 400
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid generation job' }))
    }
    return
  }

  if (request.method === 'GET' && requestUrl.pathname.startsWith(`${generationJobPath}/`)) {
    const id = safeAssetId(decodeURIComponent(requestUrl.pathname.slice(generationJobPath.length + 1)))
    const job = durableGenerationJobs.get(id)
    if (!job) {
      response.statusCode = 404
      response.end(JSON.stringify({ error: 'Generation job not found' }))
      return
    }
    response.statusCode = 200
    response.end(JSON.stringify(job))
    return
  }

  response.statusCode = 405
  response.end(JSON.stringify({ error: 'Method not allowed' }))
}

const saveGeneratedAsset: Connect.NextHandleFunction = async (request, response, next) => {
  if (!request.url?.startsWith(savePath)) return next()
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.setHeader('Allow', 'POST')
    response.end('Method not allowed')
    return
  }
  try {
    const body = await readRequestJson(request)
    const kind = body.kind
    const sourceUrl = typeof body.url === 'string' ? body.url : ''
    if (kind !== 'image' && kind !== 'video' && kind !== '3d') throw new Error('Unsupported asset kind')
    if (!sourceUrl) throw new Error('Missing asset URL')

    const folder = join(outputRoot, outputFolders[kind])
    await mkdir(folder, { recursive: true })
    const id = safeAssetId(body.id)
    const baseName = `${timestampLabel(body.createdAt)}_${id}`
    const provisional = join(folder, `${baseName}${fallbackExtensions[kind]}`)
    const contentType = await downloadAsset(sourceUrl, provisional, body.provider === 'agnes')
    const extension = chooseExtension(kind, contentType, sourceUrl)
    const target = extension === fallbackExtensions[kind] ? provisional : join(folder, `${baseName}${extension}`)
    if (target !== provisional) {
      await copyFile(provisional, target)
      await unlink(provisional)
    }

    const relativePath = relative(projectRoot, target).split(sep).join('/')
    const publicUrl = `${outputPath}${relative(outputRoot, target).split(sep).map(encodeURIComponent).join('/')}`
    response.statusCode = 201
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify({ url: publicUrl, path: relativePath }))
  } catch (error) {
    response.statusCode = 500
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to save generated asset' }))
  }
}

const serveGeneratedAsset: Connect.NextHandleFunction = async (request, response, next) => {
  if (!request.url?.startsWith(outputPath)) return next()
  try {
    const requestUrl = new URL(request.url, 'http://localhost')
    const requestedPath = decodeURIComponent(requestUrl.pathname.slice(outputPath.length))
    const target = resolve(outputRoot, requestedPath)
    if (target !== outputRoot && !target.startsWith(`${outputRoot}${sep}`)) {
      response.statusCode = 403
      response.end('Forbidden')
      return
    }
    const file = await stat(target)
    if (!file.isFile()) throw new Error('Not a file')
    const contentType = extensionContentTypes[extname(target).toLowerCase()] ?? 'application/octet-stream'
    const range = request.headers.range
    let start = 0
    let end = file.size - 1
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match) {
        response.statusCode = 416
        response.setHeader('Content-Range', `bytes */${file.size}`)
        response.end()
        return
      }
      start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2] || 0))
      end = match[2] ? Number(match[2]) : file.size - 1
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= file.size) {
        response.statusCode = 416
        response.setHeader('Content-Range', `bytes */${file.size}`)
        response.end()
        return
      }
      end = Math.min(end, file.size - 1)
      response.statusCode = 206
      response.setHeader('Content-Range', `bytes ${start}-${end}/${file.size}`)
    } else {
      response.statusCode = 200
    }
    response.setHeader('Accept-Ranges', 'bytes')
    response.setHeader('Cache-Control', 'no-cache')
    response.setHeader('Content-Type', contentType)
    response.setHeader('Content-Length', String(end - start + 1))
    response.setHeader('Content-Disposition', `inline; filename="${basename(target).replace(/"/g, '')}"`)
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(target, { start, end }).pipe(response)
  } catch {
    response.statusCode = 404
    response.end('Generated asset not found')
  }
}

const assetProxy: Connect.NextHandleFunction = (request, response, next) => {
  if (!request.url?.startsWith(proxyPath)) return next()
  const requestUrl = new URL(request.url, 'http://localhost')
  const target = requestUrl.searchParams.get('url') ?? ''
  if (!isAllowedAssetUrl(target)) {
    response.statusCode = 400
    response.end('Unsupported asset URL')
    return
  }

  try {
    const targetUrl = new URL(target)
    const headers: Record<string, string> = { Host: targetUrl.host }
    if (request.headers.range) headers.Range = request.headers.range
    const upstreamRequest = httpsRequest({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || 443,
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers,
    }, (upstream) => {
      response.statusCode = upstream.statusCode ?? 502
      response.setHeader('Access-Control-Allow-Origin', '*')
      for (const name of forwardedHeaders) {
        const value = upstream.headers[name]
        if (value) response.setHeader(name, value)
      }
      if (request.method === 'HEAD') {
        upstream.resume()
        response.end()
        return
      }
      upstream.pipe(response)
    })
    upstreamRequest.on('error', (error) => {
      if (response.headersSent) {
        response.destroy(error)
        return
      }
      response.statusCode = 502
      response.setHeader('Content-Type', 'text/plain; charset=utf-8')
      response.end(error.message)
    })
    request.on('aborted', () => upstreamRequest.destroy())
    upstreamRequest.end()
  } catch (error) {
    response.statusCode = 502
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.end(error instanceof Error ? error.message : 'Asset proxy failed')
  }
}

const assetProxyPlugin: Plugin = {
  name: 'volcengine-asset-proxy',
  configureServer(server) {
    server.middlewares.use(creativeAiMiddleware)
    server.middlewares.use(providerQuotaMiddleware)
    server.middlewares.use(durableGenerationMiddleware)
    server.middlewares.use(saveGeneratedAsset)
    server.middlewares.use(serveGeneratedAsset)
    server.middlewares.use(assetProxy)
  },
  configurePreviewServer(server) {
    server.middlewares.use(creativeAiMiddleware)
    server.middlewares.use(providerQuotaMiddleware)
    server.middlewares.use(durableGenerationMiddleware)
    server.middlewares.use(saveGeneratedAsset)
    server.middlewares.use(serveGeneratedAsset)
    server.middlewares.use(assetProxy)
  },
}

export default defineConfig({
  plugins: [react(), assetProxyPlugin],
})
