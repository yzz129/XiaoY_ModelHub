import { useEffect, useRef, useState } from 'react'
import { Box, LoaderCircle, RefreshCw } from 'lucide-react'
import '@google/model-viewer'
import type { GeneratedAsset } from '../types/generation'

interface ModelPreviewProps {
  asset: GeneratedAsset
  refreshing?: boolean
  compact?: boolean
  onRefresh: (asset: GeneratedAsset, force?: boolean) => void
}

export function ModelPreview({ asset, refreshing, compact, onRefresh }: ModelPreviewProps) {
  const viewerRef = useRef<HTMLElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || compact) return
    setState('loading')
    const loaded = () => setState('ready')
    const failed = () => { setState('failed'); onRefresh(asset) }
    viewer.addEventListener('load', loaded)
    viewer.addEventListener('error', failed)
    return () => { viewer.removeEventListener('load', loaded); viewer.removeEventListener('error', failed) }
  }, [asset, compact, onRefresh])

  if (compact) return <div className="three-d-preview compact"><Box /><strong>3D</strong></div>

  return <div className="model-preview">
    <model-viewer ref={viewerRef} src={asset.url} alt={asset.prompt || '生成的 3D 模型'} loading="eager" camera-controls="" auto-rotate="" interaction-prompt="auto" shadow-intensity="1" exposure="1" />
    {(state === 'loading' || refreshing) && <div className="model-state"><LoaderCircle className="spin-icon" /><strong>{refreshing ? '正在刷新模型链接' : '正在加载 3D 模型'}</strong></div>}
    {state === 'failed' && !refreshing && <div className="model-state failed"><Box /><strong>模型链接已失效或无法加载</strong><button type="button" onClick={() => onRefresh(asset, true)}><RefreshCw />重新获取链接</button></div>}
    {state === 'ready' && <span className="model-hint">拖动旋转 · 滚轮缩放</span>}
  </div>
}
