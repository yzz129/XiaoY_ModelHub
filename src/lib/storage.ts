import type { GeneratedAsset, ImageJob, PendingVideoTask, SettingsSnapshot, ThreeDJob, VideoJob, WorkspacePreferences } from '../types/generation'

const HISTORY_KEY = 'muse-history-v2'
const LEGACY_HISTORY_KEY = 'muse-history'
const LEGACY_PENDING_KEY = 'muse-pending-video-v1'
const PREFERENCES_KEY = 'muse-settings-v1'
const MAX_HISTORY = 24
export const DEFAULT_MAX_VIDEO_CONCURRENCY = 2
export const DEFAULT_MAX_3D_CONCURRENCY = 2

function fallbackSettings(asset: Partial<GeneratedAsset>): SettingsSnapshot {
  const kind = asset.kind === 'video' || asset.kind === '3d' ? asset.kind : 'image'
  return { kind, mode: kind === '3d' ? 'image-to-3d' : 'text', prompt: typeof asset.prompt === 'string' ? asset.prompt : '', ratio: '16:9', resolution: kind === 'video' ? '1080p' : '2K', duration: 5, count: 1, styleId: 'cinema', imageModel: 'doubao-seedream-5-0-pro-260628', videoModel: 'doubao-seedance-2-0-260128', usedFirstFrame: kind === '3d', usedLastFrame: false, referenceImageCount: 0 }
}

function normalizeAsset(value: unknown): GeneratedAsset | null {
  if (!value || typeof value !== 'object') return null
  const asset = value as Partial<GeneratedAsset>
  if (typeof asset.id !== 'string' || !['image', 'video', '3d'].includes(asset.kind ?? '') || typeof asset.url !== 'string') return null
  const kind = asset.kind as GeneratedAsset['kind']
  const prompt = typeof asset.prompt === 'string' ? asset.prompt : ''
  return { id: asset.id, kind, url: asset.url, prompt, compiledPrompt: typeof asset.compiledPrompt === 'string' ? asset.compiledPrompt : prompt, createdAt: typeof asset.createdAt === 'number' ? asset.createdAt : Date.now(), settings: asset.settings ?? fallbackSettings(asset), sessionId: typeof asset.sessionId === 'string' ? asset.sessionId : 'legacy', taskId: typeof asset.taskId === 'string' ? asset.taskId : undefined, outputPath: typeof asset.outputPath === 'string' ? asset.outputPath : undefined }
}

export function loadHistory(): GeneratedAsset[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY) ?? localStorage.getItem(LEGACY_HISTORY_KEY) ?? '[]'
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(normalizeAsset).filter((item): item is GeneratedAsset => Boolean(item)).slice(0, MAX_HISTORY) : []
  } catch { return [] }
}

export function saveHistory(assets: GeneratedAsset[]) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(assets.slice(0, MAX_HISTORY))); return true } catch { return false } }
export function clearHistory() { localStorage.removeItem(HISTORY_KEY); localStorage.removeItem(LEGACY_HISTORY_KEY) }

function clampConcurrency(value: unknown) {
  const number = typeof value === 'number' && Number.isInteger(value) ? value : DEFAULT_MAX_VIDEO_CONCURRENCY
  return Math.min(4, Math.max(1, number))
}

export function loadPreferences(): WorkspacePreferences {
  try { const parsed = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') as Partial<WorkspacePreferences>; return { maxVideoConcurrency: clampConcurrency(parsed.maxVideoConcurrency), maxThreeDConcurrency: clampConcurrency(parsed.maxThreeDConcurrency ?? DEFAULT_MAX_3D_CONCURRENCY) } }
  catch { return { maxVideoConcurrency: DEFAULT_MAX_VIDEO_CONCURRENCY, maxThreeDConcurrency: DEFAULT_MAX_3D_CONCURRENCY } }
}

export function savePreferences(preferences: WorkspacePreferences) {
  const normalized = { maxVideoConcurrency: clampConcurrency(preferences.maxVideoConcurrency), maxThreeDConcurrency: clampConcurrency(preferences.maxThreeDConcurrency) }
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(normalized)); return normalized
}

function isVideoJob(value: unknown): value is VideoJob {
  if (!value || typeof value !== 'object') return false
  const job = value as Partial<VideoJob>
  return typeof job.id === 'string' && ['queued', 'submitting', 'running', 'paused', 'failed'].includes(job.status ?? '') && Boolean(job.settings) && typeof job.sessionId === 'string'
}

function openJobsDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('muse-workspace', 3)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('videoJobs')) database.createObjectStore('videoJobs', { keyPath: 'id' })
      if (!database.objectStoreNames.contains('threeDJobs')) database.createObjectStore('threeDJobs', { keyPath: 'id' })
      if (!database.objectStoreNames.contains('imageJobs')) database.createObjectStore('imageJobs', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function readAllJobs() {
  const database = await openJobsDatabase()
  return new Promise<VideoJob[]>((resolve, reject) => {
    const request = database.transaction('videoJobs', 'readonly').objectStore('videoJobs').getAll()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result.filter(isVideoJob))
  })
}

export async function loadVideoJobs(): Promise<VideoJob[]> {
  try {
    const jobs = await readAllJobs()
    const legacy = JSON.parse(localStorage.getItem(LEGACY_PENDING_KEY) ?? 'null') as PendingVideoTask | null
    if (legacy?.taskId && !jobs.some((job) => job.remoteTask?.taskId === legacy.taskId)) {
      jobs.push({ id: `legacy-${legacy.taskId}`, status: 'queued', settings: { ...legacy.settings }, sessionId: legacy.sessionId, createdAt: legacy.createdAt, updatedAt: Date.now(), remoteTask: legacy })
      await saveVideoJobs(jobs); localStorage.removeItem(LEGACY_PENDING_KEY)
    }
    const normalized = jobs.map((job): VideoJob => job.status === 'submitting' && !job.remoteTask ? { ...job, status: 'queued', error: undefined } : job)
    await saveVideoJobs(normalized)
    return normalized
  } catch { return [] }
}

export async function saveVideoJobs(jobs: VideoJob[]) {
  try {
    const database = await openJobsDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('videoJobs', 'readwrite')
      const store = transaction.objectStore('videoJobs')
      store.clear(); jobs.forEach((job) => store.put(job))
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()
    })
    return true
  } catch { return false }
}

function isImageJob(value: unknown): value is ImageJob {
  if (!value || typeof value !== 'object') return false
  const job = value as Partial<ImageJob>
  return typeof job.id === 'string' && ['queued', 'running', 'failed'].includes(job.status ?? '') && job.settings?.kind === 'image' && typeof job.sessionId === 'string'
}

export async function loadImageJobs(): Promise<ImageJob[]> {
  try {
    const database = await openJobsDatabase()
    const jobs = await new Promise<ImageJob[]>((resolve, reject) => {
      const request = database.transaction('imageJobs', 'readonly').objectStore('imageJobs').getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result.filter(isImageJob))
    })
    const normalized = jobs.map((job): ImageJob => job.status === 'running' ? { ...job, status: 'queued' } : job)
    await saveImageJobs(normalized)
    return normalized
  } catch { return [] }
}

export async function saveImageJobs(jobs: ImageJob[]) {
  try {
    const database = await openJobsDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('imageJobs', 'readwrite')
      const store = transaction.objectStore('imageJobs')
      store.clear(); jobs.forEach((job) => store.put(job))
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()
    })
    return true
  } catch { return false }
}

function isThreeDJob(value: unknown): value is ThreeDJob {
  if (!value || typeof value !== 'object') return false
  const job = value as Partial<ThreeDJob>
  return typeof job.id === 'string' && ['queued', 'submitting', 'running', 'paused', 'failed'].includes(job.status ?? '') && job.settings?.kind === '3d' && typeof job.sessionId === 'string'
}

export async function loadThreeDJobs(): Promise<ThreeDJob[]> {
  try {
    const database = await openJobsDatabase()
    const jobs = await new Promise<ThreeDJob[]>((resolve, reject) => {
      const request = database.transaction('threeDJobs', 'readonly').objectStore('threeDJobs').getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result.filter(isThreeDJob))
    })
    const normalized = jobs.map((job): ThreeDJob => job.status === 'submitting' && !job.remoteTask ? { ...job, status: 'queued', error: undefined } : job)
    await saveThreeDJobs(normalized)
    return normalized
  } catch { return [] }
}

export async function saveThreeDJobs(jobs: ThreeDJob[]) {
  try {
    const database = await openJobsDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('threeDJobs', 'readwrite')
      const store = transaction.objectStore('threeDJobs')
      store.clear(); jobs.forEach((job) => store.put(job))
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => resolve()
    })
    return true
  } catch { return false }
}
