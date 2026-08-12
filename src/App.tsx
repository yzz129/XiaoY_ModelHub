import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Film, Image, KeyRound, PanelLeftClose, PanelLeftOpen, Plus, Sparkles } from 'lucide-react'
import { FrameUpload, PromptBox, ReferenceImageUpload } from './components/Controls'
import { LanguageStudio } from './components/LanguageStudio'
import { ModelCenter, type ModelFamily } from './components/ModelCenter'
import { OutputStage } from './components/OutputStage'
import { PortalSidebar, type PortalView } from './components/PortalSidebar'
import { SettingsDialog } from './components/SettingsDialog'
import { VideoTaskStrip } from './components/VideoTaskStrip'
import { VoiceStudio } from './components/VoiceStudio'
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, getGenerationModel, getPromptLimit, imageModels, videoModels } from './data/models'
import { pricingLabels, sortModelsByPricing, type CatalogModel } from './data/providerCatalog'
import { styleTemplates } from './data/templates'
import { useImageQueue } from './hooks/useImageQueue'
import { useProviderCatalog } from './hooks/useProviderCatalog'
import { useVideoQueue } from './hooks/useVideoQueue'
import { useThreeDQueue } from './hooks/useThreeDQueue'
import { getProviderName, hasApiKeyForSettings, refreshAssetUrl } from './lib/ark'
import { isProviderConfigured, isProviderPersonallyConfigured } from './lib/providerCredentials'
import { clearHistory, loadHistory, loadPreferences, saveHistory, savePreferences } from './lib/storage'
import { saveGeneratedAsset } from './lib/output'
import { logActivity } from './lib/account'
import { MAX_VIDEO_REFERENCE_IMAGES } from './lib/video'
import { languageModels, voiceModels } from './lib/creative'
import type { AspectRatio, CanvasView, GeneratedAsset, GenerationKind, GenerationMode, GenerationSettings, ImageModel, Resolution, SettingsSnapshot, ThreeDJob, ThreeDModel, VideoJob, VideoModel } from './types/generation'

const inspiration = [
  '一位身穿银白色未来服饰的旅行者，站在巨大的水镜前，晨雾穿过极简建筑，远处群山若隐若现',
  '深夜的海边美术馆，玻璃幕墙映出流动极光，一位独行者从暖色灯光中走过',
  '白色陶瓷香水瓶悬浮在水面上，晨光、轻雾与细小涟漪，极简奢华产品摄影',
]

const makeDefaults = (): GenerationSettings => ({ kind: 'image', mode: 'text', prompt: '', ratio: '16:9', resolution: '2K', duration: 5, count: 1, styleId: '', imageModel: DEFAULT_IMAGE_MODEL, videoModel: DEFAULT_VIDEO_MODEL, threeDModel: 'doubao-seed3d-2-0-260328' })
const makeDefaultsForKind = (kind: GenerationKind): GenerationSettings => {
  const defaults = makeDefaults()
  if (kind === 'video') {
    const videoModel = videoModels.find((model) => model.id === defaults.videoModel) ?? videoModels[0]
    return { ...defaults, kind, resolution: videoModel.resolutions.includes('1080p') ? '1080p' : '720p' }
  }
  if (kind === '3d') return { ...defaults, kind, mode: 'image-to-3d', prompt: '' }
  return defaults
}
const makeSessionId = () => crypto.randomUUID()

function settingsFromSnapshot(snapshot: SettingsSnapshot): GenerationSettings {
  const restored: GenerationSettings = {
    kind: snapshot.kind,
    mode: snapshot.mode,
    prompt: snapshot.prompt,
    ratio: snapshot.ratio,
    resolution: snapshot.resolution,
    duration: snapshot.duration,
    count: snapshot.count,
    styleId: snapshot.styleId ?? '',
    imageModel: snapshot.imageModel ?? DEFAULT_IMAGE_MODEL,
    videoModel: snapshot.videoModel ?? DEFAULT_VIDEO_MODEL,
    threeDModel: snapshot.threeDModel,
  }
  if (restored.kind !== '3d') {
    const model = getGenerationModel(restored)
    if (!model.resolutions.includes(restored.resolution)) restored.resolution = model.resolutions.includes('2K') ? '2K' : model.resolutions[0]
  }
  restored.prompt = restored.prompt.slice(0, getPromptLimit(restored))
  return restored
}

function App() {
  const providerCatalog = useProviderCatalog()
  const [settings, setSettings] = useState<GenerationSettings>(makeDefaults)
  const [history, setHistory] = useState<GeneratedAsset[]>(loadHistory)
  const [sessionId, setSessionId] = useState(makeSessionId)
  const [sessionAssetIds, setSessionAssetIds] = useState<string[]>([])
  const [canvasView, setCanvasView] = useState<CanvasView>('session')
  const [selectedId, setSelectedId] = useState<string>()
  const [imageError, setImageError] = useState<string>()
  const [promptError, setPromptError] = useState<string>()
  const [frameError, setFrameError] = useState<string>()
  const [lastFailedImage, setLastFailedImage] = useState<GenerationSettings>()
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsProviderId, setSettingsProviderId] = useState('ark')
  const [pendingCatalogModel, setPendingCatalogModel] = useState<CatalogModel>()
  const [, setCredentialVersion] = useState(0)
  const [portalView, setPortalView] = useState<PortalView>('marketplace')
  const [modelCenterFamily, setModelCenterFamily] = useState<ModelFamily>('language')
  const [languageModelId, setLanguageModelId] = useState(() => languageModels.find((model) => model.id === 'openrouter-free')?.id ?? languageModels[0]?.id ?? '')
  const [voiceModelId, setVoiceModelId] = useState(() => voiceModels.find((model) => model.id === 'eleven-flash')?.id ?? voiceModels[0]?.id ?? '')
  const [notice, setNotice] = useState('')
  const [maxVideoConcurrency, setMaxVideoConcurrency] = useState(() => loadPreferences().maxVideoConcurrency)
  const [maxThreeDConcurrency, setMaxThreeDConcurrency] = useState(() => loadPreferences().maxThreeDConcurrency)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const refreshingAssetsRef = useRef(new Set<string>())
  const failedAssetRefreshesRef = useRef(new Set<string>())
  const [refreshingAssetIds, setRefreshingAssetIds] = useState<string[]>([])
  const template = useMemo(() => styleTemplates.find((item) => item.id === settings.styleId), [settings.styleId])
  const visibleImageModels = useMemo(() => {
    const featured = imageModels.slice(0, 4)
    const selected = imageModels.find((model) => model.id === (settings.imageModel ?? DEFAULT_IMAGE_MODEL))
    if (!selected || featured.some((model) => model.id === selected.id)) return featured
    featured[featured.length - 1] = selected
    return sortModelsByPricing(featured)
  }, [settings.imageModel])
  const activeGenerationModel = settings.kind === '3d' ? undefined : getGenerationModel(settings)
  const activeHasApiKey = hasApiKeyForSettings(settings)
  const activeProviderName = getProviderName(settings)
  const activeProviderId = settings.kind === '3d' ? 'ark' : activeGenerationModel?.provider ?? 'ark'
  const sessionAssets = history.filter((asset) => sessionAssetIds.includes(asset.id))
  const currentKindSessionAssets = sessionAssets.filter((asset) => asset.settings.kind === settings.kind)
  const visibleAssets = canvasView === 'session' ? currentKindSessionAssets : history
  const addAsyncResult = useCallback(async (result: GeneratedAsset) => {
    const saved = result.outputPath ? result : await saveGeneratedAsset(result)
    setHistory((current) => current.some((item) => item.taskId && item.taskId === saved.taskId) ? current : [saved, ...current])
    if (saved.sessionId === sessionId) setSessionAssetIds((current) => [saved.id, ...current])
    const restored = settingsFromSnapshot(saved.settings)
    const generatedModel = getGenerationModel(restored)
    void logActivity({
      clientEventId: `asset:${saved.id}`,
      type: saved.kind,
      modelId: saved.settings.kind === 'image' ? saved.settings.imageModel : saved.settings.kind === 'video' ? saved.settings.videoModel : saved.settings.threeDModel,
      provider: generatedModel?.provider ?? (saved.kind === '3d' ? 'ark' : ''),
      inputText: saved.prompt,
      outputText: saved.compiledPrompt,
      mediaUrl: saved.url,
      metadata: {
        settings: saved.settings,
        sessionId: saved.sessionId,
        taskId: saved.taskId,
        outputPath: saved.outputPath,
      },
      createdAt: saved.createdAt,
    })
  }, [sessionId])
  const addAsyncImages = useCallback(async (results: GeneratedAsset[]) => {
    setHistory((current) => [...results, ...current.filter((item) => !results.some((result) => result.id === item.id))])
    const currentSessionResults = results.filter((result) => result.sessionId === sessionId)
    if (currentSessionResults.length) {
      setSessionAssetIds((current) => [...currentSessionResults.map((item) => item.id), ...current.filter((id) => !currentSessionResults.some((item) => item.id === id))])
      setSelectedId(currentSessionResults[0].id)
      setCanvasView('session')
    }
    for (const saved of results) {
      const generatedModel = getGenerationModel(settingsFromSnapshot(saved.settings))
      void logActivity({
        clientEventId: `asset:${saved.id}`,
        type: 'image',
        modelId: saved.settings.imageModel,
        provider: generatedModel?.provider,
        inputText: saved.prompt,
        outputText: saved.compiledPrompt,
        mediaUrl: saved.url,
        metadata: { settings: saved.settings, sessionId: saved.sessionId, outputPath: saved.outputPath },
        createdAt: saved.createdAt,
      })
    }
  }, [sessionId])
  const imageQueue = useImageQueue({ onComplete: addAsyncImages, onNotice: setNotice, onError: setImageError })
  const videoQueue = useVideoQueue({ maxConcurrency: maxVideoConcurrency, onComplete: addAsyncResult, onNotice: setNotice })
  const threeDQueue = useThreeDQueue({ maxConcurrency: maxThreeDConcurrency, onComplete: addAsyncResult, onNotice: setNotice })
  const imageLoading = imageQueue.jobs.some((job) => job.status === 'queued' || job.status === 'running')
  const failedImageJob = imageQueue.jobs.find((job) => job.status === 'failed')

  useEffect(() => { saveHistory(history) }, [history])
  function patch(next: Partial<GenerationSettings>) { setSettings((current) => ({ ...current, ...next })); setImageError(undefined) }
  function focusControls() { setPortalView('studio'); setCanvasView('session'); setPanelCollapsed(false); window.setTimeout(() => promptRef.current?.focus(), 80) }
  function openModelCenter(family: ModelFamily) {
    setModelCenterFamily(family)
    setPortalView('marketplace')
  }

  function openProviderSettings(providerId: string = activeProviderId) {
    setSettingsProviderId(providerId)
    setSettingsOpen(true)
  }

  function openStudio(kind: GenerationKind) {
    setPortalView('studio')
    setCanvasView('session')
    setPanelCollapsed(false)
    switchKind(kind)
  }

  function switchKind(kind: GenerationKind) {
    const videoModel = videoModels.find((model) => model.id === settings.videoModel) ?? videoModels[0]
    const imageModel = imageModels.find((model) => model.id === settings.imageModel) ?? imageModels[0]
    const promptLimit = kind === 'image' ? imageModel.maxPromptLength : kind === 'video' ? videoModel.maxPromptLength : 1200
    const prompt = kind === '3d' ? '' : settings.prompt.slice(0, promptLimit)
    if (settings.prompt.length > promptLimit) setNotice(`提示词已按目标模型上限截取为 ${promptLimit.toLocaleString()} 字符`)
    patch({ kind, mode: kind === '3d' ? 'image-to-3d' : 'text', firstFrame: undefined, lastFrame: undefined, referenceImages: undefined, prompt, resolution: kind === 'image' ? '2K' : kind === 'video' ? (videoModel.resolutions.includes('1080p') ? '1080p' : '720p') : '2K', duration: kind === 'video' && !videoModel.durations?.includes(settings.duration) ? (videoModel.durations?.[0] ?? 5) : settings.duration, threeDModel: settings.threeDModel ?? 'doubao-seed3d-2-0-260328' })
    setFrameError(undefined)
  }

  function switchMode(mode: GenerationMode) {
    const usesFrame = mode === 'first-frame' || mode === 'first-last-frame' || mode === 'image-to-3d'
    patch({ mode, firstFrame: usesFrame ? settings.firstFrame : undefined, lastFrame: mode === 'first-last-frame' ? settings.lastFrame : undefined, referenceImages: mode === 'reference-images' ? settings.referenceImages : undefined })
    setFrameError(undefined)
  }

  function selectImageModel(imageModel: ImageModel) {
    const model = imageModels.find((item) => item.id === imageModel) ?? imageModels[0]
    if (settings.prompt.length > model.maxPromptLength) setNotice(`提示词已按 ${model.name} 上限截取为 ${model.maxPromptLength.toLocaleString()} 字符`)
    if (settings.firstFrame && !model.supportsReferenceImage) setNotice(`${model.name} 当前仅接入文字生图，已移除参考图`)
    patch({ imageModel, prompt: settings.prompt.slice(0, model.maxPromptLength), firstFrame: model.supportsReferenceImage ? settings.firstFrame : undefined, resolution: model.resolutions.includes(settings.resolution) ? settings.resolution : (model.resolutions.includes('2K') ? '2K' : model.resolutions[0]) })
  }

  function selectVideoModel(videoModel: VideoModel) {
    const model = videoModels.find((item) => item.id === videoModel) ?? videoModels[0]
    if (settings.prompt.length > model.maxPromptLength) setNotice(`提示词已按 ${model.name} 上限截取为 ${model.maxPromptLength.toLocaleString()} 字符`)
    patch({
      videoModel,
      prompt: settings.prompt.slice(0, model.maxPromptLength),
      resolution: model.resolutions.includes(settings.resolution) ? settings.resolution : model.resolutions[0],
      duration: model.durations?.includes(settings.duration) ? settings.duration : (model.durations?.[0] ?? settings.duration),
      ...(model.provider === 'agnes' ? { mode: 'text' as const, firstFrame: undefined, lastFrame: undefined, referenceImages: undefined } : {}),
    })
    if (model.provider === 'agnes' && settings.mode !== 'text') setNotice('Agnes AI 已切换为文生视频；当前本地上传素材不是公开 URL')
  }

  function activateCatalogModel(model: CatalogModel) {
    if (model.category === 'image') {
      const target = imageModels.find((item) => (item.apiModel ?? item.id) === model.apiModel || item.id === model.id)
      if (!target) {
        void navigator.clipboard?.writeText(model.apiModel)
        setNotice(`${model.name} 的模型 ID 已复制；该目录模型需按官方文档调用`)
        return
      }
      switchKind('image')
      selectImageModel(target.id)
    } else if (model.category === 'video') {
      const target = videoModels.find((item) => (item.apiModel ?? item.id) === model.apiModel || item.id === model.id)
      if (!target) {
        void navigator.clipboard?.writeText(model.apiModel)
        setNotice(`${model.name} 的模型 ID 已复制；该目录模型需按官方文档调用`)
        return
      }
      switchKind('video')
      selectVideoModel(target.id)
    } else if (model.category === '3d') {
      const modelId = model.apiModel as ThreeDModel
      switchKind('3d')
      patch({ threeDModel: modelId })
    } else if (model.category === 'chat') {
      setLanguageModelId(model.id)
      setPortalView('language')
      setNotice(`已切换到 ${model.name}`)
      return
    } else if (model.category === 'audio') {
      setVoiceModelId(model.id)
      setPortalView('audio')
      setNotice(`已切换到 ${model.name}`)
      return
    } else {
      void navigator.clipboard?.writeText(model.apiModel)
      setNotice(`${model.name} 的模型 ID 已复制，可使用已配置的 ${model.provider} Key 调用`)
      return
    }
    setPortalView('studio')
    setPanelCollapsed(false)
    setCanvasView('session')
    setNotice(`已切换到 ${model.name}`)
  }

  function useCatalogModel(model: CatalogModel) {
    const configured = model.pricing === 'free'
      ? isProviderConfigured(model.providerId)
      : isProviderPersonallyConfigured(model.providerId)
    if (!configured) {
      setPendingCatalogModel(model)
      setSettingsProviderId(model.providerId)
      setSettingsOpen(true)
      setNotice(model.pricing === 'free'
        ? `请先配置 ${model.provider} API Key 以调用免费模型`
        : `${model.name} 不是完全免费模型，请先配置个人 ${model.provider} API Key`)
      return
    }
    activateCatalogModel(model)
  }

  function handleCredentialsChange(providerId: string) {
    setCredentialVersion((current) => current + 1)
    const pendingConfigured = pendingCatalogModel?.pricing === 'free'
      ? isProviderConfigured(providerId)
      : isProviderPersonallyConfigured(providerId)
    if (pendingCatalogModel?.providerId === providerId && pendingConfigured) {
      const model = pendingCatalogModel
      setPendingCatalogModel(undefined)
      setSettingsOpen(false)
      window.setTimeout(() => activateCatalogModel(model), 0)
    }
  }

  function validate(next: GenerationSettings) {
    setPromptError(undefined); setFrameError(undefined)
    if (!hasApiKeyForSettings(next)) { setImageError(`请先在 API 设置中配置 ${getProviderName(next)} API Key`); openProviderSettings(activeProviderId); return false }
    if (next.kind !== '3d' && !next.prompt.trim()) { setPromptError('请先写下画面描述'); setImageError('还缺少画面描述'); promptRef.current?.focus(); return false }
    if (next.prompt.length > getPromptLimit(next)) { setPromptError(`当前模型最多支持 ${getPromptLimit(next).toLocaleString()} 个字符`); setImageError('提示词超过模型上限'); promptRef.current?.focus(); return false }
    if (next.kind === '3d' && !next.firstFrame) { setFrameError('图片转 3D 需要上传一张参考图片'); setImageError('请先上传参考图片'); return false }
    if (next.kind === '3d' && next.firstFrame && (next.firstFrame.width < 300 || next.firstFrame.height < 300)) { setFrameError(`3D 参考图片至少需要 300 × 300px，当前为 ${next.firstFrame.width} × ${next.firstFrame.height}px`); setImageError('3D 参考图片尺寸过小'); return false }
    if (next.kind === 'video' && (next.mode === 'first-frame' || next.mode === 'first-last-frame') && !next.firstFrame) { setFrameError('当前模式需要上传首帧'); setImageError('请补充视频首帧'); return false }
    if (next.kind === 'video' && next.mode === 'first-last-frame' && !next.lastFrame) { setFrameError('首尾帧模式还需要尾帧'); setImageError('请补充视频尾帧'); return false }
    if (next.kind === 'video' && next.mode === 'reference-images' && !next.referenceImages?.length) { setFrameError('参考图生成至少需要上传 1 张图片'); setImageError('请补充视频参考图'); return false }
    if ((next.referenceImages?.length ?? 0) > MAX_VIDEO_REFERENCE_IMAGES) { setFrameError(`参考图最多上传 ${MAX_VIDEO_REFERENCE_IMAGES} 张`); setImageError('参考图数量超过上限'); return false }
    if (next.firstFrame && next.lastFrame) {
      const firstRatio = next.firstFrame.width / next.firstFrame.height
      const lastRatio = next.lastFrame.width / next.lastFrame.height
      if (Math.abs(firstRatio - lastRatio) / firstRatio > 0.03) { setFrameError('首尾帧比例差异较大，请先裁切为一致比例'); setImageError('首尾帧比例不一致'); return false }
    }
    return true
  }

  const refreshAsset = useCallback(async (asset: GeneratedAsset, force = false) => {
    if (!asset.taskId || asset.kind === 'image') return
    const failureKey = `${asset.id}:${asset.url}`
    if (refreshingAssetsRef.current.has(asset.id)) return
    if (!force && failedAssetRefreshesRef.current.has(failureKey)) return
    refreshingAssetsRef.current.add(asset.id)
    setRefreshingAssetIds([...refreshingAssetsRef.current])
    try {
      const url = await refreshAssetUrl(asset)
      const saved = await saveGeneratedAsset({ ...asset, url })
      failedAssetRefreshesRef.current.delete(failureKey)
      setHistory((current) => current.map((item) => item.id === asset.id ? saved : item))
      setNotice(asset.kind === 'video' ? '视频已重新保存到 output 文件夹' : '3D 模型已重新保存到 output 文件夹')
    } catch (caught) {
      failedAssetRefreshesRef.current.add(failureKey)
      setNotice(caught instanceof Error ? `链接刷新失败：${caught.message}` : '链接刷新失败')
    } finally {
      refreshingAssetsRef.current.delete(asset.id)
      setRefreshingAssetIds([...refreshingAssetsRef.current])
    }
  }, [])

  function selectAsset(id: string) {
    setSelectedId(id)
    if (canvasView === 'history') {
      setSessionAssetIds((current) => current.includes(id) ? current : [id, ...current])
      setCanvasView('session')
    }
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
    setImageError(undefined); setLastFailedImage(values)
    try {
      await imageQueue.enqueue(values, sessionId)
      setNotice('图片任务已提交；刷新页面后会自动继续')
    } catch (caught) { setImageError(caught instanceof Error ? caught.message : '发生未知错误') }
  }

  function newTask() {
    setSettings(makeDefaultsForKind(settings.kind)); setImageError(undefined); setPromptError(undefined); setFrameError(undefined); setSessionAssetIds([]); setSelectedId(undefined); setSessionId(makeSessionId()); setCanvasView('session')
    window.setTimeout(() => promptRef.current?.focus(), 50)
  }

  function reuse(asset: GeneratedAsset) {
    setSettings(settingsFromSnapshot(asset.settings)); setPortalView('studio'); setCanvasView('session'); setPanelCollapsed(false)
    setNotice(asset.settings.usedFirstFrame || asset.settings.usedLastFrame || asset.settings.referenceImageCount ? '参数已复用，请重新上传原参考图片' : '已复用完整生成参数')
    window.setTimeout(() => promptRef.current?.focus(), 80)
  }

  function reuseJob(job: VideoJob) {
    setSettings(job.settings); setPortalView('studio'); setCanvasView('session'); setPanelCollapsed(false)
    setNotice('已复用视频任务参数')
    window.setTimeout(() => promptRef.current?.focus(), 80)
  }

  function reuseThreeDJob(job: ThreeDJob) {
    setSettings(job.settings); setPortalView('studio'); setCanvasView('session'); setPanelCollapsed(false)
    setNotice('已复用 3D 任务参数，请重新上传参考图片')
  }

  function removeAsset(asset: GeneratedAsset) {
    if (!window.confirm('确定从本地历史中删除这件作品吗？')) return
    setHistory((current) => current.filter((item) => item.id !== asset.id)); setSessionAssetIds((current) => current.filter((id) => id !== asset.id)); setNotice('作品已从本地历史删除')
  }

  const modes = settings.kind === 'image'
    ? [{ id: 'text', label: '文字生成' }]
    : settings.kind === '3d'
      ? [{ id: 'image-to-3d', label: '图片转 3D' }]
      : settings.videoModel === 'agnes-video-v2.0'
        ? [{ id: 'text', label: '文字生成' }]
        : [{ id: 'text', label: '文字生成' }, { id: 'first-frame', label: '首帧生成' }, { id: 'first-last-frame', label: '首尾帧' }, { id: 'reference-images', label: '参考图生成' }]
  return <div className={`app-shell portal-theme ${panelCollapsed ? 'panel-collapsed' : ''}`}>
    <PortalSidebar
      view={portalView}
      kind={settings.kind}
      historyActive={portalView === 'studio' && canvasView === 'history'}
      historyCount={history.length}
      modelCount={providerCatalog.models.length}
      onMarketplace={(family = 'language') => openModelCenter(family)}
      onStudio={openStudio}
      onLanguage={() => setPortalView('language')}
      onHistory={() => { setPortalView('studio'); setCanvasView('history') }}
      onSettings={() => openProviderSettings()}
    />

    {portalView === 'marketplace'
      ? <main className="marketplace-page-shell"><ModelCenter
          embedded
          initialFamily={modelCenterFamily}
          models={providerCatalog.models}
          modelsRefreshing={providerCatalog.syncing}
          modelSyncSummary={providerCatalog.summary}
          modelSyncDetail={providerCatalog.detail}
          onRefreshModels={providerCatalog.refresh}
          onUseModel={useCatalogModel}
        /></main>
      : portalView === 'language'
        ? <LanguageStudio models={providerCatalog.models.filter((model) => model.category === 'chat')} selectedModelId={languageModelId} onModelChange={setLanguageModelId} onOpenModels={() => openModelCenter('language')} onOpenSettings={() => openProviderSettings(providerCatalog.models.find((model) => model.id === languageModelId)?.providerId ?? 'openrouter')} />
        : portalView === 'audio'
          ? <VoiceStudio models={providerCatalog.models.filter((model) => model.category === 'audio')} selectedModelId={voiceModelId} onModelChange={setVoiceModelId} onOpenModels={() => openModelCenter('speech')} onOpenSettings={() => openProviderSettings(providerCatalog.models.find((model) => model.id === voiceModelId)?.providerId ?? 'elevenlabs')} />
      : <main className={`workspace ${canvasView === 'session' ? 'generation-page' : 'history-page'}`}>
      <header className="topbar">
        <div className="workspace-title"><span>{canvasView === 'history' ? '作品历史' : settings.kind === 'image' ? '图片生成' : settings.kind === 'video' ? '视频生成' : '3D 生成'}</span><small>{activeGenerationModel?.name ?? 'Seed3D 2.0'}</small></div>
        <div className="top-actions"><button type="button" className={`connection ${activeHasApiKey ? 'online' : ''}`} onClick={() => openProviderSettings()}><i />{activeHasApiKey ? `${activeProviderName} 已连接` : `${activeProviderName} 未配置`}</button><button type="button" className="new-task top-new" onClick={newTask}><Plus /> 新建创作</button></div>
      </header>

      <div className="studio">
        <section id="control-panel" className="control-panel" aria-label={`${settings.kind === 'image' ? '图片' : settings.kind === 'video' ? '视频' : '3D'}生成参数`}>
          <div className="panel-head">
            <div className="generation-page-heading">{settings.kind === 'image' ? <Image /> : settings.kind === 'video' ? <Film /> : <Box />}<div><small>{settings.kind === 'image' ? 'IMAGE' : settings.kind === 'video' ? 'VIDEO' : '3D'}</small><strong>{settings.kind === 'image' ? '图片生成' : settings.kind === 'video' ? '视频生成' : '3D 生成'}</strong></div></div>
            <button type="button" className="collapse" aria-label={panelCollapsed ? '展开参数面板' : '收起参数面板'} onClick={() => setPanelCollapsed(!panelCollapsed)}>{panelCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
          </div>
          {panelCollapsed ? <button className="expand-rail" type="button" aria-label="展开参数面板" onClick={() => setPanelCollapsed(false)}><PanelLeftOpen /></button> : <>
            <div className="panel-scroll">
              <section className="control-section"><div className="section-label"><span>创作方式</span><small>MODE</small></div><div className="mode-tabs">{modes.map((mode) => <button type="button" key={mode.id} aria-pressed={settings.mode === mode.id} className={settings.mode === mode.id ? 'active' : ''} onClick={() => switchMode(mode.id as GenerationMode)}>{mode.label}</button>)}</div></section>
              {settings.kind === 'video' && (settings.mode === 'first-frame' || settings.mode === 'first-last-frame') && <div className="frame-grid"><FrameUpload label="首帧" hint="JPG / PNG / WebP · 最大 10MB" value={settings.firstFrame} onChange={(firstFrame) => patch({ firstFrame })} error={frameError} />{settings.mode === 'first-last-frame' && <FrameUpload label="尾帧" hint="建议与首帧比例一致" value={settings.lastFrame} onChange={(lastFrame) => patch({ lastFrame })} disabled={!settings.firstFrame} error={settings.firstFrame ? frameError : undefined} />}</div>}
              {settings.kind === 'video' && settings.mode === 'reference-images' && <ReferenceImageUpload value={settings.referenceImages ?? []} onChange={(referenceImages) => { patch({ referenceImages }); setFrameError(undefined) }} error={frameError} />}
              {settings.kind === 'image' && activeGenerationModel?.supportsReferenceImage && <div className="frame-grid single"><FrameUpload label="参考图（可选）" hint="用于图生图或风格参考 · JPG / PNG / WebP · 最大 10MB" value={settings.firstFrame} onChange={(firstFrame) => patch({ firstFrame })} error={frameError} /></div>}
              {settings.kind === '3d' && <div className="frame-grid single"><FrameUpload label="3D 参考图片" hint="不足 300 × 300px 自动白边补齐 · 最大 10MB" value={settings.firstFrame} onChange={(firstFrame) => patch({ firstFrame })} error={frameError} minWidth={300} minHeight={300} /></div>}
              {settings.kind === 'image' && <section className="control-section compact"><div className="section-label"><span>常用图片模型</span><button type="button" className="model-center-link" onClick={() => openModelCenter('vision')}>查看全部 {imageModels.length}</button></div><div className="model-choice generation-model-choice">{visibleImageModels.map((model) => <button type="button" key={model.id} aria-pressed={(settings.imageModel ?? DEFAULT_IMAGE_MODEL) === model.id} className={(settings.imageModel ?? DEFAULT_IMAGE_MODEL) === model.id ? 'active' : ''} onClick={() => selectImageModel(model.id)}><strong>{model.name}<b className={`inline-price ${model.pricing}`}>{pricingLabels[model.pricing]}</b></strong><span>{model.description}</span><small>{model.apiModel ?? model.id}</small></button>)}</div></section>}
              {settings.kind === 'video' && <section className="control-section compact"><div className="section-label"><span>视频模型</span><button type="button" className="model-center-link" onClick={() => openModelCenter('vision')}>查看全部 {videoModels.length}</button></div><div className="model-choice generation-model-choice">{videoModels.map((model) => <button type="button" key={model.id} aria-pressed={(settings.videoModel ?? DEFAULT_VIDEO_MODEL) === model.id} className={(settings.videoModel ?? DEFAULT_VIDEO_MODEL) === model.id ? 'active' : ''} onClick={() => selectVideoModel(model.id)}><strong>{model.name}<b className={`inline-price ${model.pricing}`}>{pricingLabels[model.pricing]}</b></strong><span>{model.description}</span><small>{model.apiModel ?? model.id}</small></button>)}</div></section>}
              {settings.kind === '3d' && <section className="control-section compact"><div className="section-label"><span>3D 模型</span><small>MODEL</small></div><div className="model-choice">{([['doubao-seed3d-2-0-260328', 'Seed3D 2.0'], ['hyper3d-gen2-260112', 'Hyper3D Gen2']] as Array<[ThreeDModel, string]>).map(([model, label]) => <button type="button" key={model} aria-pressed={(settings.threeDModel ?? 'doubao-seed3d-2-0-260328') === model} className={(settings.threeDModel ?? 'doubao-seed3d-2-0-260328') === model ? 'active' : ''} onClick={() => patch({ threeDModel: model })}><strong>{label}</strong><small>{model}</small></button>)}</div></section>}
              <section className="control-section"><div className="section-label"><label htmlFor="generation-prompt">{settings.kind === '3d' ? '输出命令（可选）' : '画面描述'}</label><small>{settings.kind === '3d' ? '3D OPTIONS' : 'PROMPT'}</small></div><PromptBox ref={promptRef} value={settings.prompt} onChange={(prompt) => { patch({ prompt }); setPromptError(undefined) }} onInspire={() => patch({ prompt: inspiration[Math.floor(Math.random() * inspiration.length)] })} maxLength={getPromptLimit(settings)} error={promptError} threeD={settings.kind === '3d'} /></section>
              {settings.kind !== '3d' && <section className="control-section"><div className="section-label"><span>视觉主题（可选）</span><small>{template ? 'STYLE' : '默认不选'}</small></div><div className={`template-preview ${template ? '' : 'empty'}`} style={template ? { background: template.gradient } : undefined}><div><small>{template?.eyebrow ?? 'ORIGINAL PROMPT'}</small><strong>{template?.name ?? '不使用视觉主题'}</strong><p>{template?.description ?? '仅按画面描述生成，不附加预设风格。'}</p></div><span>{template ? '已应用' : '未选择'}</span></div><div className="template-row"><button type="button" aria-label="不使用视觉主题" aria-pressed={!template} className={`template-none ${template ? '' : 'active'}`} onClick={() => patch({ styleId: '' })}><span>原始描述</span></button>{styleTemplates.map((item) => { const selected = settings.styleId === item.id; return <button type="button" key={item.id} aria-pressed={selected} className={selected ? 'active' : ''} title={selected ? '再次点击取消此主题' : `选择${item.name}`} onClick={() => patch({ styleId: selected ? '' : item.id })} style={{ background: item.gradient }}><span>{item.name}</span></button> })}</div></section>}
              {settings.kind !== '3d' && <section className="control-section"><div className="section-label"><span>画面比例</span><small>{settings.ratio}</small></div><div className="ratio-row">{(['1:1', '4:3', '3:4', '16:9', '9:16'] as AspectRatio[]).map((ratio) => <button type="button" key={ratio} aria-pressed={settings.ratio === ratio} className={settings.ratio === ratio ? 'active' : ''} onClick={() => patch({ ratio })}><i style={{ aspectRatio: ratio.replace(':', '/') }} />{ratio}</button>)}</div></section>}
              {settings.kind !== '3d' && <section className="control-section compact"><div className="section-label"><span>输出清晰度</span><small>QUALITY</small></div><div className="chips-row">{activeGenerationModel!.resolutions.map((resolution) => <button type="button" aria-pressed={settings.resolution === resolution} className={settings.resolution === resolution ? 'active' : ''} key={resolution} onClick={() => patch({ resolution: resolution as Resolution })}>{resolution}</button>)}</div></section>}
              {settings.kind === 'video' && <section className="control-section compact"><div className="section-label"><span>视频时长</span><small>DURATION</small></div><div className="chips-row">{(activeGenerationModel?.durations ?? [5, 10, 15]).map((duration) => <button type="button" aria-pressed={settings.duration === duration} className={settings.duration === duration ? 'active' : ''} key={duration} onClick={() => patch({ duration })}>{duration} 秒</button>)}</div></section>}
            </div>
            <div className="generate-wrap">{!activeHasApiKey && <button type="button" className="key-warning" onClick={() => openProviderSettings()}><KeyRound /> 配置 {activeProviderName} API Key</button>}<button className="generate-button" type="button" onClick={() => void submit()} disabled={settings.kind === 'image' && imageLoading} aria-busy={settings.kind === 'image' && imageLoading}><span><Sparkles />{settings.kind === 'video' ? '加入视频队列' : settings.kind === '3d' ? '加入 3D 队列' : imageLoading ? '创作中…' : '生成图片'}</span><b>{settings.kind === 'image' ? 'IMAGE' : settings.kind === 'video' ? 'VIDEO' : '3D'}</b></button></div>
          </>}
        </section>

        <section className="canvas-area">
          <div className="canvas-toolbar"><div role="tablist" aria-label="作品范围"><button type="button" role="tab" aria-selected={canvasView === 'session'} className={canvasView === 'session' ? 'active' : ''} onClick={() => setCanvasView('session')}>本次创作 <span>{currentKindSessionAssets.length}</span></button><button type="button" role="tab" aria-selected={canvasView === 'history'} className={canvasView === 'history' ? 'active' : ''} onClick={() => setCanvasView('history')}>全部作品 <span>{history.length}</span></button></div><button type="button" className="new-task canvas-new" onClick={newTask}><Plus /> 新建创作</button></div>
          {settings.kind === 'video' && <VideoTaskStrip jobs={videoQueue.jobs} maxConcurrency={maxVideoConcurrency} onOpenSettings={() => setSettingsOpen(true)} onPause={videoQueue.pause} onResume={videoQueue.resume} onRetry={videoQueue.retry} onRemove={videoQueue.remove} onReuse={(job) => reuseJob(job as VideoJob)} />}
          {settings.kind === '3d' && <VideoTaskStrip kind="3d" jobs={threeDQueue.jobs} maxConcurrency={maxThreeDConcurrency} onOpenSettings={() => setSettingsOpen(true)} onPause={threeDQueue.pause} onResume={threeDQueue.resume} onRetry={threeDQueue.retry} onRemove={threeDQueue.remove} onReuse={(job) => reuseThreeDJob(job as ThreeDJob)} />}
          <div className="canvas-content" role="tabpanel"><OutputStage assets={visibleAssets} view={canvasView} selectedId={selectedId} imageLoading={imageLoading} imageError={imageError} refreshingAssetIds={refreshingAssetIds} onRefreshAsset={refreshAsset} onSelect={selectAsset} onReuse={reuse} onRemove={removeAsset} onSuggestion={(prompt) => { patch({ prompt }); focusControls() }} onRetryImage={failedImageJob ? () => imageQueue.retry(failedImageJob.id) : lastFailedImage ? () => void submit(lastFailedImage) : undefined} /></div>
          <div className="canvas-foot"><span>素材文件保存在 output 分类目录，作品索引保存在当前浏览器</span><span>Powered by Agnes AI · OpenRouter</span></div>
        </section>
      </div>
    </main>}
    <SettingsDialog key={settingsOpen ? settingsProviderId : 'closed'} open={settingsOpen} selectedProviderId={settingsProviderId} maxVideoConcurrency={maxVideoConcurrency} maxThreeDConcurrency={maxThreeDConcurrency} onCredentialsChange={handleCredentialsChange} onVideoConcurrencyChange={(value) => { const next = savePreferences({ maxVideoConcurrency: value, maxThreeDConcurrency }); setMaxVideoConcurrency(next.maxVideoConcurrency); setNotice(`视频最高并发已设为 ${next.maxVideoConcurrency}`) }} onThreeDConcurrencyChange={(value) => { const next = savePreferences({ maxVideoConcurrency, maxThreeDConcurrency: value }); setMaxThreeDConcurrency(next.maxThreeDConcurrency); setNotice(`3D 最高并发已设为 ${next.maxThreeDConcurrency}`) }} onClose={() => { setSettingsOpen(false); setPendingCatalogModel(undefined) }} onClearHistory={() => { clearHistory(); setHistory([]); setSessionAssetIds([]); setSettingsOpen(false); setNotice('本地历史已清空') }} />
    <div className="live-notice" aria-live="polite">{notice}</div>
  </div>
}

export default App
