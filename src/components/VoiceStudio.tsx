import { useMemo, useRef, useState } from 'react'
import { AudioLines, Download, FileAudio, KeyRound, Mic2, Square, Upload, WandSparkles } from 'lucide-react'
import { pricingLabels } from '../data/providerCatalog'
import { createSpeech, hasCreativeProviderKey, speechVoices, transcribeSpeech, voiceModels } from '../lib/creative'

interface VoiceStudioProps {
  selectedModelId: string
  onModelChange: (modelId: string) => void
  onOpenModels: () => void
  onOpenSettings: () => void
}

export function VoiceStudio({ selectedModelId, onModelChange, onOpenModels, onOpenSettings }: VoiceStudioProps) {
  const [text, setText] = useState('')
  const [voiceId, setVoiceId] = useState(speechVoices[0].id)
  const [audioFile, setAudioFile] = useState<File>()
  const [audioUrl, setAudioUrl] = useState('')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | undefined>(undefined)
  const model = useMemo(() => voiceModels.find((item) => item.id === selectedModelId) ?? voiceModels[0], [selectedModelId])
  const isTts = model.providerId === 'elevenlabs'
  const hasKey = hasCreativeProviderKey(model.providerId)

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
        const result = await createSpeech(model, text.trim(), voiceId, controller.signal)
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
            {voiceModels.map((item) => <button type="button" key={item.id} className={item.id === model.id ? 'active' : ''} aria-pressed={item.id === model.id} onClick={() => { onModelChange(item.id); setError('') }}>
              <span className="model-letter">{item.providerId === 'groq' ? 'G' : 'E'}</span>
              <span><strong>{item.name}<b className={`inline-price ${item.pricing}`}>{pricingLabels[item.pricing]}</b></strong><small>{item.description}</small></span>
            </button>)}
          </div>
          <div className="creative-quota-note"><KeyRound /><span><strong>{hasKey ? '当前模型可以调用' : '需要配置 API Key'}</strong>{model.quota}</span></div>
        </aside>

        <section className="voice-workspace">
          <div className="voice-hero"><span><AudioLines /></span><div><small>{isTts ? 'TEXT TO SPEECH' : 'SPEECH TO TEXT'}</small><h2>{isTts ? '让文字拥有声音' : '把声音整理成文字'}</h2><p>{isTts ? '输入文案并选择声音，生成可试听和下载的 MP3。' : '上传音频，使用 Whisper 快速完成多语言转写。'}</p></div></div>

          {isTts ? <>
            <label className="voice-input"><span>朗读文本 <b>{text.length.toLocaleString()} / 5,000</b></span><textarea aria-label="朗读文本" placeholder="输入需要合成为语音的内容…" value={text} maxLength={5000} onChange={(event) => setText(event.target.value)} /></label>
            <div className="voice-options"><span>选择声音</span><div>{speechVoices.map((voice) => <button type="button" key={voice.id} className={voice.id === voiceId ? 'active' : ''} aria-pressed={voice.id === voiceId} onClick={() => setVoiceId(voice.id)}><Mic2 /><strong>{voice.name}</strong><small>{voice.description}</small></button>)}</div></div>
            {audioUrl && <div className="audio-result"><div><span><AudioLines /></span><div><strong>语音已生成</strong><small>{model.name} · MP3</small></div></div><audio controls src={audioUrl} /><a href={audioUrl} download="xiaoy-speech.mp3"><Download /> 下载音频</a></div>}
          </> : <>
            <label className={`audio-upload ${audioFile ? 'has-file' : ''}`}>
              <input type="file" accept="audio/*,.mp3,.wav,.m4a,.webm,.mp4" onChange={(event) => { setAudioFile(event.target.files?.[0]); setTranscript(''); setError('') }} />
              {audioFile ? <><FileAudio /><strong>{audioFile.name}</strong><small>{(audioFile.size / 1024 / 1024).toFixed(2)} MB · 点击重新选择</small></> : <><Upload /><strong>上传音频文件</strong><small>MP3、WAV、M4A、WebM · 免费档最大 25MB</small></>}
            </label>
            {transcript && <div className="transcript-result"><div><span>转写结果</span><button type="button" onClick={() => void navigator.clipboard.writeText(transcript)}>复制文本</button></div><p>{transcript}</p></div>}
          </>}

          {error && <p className="creative-error">{error}</p>}
          <button type="button" className={`voice-generate ${loading ? 'loading' : ''}`} disabled={!loading && (isTts ? !text.trim() : !audioFile)} onClick={() => loading ? abortRef.current?.abort() : void run()}>{loading ? <><Square /> 停止处理</> : <><WandSparkles />{isTts ? '生成语音' : '开始转写'}</>}</button>
        </section>
      </div>
    </main>
  )
}
