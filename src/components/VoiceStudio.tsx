import { useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, Check, ChevronDown, Download, FileAudio, KeyRound, Mic2, ShieldCheck, SlidersHorizontal, Square, Upload, WandSparkles } from 'lucide-react'
import { pricingLabels, type CatalogModel } from '../data/providerCatalog'
import { cloneSpeechVoice, createSpeech, hasCreativeProviderKey, isTextToSpeechModel, speechVoices, transcribeSpeech, voiceModels, type SpeechVoice, type VoiceSettings } from '../lib/creative'

interface VoiceStudioProps {
  models?: CatalogModel[]
  selectedModelId: string
  onModelChange: (modelId: string) => void
  onOpenModels: () => void
  onOpenSettings: () => void
}

export function VoiceStudio({ models: availableModels = voiceModels, selectedModelId, onModelChange, onOpenModels, onOpenSettings }: VoiceStudioProps) {
  const [text, setText] = useState('')
  const [voiceId, setVoiceId] = useState(speechVoices[0].id)
  const [audioFile, setAudioFile] = useState<File>()
  const [audioUrl, setAudioUrl] = useState('')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({ stability: 0.5, similarityBoost: 0.75, style: 0, speed: 1, useSpeakerBoost: true })
  const [referenceFile, setReferenceFile] = useState<File>()
  const [referenceName, setReferenceName] = useState('我的参考声音')
  const [referenceConsent, setReferenceConsent] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [customVoice, setCustomVoice] = useState<SpeechVoice>()
  const abortRef = useRef<AbortController | undefined>(undefined)
  const model = useMemo(() => availableModels.find((item) => item.id === selectedModelId) ?? voiceModels.find((item) => item.id === selectedModelId) ?? availableModels[0] ?? voiceModels[0], [availableModels, selectedModelId])
  const isTts = isTextToSpeechModel(model)
  const hasKey = hasCreativeProviderKey(model.providerId)
  const supportsVoiceControls = model.providerId === 'elevenlabs'
  const availableVoices = customVoice ? [...speechVoices, customVoice] : speechVoices

  useEffect(() => {
    if (!modelMenuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModelMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [modelMenuOpen])

  async function run() {
    if (loading) return
    if (!hasKey) {
      setError(`请先配置 ${model.provider} API Key`)
      return
    }
    if (isTts && !text.trim()) {
      setError('请输入需要转换为语音的文字')
      return
    }
    if (!isTts && !audioFile) {
      setError('请先上传音频文件')
      return
    }
    setError('')
    setLoading(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      if (isTts) {
        const result = await createSpeech(model, text.trim(), voiceId, supportsVoiceControls ? voiceSettings : undefined, controller.signal)
        setAudioUrl(result.url)
      } else if (audioFile) {
        setTranscript(await transcribeSpeech(model, audioFile, controller.signal))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '语音任务失败')
    } finally {
      setLoading(false)
      abortRef.current = undefined
    }
  }

  async function createReferenceVoice() {
    if (!referenceFile) {
      setError('请先上传参考语音')
      return
    }
    setCloning(true)
    setError('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const id = await cloneSpeechVoice(referenceFile, referenceName, referenceConsent, controller.signal)
      const voice = { id, name: referenceName.trim() || '我的参考声音', description: '根据已授权参考音频创建' }
      setCustomVoice(voice)
      setVoiceId(id)
      setReferenceFile(undefined)
      setReferenceConsent(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '参考声音创建失败')
    } finally {
      setCloning(false)
      abortRef.current = undefined
    }
  }

  function selectModel(modelId: string, providerId: string) {
    onModelChange(modelId)
    if (providerId !== 'elevenlabs' && customVoice?.id === voiceId) setVoiceId(speechVoices[0].id)
    setError('')
    setModelMenuOpen(false)
  }

  return (
    <main className="creative-workspace-shell">
      <header className="creative-topbar">
        <div><span>创作中心</span><h1>语音模型</h1><p>文字转语音与音频转文字</p></div>
        <div className="creative-top-actions"><button type="button" className={`connection ${hasKey ? 'online' : ''}`} onClick={onOpenSettings}><i />{model.provider} {hasKey ? '已连接' : '未配置'}</button></div>
      </header>

      <div className="creative-studio-grid voice-grid">
        <aside className="creative-config-panel">
          <div className="creative-section-head"><div><small>MODEL</small><strong>选择语音模型</strong></div><button type="button" onClick={onOpenModels}>模型广场</button></div>
          <div className="creative-model-list">
            {availableModels.map((item) => <button type="button" key={item.id} className={item.id === model.id ? 'active' : ''} aria-pressed={item.id === model.id} onClick={() => selectModel(item.id, item.providerId)}>
              <span className="model-letter">{item.providerId === 'groq' ? 'G' : item.providerId === 'pollinations' ? 'P' : 'E'}</span>
              <span><strong>{item.name}<b className={`inline-price ${item.pricing}`}>{pricingLabels[item.pricing]}</b></strong><small>{item.description}</small></span>
            </button>)}
          </div>
          <div className="creative-quota-note"><KeyRound /><span><strong>{hasKey ? '当前模型可以调用' : '需要配置 API Key'}</strong>{model.quota}</span></div>
        </aside>

        <section className="voice-workspace">
          <div className="chat-mobile-toolbar voice-model-toolbar">
            <button type="button" className={`chat-model-trigger ${modelMenuOpen ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={modelMenuOpen} onClick={() => setModelMenuOpen((open) => !open)}>
              <span className="model-letter">{model.providerId === 'groq' ? 'G' : model.providerId === 'pollinations' ? 'P' : 'E'}</span>
              <span><small>当前模型</small><strong>{model.name}</strong></span>
              <ChevronDown />
            </button>
          </div>
          {modelMenuOpen && <>
            <button type="button" className="chat-model-backdrop" aria-label="关闭模型选择" onClick={() => setModelMenuOpen(false)} />
            <div className="chat-model-menu" role="listbox" aria-label="选择语音模型">
              <div className="chat-model-menu-head"><div><small>MODEL</small><strong>选择语音模型</strong></div><button type="button" onClick={() => { setModelMenuOpen(false); onOpenModels() }}>模型广场</button></div>
              <div className="chat-model-options">
                {availableModels.map((item) => <button type="button" role="option" aria-selected={item.id === model.id} key={item.id} className={item.id === model.id ? 'selected' : ''} onClick={() => selectModel(item.id, item.providerId)}>
                  <span className="model-letter">{item.providerId === 'groq' ? 'G' : item.providerId === 'pollinations' ? 'P' : 'E'}</span>
                  <span><strong>{item.name}<b className={`inline-price ${item.pricing}`}>{pricingLabels[item.pricing]}</b></strong><small>{item.description}</small></span>
                  {item.id === model.id && <Check />}
                </button>)}
              </div>
            </div>
          </>}
          <div className="voice-workspace-content">
            <div className="voice-hero"><span><AudioLines /></span><div><small>{isTts ? 'TEXT TO SPEECH' : 'SPEECH TO TEXT'}</small><h2>{isTts ? '让文字拥有声音' : '把声音整理成文字'}</h2><p>{isTts ? '输入文案并选择声音，生成可试听和下载的 MP3。' : '上传音频，使用 Whisper 快速完成多语言转写。'}</p></div></div>

            {isTts ? <>
              <label className="voice-input"><span>朗读文本 <b>{text.length.toLocaleString()} / 5,000</b></span><textarea aria-label="朗读文本" placeholder="输入需要合成为语音的内容…" value={text} maxLength={5000} onChange={(event) => setText(event.target.value)} /></label>
              <div className="voice-options"><span>选择声音</span><div>{availableVoices.map((voice) => <button type="button" key={voice.id} className={voice.id === voiceId ? 'active' : ''} aria-pressed={voice.id === voiceId} onClick={() => setVoiceId(voice.id)}><Mic2 /><strong>{voice.name}</strong><small>{voice.description}</small></button>)}</div></div>
              {supportsVoiceControls && <section className="voice-control-card">
                <div className="voice-control-head"><SlidersHorizontal /><div><strong>语气与声音控制</strong><small>ElevenLabs 高级参数</small></div></div>
                <label><span>稳定度 <b>{voiceSettings.stability.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.05" value={voiceSettings.stability} onChange={(event) => setVoiceSettings({ ...voiceSettings, stability: Number(event.target.value) })} /></label>
                <label><span>声音相似度 <b>{voiceSettings.similarityBoost.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.05" value={voiceSettings.similarityBoost} onChange={(event) => setVoiceSettings({ ...voiceSettings, similarityBoost: Number(event.target.value) })} /></label>
                <label><span>风格强度 <b>{voiceSettings.style.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.05" value={voiceSettings.style} onChange={(event) => setVoiceSettings({ ...voiceSettings, style: Number(event.target.value) })} /></label>
                <label><span>语速 <b>{voiceSettings.speed.toFixed(2)}×</b></span><input type="range" min="0.7" max="1.2" step="0.05" value={voiceSettings.speed} onChange={(event) => setVoiceSettings({ ...voiceSettings, speed: Number(event.target.value) })} /></label>
                <label className="voice-boost-toggle"><input type="checkbox" checked={voiceSettings.useSpeakerBoost} onChange={(event) => setVoiceSettings({ ...voiceSettings, useSpeakerBoost: event.target.checked })} /><span>增强说话人相似度</span></label>
              </section>}
              {supportsVoiceControls && <section className="reference-voice-card">
                <div><Upload /><span><strong>上传参考语音</strong><small>创建可重复使用的自定义声音 · 最大 10MB</small></span></div>
                <label className="reference-file"><input type="file" accept="audio/*,.mp3,.wav,.m4a,.webm" onChange={(event) => setReferenceFile(event.target.files?.[0])} /><span>{referenceFile ? referenceFile.name : '选择音频文件'}</span></label>
                <input aria-label="参考声音名称" value={referenceName} maxLength={80} onChange={(event) => setReferenceName(event.target.value)} />
                <label className="reference-consent"><input type="checkbox" checked={referenceConsent} onChange={(event) => setReferenceConsent(event.target.checked)} /><ShieldCheck /><span>我确认拥有该声音的使用和克隆权限</span></label>
                <button type="button" disabled={!referenceFile || !referenceConsent || cloning} onClick={() => void createReferenceVoice()}>{cloning ? '正在创建…' : '创建参考声音'}</button>
              </section>}
              {audioUrl && <div className="audio-result"><div><span><AudioLines /></span><div><strong>语音已生成</strong><small>{model.name} · MP3</small></div></div><audio controls src={audioUrl} /><a href={audioUrl} download="xiaoy-modelhub-speech.mp3"><Download /> 下载音频</a></div>}
            </> : <>
              <label className={`audio-upload ${audioFile ? 'has-file' : ''}`}>
                <input type="file" accept="audio/*,.mp3,.wav,.m4a,.webm,.mp4" onChange={(event) => { setAudioFile(event.target.files?.[0]); setTranscript(''); setError('') }} />
                {audioFile ? <><FileAudio /><strong>{audioFile.name}</strong><small>{(audioFile.size / 1024 / 1024).toFixed(2)} MB · 点击重新选择</small></> : <><Upload /><strong>上传音频文件</strong><small>MP3、WAV、M4A、WebM · 免费档最大 25MB</small></>}
              </label>
              {transcript && <div className="transcript-result"><div><span>转写结果</span><button type="button" onClick={() => void navigator.clipboard.writeText(transcript)}>复制文本</button></div><p>{transcript}</p></div>}
            </>}

            {error && <p className="creative-error">{error}</p>}
            <button type="button" className={`voice-generate ${loading ? 'loading' : ''}`} disabled={!loading && (isTts ? !text.trim() : !audioFile)} onClick={() => loading ? abortRef.current?.abort() : void run()}>{loading ? <><Square /> 停止处理</> : <><WandSparkles />{isTts ? '生成语音' : '开始转写'}</>}</button>
          </div>
        </section>
      </div>
    </main>
  )
}
