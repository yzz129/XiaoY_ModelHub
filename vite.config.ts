import { request as httpsRequest } from 'node:https'
import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const proxyPath = '/__asset_proxy'
const savePath = '/__save_generated_asset'
const outputPath = '/__generated_output/'
const generationJobPath = '/__generation_jobs'
const providerQuotaPath = '/__provider_quota'
const providerModelsPath = '/__provider_models'
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
      || url.hostname === 'gen.pollinations.ai'
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
  const hostname = new URL(target).hostname
  const provider = hostname === 'apihub.agnes-ai.com' ? 'Agnes AI'
    : hostname === 'gen.pollinations.ai' ? 'Pollinations'
      : '火山方舟'
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

async function getGenerationVideo(target: string, apiKey: string, jobId: string) {
  const upstream = await fetch(target, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'video/mp4,video/*;q=0.9,application/json;q=0.5' },
    signal: AbortSignal.timeout(generationRequestTimeoutMs),
  })
  if (!upstream.ok) {
    const text = await upstream.text()
    let result: unknown
    try { result = text ? JSON.parse(text) : {} } catch { result = { message: text.slice(0, 2000) } }
    return { statusCode: upstream.status, result }
  }
  if (!upstream.body) return { statusCode: 502, result: { message: 'Video response has no body' } }
  const declaredSize = Number(upstream.headers.get('content-length') ?? 0)
  if (declaredSize > maxGenerationResponseBytes) return { statusCode: 413, result: { message: 'Video response is larger than 100 MB' } }

  const folder = join(outputRoot, outputFolders.video)
  await mkdir(folder, { recursive: true })
  const baseName = `${timestampLabel(Date.now())}_${safeAssetId(jobId)}`
  const extension = chooseExtension('video', upstream.headers.get('content-type') ?? 'video/mp4', upstream.url || target)
  const destination = join(folder, `${baseName}${extension}`)
  const temporary = `${destination}.${crypto.randomUUID()}.part`
  let received = 0
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      received += Buffer.byteLength(chunk)
      callback(received > maxGenerationResponseBytes ? new Error('Video response is larger than 100 MB') : null, chunk)
    },
  })
  try {
    await pipeline(upstream.body, limiter, createWriteStream(temporary))
    await copyFile(temporary, destination)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
  const relativePath = relative(projectRoot, destination).split(sep).join('/')
  const publicUrl = `${outputPath}${relative(outputRoot, destination).split(sep).map(encodeURIComponent).join('/')}`
  return { statusCode: upstream.status, result: { url: publicUrl, path: relativePath } }
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

type DiscoveredModelCategory = 'chat' | 'image' | 'video' | 'audio' | 'embedding' | 'reranker' | '3d'
type DiscoveredPricingTier = 'free' | 'daily-refresh' | 'free-quota' | 'paid' | 'variable'

interface DiscoveredProviderModel {
  apiModel: string
  name: string
  description: string
  category: DiscoveredModelCategory
  pricing: DiscoveredPricingTier
}

const supportedModelProviders = new Set([
  'ark',
  'agnes',
  'anthropic',
  'baidu',
  'cerebras',
  'siliconflow',
  'modelscope',
  'gemini',
  'groq',
  'openai',
  'openrouter',
  'cloudflare',
  'huggingface',
  'alibaba',
  'pollinations',
  'elevenlabs',
  'jina',
  'cohere',
  'deepinfra',
  'deepseek',
  'fireworks',
  'minimax',
  'mistral',
  'moonshot',
  'nvidia',
  'perplexity',
  'replicate',
  'sambanova',
  'together',
  'xai',
  'zhipu',
  'stepfun',
  'scaleway',
  'hyperbolic',
  'novita',
  'aimlapi',
])

const providerDefaultPricing: Record<string, DiscoveredPricingTier> = {
  ark: 'free-quota',
  agnes: 'free',
  anthropic: 'paid',
  baidu: 'free-quota',
  cerebras: 'free-quota',
  siliconflow: 'variable',
  modelscope: 'free-quota',
  gemini: 'free-quota',
  groq: 'free-quota',
  openai: 'paid',
  openrouter: 'variable',
  cloudflare: 'free-quota',
  huggingface: 'free-quota',
  alibaba: 'free-quota',
  pollinations: 'free-quota',
  elevenlabs: 'free-quota',
  jina: 'free-quota',
  cohere: 'free-quota',
  deepinfra: 'variable',
  deepseek: 'paid',
  fireworks: 'variable',
  minimax: 'paid',
  mistral: 'paid',
  moonshot: 'paid',
  nvidia: 'free-quota',
  perplexity: 'paid',
  replicate: 'paid',
  sambanova: 'free-quota',
  together: 'paid',
  xai: 'paid',
  zhipu: 'paid',
  stepfun: 'paid',
  scaleway: 'free-quota',
  hyperbolic: 'free-quota',
  novita: 'free-quota',
  aimlapi: 'free-quota',
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

const publicCatalogUrl = 'https://models.dev/api.json'
const publicCatalogProviderIds: Partial<Record<string, string>> = {
  alibaba: 'alibaba-cn',
  cloudflare: 'cloudflare-workers-ai',
  cohere: 'cohere',
  gemini: 'google',
  groq: 'groq',
  minimax: 'minimax-cn',
  scaleway: 'scaleway',
  siliconflow: 'siliconflow-cn',
  stepfun: 'stepfun',
  zhipu: 'zhipuai',
}

async function fetchPublicCatalogRows(provider: string) {
  const sourceId = publicCatalogProviderIds[provider]
  if (!sourceId) return []
  const upstream = await fetch(publicCatalogUrl, { signal: AbortSignal.timeout(30_000) })
  const payload = objectValue(await upstream.json().catch(() => ({})))
  if (!upstream.ok) throw new Error(`公共模型目录请求失败（${upstream.status}）`)
  const source = objectValue(payload?.[sourceId])
  const models = objectValue(source?.models)
  if (!models) return []
  return Object.entries(models).flatMap(([fallbackId, value]) => {
    const model = objectValue(value)
    if (!model || model.status === 'deprecated') return []
    const apiModel = stringValue(model, 'id') || fallbackId
    if (retiredModelsByProvider[provider]?.has(apiModel)) return []
    return [{ ...model, id: apiModel }]
  })
}

function rowsFromModelPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload.flatMap((item) => objectValue(item) ? [objectValue(item)!] : [])
  const root = objectValue(payload)
  if (!root) return []
  for (const key of ['data', 'models', 'result', 'results', 'items', 'llms']) {
    const value = root[key]
    if (Array.isArray(value)) return value.flatMap((item) => objectValue(item) ? [objectValue(item)!] : [])
  }
  return []
}

function inferModelCategory(record: Record<string, unknown>, apiModel: string): DiscoveredModelCategory {
  const architecture = objectValue(record.architecture)
  const outputModalities = [
    ...stringArray(record.output_modalities),
    ...stringArray(record.supported_output_modalities),
    ...stringArray(architecture?.output_modalities),
  ].map((value) => value.toLowerCase())
  if (outputModalities.includes('embeddings') || outputModalities.includes('embedding')) return 'embedding'
  if (outputModalities.includes('rerank') || outputModalities.includes('reranker')) return 'reranker'
  if (outputModalities.includes('video')) return 'video'
  if (outputModalities.includes('image')) return 'image'
  if (outputModalities.some((value) => ['audio', 'speech', 'tts'].includes(value))) return 'audio'

  const endpoints = stringArray(record.endpoints)
  const descriptor = [
    apiModel,
    stringValue(record, 'type', 'sub_type', 'task', 'pipeline_tag', 'category', 'model_type'),
    stringValue(record, 'name', 'displayName', 'display_name', 'description', 'summary'),
    ...endpoints,
  ].join(' ').toLowerCase()
  if (/rerank|re-rank/.test(descriptor)) return 'reranker'
  if (/embedding|feature-extraction|sentence-similarity/.test(descriptor)) return 'embedding'
  if (/text-to-video|image-to-video|video-generation|\bvideo\b/.test(descriptor)) return 'video'
  if (/text-to-image|image-to-image|image-generation|image-classification|zero-shot-image|object-detection|image-segmentation|depth-estimation|stable-diffusion|segformer|resnet|flux|seedream/.test(descriptor)) return 'image'
  if (/text-to-speech|speech-to-text|automatic-speech-recognition|audio-classification|voice-activity|transcription|\btts\b|\basr\b|whisper|scribe|\baudio\b|music|sound-effect/.test(descriptor)) return 'audio'
  if (/text-to-3d|image-to-3d|\b3d\b/.test(descriptor)) return '3d'
  return 'chat'
}

const retiredModelsByProvider: Partial<Record<string, Set<string>>> = {
  alibaba: new Set(['deepseek-r1-distill-llama-8b']),
  cerebras: new Set(['llama3.1-8b', 'qwen-3-235b-a22b-instruct-2507']),
  zhipu: new Set(['glm-4.5-flash']),
}

const cloudflarePaidOnlyModels = new Set([
  '@cf/moonshotai/kimi-k2.6',
  '@cf/moonshotai/kimi-k2.7-code',
  '@cf/zai-org/glm-5.2',
  '@cf/deepseek-ai/deepseek-v4-flash-0731',
  '@cf/deepseek-ai/deepseek-v4-pro-0813',
])

const geminiFreeTierModels = new Set([
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-live-translate-preview',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-live-preview',
  'gemini-3.1-flash-tts-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash-lite-preview-09-2025',
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-2.5-flash-preview-tts',
  'gemini-embedding-2',
  'gemini-embedding-001',
  'gemini-robotics-er-2-preview',
  'gemini-robotics-er-2-streaming-preview',
  'gemini-robotics-er-1.6-preview',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
])

const groqFreePlanModels = new Set([
  'whisper-large-v3', 'whisper-large-v3-turbo', 'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant', 'allam-2-7b', 'openai/gpt-oss-120b',
  'openai/gpt-oss-20b', 'openai/gpt-oss-safeguard-20b', 'qwen/qwen3.6-27b',
  'meta-llama/llama-prompt-guard-2-86m', 'meta-llama/llama-prompt-guard-2-22m',
  'groq/compound-mini', 'groq/compound', 'canopylabs/orpheus-arabic-saudi',
  'canopylabs/orpheus-v1-english',
])

const cerebrasFreePlanModels = new Set(['gpt-oss-120b', 'zai-glm-4.7'])
const sambanovaFreePlanModels = new Set([
  'DeepSeek-V3.1', 'Meta-Llama-3.3-70B-Instruct', 'gpt-oss-120b',
  'Llama-4-Maverick-17B-128E-Instruct', 'DeepSeek-V3.2',
])

const baiduFreeQuotaModels = new Set([
  'ernie-4.5-turbo-128k', 'ernie-4.5-turbo-32k', 'ernie-4.5-turbo-vl',
  'ernie-x1-turbo-32k', 'deepseek-r1', 'deepseek-r1-250528',
  'deepseek-v3-250324', 'deepseek-v3.1-250821', 'deepseek-v3.1-think-250821',
  'kimi-k2-instruct', 'qwen3-235b-a22b-instruct-2507', 'qwen3-30b-a3b-instruct-2507',
  'qwen3-coder-30b-a3b-instruct', 'qwen3-coder-480b-a35b-instruct',
  'bge-large-en', 'bge-large-zh', 'qianfan-sug-8k',
])

const alibabaFreeQuotaModels = new Set([
  'deepseek-r1-distill-qwen-32b', 'qwen3-vl-plus', 'qwen3-coder-30b-a3b-instruct',
  'qwen3.7-max', 'deepseek-r1', 'deepseek-v3-1', 'qwen-turbo', 'qwen-omni-turbo',
  'qwen-vl-max', 'qwen3-32b', 'deepseek-v3-2-exp', 'deepseek-v4-flash',
  'qwen3-vl-30b-a3b', 'qwen-math-plus', 'qwen3-235b-a22b', 'qwen-max',
  'qwen3.5-397b-a17b', 'qwen3.5-flash', 'qwen-plus', 'deepseek-v4-pro',
  'deepseek-v3', 'qwen3.5-plus', 'deepseek-r1-0528', 'qwen3-coder-flash',
  'glm-5', 'qwen3.6-max-preview', 'qwen3.8-max', 'qwen3.7-plus', 'qwen3.7-flash',
  'qwen3-vl-235b-a22b', 'qwen-vl-ocr', 'qwen3-14b', 'qwen-mt-turbo',
  'qwen3-next-80b-a3b-thinking', 'qwen3-coder-480b-a35b-instruct',
  'qwen3-omni-flash', 'kimi-k2.5', 'qwen-flash', 'moonshot-kimi-k2-instruct',
  'qwen3-8b', 'qwen3-max', 'glm-5.2', 'deepseek-r1-distill-llama-70b',
  'deepseek-r1-distill-qwen-7b', 'qwen2-5-omni-7b', 'qvq-max',
  'qwen3-next-80b-a3b-instruct', 'qwen-long', 'qwen3-omni-flash-realtime',
  'qwen3.6-plus', 'qwen-mt-plus', 'qwq-plus', 'glm-5.1', 'minimax-m2.5',
  'deepseek-r1-distill-qwen-14b', 'qwen-omni-turbo-realtime', 'qwen3-asr-flash',
  'qwen-vl-plus', 'kimi-k2-thinking', 'qwen3.6-flash', 'kimi-k2.6', 'qwen3-coder-plus',
  'qwen-image-3.0-pro', 'wan2.7-image-pro', 'wan2.6-image', 'wan2.6-i2v',
  'wan2.6-t2v', 'happyhorse-1.1-t2v', 'qwen-audio-3.0-tts-plus',
  'qwen-audio-3.0-realtime-plus', 'fun-asr', 'fun-asr-realtime',
  'text-embedding-v4', 'text-embedding-v3', 'qwen2.5-vl-embedding',
  'tongyi-embedding-vision-plus', 'gte-rerank-v2',
])

function isArkFreeQuotaModel(apiModel: string) {
  return /^(?:doubao-seed-2-1-(?:pro|turbo)|doubao-seed-evolving|doubao-seed-character|doubao-seedance-(?:1-5-pro|1-0-pro)|doubao-seedream-(?:5-0-lite|4-5|4-0)|doubao-embedding-vision)(?:$|-)/i.test(apiModel)
}

function discoveredOutputModalities(record: Record<string, unknown>) {
  const architecture = objectValue(record.architecture)
  return [
    ...stringArray(record.output_modalities),
    ...stringArray(record.supported_output_modalities),
    ...stringArray(architecture?.output_modalities),
  ].map((value) => value.toLowerCase())
}

function inferModelPricing(provider: string, record: Record<string, unknown>, apiModel: string): DiscoveredPricingTier {
  if (record.paid_only === true) return 'paid'
  if (apiModel.endsWith(':free') || /(?:^|[-_/])free(?:$|[-_/])/.test(apiModel.toLowerCase())) return 'free'
  if (record.is_free === true) return 'free'

  if (provider === 'cloudflare') return cloudflarePaidOnlyModels.has(apiModel) ? 'paid' : 'daily-refresh'
  if (provider === 'gemini') return geminiFreeTierModels.has(apiModel) ? 'daily-refresh' : 'paid'
  if (provider === 'groq') return groqFreePlanModels.has(apiModel) ? 'daily-refresh' : 'paid'
  if (provider === 'modelscope') return 'daily-refresh'
  if (provider === 'cerebras') return cerebrasFreePlanModels.has(apiModel) ? 'daily-refresh' : 'paid'
  if (provider === 'sambanova') return sambanovaFreePlanModels.has(apiModel) ? 'daily-refresh' : 'paid'
  if (provider === 'cohere') return /(?:^|\/)north-mini-code(?:-1-0)?$/i.test(apiModel) ? 'free' : 'free-quota'
  if (provider === 'elevenlabs') {
    const freeUserLimit = Number(record.max_characters_request_free_user)
    return Number.isFinite(freeUserLimit) && freeUserLimit > 0 ? 'free-quota' : 'paid'
  }
  if (provider === 'baidu') return baiduFreeQuotaModels.has(apiModel.toLowerCase()) ? 'free-quota' : 'paid'
  if (provider === 'alibaba') {
    const normalizedId = apiModel.toLowerCase()
    if (normalizedId === 'deepseek-r1-distill-qwen-1-5b') return 'free'
    return alibabaFreeQuotaModels.has(normalizedId) ? 'free-quota' : 'paid'
  }
  if (provider === 'ark') return isArkFreeQuotaModel(apiModel) ? 'free-quota' : 'paid'
  if (provider === 'zhipu') {
    return new Set(['glm-4.7-flash', 'glm-4.6v-flash', 'glm-4v-flash', 'bge-reranker-large'])
      .has(apiModel.toLowerCase()) ? 'free' : 'paid'
  }
  if (provider === 'stepfun') {
    return new Set(['step-gui', 'step-2x-large', 'step-1x-edit'])
      .has(apiModel.toLowerCase()) ? 'free' : 'paid'
  }
  if (['scaleway', 'hyperbolic', 'novita', 'aimlapi'].includes(provider)) return 'free-quota'
  if (provider === 'minimax') return 'free-quota'
  if (provider === 'pollinations') return 'free-quota'
  if (['huggingface', 'jina', 'nvidia', 'mistral', 'fireworks'].includes(provider)) return 'free-quota'

  const pricing = objectValue(record.pricing)
  let numericPrices: number[] = []
  if (pricing) {
    numericPrices = Object.values(pricing)
      .flatMap((value) => typeof value === 'number' || typeof value === 'string' ? [Number(value)] : [])
      .filter(Number.isFinite)
    if (numericPrices.length && numericPrices.every((value) => value === 0)) {
      const hasRichMediaOutput = discoveredOutputModalities(record)
        .some((value) => ['video', 'image', 'audio', 'speech', 'tts'].includes(value))
      if (provider === 'openrouter' && hasRichMediaOutput) return 'variable'
      return 'free'
    }
  }
  if (record.free_tier === true || record.has_free_tier === true) return 'free-quota'
  if (numericPrices.some((value) => value > 0)) return 'paid'
  if (provider === 'deepinfra') return 'paid'
  return providerDefaultPricing[provider] ?? 'variable'
}

function normalizeProviderModels(provider: string, payload: unknown): DiscoveredProviderModel[] {
  const unique = new Map<string, DiscoveredProviderModel>()
  for (const record of rowsFromModelPayload(payload)) {
    const owner = stringValue(record, 'owner', 'organization')
    const recordName = stringValue(record, 'name')
    const rawId = provider === 'replicate' && owner && recordName
      ? `${owner}/${recordName}`
      : stringValue(record, 'baseModelId', 'model_id', 'id', 'name', 'llm')
    const apiModel = rawId.replace(/^models\//, '')
    if (!apiModel || apiModel.length > 240) continue
    if (retiredModelsByProvider[provider]?.has(apiModel)) continue
    const rawName = stringValue(record, 'displayName', 'display_name', 'name', 'model_name', 'model_id', 'id', 'llm')
    const name = (rawName.replace(/^models\//, '') || apiModel).slice(0, 160)
    const description = stringValue(record, 'description', 'summary').slice(0, 500)
      || '由服务商官方模型目录动态同步'
    unique.set(apiModel, {
      apiModel,
      name,
      description,
      category: inferModelCategory(record, apiModel),
      pricing: inferModelPricing(provider, record, apiModel),
    })
  }
  return [...unique.values()]
}

async function fetchProviderModelPayload(provider: string, apiKey: string, accountId: string) {
  const headers: Record<string, string> = { Accept: 'application/json' }
  let target: string

  switch (provider) {
    case 'openrouter':
      target = 'https://openrouter.ai/api/v1/models?output_modalities=all'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'pollinations':
      target = 'https://gen.pollinations.ai/v1/models'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'huggingface':
      target = 'https://huggingface.co/api/models?inference_provider=hf-inference&limit=1000&full=true'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'elevenlabs':
      target = 'https://api.elevenlabs.io/v1/models'
      if (apiKey) headers['xi-api-key'] = apiKey
      break
    case 'openai':
      if (!apiKey) throw new Error('需要先配置 OpenAI API Key 才能同步完整模型目录')
      target = 'https://api.openai.com/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'anthropic':
      if (!apiKey) throw new Error('需要先配置 Anthropic API Key 才能同步完整模型目录')
      target = 'https://api.anthropic.com/v1/models?limit=1000'
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
      break
    case 'mistral':
      if (!apiKey) throw new Error('需要先配置 Mistral API Key 才能同步完整模型目录')
      target = 'https://api.mistral.ai/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'together':
      if (!apiKey) throw new Error('需要先配置 Together AI API Key 才能同步完整模型目录')
      target = 'https://api.together.xyz/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'deepinfra':
      target = 'https://api.deepinfra.com/v1/openai/models'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'cerebras':
      if (!apiKey) throw new Error('需要先配置 Cerebras API Key 才能同步完整模型目录')
      target = 'https://api.cerebras.ai/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'sambanova':
      if (!apiKey) throw new Error('需要先配置 SambaNova API Key 才能同步完整模型目录')
      target = 'https://api.sambanova.ai/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'nvidia':
      target = 'https://integrate.api.nvidia.com/v1/models'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'deepseek':
      if (!apiKey) throw new Error('需要先配置 DeepSeek API Key 才能同步完整模型目录')
      target = 'https://api.deepseek.com/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'moonshot':
      if (!apiKey) throw new Error('需要先配置 Moonshot API Key 才能同步完整模型目录')
      target = 'https://api.moonshot.cn/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'minimax':
      if (!apiKey) return { data: await fetchPublicCatalogRows(provider) }
      target = 'https://api.minimaxi.com/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'baidu':
      if (!apiKey) throw new Error('需要先配置百度千帆 API Key 才能同步完整模型目录')
      target = 'https://qianfan.baidubce.com/v2/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'xai':
      if (!apiKey) throw new Error('需要先配置 xAI API Key 才能同步完整模型目录')
      target = 'https://api.x.ai/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'perplexity':
      if (!apiKey) throw new Error('需要先配置 Perplexity API Key 才能同步完整模型目录')
      target = 'https://api.perplexity.ai/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'fireworks':
      if (!apiKey || !accountId) throw new Error('需要同时配置 Fireworks API Key 和 Account ID')
      target = `https://api.fireworks.ai/v1/accounts/${encodeURIComponent(accountId)}/models?pageSize=1000`
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'replicate':
      if (!apiKey) throw new Error('需要先配置 Replicate API Token 才能同步完整模型目录')
      target = 'https://api.replicate.com/v1/models?sort_by=latest_version_created_at&sort_direction=desc'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'gemini':
      if (!apiKey) return { data: await fetchPublicCatalogRows(provider) }
      target = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`
      break
    case 'groq':
      if (!apiKey) return { data: await fetchPublicCatalogRows(provider) }
      target = 'https://api.groq.com/openai/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'siliconflow':
      if (!apiKey) return { data: await fetchPublicCatalogRows(provider) }
      target = 'https://api.siliconflow.cn/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'cloudflare':
      if (!apiKey || !accountId) return { data: await fetchPublicCatalogRows(provider) }
      target = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?per_page=1000`
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'cohere':
      if (!apiKey) return { data: await fetchPublicCatalogRows(provider) }
      target = 'https://api.cohere.com/v1/models?page_size=1000'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'agnes':
      if (!apiKey) throw new Error('需要先配置 Agnes API Key 才能同步完整模型目录')
      target = 'https://apihub.agnes-ai.com/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'modelscope':
      target = 'https://api-inference.modelscope.cn/v1/models'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'alibaba':
      if (!apiKey) return { data: await fetchPublicCatalogRows(provider) }
      target = 'https://dashscope.aliyuncs.com/compatible-mode/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'ark':
      if (!apiKey) throw new Error('需要先配置火山方舟 API Key 才能同步完整模型目录')
      target = 'https://ark.cn-beijing.volces.com/api/v3/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'jina':
      target = 'https://api.jina.ai/v1/models'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'zhipu':
      if (!apiKey) return { data: await fetchPublicCatalogRows(provider) }
      target = 'https://open.bigmodel.cn/api/paas/v4/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'stepfun':
      if (!apiKey) return { data: await fetchPublicCatalogRows(provider) }
      target = 'https://api.stepfun.com/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'scaleway':
      if (!apiKey) return { data: await fetchPublicCatalogRows(provider) }
      target = 'https://api.scaleway.ai/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'hyperbolic':
      if (!apiKey) throw new Error('需要先配置 Hyperbolic API Key 才能同步模型目录')
      target = 'https://api.hyperbolic.xyz/v1/models'
      headers.Authorization = `Bearer ${apiKey}`
      break
    case 'novita':
      target = 'https://api.novita.ai/openai/v1/models'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    case 'aimlapi':
      target = 'https://api.aimlapi.com/models'
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`
      break
    default:
      throw new Error('当前服务商不支持模型目录同步')
  }

  if (provider === 'replicate') {
    const results: Record<string, unknown>[] = []
    let nextPage: string | undefined = target
    for (let page = 0; page < 12 && nextPage; page += 1) {
      const nextUrl = new URL(nextPage)
      if (nextUrl.protocol !== 'https:' || nextUrl.hostname !== 'api.replicate.com') {
        throw new Error('Replicate 返回了不安全的分页地址')
      }
      const upstream = await fetch(nextUrl, { headers, signal: AbortSignal.timeout(30_000) })
      const payload = await upstream.json().catch(() => ({}))
      if (!upstream.ok) throw new Error(upstreamError(payload, upstream.status))
      const root = objectValue(payload)
      results.push(...rowsFromModelPayload(payload))
      nextPage = typeof root?.next === 'string' && root.next ? root.next : undefined
    }
    return { results }
  }

  if (provider === 'huggingface') {
    const results: Record<string, unknown>[] = []
    let nextPage: string | undefined = target
    for (let page = 0; page < 30 && nextPage; page += 1) {
      const nextUrl = new URL(nextPage)
      if (nextUrl.protocol !== 'https:' || nextUrl.hostname !== 'huggingface.co') {
        throw new Error('Hugging Face 返回了不安全的分页地址')
      }
      const upstream = await fetch(nextUrl, { headers, signal: AbortSignal.timeout(30_000) })
      const payload = await upstream.json().catch(() => ({}))
      if (!upstream.ok) throw new Error(upstreamError(payload, upstream.status))
      results.push(...rowsFromModelPayload(payload))
      const link = upstream.headers.get('Link') || ''
      nextPage = link.match(/<([^>]+)>;\s*rel="next"/)?.[1]
    }
    return { results }
  }

  const upstream = await fetch(target, { headers, signal: AbortSignal.timeout(30_000) })
  const payload = await upstream.json().catch(() => ({}))
  if (!upstream.ok) throw new Error(upstreamError(payload, upstream.status))
  return payload
}

const providerModelsMiddleware: Connect.NextHandleFunction = async (request, response, next) => {
  if (!request.url?.startsWith(providerModelsPath)) return next()
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
    const accountId = typeof body.accountId === 'string' ? body.accountId : ''
    if (!supportedModelProviders.has(provider)) throw new Error('未知服务商')
    const payload = await fetchProviderModelPayload(provider, apiKey, accountId)
    const models = normalizeProviderModels(provider, payload)
    response.statusCode = 200
    response.end(JSON.stringify({ provider, models, syncedAt: Date.now() }))
  } catch (error) {
    response.statusCode = 502
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : '同步服务商模型目录失败' }))
  }
}

const chatProviderEndpoints: Record<string, string> = {
  agnes: 'https://apihub.agnes-ai.com/v1/chat/completions',
  alibaba: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  ark: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  baidu: 'https://qianfan.baidubce.com/v2/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  cohere: 'https://api.cohere.com/compatibility/v1/chat/completions',
  deepinfra: 'https://api.deepinfra.com/v1/openai/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  fireworks: 'https://api.fireworks.ai/inference/v1/chat/completions',
  minimax: 'https://api.minimaxi.com/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  modelscope: 'https://api-inference.modelscope.cn/v1/chat/completions',
  moonshot: 'https://api.moonshot.cn/v1/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  perplexity: 'https://api.perplexity.ai/chat/completions',
  sambanova: 'https://api.sambanova.ai/v1/chat/completions',
  siliconflow: 'https://api.siliconflow.cn/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  pollinations: 'https://gen.pollinations.ai/v1/chat/completions',
  together: 'https://api.together.xyz/v1/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  stepfun: 'https://api.stepfun.com/v1/chat/completions',
  scaleway: 'https://api.scaleway.ai/v1/chat/completions',
  hyperbolic: 'https://api.hyperbolic.xyz/v1/chat/completions',
  novita: 'https://api.novita.ai/openai/v1/chat/completions',
  aimlapi: 'https://api.aimlapi.com/v1/chat/completions',
}
const allowedSpeechVoices = new Set(['JBFqnCBsd6RMkjVDRZzb', '21m00Tcm4TlvDq8ikWAM', 'pNInz6obpgDQGcFmaJgB'])
const pollinationsSpeechVoices: Record<string, string> = {
  JBFqnCBsd6RMkjVDRZzb: 'george',
  '21m00Tcm4TlvDq8ikWAM': 'rachel',
  pNInz6obpgDQGcFmaJgB: 'adam',
}

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
          const rawContent = 'content' in message ? message.content : ''
          const content = typeof rawContent === 'string'
            ? rawContent.slice(0, 32_000)
            : Array.isArray(rawContent)
              ? rawContent.slice(0, 6).reduce<Array<Record<string, unknown>>>((items, item) => {
                  if (!item || typeof item !== 'object' || !('type' in item)) return items
                  if (item.type === 'text' && 'text' in item && typeof item.text === 'string') {
                    items.push({ type: 'text', text: item.text.slice(0, 32_000) })
                    return items
                  }
                  if (item.type === 'image_url' && 'image_url' in item && item.image_url && typeof item.image_url === 'object' && 'url' in item.image_url && typeof item.image_url.url === 'string' && /^data:image\/(?:png|jpeg|webp);base64,/.test(item.image_url.url)) {
                    items.push({ type: 'image_url', image_url: { url: item.image_url.url.slice(0, 8_000_000) } })
                  }
                  return items
                }, [])
              : ''
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
          ...(provider === 'openrouter' ? { 'HTTP-Referer': 'http://127.0.0.1:43129', 'X-Title': 'XiaoY_ModelHub' } : {}),
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
      if (provider !== 'elevenlabs' && provider !== 'pollinations') throw new Error('该文字转语音服务商尚未接入')
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 5_000) : ''
      const voiceId = typeof body.voiceId === 'string' && (allowedSpeechVoices.has(body.voiceId) || (provider === 'elevenlabs' && /^[a-zA-Z0-9_-]{10,80}$/.test(body.voiceId))) ? body.voiceId : ''
      const requestedVoiceSettings = body.voiceSettings && typeof body.voiceSettings === 'object'
        ? body.voiceSettings as Record<string, unknown>
        : undefined
      if (!text) throw new Error('请输入需要朗读的文字')
      if (!voiceId) throw new Error('不支持当前声音')
      const upstream = provider === 'pollinations'
        ? await fetch('https://gen.pollinations.ai/v1/audio/speech', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
            body: JSON.stringify({ input: text, model, voice: pollinationsSpeechVoices[voiceId], response_format: 'mp3' }),
            signal: AbortSignal.timeout(120_000),
          })
        : await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
            method: 'POST',
            headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
            body: JSON.stringify({
              text,
              model_id: model,
              voice_settings: requestedVoiceSettings
                ? {
                    stability: Math.max(0, Math.min(1, Number(requestedVoiceSettings.stability) || 0.5)),
                    similarity_boost: Math.max(0, Math.min(1, Number(requestedVoiceSettings.similarityBoost) || 0.75)),
                    style: Math.max(0, Math.min(1, Number(requestedVoiceSettings.style) || 0)),
                    speed: Math.max(0.7, Math.min(1.2, Number(requestedVoiceSettings.speed) || 1)),
                    use_speaker_boost: requestedVoiceSettings.useSpeakerBoost !== false,
                  }
                : undefined,
            }),
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

    if (task === 'clone_voice') {
      if (provider !== 'elevenlabs') throw new Error('当前服务商不支持参考声音')
      if (body.consent !== true) throw new Error('必须确认拥有参考声音的使用权限')
      const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : ''
      const fileName = typeof body.fileName === 'string' ? body.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) : 'reference.mp3'
      const mimeType = typeof body.mimeType === 'string' && body.mimeType.startsWith('audio/') ? body.mimeType : 'audio/mpeg'
      const audio = Buffer.from(audioBase64, 'base64')
      if (!audio.length) throw new Error('参考声音文件为空')
      if (audio.length > 10 * 1024 * 1024) throw new Error('参考声音文件不能超过 10MB')
      const form = new FormData()
      form.append('files', new Blob([new Uint8Array(audio)], { type: mimeType }), fileName)
      form.append('name', typeof body.name === 'string' ? body.name.slice(0, 80) : '参考声音')
      form.append('description', '由 XiaoY_ModelHub 根据用户授权的参考音频创建')
      form.append('remove_background_noise', 'false')
      const upstream = await fetch('https://api.elevenlabs.io/v1/voices/add', {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: form,
        signal: AbortSignal.timeout(120_000),
      })
      const result = await upstream.json().catch(() => ({})) as { voice_id?: string }
      if (!upstream.ok) throw new Error(upstreamError(result, upstream.status))
      if (!result.voice_id) throw new Error('服务商未返回自定义声音 ID')
      response.statusCode = 200
      response.end(JSON.stringify({ voiceId: result.voice_id }))
      return
    }

    if (task === 'stt') {
      if (provider !== 'groq' && provider !== 'pollinations') throw new Error('该语音转文字服务商尚未接入')
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
      const upstream = await fetch(provider === 'pollinations'
        ? 'https://gen.pollinations.ai/v1/audio/transcriptions'
        : 'https://api.groq.com/openai/v1/audio/transcriptions', {
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

    if (provider === 'pollinations') {
      const upstream = await getProviderQuotaJson('https://gen.pollinations.ai/account/balance', { Authorization: `Bearer ${apiKey}` })
      if (upstream.statusCode < 200 || upstream.statusCode >= 300) throw new Error(upstreamError(upstream.result, upstream.statusCode))
      const balance = (upstream.result as { balance?: number }).balance
      response.statusCode = 200
      response.end(JSON.stringify({
        summary: typeof balance === 'number' ? `剩余 ${balance.toFixed(4)} Pollen` : '已连接，但接口未返回 Pollen 余额',
        detail: '包含任务赠送额度与已充值余额',
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
      const responseType = body.responseType === 'video' ? 'video' : 'json'
      if (!isAllowedGenerationUrl(target)) throw new Error('Unsupported generation endpoint')
      if (!apiKey) throw new Error('Missing API Key')
      if (responseType === 'json' && (!payload || typeof payload !== 'object' || Array.isArray(payload))) throw new Error('Missing generation payload')

      let job = durableGenerationJobs.get(id)
      if (!job) {
        job = { id, status: 'running', updatedAt: Date.now() }
        durableGenerationJobs.set(id, job)
        void (async () => {
          try {
            const upstream = responseType === 'video'
              ? await getGenerationVideo(target, apiKey, id)
              : await postGenerationJson(target, apiKey, payload as Record<string, unknown>)
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
    server.middlewares.use(providerModelsMiddleware)
    server.middlewares.use(creativeAiMiddleware)
    server.middlewares.use(providerQuotaMiddleware)
    server.middlewares.use(durableGenerationMiddleware)
    server.middlewares.use(saveGeneratedAsset)
    server.middlewares.use(serveGeneratedAsset)
    server.middlewares.use(assetProxy)
  },
  configurePreviewServer(server) {
    server.middlewares.use(providerModelsMiddleware)
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
  server: {
    proxy: {
      '/api': {
        target: process.env.XIAOY_BACKEND_ORIGIN ?? 'https://xiaoy-modelhub.pages.dev',
        changeOrigin: true,
        secure: true,
        configure(proxy, options) {
          proxy.on('proxyReq', (proxyRequest) => {
            if (options.target) proxyRequest.setHeader('Origin', String(options.target))
          })
        },
      },
    },
  },
})
