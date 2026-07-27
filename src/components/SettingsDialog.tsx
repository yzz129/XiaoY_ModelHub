import { useEffect, useRef } from 'react'
import { AlertTriangle, KeyRound, Trash2, X } from 'lucide-react'
import { arkModels, hasApiKey } from '../lib/ark'
import { imageModels, videoModels } from '../data/models'

interface SettingsDialogProps {
  open: boolean
  maxVideoConcurrency: number
  maxThreeDConcurrency: number
  onVideoConcurrencyChange: (value: number) => void
  onThreeDConcurrencyChange: (value: number) => void
  onClose: () => void
  onClearHistory: () => void
}

export function SettingsDialog({ open, maxVideoConcurrency, maxThreeDConcurrency, onVideoConcurrencyChange, onThreeDConcurrencyChange, onClose, onClearHistory }: SettingsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={ref} className="settings-dialog" onClose={onClose} aria-labelledby="settings-title">
      <div className="dialog-head"><div><span>WORKSPACE</span><h2 id="settings-title">工作台设置</h2></div><button type="button" aria-label="关闭设置" onClick={onClose}><X /></button></div>
      <div className="connection-card">
        <div className={hasApiKey ? 'status-dot online' : 'status-dot'}><KeyRound size={19} /></div>
        <div><strong>{hasApiKey ? '火山方舟已配置' : '尚未配置 API Key'}</strong><p>{hasApiKey ? '当前浏览器可直接发起方舟请求' : '请在项目根目录的 .env.local 中填写 VITE_ARK_API_KEY'}</p></div>
      </div>
      <dl className="model-list"><div><dt>图片模型</dt><dd>{imageModels.length} 个方舟模型可选</dd></div><div><dt>视频模型</dt><dd>{videoModels.length} 个方舟模型可选</dd></div><div><dt>3D · Seed3D</dt><dd>{arkModels.threeD}</dd></div><div><dt>3D · Hyper3D</dt><dd>{arkModels.hyperThreeD}</dd></div></dl>
      <div className="concurrency-row"><div><strong>视频最高并发</strong><p>同时提交并等待的视频任务数。</p></div><div className="concurrency-options" aria-label="视频最高并发数">{[1, 2, 3, 4].map((value) => <button type="button" key={value} aria-pressed={maxVideoConcurrency === value} className={maxVideoConcurrency === value ? 'active' : ''} onClick={() => onVideoConcurrencyChange(value)}>{value}</button>)}</div></div>
      <div className="concurrency-row"><div><strong>3D 最高并发</strong><p>同时提交并等待的图片转 3D 任务数。</p></div><div className="concurrency-options" aria-label="3D 最高并发数">{[1, 2, 3, 4].map((value) => <button type="button" key={value} aria-pressed={maxThreeDConcurrency === value} className={maxThreeDConcurrency === value ? 'active' : ''} onClick={() => onThreeDConcurrencyChange(value)}>{value}</button>)}</div></div>
      <div className="warning-card"><AlertTriangle size={18} /><p><strong>仅用于本地原型</strong>VITE_ 环境变量会进入浏览器构建产物，访问页面的人可以读取 API Key。公开部署时请迁移到服务端代理。</p></div>
      <div className="storage-row"><div><strong>本地创作历史</strong><p>最多保留 24 条记录，远端资源链接可能过期。</p></div><button type="button" onClick={() => { if (window.confirm('确定清空当前浏览器中的全部创作历史吗？')) onClearHistory() }}><Trash2 size={16} /> 清空历史</button></div>
      <button type="button" className="dialog-done" onClick={onClose}>完成</button>
    </dialog>
  )
}
