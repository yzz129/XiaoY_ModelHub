import { useCallback, useEffect, useRef, useState } from 'react'
import { generateImage } from '../lib/ark'
import { saveGeneratedAsset } from '../lib/output'
import { loadImageJobs, saveImageJobs } from '../lib/storage'
import type { GeneratedAsset, GenerationSettings, ImageJob } from '../types/generation'

interface UseImageQueueOptions {
  onComplete: (assets: GeneratedAsset[]) => void | Promise<void>
  onNotice: (message: string) => void
  onError: (message: string) => void
  onFailed?: (job: ImageJob, message: string) => void | Promise<void>
}

export function useImageQueue({ onComplete, onNotice, onError, onFailed }: UseImageQueueOptions) {
  const [jobs, setJobsState] = useState<ImageJob[]>([])
  const [hydrated, setHydrated] = useState(false)
  const jobsRef = useRef<ImageJob[]>([])
  const running = useRef(new Set<string>())
  const controllers = useRef(new Map<string, AbortController>())

  const setJobs = useCallback((update: ImageJob[] | ((current: ImageJob[]) => ImageJob[])) => {
    setJobsState((current) => {
      const next = typeof update === 'function' ? update(current) : update
      jobsRef.current = next
      void saveImageJobs(next)
      return next
    })
  }, [])

  useEffect(() => {
    let active = true
    const activeControllers = controllers.current
    void loadImageJobs().then((loaded) => {
      if (!active) return
      jobsRef.current = loaded
      setJobsState(loaded)
      setHydrated(true)
    })
    return () => { active = false; activeControllers.forEach((controller) => controller.abort()) }
  }, [])

  const updateJob = useCallback((id: string, patch: Partial<ImageJob>) => {
    setJobs((current) => current.map((job) => job.id === id ? { ...job, ...patch, updatedAt: Date.now() } : job))
  }, [setJobs])

  const execute = useCallback(async (jobId: string) => {
    if (running.current.has(jobId)) return
    const initial = jobsRef.current.find((job) => job.id === jobId)
    if (!initial) return
    running.current.add(jobId)
    const controller = new AbortController()
    controllers.current.set(jobId, controller)
    updateJob(jobId, { status: 'running', error: undefined })
    try {
      const remoteResults = await generateImage(initial.settings, initial.sessionId, controller.signal, initial.id)
      if (!remoteResults.length) throw new Error('生成服务已响应，但没有返回可展示的图片')
      const results = await Promise.all(remoteResults.map((asset) => saveGeneratedAsset(asset, controller.signal)))
      await onComplete(results)
      setJobs((current) => current.filter((job) => job.id !== jobId))
      onNotice(`${results.length} 张图片已完成并保存；刷新页面不会中断任务`)
    } catch (caught) {
      if (controller.signal.aborted) return
      const message = caught instanceof Error ? caught.message : '图片任务失败'
      updateJob(jobId, { status: 'failed', error: message })
      onError(message)
      await onFailed?.(initial, message)
    } finally {
      running.current.delete(jobId)
      controllers.current.delete(jobId)
    }
  }, [onComplete, onError, onFailed, onNotice, setJobs, updateJob])

  useEffect(() => {
    if (!hydrated || running.current.size) return
    const candidate = jobs.find((job) => job.status === 'queued' && !running.current.has(job.id))
    if (candidate) void execute(candidate.id)
  }, [execute, hydrated, jobs])

  const enqueue = useCallback(async (settings: GenerationSettings, sessionId: string) => {
    if (jobsRef.current.some((job) => job.status === 'queued' || job.status === 'running')) throw new Error('已有图片正在生成，请等待当前任务完成')
    const now = Date.now()
    const job: ImageJob = { id: crypto.randomUUID(), status: 'queued', settings: structuredClone(settings), sessionId, createdAt: now, updatedAt: now }
    const next = [job]
    if (!await saveImageJobs(next)) throw new Error('无法保存图片任务，请释放浏览器存储空间后重试')
    jobsRef.current = next
    setJobsState(next)
    return job.id
  }, [])

  const retry = useCallback(async (id: string) => {
    const failed = jobsRef.current.find((job) => job.id === id)
    if (!failed) return
    const now = Date.now()
    const replacement: ImageJob = { ...failed, id: crypto.randomUUID(), status: 'queued', createdAt: now, updatedAt: now, error: undefined }
    if (!await saveImageJobs([replacement])) {
      onError('无法保存重试任务，请释放浏览器存储空间后重试')
      return
    }
    jobsRef.current = [replacement]
    setJobsState([replacement])
    onNotice('已创建新的图片重试任务')
  }, [onError, onNotice])

  return { jobs, hydrated, enqueue, retry }
}
