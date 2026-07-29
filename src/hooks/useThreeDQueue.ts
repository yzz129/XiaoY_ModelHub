import { useCallback, useEffect, useRef, useState } from 'react'
import { createThreeDTask, waitForThreeD } from '../lib/ark'
import { loadThreeDJobs, saveThreeDJobs } from '../lib/storage'
import type { GeneratedAsset, GenerationSettings, ThreeDJob } from '../types/generation'

interface UseThreeDQueueOptions {
  maxConcurrency: number
  onComplete: (asset: GeneratedAsset) => void | Promise<void>
  onNotice: (message: string) => void
}

export function useThreeDQueue({ maxConcurrency, onComplete, onNotice }: UseThreeDQueueOptions) {
  const [jobs, setJobsState] = useState<ThreeDJob[]>([])
  const [hydrated, setHydrated] = useState(false)
  const jobsRef = useRef<ThreeDJob[]>([])
  const controllers = useRef(new Map<string, AbortController>())
  const running = useRef(new Set<string>())

  const setJobs = useCallback((update: ThreeDJob[] | ((current: ThreeDJob[]) => ThreeDJob[])) => {
    setJobsState((current) => {
      const next = typeof update === 'function' ? update(current) : update
      jobsRef.current = next
      void saveThreeDJobs(next)
      return next
    })
  }, [])

  useEffect(() => {
    let active = true
    const activeControllers = controllers.current
    void loadThreeDJobs().then((loaded) => {
      if (!active) return
      jobsRef.current = loaded
      setJobsState(loaded)
      setHydrated(true)
    })
    return () => { active = false; activeControllers.forEach((controller) => controller.abort()) }
  }, [])

  const updateJob = useCallback((id: string, patch: Partial<ThreeDJob>) => {
    setJobs((current) => current.map((job) => job.id === id ? { ...job, ...patch, updatedAt: Date.now() } : job))
  }, [setJobs])

  const execute = useCallback(async (jobId: string) => {
    if (running.current.has(jobId)) return
    const initial = jobsRef.current.find((job) => job.id === jobId)
    if (!initial) return
    running.current.add(jobId)
    const controller = new AbortController()
    controllers.current.set(jobId, controller)
    updateJob(jobId, { status: initial.remoteTask ? 'running' : 'submitting', error: undefined })
    let activeRemoteTask = initial.remoteTask
    try {
      const remoteTask = activeRemoteTask ?? await createThreeDTask(initial.settings, initial.sessionId, controller.signal, `${initial.id}-${initial.submissionAttempt ?? 0}`)
      activeRemoteTask = remoteTask
      updateJob(jobId, { status: 'running', remoteTask, providerStatus: 'queued' })
      const result = await waitForThreeD(remoteTask, { signal: controller.signal, onState: (providerStatus) => updateJob(jobId, { providerStatus }) })
      await onComplete(result)
      setJobs((current) => current.filter((job) => job.id !== jobId))
      onNotice('一个 3D 任务已完成，并已保存到 output/models')
    } catch (caught) {
      const current = jobsRef.current.find((job) => job.id === jobId)
      if (current?.status !== 'paused') updateJob(jobId, { status: 'failed', remoteTask: current?.remoteTask ?? activeRemoteTask, error: caught instanceof Error ? caught.message : '3D 任务失败' })
    } finally {
      running.current.delete(jobId)
      controllers.current.delete(jobId)
    }
  }, [onComplete, onNotice, setJobs, updateJob])

  useEffect(() => {
    if (!hydrated) return
    const activeCount = jobs.filter((job) => ['submitting', 'running'].includes(job.status) && running.current.has(job.id)).length
    const available = Math.max(0, maxConcurrency - activeCount)
    jobs.filter((job) => job.status === 'queued' && !running.current.has(job.id)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)).slice(0, available).forEach((job) => void execute(job.id))
  }, [execute, hydrated, jobs, maxConcurrency])

  const enqueue = useCallback(async (settings: GenerationSettings, sessionId: string) => {
    const now = Date.now()
    const job: ThreeDJob = { id: crypto.randomUUID(), status: 'queued', settings: structuredClone(settings), sessionId, createdAt: now, updatedAt: now }
    const next = [...jobsRef.current, job]
    if (!await saveThreeDJobs(next)) throw new Error('无法保存 3D 任务，请释放浏览器存储空间后重试')
    jobsRef.current = next
    setJobsState(next)
    return next.filter((item) => item.status === 'queued').length
  }, [])

  const pause = useCallback((id: string) => { updateJob(id, { status: 'paused', error: undefined }); controllers.current.get(id)?.abort() }, [updateJob])
  const resume = useCallback((id: string) => updateJob(id, { status: 'queued', error: undefined }), [updateJob])
  const retry = useCallback((id: string) => {
    const job = jobsRef.current.find((item) => item.id === id)
    updateJob(id, { status: 'queued', error: undefined, ...(!job?.remoteTask ? { submissionAttempt: (job?.submissionAttempt ?? 0) + 1 } : {}) })
  }, [updateJob])
  const remove = useCallback((id: string) => { controllers.current.get(id)?.abort(); running.current.delete(id); setJobs((current) => current.filter((job) => job.id !== id)) }, [setJobs])

  return { jobs, hydrated, enqueue, pause, resume, retry, remove }
}
