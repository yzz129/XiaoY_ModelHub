import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Box, LoaderCircle, Maximize2, RefreshCw, X } from 'lucide-react'
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
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [expanded, setExpanded] = useState(false)
  const sourceUrl = asset.url.startsWith('https://') && asset.url.includes('.tos-') && asset.url.includes('.volces.com')
    ? `/__asset_proxy?url=${encodeURIComponent(asset.url)}`
    : asset.url

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    setState('loading')
    const loaded = () => setState('ready')
    const failed = () => { setState('failed'); onRefresh(asset) }
    viewer.addEventListener('load', loaded)
    viewer.addEventListener('error', failed)
    return () => { viewer.removeEventListener('load', loaded); viewer.removeEventListener('error', failed) }
  }, [asset, compact, onRefresh])

  useEffect(() => {
    if (!expanded) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    closeButtonRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [expanded])

  return <div className={`model-preview ${compact ? 'compact' : ''}`}>
    <model-viewer ref={viewerRef} src={sourceUrl} alt={asset.prompt || '生成的 3D 模型'} loading={compact ? 'lazy' : 'eager'} camera-controls="" auto-rotate="" interaction-prompt={compact ? 'none' : 'auto'} shadow-intensity="1" exposure="1" />
    {(state === 'loading' || refreshing) && <div className="model-state"><LoaderCircle className="spin-icon" /><strong>{refreshing ? '正在刷新模型链接' : '正在加载 3D 模型'}</strong></div>}
    {state === 'failed' && !refreshing && <div className="model-state failed"><Box /><strong>{compact ? '点击打开并重试' : '模型链接已失效或无法加载'}</strong>{!compact && <button type="button" onClick={() => onRefresh(asset, true)}><RefreshCw />重新获取链接</button>}</div>}
    {state === 'ready' && !compact && <><span className="model-hint">拖动旋转 · 滚轮缩放</span><button type="button" className="model-expand" onClick={() => setExpanded(true)} aria-label="放大预览 3D 模型"><Maximize2 /><span>放大预览</span></button></>}
    {expanded && createPortal(<div className="model-lightbox" role="dialog" aria-modal="true" aria-label="3D 模型放大预览" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpanded(false) }}>
      <div className="model-lightbox-panel">
        <model-viewer src={sourceUrl} alt={asset.prompt || '生成的 3D 模型放大预览'} loading="eager" camera-controls="" auto-rotate="" interaction-prompt="auto" shadow-intensity="1" exposure="1" />
        <div className="model-lightbox-hint">拖动旋转 · 滚轮或双指缩放</div>
        <button ref={closeButtonRef} type="button" className="model-lightbox-close" onClick={() => setExpanded(false)} aria-label="关闭放大预览"><X /></button>
      </div>
    </div>, document.body)}
  </div>
}
