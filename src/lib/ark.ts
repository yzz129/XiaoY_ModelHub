import type { GenerationSettings, GeneratedAsset, PendingThreeDTask, PendingVideoTask, SettingsSnapshot } from '../types/generation'
import { compilePrompt } from './prompt'
import { styleTemplates } from '../data/templates'
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, imageModels, videoModels } from '../data/models'

const config = {
  apiKey: import.meta.env.VITE_ARK_API_KEY ?? '',
  baseUrl: import.meta.env.VITE_ARK_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3',
  agnesApiKey: import.meta.env.VITE_AGNES_API_KEY ?? '',
  agnesBaseUrl: (import.meta.env.VITE_AGNES_BASE_URL ?? 'https://apihub.agnes-ai.com/v1').replace(/\/$/, ''),
  siliconFlowApiKey: import.meta.env.VITE_SILICONFLOW_API_KEY ?? '',
  siliconFlowBaseUrl: (import.meta.env.VITE_SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1').replace(/\/$/, ''),
  cloudflareApiToken: import.meta.env.VITE_CLOUDFLARE_API_TOKEN ?? '',
  cloudflareAccountId: import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID ?? '',
  pollinationsApiKey: import.meta.env.VITE_POLLINATIONS_API_KEY ?? '',
  pollinationsBaseUrl: (import.meta.env.VITE_POLLINATIONS_BASE_URL ?? 'https://gen.pollinations.ai').replace(/\/$/, ''),
  threeDModel: import.meta.env.VITE_ARK_3D_MODEL ?? 'doubao-seed3d-2-0-260328',
  hyperThreeDModel: import.meta.env.VITE_ARK_HYPER3D_MODEL ?? 'hyper3d-gen2-260112',
}

export const hasArkApiKey = Boolean(config.apiKey)
export const hasAgnesApiKey = Boolean(config.agnesApiKey)
export const hasSiliconFlowApiKey = Boolean(config.siliconFlowApiKey)
export const hasCloudflareApiKey = Boolean(config.cloudflareApiToken && config.cloudflareAccountId)
export const hasPollinationsApiKey = Boolean(config.pollinationsApiKey)
export const hasApiKey = hasArkApiKey || hasAgnesApiKey || hasSiliconFlowApiKey || hasCloudflareApiKey || hasPollinationsApiKey
export const arkModels = { image: DEFAULT_IMAGE_MODEL, video: DEFAULT_VIDEO_MODEL, threeD: config.threeDModel, hyperThreeD: config.hyperThreeDModel }

function providerForSettings(settings: Pick<GenerationSettings, 'kind' | 'imageModel' | 'videoModel'>) {
  if (settings.kind === '3d') return 'ark'
  return settings.kind === 'image'
    ? (imageModels.find((model) => model.id === settings.imageModel) ?? imageModels[0]).provider
    : (videoModels.find((model) => model.id === settings.videoModel) ?? videoModels[0]).provider
}

export function hasApiKeyForSettings(settings: Pick<GenerationSettings, 'kind' | 'imageModel' | 'videoModel'>) {
  const provider = providerForSettings(settings)
  return provider === 'agnes' ? hasAgnesApiKey
    : provider === 'siliconflow' ? hasSiliconFlowApiKey
      : provider === 'cloudflare' ? hasCloudflareApiKey
        : provider === 'pollinations' ? hasPollinationsApiKey
          : hasArkApiKey
}

export function getProviderName(settings: Pick<GenerationSettings, 'kind' | 'imageModel' | 'videoModel'>) {
  const provider = providerForSettings(settings)
  return provider === 'agnes' ? 'Agnes AI'
    : provider === 'siliconflow' ? 'SiliconFlow'
      : provider === 'cloudflare' ? 'Cloudflare Workers AI'
        : provider === 'pollinations' ? 'Pollinations'
          : '火山方舟'
}

function snapshot(settings: GenerationSettings): SettingsSnapshot {
  const { firstFrame, lastFrame, referenceImages, ...values } = settings
  return { ...values, usedFirstFrame: Boolean(firstFrame), usedLastFrame: Boolean(lastFrame), referenceImageCount: referenceImages?.length ?? 0 }
}

async function arkFetch<T>(path: string, init: RequestInit): Promise<T> {
  if (!config.apiKey) throw new Error('请先在 .env.local 中配置 VITE_ARK_API_KEY')
  let response: Response
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', ...init.headers },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('已停止本地查询，远端任务可能仍在继续', { cause: error })
    throw new Error('无法连接火山方舟，请检查网络与浏览器 CORS 设置', { cause: error })
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('API Key 无效，或当前账号没有模型调用权限')
    if (response.status === 429) throw new Error('请求过于频繁或额度不足，请稍后重试')
    if (response.status >= 500) throw new Error('火山方舟服务暂时不可用，请稍后重试')
    let detail = ''
    try {
      const payload = await response.json() as { error?: { message?: string; param?: string } }
      detail = payload.error?.message ?? ''
    } catch { /* Ark may return an empty non-JSON response. */ }
    throw new Error(detail ? `请求参数错误：${detail}` : `请求参数未被方舟接受（${response.status}）`)
  }
  return response.json() as Promise<T>
}

const AGNES_VIDEO_POLL_INTERVAL_MS = 65_000

class AgnesRateLimitError extends Error {
  retryAfterMs: number

  constructor(retryAfterMs: number) {
    super('Agnes AI 请求频率超过当前套餐限制，任务仍在远端生成，将自动等待后继续查询')
    this.name = 'AgnesRateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

function getRetryAfterMs(response: Response) {
  const retryAfter = response.headers.get('Retry-After')
  if (!retryAfter) return AGNES_VIDEO_POLL_INTERVAL_MS
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds)) return Math.max(seconds * 1000, AGNES_VIDEO_POLL_INTERVAL_MS)
  const retryAt = Date.parse(retryAfter)
  return Number.isNaN(retryAt) ? AGNES_VIDEO_POLL_INTERVAL_MS : Math.max(retryAt - Date.now(), AGNES_VIDEO_POLL_INTERVAL_MS)
}

function isQuotaError(detail: string) {
  return /(?:quota|credit|balance|token|额度|余额).*(?:exceed|exhaust|insufficient|不足|用尽|超出)|(?:exceed|exhaust|insufficient|不足|用尽|超出).*(?:quota|credit|balance|token|额度|余额)/i.test(detail)
}

async function agnesFetch<T>(path: string, init: RequestInit): Promise<T> {
  if (!config.agnesApiKey) throw new Error('请先在 .env.local 中配置 VITE_AGNES_API_KEY')
  const baseUrl = path.startsWith('/agnesapi') ? config.agnesBaseUrl.replace(/\/v1$/, '') : config.agnesBaseUrl
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${config.agnesApiKey}`, 'Content-Type': 'application/json', ...init.headers },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('已停止本地查询，远端任务可能仍在继续', { cause: error })
    throw new Error('无法连接 Agnes AI，请检查网络与浏览器 CORS 设置', { cause: error })
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Agnes AI API Key 无效，或当前账号没有模型调用权限')
    let detail = ''
    try {
      const payload = await response.json() as { error?: { message?: string } | string; message?: string }
      detail = typeof payload.error === 'string' ? payload.error : payload.error?.message ?? payload.message ?? ''
    } catch { /* Agnes may return an empty non-JSON response. */ }
    if (response.status === 429) {
      if (isQuotaError(detail)) throw new Error(detail ? `Agnes AI 额度不足：${detail}` : 'Agnes AI 当前套餐额度已用尽')
      throw new AgnesRateLimitError(getRetryAfterMs(response))
    }
    if (response.status >= 500) throw new Error('Agnes AI 服务暂时不可用，请稍后重试')
    throw new Error(detail ? `Agnes AI 请求参数错误：${detail}` : `Agnes AI 未接受请求（${response.status}）`)
  }
  return response.json() as Promise<T>
}

function wait(delay: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(new Error('已停止本地查询，远端任务可能仍在继续'))
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delay)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

interface DurableJobResponse<T> {
  status?: 'running' | 'completed' | 'failed'
  result?: T
  error?: string
  statusCode?: number
}

async function durableJsonPost<T>(jobId: string, url: string, apiKey: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const created = await fetch('/__generation_jobs', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: jobId, url, apiKey, payload }),
  })
  const createResult = await created.json().catch(() => ({})) as { error?: string }
  if (!created.ok) throw new Error(createResult.error ? `无法创建可恢复任务：${createResult.error}` : '无法创建可恢复的本地生成任务')

  const startedAt = Date.now()
  while (Date.now() - startedAt < 30 * 60 * 1000) {
    const response = await fetch(`/__generation_jobs/${encodeURIComponent(jobId)}`, { signal })
    const job = await response.json().catch(() => ({})) as DurableJobResponse<T>
    if (!response.ok) throw new Error(job.error ?? '本地生成任务不存在，请重新提交')
    if (job.status === 'completed' && job.result) return job.result
    if (job.status === 'failed') {
      if (job.statusCode === 401 || job.statusCode === 403) throw new Error('API Key 无效，或当前账号没有模型调用权限')
      if (job.statusCode === 402) throw new Error(job.error ? `付费余额不足：${job.error}` : '付费余额不足，请充值后重试')
      if (job.statusCode === 429) throw new Error(job.error ? `请求频率超过服务商限制：${job.error}` : '请求频率超过服务商限制，请等待一分钟后重试')
      throw new Error(job.error ?? '远端生成任务失败')
    }
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 1000)
      signal?.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    })
  }
  throw new Error('本地任务仍在运行，刷新页面后会自动继续查询')
}

async function beginDurableVideoJob(jobId: string, url: string, apiKey: string, signal?: AbortSignal) {
  const response = await fetch('/__generation_jobs', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: jobId, url, apiKey, responseType: 'video' }),
  })
  const result = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(result.error ? `无法创建可恢复视频任务：${result.error}` : '无法创建可恢复视频任务')
}

async function uploadPollinationsImage(image: { dataUrl: string; mimeType: string; name: string }, jobId: string, signal?: AbortSignal) {
  const result = await durableJsonPost<{ url?: string }>(
    jobId,
    `${config.pollinationsBaseUrl}/upload`,
    config.pollinationsApiKey,
    { data: image.dataUrl, contentType: image.mimeType, name: image.name },
    signal,
  )
  if (!result.url) throw new Error('Pollinations 未返回参考图上传地址')
  return result.url
}

export async function generateImage(settings: GenerationSettings, sessionId: string, signal?: AbortSignal, generationJobId: string = crypto.randomUUID()): Promise<GeneratedAsset[]> {
  const template = styleTemplates.find((item) => item.id === settings.styleId)
  const compiledPrompt = compilePrompt(settings, template)
  const imageOption = imageModels.find((model) => model.id === settings.imageModel) ?? imageModels[0]
  const imageModel = imageOption.apiModel ?? imageOption.id ?? DEFAULT_IMAGE_MODEL
  const referenceImage = settings.firstFrame?.dataUrl
  const imageSizes: Record<string, string> = { '1:1': '1024x1024', '4:3': '1024x768', '3:4': '768x1024', '16:9': '1024x576', '9:16': '576x1024' }
  let response: { data?: Array<{ url?: string; b64_json?: string }>; images?: Array<{ url?: string }>; result?: { image?: string } }
  if (imageOption.provider === 'agnes') {
    response = await durableJsonPost<{ data?: Array<{ url?: string; b64_json?: string }> }>(
        `image-${generationJobId}`,
        `${config.agnesBaseUrl}/images/generations`,
        config.agnesApiKey,
        { model: imageModel, prompt: compiledPrompt, size: settings.resolution, ratio: settings.ratio, extra_body: { response_format: 'url', ...(referenceImage ? { image: [referenceImage] } : {}) } },
        signal,
      )
  } else if (imageOption.provider === 'siliconflow') {
    response = await durableJsonPost<{ images?: Array<{ url?: string }> }>(
      `image-${generationJobId}`,
      `${config.siliconFlowBaseUrl}/images/generations`,
      config.siliconFlowApiKey,
      { model: imageModel, prompt: compiledPrompt, image_size: imageSizes[settings.ratio], batch_size: 1, num_inference_steps: 20, guidance_scale: 7.5 },
      signal,
    )
  } else if (imageOption.provider === 'pollinations') {
    const communityModel = imageModel.includes('/')
    response = await durableJsonPost<{ data?: Array<{ url?: string; b64_json?: string }> }>(
      `image-${generationJobId}`,
      `${config.pollinationsBaseUrl}/v1/images/generations`,
      config.pollinationsApiKey,
      {
        model: imageModel,
        prompt: compiledPrompt,
        n: 1,
        size: imageSizes[settings.ratio],
        response_format: communityModel ? 'b64_json' : 'url',
        ...(referenceImage && imageOption.supportsReferenceImage ? { image: [referenceImage] } : {}),
      },
      signal,
    )
  } else if (imageOption.provider === 'cloudflare') {
    const dimensions = imageSizes[settings.ratio].split('x').map(Number)
    const isSdxlLightning = imageModel === '@cf/bytedance/stable-diffusion-xl-lightning'
    response = await durableJsonPost<{ result?: { image?: string } }>(
      `image-${generationJobId}`,
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.cloudflareAccountId)}/ai/run/${imageModel}`,
      config.cloudflareApiToken,
      isSdxlLightning
        ? {
            prompt: compiledPrompt,
            width: dimensions[0],
            height: dimensions[1],
            num_steps: 4,
            ...(referenceImage ? { image_b64: referenceImage.split(',', 2)[1] ?? referenceImage, strength: 0.8 } : {}),
          }
        : { prompt: compiledPrompt, steps: 4 },
      signal,
    )
  } else {
    response = await durableJsonPost<{ data?: Array<{ url?: string; b64_json?: string }> }>(
        `image-${generationJobId}`,
        `${config.baseUrl}/images/generations`,
        config.apiKey,
        { model: imageModel, prompt: compiledPrompt, size: settings.ratio === '1:1' ? settings.resolution : `${settings.resolution} ${settings.ratio}`, n: 1, response_format: 'url', watermark: false, ...(referenceImage ? { image: [referenceImage] } : {}) },
        signal,
      )
  }
  const items: Array<{ url?: string; b64_json?: string }> = response.data ?? response.images ?? (response.result?.image ? [{ b64_json: response.result.image }] : [])
  return items.flatMap((item, index) => {
    const url = item.url ?? (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '')
    return url ? [{ id: `${generationJobId}-${index}`, kind: 'image' as const, url, prompt: settings.prompt, compiledPrompt, createdAt: Date.now(), settings: snapshot(settings), sessionId }] : []
  })
}

interface VideoTaskResponse {
  id?: string
  task_id?: string
  video_id?: string
  status?: string
  progress?: number
  content?: { video_url?: string }
  video_url?: string
  output?: { video_url?: string }
  metadata?: { url?: string }
  error?: { message?: string } | null
}

interface ThreeDTaskResponse {
  id?: string
  task_id?: string
  status?: string
  content?: { file_url?: string }
  file_url?: string
  output?: { file_url?: string }
  error?: { message?: string }
}

export async function createVideoTask(settings: GenerationSettings, sessionId: string, signal?: AbortSignal, requestId: string = crypto.randomUUID()): Promise<PendingVideoTask> {
  const template = styleTemplates.find((item) => item.id === settings.styleId)
  const compiledPrompt = compilePrompt(settings, template)
  const videoOption = videoModels.find((model) => model.id === settings.videoModel) ?? videoModels[0]
  const videoModel = videoOption.apiModel ?? videoOption.id ?? DEFAULT_VIDEO_MODEL
  if (videoOption.provider === 'pollinations') {
    const sourceImages = [
      ...(settings.firstFrame ? [{ image: settings.firstFrame, role: 'first' }] : []),
      ...(settings.lastFrame ? [{ image: settings.lastFrame, role: 'last' }] : []),
      ...(settings.referenceImages ?? []).slice(0, 2).map((image, index) => ({ image, role: `reference-${index}` })),
    ].slice(0, 2)
    const uploadedImages = await Promise.all(sourceImages.map(({ image, role }) =>
      uploadPollinationsImage(image, `pollinations-upload-${requestId}-${role}`, signal),
    ))
    const dimensions: Record<string, [number, number]> = settings.resolution === '1080p'
      ? { '1:1': [1080, 1080], '4:3': [1440, 1080], '3:4': [1080, 1440], '16:9': [1920, 1080], '9:16': [1080, 1920] }
      : { '1:1': [720, 720], '4:3': [960, 720], '3:4': [720, 960], '16:9': [1280, 720], '9:16': [720, 1280] }
    const [width, height] = dimensions[settings.ratio]
    const url = new URL(`${config.pollinationsBaseUrl}/video/${encodeURIComponent(compiledPrompt)}`)
    url.searchParams.set('model', videoModel)
    url.searchParams.set('duration', String(settings.duration))
    url.searchParams.set('width', String(width))
    url.searchParams.set('height', String(height))
    if (uploadedImages.length) url.searchParams.set('image', uploadedImages.join('|'))
    if (['veo', 'veo-1080p', 'seedance-2.0', 'wan-pro'].includes(videoModel)) url.searchParams.set('audio', 'true')
    const taskId = `pollinations-video-${requestId}`
    await beginDurableVideoJob(taskId, url.toString(), config.pollinationsApiKey, signal)
    return { taskId, provider: 'pollinations', compiledPrompt, settings: snapshot(settings), sessionId, createdAt: Date.now() }
  }
  if (videoOption.provider === 'agnes') {
    const dimensions: Record<string, [number, number]> = settings.resolution === '1080p'
      ? { '1:1': [1080, 1080], '4:3': [1440, 1080], '3:4': [1080, 1440], '16:9': [1920, 1080], '9:16': [1080, 1920] }
      : { '1:1': [720, 720], '4:3': [960, 720], '3:4': [720, 960], '16:9': [1280, 720], '9:16': [720, 1280] }
    const [width, height] = dimensions[settings.ratio]
    const body: Record<string, unknown> = {
      model: videoModel,
      prompt: compiledPrompt,
      width,
      height,
      num_frames: settings.duration * 24 + 1,
      frame_rate: 24,
    }
    if (settings.firstFrame && settings.lastFrame) {
      body.extra_body = { image: [settings.firstFrame.dataUrl, settings.lastFrame.dataUrl], mode: 'keyframes' }
    } else if (settings.firstFrame) {
      body.image = settings.firstFrame.dataUrl
    } else if (settings.referenceImages?.length) {
      body.extra_body = { image: settings.referenceImages.slice(0, 2).map((image) => image.dataUrl), mode: 'keyframes' }
    }
    const response = await durableJsonPost<VideoTaskResponse>(`video-${requestId}`, `${config.agnesBaseUrl}/videos`, config.agnesApiKey, body, signal)
    const taskId = response.task_id ?? response.id
    if (!taskId) throw new Error('Agnes AI 未返回视频任务 ID，请核对当前 API 协议')
    return { taskId, videoId: response.video_id, provider: 'agnes', compiledPrompt, settings: snapshot(settings), sessionId, createdAt: Date.now() }
  }
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: compiledPrompt }]
  if (settings.firstFrame) content.push({ type: 'image_url', image_url: { url: settings.firstFrame.dataUrl }, role: 'first_frame' })
  if (settings.lastFrame) content.push({ type: 'image_url', image_url: { url: settings.lastFrame.dataUrl }, role: 'last_frame' })
  settings.referenceImages?.forEach((image) => content.push({ type: 'image_url', image_url: { url: image.dataUrl }, role: 'reference_image' }))
  const response = await durableJsonPost<VideoTaskResponse>(
    `video-${requestId}`,
    `${config.baseUrl}/contents/generations/tasks`,
    config.apiKey,
    { model: videoModel, content, duration: settings.duration, ratio: settings.ratio, resolution: settings.resolution, watermark: false },
    signal,
  )
  const taskId = response.id ?? response.task_id
  if (!taskId) throw new Error('方舟未返回视频任务 ID，请核对当前 API 协议')
  return { taskId, provider: 'ark', compiledPrompt, settings: snapshot(settings), sessionId, createdAt: Date.now() }
}

export async function waitForVideo(task: PendingVideoTask, options: { signal?: AbortSignal; onState: (value: string) => void }) {
  const startedAt = Date.now()
  let attempt = 0
  let nextAgnesPollAt = Math.max(Date.now(), task.createdAt + AGNES_VIDEO_POLL_INTERVAL_MS)
  while (Date.now() - startedAt < 30 * 60 * 1000) {
    if (task.provider === 'pollinations') {
      const response = await fetch(`/__generation_jobs/${encodeURIComponent(task.taskId)}`, { signal: options.signal })
      const job = await response.json().catch(() => ({})) as DurableJobResponse<{ url?: string; path?: string }>
      if (!response.ok) throw new Error(job.error ?? '本地视频任务不存在，请重新提交')
      options.onState(job.status === 'completed' ? '已完成' : job.status === 'failed' ? '失败' : 'Pollinations 正在生成')
      if (job.status === 'completed' && job.result?.url) {
        return { id: crypto.randomUUID(), taskId: task.taskId, kind: 'video' as const, url: job.result.url, outputPath: job.result.path, prompt: task.settings.prompt, compiledPrompt: task.compiledPrompt, createdAt: Date.now(), settings: task.settings, sessionId: task.sessionId }
      }
      if (job.status === 'failed') {
        if (job.statusCode === 402) throw new Error(job.error ? `Pollinations 付费余额不足：${job.error}` : 'Pollinations 付费余额不足，请充值后重试')
        if (job.statusCode === 429) throw new Error(job.error ? `Pollinations 请求频率受限：${job.error}` : 'Pollinations 请求频率受限，请稍后重试')
        throw new Error(job.error ?? 'Pollinations 视频生成失败')
      }
      await wait(attempt < 10 ? 2000 : 5000, options.signal)
      attempt += 1
      continue
    }
    if (task.provider === 'agnes' && nextAgnesPollAt > Date.now()) {
      options.onState('等待 Agnes 免费档查询窗口')
      await wait(nextAgnesPollAt - Date.now(), options.signal)
    }

    let result: VideoTaskResponse
    try {
      result = task.provider === 'agnes'
        ? await agnesFetch<VideoTaskResponse>(`/agnesapi?video_id=${encodeURIComponent(task.videoId ?? task.taskId)}`, { method: 'GET', signal: options.signal })
        : await arkFetch<VideoTaskResponse>(`/contents/generations/tasks/${task.taskId}`, { method: 'GET', signal: options.signal })
    } catch (error) {
      if (task.provider !== 'agnes' || !(error instanceof AgnesRateLimitError)) throw error
      options.onState('Agnes 限流等待，任务仍在远端生成')
      nextAgnesPollAt = Date.now() + error.retryAfterMs
      continue
    }

    const status = (result.status ?? '').toLowerCase()
    options.onState(status || 'processing')
    const url = result.metadata?.url ?? result.content?.video_url ?? result.output?.video_url ?? result.video_url
    if (url) return { id: crypto.randomUUID(), taskId: task.provider === 'agnes' ? task.videoId ?? task.taskId : task.taskId, kind: 'video' as const, url, prompt: task.settings.prompt, compiledPrompt: task.compiledPrompt, createdAt: Date.now(), settings: task.settings, sessionId: task.sessionId }
    if (['failed', 'error', 'cancelled', 'expired'].includes(status)) throw new Error(result.error?.message || `视频任务已${status === 'failed' || status === 'error' ? '失败' : status === 'cancelled' ? '取消' : '过期'}`)
    const delay = task.provider === 'agnes' ? AGNES_VIDEO_POLL_INTERVAL_MS : attempt < 10 ? 2000 : 5000
    attempt += 1
    if (task.provider === 'agnes') nextAgnesPollAt = Date.now() + delay
    else await wait(delay, options.signal)
  }
  throw new Error('查询等待已暂停，可稍后继续查询该视频任务')
}

export async function createThreeDTask(settings: GenerationSettings, sessionId: string, signal?: AbortSignal, requestId: string = crypto.randomUUID()): Promise<PendingThreeDTask> {
  if (!settings.firstFrame) throw new Error('请先上传用于生成 3D 的参考图片')
  const command = settings.prompt.trim() || '--subdivisionlevel medium --fileformat glb'
  const response = await durableJsonPost<ThreeDTaskResponse>(
    `3d-${requestId}`,
    `${config.baseUrl}/contents/generations/tasks`,
    config.apiKey,
    {
      model: settings.threeDModel ?? config.threeDModel,
      content: [
        { type: 'text', text: command },
        { type: 'image_url', image_url: { url: settings.firstFrame.dataUrl } },
      ],
    },
    signal,
  )
  const taskId = response.id ?? response.task_id
  if (!taskId) throw new Error('方舟未返回 3D 任务 ID，请核对当前 API 协议')
  return { taskId, compiledPrompt: command, settings: snapshot(settings), sessionId, createdAt: Date.now() }
}

export async function waitForThreeD(task: PendingThreeDTask, options: { signal?: AbortSignal; onState: (value: string) => void }) {
  const startedAt = Date.now()
  let attempt = 0
  while (Date.now() - startedAt < 30 * 60 * 1000) {
    const result = await arkFetch<ThreeDTaskResponse>(`/contents/generations/tasks/${task.taskId}`, { method: 'GET', signal: options.signal })
    const status = (result.status ?? '').toLowerCase()
    options.onState(status || 'processing')
    const url = result.content?.file_url ?? result.output?.file_url ?? result.file_url
    if (url) return { id: crypto.randomUUID(), taskId: task.taskId, kind: '3d' as const, url, prompt: task.settings.prompt || '图片转 3D', compiledPrompt: task.compiledPrompt, createdAt: Date.now(), settings: task.settings, sessionId: task.sessionId }
    if (['failed', 'error', 'cancelled', 'expired'].includes(status)) throw new Error(result.error?.message || `3D 任务已${status === 'failed' || status === 'error' ? '失败' : status === 'cancelled' ? '取消' : '过期'}`)
    const delay = attempt < 10 ? 2000 : 5000
    attempt += 1
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, delay)
      options.signal?.addEventListener('abort', () => { window.clearTimeout(timer); reject(new Error('已停止本地查询，远端 3D 任务可能仍在继续')) }, { once: true })
    })
  }
  throw new Error('查询等待已暂停，可稍后继续查询该 3D 任务')
}

export async function refreshAssetUrl(asset: GeneratedAsset, signal?: AbortSignal) {
  if (asset.outputPath && asset.url.startsWith('/__generated_output/')) return asset.url
  if (!asset.taskId || asset.kind === 'image') throw new Error('这件作品没有可用于刷新链接的任务 ID')
  const agnesVideo = asset.kind === 'video' && asset.settings.videoModel?.startsWith('agnes-')
  const result = agnesVideo
    ? await agnesFetch<VideoTaskResponse & ThreeDTaskResponse>(`/agnesapi?video_id=${encodeURIComponent(asset.taskId)}`, { method: 'GET', signal })
    : await arkFetch<VideoTaskResponse & ThreeDTaskResponse>(`/contents/generations/tasks/${asset.taskId}`, { method: 'GET', signal })
  const status = (result.status ?? '').toLowerCase()
  if (['failed', 'error', 'cancelled', 'expired'].includes(status)) throw new Error(result.error?.message || `远端任务状态为 ${status}`)
  const url = asset.kind === 'video'
    ? result.metadata?.url ?? result.content?.video_url ?? result.output?.video_url ?? result.video_url
    : result.content?.file_url ?? result.output?.file_url ?? result.file_url
  if (!url) throw new Error(status && status !== 'succeeded' ? `远端任务仍在 ${status}` : '方舟没有返回新的资源链接')
  return url
}
