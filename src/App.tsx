import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Aperture, Box, Clock3, Film, Image, KeyRound, Menu, PanelLeftClose, PanelLeftOpen, Plus, Settings, Sparkles, WandSparkles, X } from 'lucide-react'
import { FrameUpload, PromptBox } from './components/Controls'
import { OutputStage } from './components/OutputStage'
import { SettingsDialog } from './components/SettingsDialog'
import { VideoTaskStrip } from './components/VideoTaskStrip'
import { styleTemplates } from './data/templates'
import { useVideoQueue } from './hooks/useVideoQueue'
import { useThreeDQueue } from './hooks/useThreeDQueue'
import { generateImage, hasApiKey } from './lib/ark'
import { clearHistory, loadHistory, loadPreferences, saveHistory, savePreferences } from './lib/storage'
import type { AspectRatio, CanvasView, GeneratedAsset, GenerationKind, GenerationMode, GenerationSettings, Resolution, SettingsSnapshot, ThreeDJob, ThreeDModel, VideoJob } from './types/generation'

const inspiration = [
  '一位身穿银白色未来服饰的旅行者，站在巨大的水镜前，晨雾穿过极简建筑，远处群山若隐若现',
  '深夜的海边美术馆，玻璃幕墙映出流动极光，一位独行者从暖色灯光中走过',
  '白色陶瓷香水瓶悬浮在水面上，晨光、轻雾与细小涟漪，极简奢华产品摄影',
]

const makeDefaults = (): GenerationSettings => ({ kind: 'image', mode: 'text', prompt: '', ratio: '16:9', resolution: '2K', duration: 5, count: 1, styleId: 'cinema', threeDModel: 'doubao-seed3d-2-0-260328' })
const makeSessionId = () => crypto.randomUUID()

function settingsFromSnapshot(snapshot: SettingsSnapshot): GenerationSettings {
  return {
    kind: snapshot.kind,
    mode: snapshot.mode,
    prompt: snapshot.prompt,
    ratio: snapshot.ratio,
    resolution: snapshot.resolution,
    duration: snapshot.duration,
    count: snapshot.count,
    styleId: snapshot.styleId,
    threeDModel: snapshot.threeDModel,
  }
}

function App() {
  const [settings, setSettings] = useState<GenerationSettings>(makeDefaults)
  const [history, setHistory] = useState<GeneratedAsset[]>(loadHistory)
  const [sessionId, setSessionId] = useState(makeSessionId)
  const [sessionAssetIds, setSessionAssetIds] = useState<string[]>([])
  const [canvasView, setCanvasView] = useState<CanvasView>('session')
  const [selectedId, setSelectedId] = useState<string>()
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState<string>()
  const [promptError, setPromptError] = useState<string>()
  const [frameError, setFrameError] = useState<string>()
  const [lastFailedImage, setLastFailedImage] = useState<GenerationSettings>()
  const [mobilePanel, setMobilePanel] = useState(false)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [maxVideoConcurrency, setMaxVideoConcurrency] = useState(() => loadPreferences().maxVideoConcurrency)
  const [maxThreeDConcurrency, setMaxThreeDConcurrency] = useState(() => loadPreferences().maxThreeDConcurrency)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const imageAbortRef = useRef<AbortController | null>(null)
  const template = useMemo(() => styleTemplates.find((item) => item.id === settings.styleId)!, [settings.styleId])
  const sessionAssets = history.filter((asset) => sessionAssetIds.includes(asset.id))
  const visibleAssets = canvasView === 'session' ? sessionAssets : history
  const addAsyncResult = useCallback((result: GeneratedAsset) => {
    setHistory((current) => current.some((item) => item.taskId && item.taskId === result.taskId) ? current : [result, ...current])
    if (result.sessionId === sessionId) setSessionAssetIds((current) => [result.id, ...current])
  }, [sessionId])
  const videoQueue = useVideoQueue({ maxConcurrency: maxVideoConcurrency, onComplete: addAsyncResult, onNotice: setNotice })
  const threeDQueue = useThreeDQueue({ maxConcurrency: maxThreeDConcurrency, onComplete: addAsyncResult, onNotice: setNotice })

  useEffect(() => { saveHistory(history) }, [history])
  useEffect(() => {
    if (!mobilePanel) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobilePanel(false) }
    document.addEventListener('keydown', close); document.body.classList.add('drawer-open')
    return () => { document.removeEventListener('keydown', close); document.body.classList.remove('drawer-open') }
  }, [mobilePanel])

  function patch(next: Partial<GenerationSettings>) { setSettings((current) => ({ ...current, ...next })); setImageError(undefined) }
  function focusControls() { setCanvasView('session'); setMobilePanel(true); window.setTimeout(() => promptRef.current?.focus(), 80) }

  function switchKind(kind: GenerationKind) {
    patch({ kind, mode: kind === '3d' ? 'image-to-3d' : 'text', firstFrame: undefined, lastFrame: undefined, prompt: kind === '3d' ? '' : settings.prompt, resolution: kind === 'image' ? '2K' : kind === 'video' ? '1080p' : '2K', threeDModel: settings.threeDModel ?? 'doubao-seed3d-2-0-260328' })
    setFrameError(undefined)
  }

  function switchMode(mode: GenerationMode) {
    patch({ mode, firstFrame: mode === 'text' ? undefined : settings.firstFrame, lastFrame: mode === 'first-last-frame' ? settings.lastFrame : undefined })
    setFrameError(undefined)
  }

  function validate(next: GenerationSettings) {
    setPromptError(undefined); setFrameError(undefined)
    if (!hasApiKey) { setImageError('请先在 .env.local 中配置火山方舟 API Key'); setSettingsOpen(true); return false }
    if (next.kind !== '3d' && !next.prompt.trim()) { setPromptError('请先写下画面描述'); setImageError('还缺少画面描述'); promptRef.current?.focus(); return false }
    if (next.kind === '3d' && !next.firstFrame) { setFrameError('图片转 3D 需要上传一张参考图片'); setImageError('请先上传参考图片'); return false }
    if (next.kind === 'video' && next.mode !== 'text' && !next.firstFrame) { setFrameError('当前模式需要上传首帧'); setImageError('请补充视频首帧'); return false }
    if (next.kind === 'video' && next.mode === 'first-last-frame' && !next.lastFrame) { setFrameError('首尾帧模式还需要尾帧'); setImageError('请补充视频尾帧'); return false }
    if (next.firstFrame && next.lastFrame) {
      const firstRatio = next.firstFrame.width / next.firstFrame.height
      const lastRatio = next.lastFrame.width / next.lastFrame.height
      if (Math.abs(firstRatio - lastRatio) / firstRatio > 0.03) { setFrameError('首尾帧比例差异较大，请先裁切为一致比例'); setImageError('首尾帧比例不一致'); return false }
    }
    return true
  }

  function addResult(results: GeneratedAsset[]) {
    setHistory((current) => [...results, ...current.filter((item) => !results.some((result) => result.taskId && result.taskId === item.taskId))])
    setSessionAssetIds((current) => [...results.map((item) => item.id), ...current])
    setSelectedId(results[0]?.id); setCanvasView('session')
  }

  async function submit(values: GenerationSettings = settings) {
    if (!validate(values)) return
    if (values.kind === 'video') {
      try {
        const position = await videoQueue.enqueue(values, sessionId)
        setNotice(`视频已加入队列 · 当前等待 ${position} 个任务`)
        setImageError(undefined)
      } catch (caught) { setImageError(caught instanceof Error ? caught.message : '视频入队失败') }
      return
    }
    if (values.kind === '3d') {
      try {
        const position = await threeDQueue.enqueue(values, sessionId)
        setNotice(`3D 已加入队列 · 当前等待 ${position} 个任务`)
        setImageError(undefined)
      } catch (caught) { setImageError(caught instanceof Error ? caught.message : '3D 入队失败') }
      return
    }
    if (imageLoading) return
    setImageLoading(true); setImageError(undefined); setLastFailedImage(values); imageAbortRef.current = new AbortController()
    try {
      const results = await generateImage(values, sessionId, imageAbortRef.current.signal)
      if (!results.length) throw new Error('方舟已响应，但没有返回可展示的图片')
      addResult(results)
    } catch (caught) { setImageError(caught instanceof Error ? caught.message : '发生未知错误') }
    finally { setImageLoading(false); imageAbortRef.current = null }
  }

  function newTask() {
    setSettings(makeDefaults()); setImageError(undefined); setPromptError(undefined); setFrameError(undefined); setSessionAssetIds([]); setSelectedId(undefined); setSessionId(makeSessionId()); setCanvasView('session')
    window.setTimeout(() => promptRef.current?.focus(), 50)
  }

  function reuse(asset: GeneratedAsset) {
    setSettings(settingsFromSnapshot(asset.settings)); setCanvasView('session'); setPanelCollapsed(false); setMobilePanel(true)
    setNotice(asset.settings.usedFirstFrame || asset.settings.usedLastFrame ? '参数已复用，请重新上传原首尾帧' : '已复用完整生成参数')
    window.setTimeout(() => promptRef.current?.focus(), 80)
  }

  function reuseJob(job: VideoJob) {
    setSettings(job.settings); setCanvasView('session'); setPanelCollapsed(false); setMobilePanel(true)
    setNotice('已复用视频任务参数')
    window.setTimeout(() => promptRef.current?.focus(), 80)
  }

  function reuseThreeDJob(job: ThreeDJob) {
    setSettings(job.settings); setCanvasView('session'); setPanelCollapsed(false); setMobilePanel(true)
    setNotice('已复用 3D 任务参数，请重新上传参考图片')
  }

  function removeAsset(asset: GeneratedAsset) {
    if (!window.confirm('确定从本地历史中删除这件作品吗？')) return
    setHistory((current) => current.filter((item) => item.id !== asset.id)); setSessionAssetIds((current) => current.filter((id) => id !== asset.id)); setNotice('作品已从本地历史删除')
  }

  const modes = settings.kind === 'image' ? [{ id: 'text', label: '文字生成' }] : settings.kind === '3d' ? [{ id: 'image-to-3d', label: '图片转 3D' }] : [{ id: 'text', label: '文字生成' }, { id: 'first-frame', label: '首帧生成' }, { id: 'first-last-frame', label: '首尾帧' }]
  return <div className={`app-shell ${panelCollapsed ? 'panel-collapsed' : ''}`}>
    <aside className="sidebar" aria-label="主导航">
      <div className="brand"><Aperture size={27} /><span>MUSE</span></div>
      <nav>
        <button type="button" className={`nav-item ${canvasView === 'session' ? 'active' : ''}`} aria-current={canvasView === 'session' ? 'page' : undefined} onClick={focusControls}><WandSparkles /><span>创作</span></button>
        <button type="button" className={`nav-item ${canvasView === 'history' ? 'active' : ''}`} aria-current={canvasView === 'history' ? 'page' : undefined} onClick={() => setCanvasView('history')}><Clock3 /><span>历史</span><b>{history.length}</b></button>
      </nav>
      <div className="sidebar-bottom"><button type="button" className="nav-item" onClick={() => setSettingsOpen(true)}><Settings /><span>设置</span></button><div className="profile"><span>MS</span><div><strong>Muse Studio</strong><small>Local workspace</small></div></div></div>
    </aside>

    <main className="workspace">
      <header className="topbar">
        <button type="button" className="mobile-menu" aria-label="打开创作参数" aria-expanded={mobilePanel} aria-controls="control-panel" onClick={() => setMobilePanel(true)}><Menu /></button>
        <div className="workspace-title"><span>{canvasView === 'session' ? '创作工作台' : '作品历史'}</span><small>{settings.kind === 'image' ? 'Seedream 5.0 Pro' : settings.kind === 'video' ? 'Seedance 2.0' : 'Seed3D 2.0'}</small></div>
        <div className="top-actions"><button type="button" className={`connection ${hasApiKey ? 'online' : ''}`} onClick={() => setSettingsOpen(true)}><i />{hasApiKey ? '方舟已连接' : '未配置 Key'}</button><button type="button" className="new-task top-new" onClick={newTask}><Plus /> 新建创作</button></div>
      </header>

      <div className="studio">
        {mobilePanel && <button className="drawer-backdrop" type="button" aria-label="关闭参数面板" onClick={() => setMobilePanel(false)} />}
        <section id="control-panel" className={`control-panel ${mobilePanel ? 'open' : ''}`} role={mobilePanel ? 'dialog' : undefined} aria-modal={mobilePanel || undefined} aria-label="创作参数">
          <div className="panel-head">
            <div className="kind-switch" aria-label="生成类型">{(['image', 'video', '3d'] as GenerationKind[]).map((kind) => <button type="button" key={kind} aria-pressed={settings.kind === kind} className={settings.kind === kind ? 'active' : ''} onClick={() => switchKind(kind)}>{kind === 'image' ? <Image /> : kind === 'video' ? <Film /> : <Box />}{kind === 'image' ? '图片' : kind === 'video' ? '视频' : '3D'}</button>)}</div>
            <button type="button" className="collapse" aria-label={panelCollapsed ? '展开参数面板' : '收起参数面板'} onClick={() => window.innerWidth <= 800 ? setMobilePanel(false) : setPanelCollapsed(!panelCollapsed)}>{panelCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
          </div>
          {panelCollapsed ? <button className="expand-rail" type="button" aria-label="展开参数面板" onClick={() => setPanelCollapsed(false)}><PanelLeftOpen /></button> : <>
            <div className="panel-scroll">
              <section className="control-section"><div className="section-label"><span>创作方式</span><small>MODE</small></div><div className="mode-tabs">{modes.map((mode) => <button type="button" key={mode.id} aria-pressed={settings.mode === mode.id} className={settings.mode === mode.id ? 'active' : ''} onClick={() => switchMode(mode.id as GenerationMode)}>{mode.label}</button>)}</div></section>
              {settings.kind === 'video' && settings.mode !== 'text' && <div className="frame-grid"><FrameUpload label="首帧" hint="JPG / PNG / WebP · 最大 10MB" value={settings.firstFrame} onChange={(firstFrame) => patch({ firstFrame })} error={frameError} />{settings.mode === 'first-last-frame' && <FrameUpload label="尾帧" hint="建议与首帧比例一致" value={settings.lastFrame} onChange={(lastFrame) => patch({ lastFrame })} disabled={!settings.firstFrame} error={settings.firstFrame ? frameError : undefined} />}</div>}
              {settings.kind === '3d' && <div className="frame-grid single"><FrameUpload label="3D 参考图片" hint="单个主体 · JPG / PNG / WebP · 最大 10MB" value={settings.firstFrame} onChange={(firstFrame) => patch({ firstFrame })} error={frameError} /></div>}
              {settings.kind === '3d' && <section className="control-section compact"><div className="section-label"><span>3D 模型</span><small>MODEL</small></div><div className="model-choice">{([['doubao-seed3d-2-0-260328', 'Seed3D 2.0'], ['hyper3d-gen2-260112', 'Hyper3D Gen2']] as Array<[ThreeDModel, string]>).map(([model, label]) => <button type="button" key={model} aria-pressed={(settings.threeDModel ?? 'doubao-seed3d-2-0-260328') === model} className={(settings.threeDModel ?? 'doubao-seed3d-2-0-260328') === model ? 'active' : ''} onClick={() => patch({ threeDModel: model })}><strong>{label}</strong><small>{model}</small></button>)}</div></section>}
              <section className="control-section"><div className="section-label"><label htmlFor="generation-prompt">{settings.kind === '3d' ? '输出命令（可选）' : '画面描述'}</label><small>{settings.kind === '3d' ? '3D OPTIONS' : 'PROMPT'}</small></div><PromptBox ref={promptRef} value={settings.prompt} onChange={(prompt) => { patch({ prompt }); setPromptError(undefined) }} onInspire={() => patch({ prompt: inspiration[Math.floor(Math.random() * inspiration.length)] })} error={promptError} threeD={settings.kind === '3d'} /></section>
              {settings.kind !== '3d' && <section className="control-section"><div className="section-label"><span>视觉主题</span><small>STYLE</small></div><div className="template-preview" style={{ background: template.gradient }}><div><small>{template.eyebrow}</small><strong>{template.name}</strong><p>{template.description}</p></div><span>已应用</span></div><div className="template-row">{styleTemplates.map((item) => <button type="button" key={item.id} aria-pressed={settings.styleId === item.id} className={settings.styleId === item.id ? 'active' : ''} onClick={() => patch({ styleId: item.id })} style={{ background: item.gradient }}><span>{item.name}</span></button>)}</div></section>}
              {settings.kind !== '3d' && <section className="control-section"><div className="section-label"><span>画面比例</span><small>{settings.ratio}</small></div><div className="ratio-row">{(['1:1', '4:3', '3:4', '16:9', '9:16'] as AspectRatio[]).map((ratio) => <button type="button" key={ratio} aria-pressed={settings.ratio === ratio} className={settings.ratio === ratio ? 'active' : ''} onClick={() => patch({ ratio })}><i style={{ aspectRatio: ratio.replace(':', '/') }} />{ratio}</button>)}</div></section>}
              {settings.kind !== '3d' && <section className="control-section compact"><div className="section-label"><span>输出清晰度</span><small>QUALITY</small></div><div className="chips-row">{(settings.kind === 'image' ? ['1K', '2K', '4K'] : ['720p', '1080p']).map((resolution) => <button type="button" aria-pressed={settings.resolution === resolution} className={settings.resolution === resolution ? 'active' : ''} key={resolution} onClick={() => patch({ resolution: resolution as Resolution })}>{resolution}</button>)}</div></section>}
              {settings.kind === 'video' && <section className="control-section compact"><div className="section-label"><span>视频时长</span><small>DURATION</small></div><div className="chips-row">{[5, 10, 15].map((duration) => <button type="button" aria-pressed={settings.duration === duration} className={settings.duration === duration ? 'active' : ''} key={duration} onClick={() => patch({ duration })}>{duration} 秒</button>)}</div></section>}
            </div>
            <div className="generate-wrap">{!hasApiKey && <button type="button" className="key-warning" onClick={() => setSettingsOpen(true)}><KeyRound /> 在 .env.local 中配置方舟 API Key</button>}<button className="generate-button" type="button" onClick={() => void submit()} disabled={settings.kind === 'image' && imageLoading} aria-busy={settings.kind === 'image' && imageLoading}><span><Sparkles />{settings.kind === 'video' ? '加入视频队列' : settings.kind === '3d' ? '加入 3D 队列' : imageLoading ? '创作中…' : '生成图片'}</span><b>{settings.kind === 'image' ? 'IMAGE' : settings.kind === 'video' ? 'VIDEO' : '3D'}</b></button></div>
          </>}
        </section>

        <section className="canvas-area">
          <div className="canvas-toolbar"><div role="tablist" aria-label="作品范围"><button type="button" role="tab" aria-selected={canvasView === 'session'} className={canvasView === 'session' ? 'active' : ''} onClick={() => setCanvasView('session')}>本次创作 <span>{sessionAssets.length}</span></button><button type="button" role="tab" aria-selected={canvasView === 'history'} className={canvasView === 'history' ? 'active' : ''} onClick={() => setCanvasView('history')}>全部作品 <span>{history.length}</span></button></div><button type="button" className="new-task canvas-new" onClick={newTask}><Plus /> 新建创作</button></div>
          <VideoTaskStrip jobs={videoQueue.jobs} maxConcurrency={maxVideoConcurrency} onOpenSettings={() => setSettingsOpen(true)} onPause={videoQueue.pause} onResume={videoQueue.resume} onRetry={videoQueue.retry} onRemove={videoQueue.remove} onReuse={(job) => reuseJob(job as VideoJob)} />
          <VideoTaskStrip kind="3d" jobs={threeDQueue.jobs} maxConcurrency={maxThreeDConcurrency} onOpenSettings={() => setSettingsOpen(true)} onPause={threeDQueue.pause} onResume={threeDQueue.resume} onRetry={threeDQueue.retry} onRemove={threeDQueue.remove} onReuse={(job) => reuseThreeDJob(job as ThreeDJob)} />
          <div className="canvas-content" role="tabpanel"><OutputStage assets={visibleAssets} view={canvasView} selectedId={selectedId} imageLoading={imageLoading} imageError={imageError} onSelect={setSelectedId} onReuse={reuse} onRemove={removeAsset} onSuggestion={(prompt) => { patch({ prompt }); focusControls() }} onRetryImage={lastFailedImage ? () => void submit(lastFailedImage) : undefined} /></div>
          <div className="canvas-foot"><span>作品仅保存在当前浏览器，远端链接可能过期</span><span>Powered by Volcengine Ark</span></div>
        </section>
      </div>
    </main>
    {mobilePanel && <button type="button" className="drawer-close" aria-label="关闭参数面板" onClick={() => setMobilePanel(false)}><X /></button>}
    <SettingsDialog open={settingsOpen} maxVideoConcurrency={maxVideoConcurrency} maxThreeDConcurrency={maxThreeDConcurrency} onVideoConcurrencyChange={(value) => { const next = savePreferences({ maxVideoConcurrency: value, maxThreeDConcurrency }); setMaxVideoConcurrency(next.maxVideoConcurrency); setNotice(`视频最高并发已设为 ${next.maxVideoConcurrency}`) }} onThreeDConcurrencyChange={(value) => { const next = savePreferences({ maxVideoConcurrency, maxThreeDConcurrency: value }); setMaxThreeDConcurrency(next.maxThreeDConcurrency); setNotice(`3D 最高并发已设为 ${next.maxThreeDConcurrency}`) }} onClose={() => setSettingsOpen(false)} onClearHistory={() => { clearHistory(); setHistory([]); setSessionAssetIds([]); setSettingsOpen(false); setNotice('本地历史已清空') }} />
    <div className="live-notice" aria-live="polite">{notice}</div>
  </div>
}

export default App
