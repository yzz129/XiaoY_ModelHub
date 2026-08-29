import type { GenerationSettings, GeneratedAsset, PendingThreeDTask, PendingVideoTask, SettingsSnapshot } from '../types/generation'
import { compilePrompt } from './prompt'
import { styleTemplates } from '../data/templates'
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, getThreeDModel, imageModels, videoModels } from '../data/models'
import { getProviderAuthMode, isProviderConfigured } from './providerCredentials'

const config = {
  baseUrl: import.meta.env.VITE_ARK_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3',
  agnesBaseUrl: (import.meta.env.VITE_AGNES_BASE_URL ?? 'https://apihub.agnes-ai.com/v1').replace(/\/$/, ''),
  siliconFlowBaseUrl: (import.meta.env.VITE_SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1').replace(/\/$/, ''),
  pollinationsBaseUrl: (import.meta.env.VITE_POLLINATIONS_BASE_URL ?? 'https://gen.pollinations.ai').replace(/\/$/, ''),
  tencentBaseUrl: (import.meta.env.VITE_TENCENT_TOKENHUB_BASE_URL ?? 'https://tokenhub.tencentmaas.com').replace(/\/$/, ''),
  threeDModel: import.meta.env.VITE_ARK_3D_MODEL ?? 'doubao-seed3d-2-0-260328',
  hyperThreeDModel: import.meta.env.VITE_ARK_HYPER3D_MODEL ?? 'hyper3d-gen2-260112',
}

export const arkModels = { image: DEFAULT_IMAGE_MODEL, video: DEFAULT_VIDEO_MODEL, threeD: config.threeDModel, hyperThreeD: config.hyperThreeDModel }

function providerForSettings(settings: Pick<GenerationSettings, 'kind' | 'imageModel' | 'videoModel' | 'threeDModel'>) {
  if (settings.kind === '3d') return getThreeDModel(settings.threeDModel).provider
  return settings.kind === 'image'
    ? (imageModels.find((model) => model.id === settings.imageModel) ?? imageModels[0]).provider
    : (videoModels.find((model) => model.id === settings.videoModel) ?? videoModels[0]).provider
}

export function hasApiKeyForSettings(settings: Pick<GenerationSettings, 'kind' | 'imageModel' | 'videoModel' | 'threeDModel'>) {
  return isProviderConfigured(providerForSettings(settings))
}

export function getProviderName(settings: Pick<GenerationSettings, 'kind' | 'imageModel' | 'videoModel' | 'threeDModel'>) {
  const provider = providerForSettings(settings)
  return provider === 'agnes' ? 'Agnes AI'
    : provider === 'siliconflow' ? 'SiliconFlow'
      : provider === 'cloudflare' ? 'Cloudflare Workers AI'
        : provider === 'pollinations' ? 'Pollinations'
          : provider === 'tencent' ? '腾讯混元 TokenHub'
            : '火山方舟'
}

function snapshot(settings: GenerationSettings): SettingsSnapshot {
  const { firstFrame, lastFrame, referenceImages, ...values } = settings
  return { ...values, usedFirstFrame: Boolean(firstFrame), usedLastFrame: Boolean(lastFrame), referenceImageCount: referenceImages?.length ?? 0 }
}

async function arkFetch<T>(path: string, init: RequestInit): Promise<T> {
  try {
    return await generationRequest<T>('ark', `${config.baseUrl}${path}`, init.method === 'GET' ? 'GET' : 'POST', parseRequestBody(init.body), init.signal ?? undefined)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('已停止本地查询，远端任务可能仍在继续', { cause: error })
    throw error
  }
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

async function agnesFetch<T>(path: string, init: RequestInit): Promise<T> {
  const baseUrl = path.startsWith('/agnesapi') ? config.agnesBaseUrl.replace(/\/v1$/, '') : config.agnesBaseUrl
  try {
    return await generationRequest<T>('agnes', `${baseUrl}${path}`, init.method === 'GET' ? 'GET' : 'POST', parseRequestBody(init.body), init.signal ?? undefined)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('已停止本地查询，远端任务可能仍在继续', { cause: error })
    if (error instanceof Error && /429|频率|rate/i.test(error.message)) throw new AgnesRateLimitError(AGNES_VIDEO_POLL_INTERVAL_MS)
    throw error
  }
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

function parseRequestBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof body !== 'string') return {}
  try {
    return JSON.parse(body) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function generationRequest<T>(
  provider: string,
  url: string,
  method: 'GET' | 'POST',
  payload: Record<string, unknown>,
  signal?: AbortSignal,
  responseType: 'json' | 'binary' = 'json',
  action?: string,
  version?: string,
): Promise<T> {
  const response = await fetch('/__generation_request', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, url, method, payload, responseType, ...(action ? { action, version } : {}) }),
  })
  const result = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(result.error || `服务商请求失败（${response.status}）`)
  return result
}

async function durableJsonPost<T>(_jobId: string, provider: string, url: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  return generationRequest<T>(provider, url, 'POST', payload, signal)
}

async function beginDurableVideoJob(_jobId: string, provider: string, url: string, signal?: AbortSignal) {
  const result = await generationRequest<{ dataBase64?: string, contentType?: string }>(provider, url, 'GET', {}, signal, 'binary')
  if (!result.dataBase64) throw new Error('视频服务未返回可播放内容')
  return `data:${result.contentType || 'video/mp4'};base64,${result.dataBase64}`
}

async function uploadPollinationsImage(image: { dataUrl: string; mimeType: string; name: string }, jobId: string, signal?: AbortSignal) {
  const result = await durableJsonPost<{ url?: string }>(
    jobId,
    'pollinations',
    `${config.pollinationsBaseUrl}/upload`,
    { data: image.dataUrl, contentType: image.mimeType, name: image.name },
    signal,
  )
  if (!result.url) throw new Error('Pollinations 未返回参考图上传地址')
  return result.url
}

interface TencentAsyncImageResponse {
  id?: string
  status?: string
  data?: Array<{ url?: string; b64_json?: string }>
  error?: { message?: string } | string
}

interface TencentNativeImageResponse {
  Response?: {
    ResultImage?: string
    JobId?: string
    JobStatusCode?: string
    ResultImageUrls?: string[]
    Error?: { Message?: string }
  }
}

interface TencentNativeThreeDResponse {
  error?: { message?: string }
  Response?: {
    JobId?: string
    Status?: string
    ResultFile3Ds?: Array<{ Type?: string; Url?: string }>
    Error?: { Message?: string }
  }
}

async function tencentNativeRequest<T>(host: string, action: string, version: string, payload: Record<string, unknown>, signal?: AbortSignal) {
  return generationRequest<T>('tencent', host, 'POST', payload, signal, 'json', action, version)
}

function base64Payload(dataUrl: string) {
  return dataUrl.split(',', 2)[1] ?? dataUrl
}

async function generateTencentNativeImage(model: string, prompt: string, ratio: string, referenceImage: string | undefined, signal?: AbortSignal) {
  const resolutionByRatio: Record<string, string> = {
    '1:1': '1024:1024', '4:3': '1024:768', '3:4': '768:1024', '16:9': '1280:720', '9:16': '720:1280',
  }
  if (model === 'hy-image-lite') {
    const result = await tencentNativeRequest<TencentNativeImageResponse>(
      'https://hunyuan.tencentcloudapi.com/',
      'TextToImageLite',
      '2023-09-01',
      { Prompt: prompt.slice(0, 256), Resolution: resolutionByRatio[ratio] ?? '1024:1024', RspImgType: 'url' },
      signal,
    )
    const url = result.Response?.ResultImage
    if (!url) throw new Error(result.Response?.Error?.Message || '腾讯云混元未返回图片')
    return { data: [{ url }] }
  }
  const submitted = await tencentNativeRequest<TencentNativeImageResponse>(
    'https://hunyuan.tencentcloudapi.com/',
    'SubmitHunyuanImageJob',
    '2023-09-01',
    { Prompt: prompt.slice(0, 1024), Resolution: resolutionByRatio[ratio] ?? '1024:1024', ...(referenceImage ? { ContentImage: { ImageBase64: base64Payload(referenceImage) } } : {}) },
    signal,
  )
  const jobId = submitted.Response?.JobId
  if (!jobId) throw new Error(submitted.Response?.Error?.Message || '腾讯云混元未返回图片任务 ID')
  const startedAt = Date.now()
  let attempt = 0
  while (Date.now() - startedAt < 15 * 60 * 1000) {
    const result = await tencentNativeRequest<TencentNativeImageResponse>('https://hunyuan.tencentcloudapi.com/', 'QueryHunyuanImageJob', '2023-09-01', { JobId: jobId }, signal)
    const response = result.Response
    const code = response?.JobStatusCode
    const url = response?.ResultImage || response?.ResultImageUrls?.[0]
    if (url && code === '5') return { data: [{ url }] }
    if (code === '4') throw new Error(response?.Error?.Message || '腾讯云混元图片任务失败')
    await wait(attempt++ < 10 ? 2000 : 5000, signal)
  }
  throw new Error('腾讯云混元图片任务仍在生成 请稍后重试')
}

async function generateTencentImage(model: string, prompt: string, ratio: string, referenceImage: string | undefined, signal?: AbortSignal) {
  if (getProviderAuthMode('tencent') === 'tencent-cloud') return generateTencentNativeImage(model, prompt, ratio, referenceImage, signal)
  const resolutionByRatio: Record<string, string> = {
    '1:1': '1024:1024',
    '4:3': '1024:768',
    '3:4': '768:1024',
    '16:9': '1280:720',
    '9:16': '720:1280',
  }
  if (model === 'hy-image-lite') {
    return durableJsonPost<TencentAsyncImageResponse>(
      `tencent-image-${crypto.randomUUID()}`,
      'tencent',
      `${config.tencentBaseUrl}/v1/api/image/lite`,
      { model, prompt, resolution: resolutionByRatio[ratio], rsp_img_type: 'url' },
      signal,
    )
  }

  const submitted = await durableJsonPost<TencentAsyncImageResponse>(
    `tencent-image-${crypto.randomUUID()}`,
    'tencent',
    `${config.tencentBaseUrl}/v1/api/image/submit`,
    { model, prompt, resolution: resolutionByRatio[ratio], ...(referenceImage ? { images: [referenceImage] } : {}) },
    signal,
  )
  if (!submitted.id) throw new Error('腾讯混元未返回图片任务 ID')
  const startedAt = Date.now()
  let attempt = 0
  while (Date.now() - startedAt < 15 * 60 * 1000) {
    const result = await durableJsonPost<TencentAsyncImageResponse>(
      `tencent-image-query-${submitted.id}`,
      'tencent',
      `${config.tencentBaseUrl}/v1/api/image/query`,
      { model, id: submitted.id },
      signal,
    )
    const status = (result.status ?? '').toLowerCase()
    if (result.data?.some((item) => item.url || item.b64_json)) return result
    if (['failed', 'error', 'cancelled', 'expired'].includes(status)) {
      const message = typeof result.error === 'string' ? result.error : result.error?.message
      throw new Error(message || `腾讯混元图片任务已${status === 'cancelled' ? '取消' : '失败'}`)
    }
    await wait(attempt++ < 10 ? 2000 : 5000, signal)
  }
  throw new Error('腾讯混元图片任务仍在生成，可稍后重试')
}

export async function generateImage(settings: GenerationSettings, sessionId: string, signal?: AbortSignal, generationJobId: string = crypto.randomUUID()): Promise<GeneratedAsset[]> {
  const template = styleTemplates.find((item) => item.id === settings.styleId)
  const compiledPrompt = compilePrompt(settings, template)
  const imageOption = imageModels.find((model) => model.id === settings.imageModel) ?? imageModels[0]
  const imageModel = imageOption.apiModel ?? imageOption.id ?? DEFAULT_IMAGE_MODEL
  const referenceImage = settings.firstFrame?.dataUrl
  const imageSizes: Record<string, string> = { '1:1': '1024x1024', '4:3': '1024x768', '3:4': '768x1024', '16:9': '1024x576', '9:16': '576x1024' }
  let response: { data?: Array<{ url?: string; b64_json?: string }>; images?: Array<{ url?: string }>; result?: { image?: string } }
  if (imageOption.provider === 'tencent') {
    response = await generateTencentImage(imageModel, compiledPrompt, settings.ratio, referenceImage, signal)
  } else if (imageOption.provider === 'agnes') {
      response = await durableJsonPost<{ data?: Array<{ url?: string; b64_json?: string }> }>(
        `image-${generationJobId}`,
        'agnes',
        `${config.agnesBaseUrl}/images/generations`,
        { model: imageModel, prompt: compiledPrompt, size: settings.resolution, ratio: settings.ratio, extra_body: { response_format: 'url', ...(referenceImage ? { image: [referenceImage] } : {}) } },
        signal,
      )
  } else if (imageOption.provider === 'siliconflow') {
    response = await durableJsonPost<{ images?: Array<{ url?: string }> }>(
      `image-${generationJobId}`,
      'siliconflow',
      `${config.siliconFlowBaseUrl}/images/generations`,
      { model: imageModel, prompt: compiledPrompt, image_size: imageSizes[settings.ratio], batch_size: 1, num_inference_steps: 20, guidance_scale: 7.5 },
      signal,
    )
  } else if (imageOption.provider === 'pollinations') {
    const communityModel = imageModel.includes('/')
    response = await durableJsonPost<{ data?: Array<{ url?: string; b64_json?: string }> }>(
      `image-${generationJobId}`,
      'pollinations',
      `${config.pollinationsBaseUrl}/v1/images/generations`,
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
      'cloudflare',
      `https://api.cloudflare.com/client/v4/accounts/__ACCOUNT_ID__/ai/run/${imageModel}`,
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
        'ark',
        `${config.baseUrl}/images/generations`,
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
  data?: Array<{ type?: string; url?: string; preview_image_url?: string }>
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
    const resultUrl = await beginDurableVideoJob(taskId, 'pollinations', url.toString(), signal)
    return { taskId, provider: 'pollinations', resultUrl, compiledPrompt, settings: snapshot(settings), sessionId, createdAt: Date.now() }
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
    const response = await durableJsonPost<VideoTaskResponse>(`video-${requestId}`, 'agnes', `${config.agnesBaseUrl}/videos`, body, signal)
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
    'ark',
    `${config.baseUrl}/contents/generations/tasks`,
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
      if (!task.resultUrl) throw new Error('Pollinations 视频结果不存在，请重新提交')
      options.onState('已完成')
      return { id: crypto.randomUUID(), taskId: task.taskId, kind: 'video' as const, url: task.resultUrl, prompt: task.settings.prompt, compiledPrompt: task.compiledPrompt, createdAt: Date.now(), settings: task.settings, sessionId: task.sessionId }
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
  const model = settings.threeDModel ?? config.threeDModel as GenerationSettings['threeDModel']
  const provider = getThreeDModel(model).provider
  if (settings.mode === 'image-to-3d' && !settings.firstFrame) throw new Error('请先上传用于生成 3D 的参考图片')
  if (settings.mode === 'text-to-3d' && !settings.prompt.trim()) throw new Error('请先描述要生成的 3D 模型')
  const command = settings.prompt.trim() || '--subdivisionlevel medium --fileformat glb'
  if (provider === 'tencent') {
    if (getProviderAuthMode('tencent') === 'tencent-cloud') {
      const selectedModel = model ?? config.threeDModel
      const nativeModel = selectedModel === 'hy-3d-express' ? undefined : selectedModel.includes('3.1') ? '3.1' : '3.0'
      const rapid = !nativeModel
      const payload = settings.mode === 'image-to-3d'
        ? { ...(nativeModel ? { Model: nativeModel } : {}), ImageBase64: base64Payload(settings.firstFrame!.dataUrl), ResultFormat: 'GLB' }
        : { ...(nativeModel ? { Model: nativeModel } : {}), Prompt: settings.prompt.trim(), ResultFormat: 'GLB' }
      const response = await tencentNativeRequest<TencentNativeThreeDResponse>(
        'https://ai3d.tencentcloudapi.com/',
        rapid ? 'SubmitHunyuanTo3DRapidJob' : 'SubmitHunyuanTo3DProJob',
        '2025-05-13',
        payload,
        signal,
      )
      const taskId = response.Response?.JobId
      if (!taskId) throw new Error(response.Response?.Error?.Message || '腾讯云混元 3D 未返回任务 ID')
      return { taskId, provider, compiledPrompt: settings.mode === 'text-to-3d' ? settings.prompt.trim() : '图片转 3D', settings: snapshot(settings), sessionId, createdAt: Date.now() }
    }
    const response = await durableJsonPost<ThreeDTaskResponse>(
      `3d-${requestId}`,
      'tencent',
      `${config.tencentBaseUrl}/v1/api/3d/submit`,
      settings.mode === 'image-to-3d'
        ? { model, image_base64: settings.firstFrame!.dataUrl.split(',', 2)[1] ?? settings.firstFrame!.dataUrl }
        : { model, prompt: settings.prompt.trim() },
      signal,
    )
    const taskId = response.id ?? response.task_id
    if (!taskId) throw new Error('腾讯混元未返回 3D 任务 ID')
    return { taskId, provider, compiledPrompt: settings.mode === 'text-to-3d' ? settings.prompt.trim() : '图片转 3D', settings: snapshot(settings), sessionId, createdAt: Date.now() }
  }
  if (!settings.firstFrame) throw new Error('方舟 3D 模型需要上传一张参考图片')
  const response = await durableJsonPost<ThreeDTaskResponse>(
    `3d-${requestId}`,
    'ark',
    `${config.baseUrl}/contents/generations/tasks`,
    {
      model,
      content: [
        { type: 'text', text: command },
        { type: 'image_url', image_url: { url: settings.firstFrame.dataUrl } },
      ],
    },
    signal,
  )
  const taskId = response.id ?? response.task_id
  if (!taskId) throw new Error('方舟未返回 3D 任务 ID，请核对当前 API 协议')
  return { taskId, provider, compiledPrompt: command, settings: snapshot(settings), sessionId, createdAt: Date.now() }
}

export async function waitForThreeD(task: PendingThreeDTask, options: { signal?: AbortSignal; onState: (value: string) => void }) {
  const startedAt = Date.now()
  let attempt = 0
  while (Date.now() - startedAt < 30 * 60 * 1000) {
    const result = task.provider === 'tencent' && getProviderAuthMode('tencent') === 'tencent-cloud'
      ? await tencentNativeRequest<TencentNativeThreeDResponse>('https://ai3d.tencentcloudapi.com/', task.settings.threeDModel === 'hy-3d-express' ? 'QueryHunyuanTo3DRapidJob' : 'QueryHunyuanTo3DProJob', '2025-05-13', { JobId: task.taskId }, options.signal)
      : task.provider === 'tencent'
      ? await durableJsonPost<ThreeDTaskResponse>(`3d-query-${task.taskId}`, 'tencent', `${config.tencentBaseUrl}/v1/api/3d/query`, { model: task.settings.threeDModel, id: task.taskId }, options.signal)
      : await arkFetch<ThreeDTaskResponse>(`/contents/generations/tasks/${task.taskId}`, { method: 'GET', signal: options.signal })
    const nativeResponse = (result as TencentNativeThreeDResponse).Response
    const status = (nativeResponse?.Status ?? (result as ThreeDTaskResponse).status ?? '').toLowerCase()
    options.onState(status || 'processing')
    const nativeFile = nativeResponse?.ResultFile3Ds?.find((file) => file.Type?.toLowerCase() === 'glb') ?? nativeResponse?.ResultFile3Ds?.[0]
    const legacyFile = (result as ThreeDTaskResponse).data?.find((file) => file.type?.toLowerCase() === 'glb') ?? (result as ThreeDTaskResponse).data?.[0]
    const url = nativeFile?.Url ?? legacyFile?.url ?? (result as ThreeDTaskResponse).content?.file_url ?? (result as ThreeDTaskResponse).output?.file_url ?? (result as ThreeDTaskResponse).file_url
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
  const tencentThreeD = asset.kind === '3d' && getThreeDModel(asset.settings.threeDModel).provider === 'tencent'
  const result = tencentThreeD
    ? await durableJsonPost<VideoTaskResponse & ThreeDTaskResponse>(`3d-refresh-${asset.taskId}`, 'tencent', `${config.tencentBaseUrl}/v1/api/3d/query`, { model: asset.settings.threeDModel, id: asset.taskId }, signal)
    : agnesVideo
    ? await agnesFetch<VideoTaskResponse & ThreeDTaskResponse>(`/agnesapi?video_id=${encodeURIComponent(asset.taskId)}`, { method: 'GET', signal })
    : await arkFetch<VideoTaskResponse & ThreeDTaskResponse>(`/contents/generations/tasks/${asset.taskId}`, { method: 'GET', signal })
  const status = (result.status ?? '').toLowerCase()
  if (['failed', 'error', 'cancelled', 'expired'].includes(status)) throw new Error(result.error?.message || `远端任务状态为 ${status}`)
  const url = asset.kind === 'video'
    ? result.metadata?.url ?? result.content?.video_url ?? result.output?.video_url ?? result.video_url
    : (result.data?.find((file) => file.type?.toLowerCase() === 'glb') ?? result.data?.[0])?.url ?? result.content?.file_url ?? result.output?.file_url ?? result.file_url
  if (!url) throw new Error(status && status !== 'succeeded' && status !== 'completed' ? `远端任务仍在 ${status}` : '服务商没有返回新的资源链接')
  return url
}
