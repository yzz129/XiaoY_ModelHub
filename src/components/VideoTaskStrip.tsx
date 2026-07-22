import { Box, Clock3, Copy, ListVideo, Pause, Play, RotateCcw, Settings2, Trash2, X } from 'lucide-react'
import type { ThreeDJob, VideoJob } from '../types/generation'

type AsyncJob = VideoJob | ThreeDJob

interface VideoTaskStripProps {
  jobs: AsyncJob[]
  kind?: 'video' | '3d'
  maxConcurrency: number
  onOpenSettings: () => void
  onPause: (id: string) => void
  onResume: (id: string) => void
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onReuse: (job: AsyncJob) => void
}

const statusLabels: Record<VideoJob['status'], string> = {
  queued: '等待空闲槽位', submitting: '正在提交方舟', running: '正在生成', paused: '本地查询已暂停', failed: '任务需要处理',
}

export function VideoTaskStrip({ jobs, kind = 'video', maxConcurrency, onOpenSettings, onPause, onResume, onRetry, onRemove, onReuse }: VideoTaskStripProps) {
  if (!jobs.length) return null
  const active = jobs.filter((job) => job.status === 'submitting' || job.status === 'running').length
  const queued = jobs.filter((job) => job.status === 'queued').length
  const titleId = `${kind}-tasks-title`
  return <section className="video-task-strip" aria-labelledby={titleId}>
    <div className="task-strip-head">
      <div>{kind === '3d' ? <Box size={18} /> : <ListVideo size={18} />}<strong id={titleId}>{kind === '3d' ? '3D 任务' : '视频任务'}</strong><span>{active} / {maxConcurrency} 运行中</span>{queued > 0 && <span>{queued} 排队</span>}</div>
      <button type="button" onClick={onOpenSettings}><Settings2 size={15} />并发设置</button>
    </div>
    <div className="task-list">
      {jobs.slice().sort((a, b) => a.createdAt - b.createdAt).map((job) => <article className={`task-card ${job.status}`} key={job.id}>
        <div className="task-card-main"><div className="task-status"><i /><span>{statusLabels[job.status]}</span>{job.status === 'queued' && <b>#{jobs.filter((item) => item.status === 'queued').findIndex((item) => item.id === job.id) + 1}</b>}</div><p>{job.settings.prompt}</p><small><Clock3 size={12} />{new Date(job.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}{job.remoteTask && <> · {job.remoteTask.taskId.slice(0, 20)}…</>}</small>{job.error && <em role="alert">{job.error}</em>}</div>
        <div className="task-card-actions">
          {job.remoteTask && <button type="button" aria-label="复制任务 ID" onClick={() => void navigator.clipboard.writeText(job.remoteTask!.taskId)}><Copy size={15} /></button>}
          <button type="button" aria-label="复用任务参数" onClick={() => onReuse(job)}><RotateCcw size={15} /></button>
          {(job.status === 'running' || job.status === 'submitting') && <button type="button" aria-label="停止本地处理" onClick={() => onPause(job.id)}><Pause size={15} /></button>}
          {job.status === 'paused' && <button type="button" aria-label="继续查询任务" onClick={() => onResume(job.id)}><Play size={15} /></button>}
          {job.status === 'failed' && <button type="button" aria-label={job.remoteTask ? '继续查询任务' : '重新排队'} onClick={() => onRetry(job.id)}><Play size={15} /></button>}
          {job.status === 'queued' && <button type="button" aria-label="取消排队" onClick={() => onRemove(job.id)}><X size={15} /></button>}
          {(job.status === 'paused' || job.status === 'failed') && <button type="button" className="danger" aria-label="移除任务记录" onClick={() => { if (!job.remoteTask || window.confirm('移除记录不会取消方舟远端任务，也将失去自动恢复能力。确定继续吗？')) onRemove(job.id) }}><Trash2 size={15} /></button>}
        </div>
      </article>)}
    </div>
  </section>
}
