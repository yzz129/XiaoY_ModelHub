import type { GenerationSettings, GeneratedAsset, PendingThreeDTask, PendingVideoTask, SettingsSnapshot } from '../types/generation'
import { compilePrompt } from './prompt'
import { styleTemplates } from '../data/templates'
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, imageModels, videoModels } from '../data/models'

const config = {
  apiKey: import.meta.env.VITE_ARK_API_KEY ?? '',
  baseUrl: import.meta.env.VITE_ARK_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3',
  threeDModel: import.meta.env.VITE_ARK_3D_MODEL ?? 'doubao-seed3d-2-0-260328',
  hyperThreeDModel: import.meta.env.VITE_ARK_HYPER3D_MODEL ?? 'hyper3d-gen2-260112',
}

export const hasApiKey = Boolean(config.apiKey)
export const arkModels = { image: DEFAULT_IMAGE_MODEL, video: DEFAULT_VIDEO_MODEL, threeD: config.threeDModel, hyperThreeD: config.hyperThreeDModel }

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

export async function generateImage(settings: GenerationSettings, sessionId: string, signal?: AbortSignal): Promise<GeneratedAsset[]> {
  const template = styleTemplates.find((item) => item.id === settings.styleId)
  const compiledPrompt = compilePrompt(settings, template)
  const imageModel = imageModels.find((model) => model.id === settings.imageModel)?.id ?? DEFAULT_IMAGE_MODEL
  const response = await arkFetch<{ data?: Array<{ url?: string; b64_json?: string }> }>('/images/generations', {
    method: 'POST', signal,
    body: JSON.stringify({ model: imageModel, prompt: compiledPrompt, size: settings.ratio === '1:1' ? settings.resolution : `${settings.resolution} ${settings.ratio}`, n: 1, response_format: 'url', watermark: false }),
  })
  return (response.data ?? []).flatMap((item) => {
    const url = item.url ?? (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '')
    return url ? [{ id: crypto.randomUUID(), kind: 'image' as const, url, prompt: settings.prompt, compiledPrompt, createdAt: Date.now(), settings: snapshot(settings), sessionId }] : []
  })
}

interface VideoTaskResponse {
  id?: string
  task_id?: string
  status?: string
  content?: { video_url?: string }
  video_url?: string
  output?: { video_url?: string }
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

export async function createVideoTask(settings: GenerationSettings, sessionId: string, signal?: AbortSignal): Promise<PendingVideoTask> {
  const template = styleTemplates.find((item) => item.id === settings.styleId)
  const compiledPrompt = compilePrompt(settings, template)
  const videoModel = videoModels.find((model) => model.id === settings.videoModel)?.id ?? DEFAULT_VIDEO_MODEL
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: compiledPrompt }]
  if (settings.firstFrame) content.push({ type: 'image_url', image_url: { url: settings.firstFrame.dataUrl }, role: 'first_frame' })
  if (settings.lastFrame) content.push({ type: 'image_url', image_url: { url: settings.lastFrame.dataUrl }, role: 'last_frame' })
  settings.referenceImages?.forEach((image) => content.push({ type: 'image_url', image_url: { url: image.dataUrl }, role: 'reference_image' }))
  const response = await arkFetch<VideoTaskResponse>('/contents/generations/tasks', {
    method: 'POST', signal,
    body: JSON.stringify({ model: videoModel, content, duration: settings.duration, ratio: settings.ratio, resolution: settings.resolution, watermark: false }),
  })
  const taskId = response.id ?? response.task_id
  if (!taskId) throw new Error('方舟未返回视频任务 ID，请核对当前 API 协议')
  return { taskId, compiledPrompt, settings: snapshot(settings), sessionId, createdAt: Date.now() }
}

export async function waitForVideo(task: PendingVideoTask, options: { signal?: AbortSignal; onState: (value: string) => void }) {
  const startedAt = Date.now()
  let attempt = 0
  while (Date.now() - startedAt < 12 * 60 * 1000) {
    const result = await arkFetch<VideoTaskResponse>(`/contents/generations/tasks/${task.taskId}`, { method: 'GET', signal: options.signal })
    const status = (result.status ?? '').toLowerCase()
    options.onState(status || 'processing')
    const url = result.content?.video_url ?? result.output?.video_url ?? result.video_url
    if (url) return { id: crypto.randomUUID(), taskId: task.taskId, kind: 'video' as const, url, prompt: task.settings.prompt, compiledPrompt: task.compiledPrompt, createdAt: Date.now(), settings: task.settings, sessionId: task.sessionId }
    if (['failed', 'error', 'cancelled', 'expired'].includes(status)) throw new Error(`视频任务已${status === 'failed' || status === 'error' ? '失败' : status === 'cancelled' ? '取消' : '过期'}`)
    const delay = attempt < 10 ? 2000 : 5000
    attempt += 1
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, delay)
      options.signal?.addEventListener('abort', () => { window.clearTimeout(timer); reject(new Error('已停止本地查询，远端任务可能仍在继续')) }, { once: true })
    })
  }
  throw new Error('查询等待已暂停，可稍后继续查询该视频任务')
}

export async function createThreeDTask(settings: GenerationSettings, sessionId: string, signal?: AbortSignal): Promise<PendingThreeDTask> {
  if (!settings.firstFrame) throw new Error('请先上传用于生成 3D 的参考图片')
  const command = settings.prompt.trim() || '--subdivisionlevel medium --fileformat glb'
  const response = await arkFetch<ThreeDTaskResponse>('/contents/generations/tasks', {
    method: 'POST', signal,
    body: JSON.stringify({
      model: settings.threeDModel ?? config.threeDModel,
      content: [
        { type: 'text', text: command },
        { type: 'image_url', image_url: { url: settings.firstFrame.dataUrl } },
      ],
    }),
  })
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
  if (!asset.taskId || asset.kind === 'image') throw new Error('这件作品没有可用于刷新链接的任务 ID')
  const result = await arkFetch<VideoTaskResponse & ThreeDTaskResponse>(`/contents/generations/tasks/${asset.taskId}`, { method: 'GET', signal })
  const status = (result.status ?? '').toLowerCase()
  if (['failed', 'error', 'cancelled', 'expired'].includes(status)) throw new Error(result.error?.message || `远端任务状态为 ${status}`)
  const url = asset.kind === 'video'
    ? result.content?.video_url ?? result.output?.video_url ?? result.video_url
    : result.content?.file_url ?? result.output?.file_url ?? result.file_url
  if (!url) throw new Error(status && status !== 'succeeded' ? `远端任务仍在 ${status}` : '方舟没有返回新的资源链接')
  return url
}
