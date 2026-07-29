import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Copy, KeyRound, MessageSquareText, RotateCcw, Send, Square, UserRound } from 'lucide-react'
import { pricingLabels } from '../data/providerCatalog'
import { hasCreativeProviderKey, languageModels, sendLanguageMessage, type ChatMessage } from '../lib/creative'

interface LanguageStudioProps {
  selectedModelId: string
  onModelChange: (modelId: string) => void
  onOpenModels: () => void
  onOpenSettings: () => void
}

const languageHistoryKey = 'xiaoy_language_messages_v1'

function loadMessages(): ChatMessage[] {
  try {
    const value = JSON.parse(localStorage.getItem(languageHistoryKey) ?? '[]')
    return Array.isArray(value) ? value.slice(-40) : []
  } catch {
    return []
  }
}

export function LanguageStudio({ selectedModelId, onModelChange, onOpenModels, onOpenSettings }: LanguageStudioProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages)
  const [prompt, setPrompt] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('你是小Y中转站的专业 AI 助手。回答准确、清晰，并优先使用中文。')
  const [temperature, setTemperature] = useState(0.7)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | undefined>(undefined)
  const model = useMemo(
    () => languageModels.find((item) => item.id === selectedModelId) ?? languageModels[0],
    [selectedModelId],
  )
  const hasKey = hasCreativeProviderKey(model.providerId)

  useEffect(() => {
    localStorage.setItem(languageHistoryKey, JSON.stringify(messages.slice(-40)))
  }, [messages])

  async function submit() {
    const content = prompt.trim()
    if (!content || loading) return
    if (!hasKey) {
      setError(`请先配置 ${model.provider} API Key`)
      return
    }
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content, createdAt: Date.now() }
    const nextMessages = [...messages, userMessage].slice(-20)
    setMessages(nextMessages)
    setPrompt('')
    setError('')
    setLoading(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const answer = await sendLanguageMessage(model, nextMessages, systemPrompt, temperature, controller.signal)
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant' as const, content: answer, createdAt: Date.now() }].slice(-40))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '语言模型请求失败')
    } finally {
      setLoading(false)
      abortRef.current = undefined
    }
  }

  function clearConversation() {
    setMessages([])
    setError('')
  }

  return (
    <main className="creative-workspace-shell">
      <header className="creative-topbar">
        <div><span>创作中心</span><h1>语言模型</h1><p>对话、写作、总结与灵感辅助</p></div>
        <div className="creative-top-actions">
          <button type="button" className={`connection ${hasKey ? 'online' : ''}`} onClick={onOpenSettings}><i />{model.provider} {hasKey ? '已连接' : '未配置'}</button>
          <button type="button" className="secondary-action" onClick={clearConversation}><RotateCcw /> 新对话</button>
        </div>
      </header>

      <div className="creative-studio-grid">
        <aside className="creative-config-panel">
          <div className="creative-section-head"><div><small>MODEL</small><strong>选择语言模型</strong></div><button type="button" onClick={onOpenModels}>模型广场</button></div>
          <div className="creative-model-list">
            {languageModels.map((item) => <button type="button" key={item.id} className={item.id === model.id ? 'active' : ''} aria-pressed={item.id === model.id} onClick={() => onModelChange(item.id)}>
              <span className="model-letter">{item.name.slice(0, 1)}</span>
              <span><strong>{item.name}<b className={`inline-price ${item.pricing}`}>{pricingLabels[item.pricing]}</b></strong><small>{item.provider} · {item.description}</small></span>
            </button>)}
          </div>
          <label className="creative-field"><span>系统指令</span><textarea value={systemPrompt} maxLength={2000} onChange={(event) => setSystemPrompt(event.target.value)} /></label>
          <label className="creative-field range-field"><span>创造性 <b>{temperature.toFixed(1)}</b></span><input type="range" min="0" max="1.5" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /></label>
          <div className="creative-quota-note"><KeyRound /><span><strong>{hasKey ? '当前模型可以调用' : '需要配置 API Key'}</strong>{model.quota}</span></div>
        </aside>

        <section className="chat-workspace">
          <div className="chat-scroll">
            {!messages.length && <div className="creative-empty"><span><MessageSquareText /></span><small>LANGUAGE WORKSPACE</small><h2>从一个问题开始</h2><p>可以让模型写文案、总结资料、润色内容或继续头脑风暴。</p><div>{['写一份新品发布文案', '把复杂概念讲简单', '整理一份执行清单'].map((value) => <button type="button" key={value} onClick={() => setPrompt(value)}>{value}</button>)}</div></div>}
            {messages.map((message) => <article key={message.id} className={`chat-message ${message.role}`}>
              <span>{message.role === 'assistant' ? <Bot /> : <UserRound />}</span>
              <div><small>{message.role === 'assistant' ? model.name : '你'}</small><p>{message.content}</p>{message.role === 'assistant' && <button type="button" aria-label="复制回答" onClick={() => void navigator.clipboard.writeText(message.content)}><Copy /> 复制</button>}</div>
            </article>)}
            {loading && <article className="chat-message assistant pending"><span><Bot /></span><div><small>{model.name}</small><p>正在思考<span className="typing-dots">•••</span></p></div></article>}
          </div>
          <div className="chat-composer">
            {error && <p className="creative-error">{error}</p>}
            <textarea aria-label="发送给语言模型" placeholder={`向 ${model.name} 提问…`} value={prompt} maxLength={32000} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() } }} />
            <div><small>{prompt.length.toLocaleString()} / 32,000 · Enter 发送，Shift + Enter 换行</small>{loading ? <button type="button" className="send-button stop" onClick={() => abortRef.current?.abort()}><Square /> 停止</button> : <button type="button" className="send-button" disabled={!prompt.trim()} onClick={() => void submit()}><Send /> 发送</button>}</div>
          </div>
        </section>
      </div>
    </main>
  )
}
