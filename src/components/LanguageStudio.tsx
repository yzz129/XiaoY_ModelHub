import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileDown,
  FileText,
  History,
  ImagePlus,
  KeyRound,
  Mic,
  MicOff,
  MoreHorizontal,
  Paperclip,
  PencilLine,
  Plus,
  Reply,
  Send,
  Square,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { pricingLabels, type CatalogModel } from '../data/providerCatalog'
import {
  hasCreativeProviderKey,
  languageModels,
  sendLanguageMessage,
  supportsLanguageImageInput,
  type ChatAttachment,
  type ChatMessage,
} from '../lib/creative'
import { logActivity } from '../lib/account'
import { MarkdownContent } from './MarkdownContent'

interface LanguageStudioProps {
  models?: CatalogModel[]
  selectedModelId: string
  onModelChange: (modelId: string) => void
  onOpenModels: () => void
  onOpenSettings: () => void
}

interface Conversation {
  id: string
  title: string
  modelId: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

interface DocumentDraft {
  title: string
  content: string
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

const conversationsKey = 'xiaoy_language_conversations_v2'
const legacyMessagesKey = 'xiaoy_language_messages_v1'
const activeConversationKey = 'xiaoy_language_active_conversation_v2'

function createConversation(modelId = ''): Conversation {
  const now = Date.now()
  return { id: crypto.randomUUID(), title: '新对话', modelId, messages: [], createdAt: now, updatedAt: now }
}

function loadConversations(): Conversation[] {
  try {
    const saved = JSON.parse(localStorage.getItem(conversationsKey) ?? '[]')
    if (Array.isArray(saved) && saved.length) return saved.slice(0, 40)
    const legacy = JSON.parse(localStorage.getItem(legacyMessagesKey) ?? '[]')
    if (Array.isArray(legacy) && legacy.length) {
      const conversation = createConversation()
      conversation.title = legacy.find((message: ChatMessage) => message.role === 'user')?.content?.slice(0, 28) || '历史对话'
      conversation.messages = legacy.slice(-40)
      return [conversation]
    }
  } catch {
    // Invalid local history falls back to a clean conversation.
  }
  return [createConversation()]
}

function persistedConversations(conversations: Conversation[]) {
  return conversations.map((conversation) => ({
    ...conversation,
    messages: conversation.messages.map((message) => ({
      ...message,
      attachments: message.attachments?.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        text: attachment.text,
      })),
    })),
  }))
}

function downloadText(content: string, fileName: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function conversationMarkdown(conversation: Conversation) {
  return `# ${conversation.title}\n\n${conversation.messages.map((message) =>
    `## ${message.role === 'user' ? '问题' : '回答'}\n\n${message.content}`,
  ).join('\n\n')}\n`
}

async function readAttachment(file: File): Promise<ChatAttachment> {
  const base = { id: crypto.randomUUID(), name: file.name, type: file.type || 'application/octet-stream', size: file.size }
  if (file.type.startsWith('image/')) {
    if (file.size > 4 * 1024 * 1024) throw new Error(`${file.name} 超过图片附件 4MB 上限`)
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error(`无法读取 ${file.name}`))
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(file)
    })
    return { ...base, dataUrl }
  }
  if (file.size > 1024 * 1024) throw new Error(`${file.name} 超过文本附件 1MB 上限`)
  const text = await file.text()
  return { ...base, text: text.slice(0, 20_000) }
}

export function LanguageStudio({ models: availableModels = languageModels, selectedModelId, onModelChange, onOpenModels, onOpenSettings }: LanguageStudioProps) {
  const [initialWorkspace] = useState(() => {
    const loadedConversations = loadConversations()
    const savedActiveId = localStorage.getItem(activeConversationKey)
    return {
      conversations: loadedConversations,
      activeId: loadedConversations.some((conversation) => conversation.id === savedActiveId)
        ? savedActiveId as string
        : loadedConversations[0].id,
    }
  })
  const [conversations, setConversations] = useState<Conversation[]>(initialWorkspace.conversations)
  const [activeConversationId, setActiveConversationId] = useState(initialWorkspace.activeId)
  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [systemPrompt, setSystemPrompt] = useState('你是 XiaoY_ModelHub 的专业 AI 助手。请使用结构清晰的 Markdown 回答，准确、清晰，并优先使用中文。')
  const [temperature, setTemperature] = useState(0.7)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [messageMenuId, setMessageMenuId] = useState('')
  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>()
  const abortRef = useRef<AbortController | undefined>(undefined)
  const speechRef = useRef<SpeechRecognitionLike | undefined>(undefined)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const model = useMemo(
    () => availableModels.find((item) => item.id === selectedModelId) ?? languageModels.find((item) => item.id === selectedModelId) ?? availableModels[0] ?? languageModels[0],
    [availableModels, selectedModelId],
  )
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0]
  const messages = activeConversation?.messages ?? []
  const hasKey = hasCreativeProviderKey(model.providerId)
  const supportsImages = supportsLanguageImageInput(model)

  useEffect(() => {
    localStorage.setItem(conversationsKey, JSON.stringify(persistedConversations(conversations.slice(0, 40))))
  }, [conversations])

  useEffect(() => {
    if (activeConversation?.id) localStorage.setItem(activeConversationKey, activeConversation.id)
  }, [activeConversation?.id])

  useEffect(() => {
    if (!modelMenuOpen && !historyOpen && !messageMenuId) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModelMenuOpen(false)
        setHistoryOpen(false)
        setMessageMenuId('')
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [historyOpen, messageMenuId, modelMenuOpen])

  function updateMessages(nextMessages: ChatMessage[]) {
    const targetId = activeConversation?.id
    if (!targetId) return
    setConversations((current) => current.map((conversation) => conversation.id === targetId
      ? {
          ...conversation,
          title: conversation.title === '新对话'
            ? nextMessages.find((message) => message.role === 'user')?.content.slice(0, 28) || conversation.title
            : conversation.title,
          modelId: model.id,
          messages: nextMessages.slice(-80),
          updatedAt: Date.now(),
        }
      : conversation))
  }

  function startNewConversation() {
    const conversation = createConversation(model.id)
    setConversations((current) => [conversation, ...current].slice(0, 40))
    setActiveConversationId(conversation.id)
    setPrompt('')
    setAttachments([])
    setError('')
    setHistoryOpen(false)
    setDocumentDraft(undefined)
    window.setTimeout(() => promptRef.current?.focus(), 50)
  }

  function openConversation(conversation: Conversation) {
    setActiveConversationId(conversation.id)
    if (conversation.modelId) onModelChange(conversation.modelId)
    setHistoryOpen(false)
    setDocumentDraft(undefined)
    setError('')
  }

  function deleteConversation(id: string) {
    setConversations((current) => {
      const remaining = current.filter((conversation) => conversation.id !== id)
      const next = remaining.length ? remaining : [createConversation(model.id)]
      if (id === activeConversation?.id) setActiveConversationId(next[0].id)
      return next
    })
  }

  async function submit() {
    const content = prompt.trim()
    if ((!content && !attachments.length) || loading || !activeConversation) return
    if (!hasKey) {
      setError(`请先配置 ${model.provider} API Key`)
      return
    }
    if (!supportsImages && attachments.some((attachment) => attachment.type.startsWith('image/'))) {
      setError(`${model.name} 未声明图片输入能力，请切换到支持图片输入的模型`)
      return
    }
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content || '请分析这些附件。',
      attachments,
      createdAt: Date.now(),
    }
    const nextMessages = [...messages, userMessage].slice(-30)
    updateMessages(nextMessages)
    setPrompt('')
    setAttachments([])
    setError('')
    setLoading(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const answer = await sendLanguageMessage(model, nextMessages, systemPrompt, temperature, controller.signal)
      updateMessages([...nextMessages, { id: crypto.randomUUID(), role: 'assistant', content: answer, createdAt: Date.now() }])
      void logActivity({
        clientEventId: `chat:${userMessage.id}`,
        type: 'chat',
        modelId: model.apiModel,
        provider: model.provider,
        inputText: userMessage.content,
        outputText: answer,
        metadata: {
          conversationId: activeConversation.id,
          conversationTitle: activeConversation.title,
          systemPrompt,
          temperature,
          attachments: attachments.map(({ id, name, type, size }) => ({ id, name, type, size })),
        },
        createdAt: userMessage.createdAt,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '语言模型请求失败')
      void logActivity({
        clientEventId: `chat:${userMessage.id}`,
        type: 'chat',
        modelId: model.apiModel,
        provider: model.provider,
        inputText: userMessage.content,
        outputText: caught instanceof Error ? caught.message : '语言模型请求失败',
        metadata: { conversationId: activeConversation.id },
        status: 'failed',
        createdAt: userMessage.createdAt,
      })
    } finally {
      setLoading(false)
      abortRef.current = undefined
    }
  }

  async function addAttachments(files: FileList | null) {
    if (!files?.length) return
    try {
      const next = await Promise.all([...files].slice(0, Math.max(0, 5 - attachments.length)).map(readAttachment))
      setAttachments((current) => [...current, ...next].slice(0, 5))
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法读取附件')
    }
  }

  function toggleDictation() {
    if (listening) {
      speechRef.current?.stop()
      return
    }
    const speechWindow = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      setError('当前浏览器不支持语音输入，请使用最新版 Chrome 或 Edge')
      return
    }
    const recognition = new Recognition()
    recognition.lang = 'zh-CN'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let finalText = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) finalText += event.results[index][0].transcript
      }
      if (finalText) setPrompt((current) => `${current}${current ? ' ' : ''}${finalText}`)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => {
      setListening(false)
      setError('语音输入失败，请检查麦克风权限')
    }
    speechRef.current = recognition
    recognition.start()
    setListening(true)
    setError('')
  }

  function followUp(message: ChatMessage) {
    setPrompt('请基于上面的回答继续说明：')
    setMessageMenuId('')
    window.setTimeout(() => promptRef.current?.focus(), 50)
    document.getElementById(`message-${message.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function renderConversationList(className = '') {
    return <div className={`conversation-list ${className}`}>
      {conversations.map((conversation) => <div key={conversation.id} className={conversation.id === activeConversation?.id ? 'active' : ''}>
        <button type="button" onClick={() => openConversation(conversation)}><strong>{conversation.title}</strong><small>{conversation.messages.length} 条消息 · {new Date(conversation.updatedAt).toLocaleDateString()}</small></button>
        <button type="button" aria-label={`删除${conversation.title}`} onClick={() => deleteConversation(conversation.id)}><Trash2 /></button>
      </div>)}
    </div>
  }

  return (
    <main className="creative-workspace-shell">
      <header className="creative-topbar">
        <div><span>创作中心</span><h1>语言模型</h1><p>支持 Markdown、附件、语音输入与可检索会话</p></div>
        <div className="creative-top-actions">
          <button type="button" className={`connection ${hasKey ? 'online' : ''}`} onClick={onOpenSettings}><i />{model.provider} {hasKey ? '已连接' : '未配置'}</button>
          {messages.length > 0 && <button type="button" className="secondary-action export-conversation" onClick={() => downloadText(conversationMarkdown(activeConversation), `${activeConversation.title}.md`)}><Download /> 导出</button>}
          <button type="button" className="secondary-action" onClick={startNewConversation}><Plus /> 新对话</button>
        </div>
      </header>

      <div className="creative-studio-grid">
        <aside className="creative-config-panel language-config-panel">
          <div className="creative-section-head"><div><small>MODEL</small><strong>选择语言模型</strong></div><button type="button" onClick={onOpenModels}>模型广场</button></div>
          <div className="creative-model-list">
            {availableModels.map((item) => <button type="button" key={item.id} className={item.id === model.id ? 'active' : ''} aria-pressed={item.id === model.id} onClick={() => onModelChange(item.id)}>
              <span className="model-letter">{item.name.slice(0, 1)}</span>
              <span><strong>{item.name}<b className={`inline-price ${item.pricing}`}>{pricingLabels[item.pricing]}</b></strong><small>{item.provider} · {item.description}</small></span>
            </button>)}
          </div>
          <div className="conversation-side-head"><div><small>HISTORY</small><strong>历史对话</strong></div><button type="button" onClick={startNewConversation}><Plus /> 新建</button></div>
          {renderConversationList()}
          <label className="creative-field"><span>系统指令</span><textarea value={systemPrompt} maxLength={2000} onChange={(event) => setSystemPrompt(event.target.value)} /></label>
          <label className="creative-field range-field"><span>创造性 <b>{temperature.toFixed(1)}</b></span><input type="range" min="0" max="1.5" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /></label>
          <div className="creative-quota-note"><KeyRound /><span><strong>{hasKey ? '当前模型可以调用' : '需要配置 API Key'}</strong>{model.quota}</span></div>
        </aside>

        <section className={`chat-workspace ${documentDraft ? 'document-mode' : ''}`}>
          <div className="chat-mobile-toolbar">
            <button type="button" className={`chat-model-trigger ${modelMenuOpen ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={modelMenuOpen} onClick={() => { setModelMenuOpen((open) => !open); setHistoryOpen(false) }}>
              <span className="model-letter">{model.name.slice(0, 1)}</span>
              <span><small>当前模型</small><strong>{model.name}</strong></span>
              <ChevronDown />
            </button>
            <button type="button" className="chat-history-trigger" aria-label="历史对话" aria-expanded={historyOpen} onClick={() => { setHistoryOpen((open) => !open); setModelMenuOpen(false) }}><History /></button>
          </div>
          {modelMenuOpen && <>
            <button type="button" className="chat-model-backdrop" aria-label="关闭模型选择" onClick={() => setModelMenuOpen(false)} />
            <div className="chat-model-menu" role="listbox" aria-label="选择语言模型">
              <div className="chat-model-menu-head"><div><small>MODEL</small><strong>选择语言模型</strong></div><button type="button" onClick={() => { setModelMenuOpen(false); onOpenModels() }}>模型广场</button></div>
              <div className="chat-model-options">
                {availableModels.map((item) => <button type="button" role="option" aria-selected={item.id === model.id} key={item.id} className={item.id === model.id ? 'selected' : ''} onClick={() => { onModelChange(item.id); setModelMenuOpen(false) }}>
                  <span className="model-letter">{item.name.slice(0, 1)}</span>
                  <span><strong>{item.name}<b className={`inline-price ${item.pricing}`}>{pricingLabels[item.pricing]}</b></strong><small>{item.provider} · {item.description}</small></span>
                  {item.id === model.id && <Check />}
                </button>)}
              </div>
            </div>
          </>}
          {historyOpen && <>
            <button type="button" className="chat-model-backdrop" aria-label="关闭历史对话" onClick={() => setHistoryOpen(false)} />
            <div className="conversation-mobile-panel"><div><strong>历史对话</strong><button type="button" onClick={startNewConversation}><Plus /> 新对话</button></div>{renderConversationList()}</div>
          </>}

          {documentDraft ? <section className="document-editor">
            <header><div><small>MARKDOWN DOCUMENT</small><input aria-label="文档标题" value={documentDraft.title} onChange={(event) => setDocumentDraft({ ...documentDraft, title: event.target.value })} /></div><div><button type="button" onClick={() => downloadText(documentDraft.content, `${documentDraft.title || '文档'}.md`)}><FileDown /> MD</button><button type="button" onClick={() => downloadText(documentDraft.content, `${documentDraft.title || '文档'}.txt`, 'text/plain;charset=utf-8')}><Download /> TXT</button><button type="button" aria-label="关闭文档编辑" onClick={() => setDocumentDraft(undefined)}><X /></button></div></header>
            <div><textarea aria-label="Markdown 文档内容" value={documentDraft.content} onChange={(event) => setDocumentDraft({ ...documentDraft, content: event.target.value })} /><article><MarkdownContent content={documentDraft.content} /></article></div>
          </section> : <>
            <div className="chat-scroll">
              {messages.length > 0 && <nav className="question-nodes" aria-label="问题节点">{messages.filter((message) => message.role === 'user').map((message, index) => <button type="button" key={message.id} onClick={() => document.getElementById(`message-${message.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><span>{index + 1}</span>{message.content.slice(0, 18)}</button>)}</nav>}
              {!messages.length && <div className="creative-empty"><span><FileText /></span><small>MARKDOWN WORKSPACE</small><h2>从一个问题开始</h2><p>可以语音输入、上传图片或文本附件，回答将按 Markdown 排版。</p><div>{['写一份新品发布文案', '分析图片并给出建议', '整理一份执行清单'].map((value) => <button type="button" key={value} onClick={() => setPrompt(value)}>{value}</button>)}</div></div>}
              {messages.map((message) => <article id={`message-${message.id}`} key={message.id} className={`chat-message ${message.role}`}>
                <span>{message.role === 'assistant' ? <Bot /> : <UserRound />}</span>
                <div>
                  <div className="chat-message-head"><small>{message.role === 'assistant' ? model.name : '你'}</small>{message.role === 'assistant' && <button type="button" aria-label="回答操作" onClick={() => setMessageMenuId((current) => current === message.id ? '' : message.id)}><MoreHorizontal /></button>}</div>
                  {message.attachments?.length ? <div className="message-attachments">{message.attachments.map((attachment) => <span key={attachment.id}>{attachment.type.startsWith('image/') ? <ImagePlus /> : <FileText />}{attachment.name}</span>)}</div> : null}
                  {message.role === 'assistant' ? <MarkdownContent content={message.content} /> : <p>{message.content}</p>}
                  {message.role === 'assistant' && messageMenuId === message.id && <div className="answer-menu">
                    <button type="button" onClick={() => followUp(message)}><Reply /> 追问</button>
                    <button type="button" onClick={() => { setDocumentDraft({ title: activeConversation.title, content: message.content }); setMessageMenuId('') }}><PencilLine /> 转为文档</button>
                    <button type="button" onClick={() => { downloadText(message.content, `${activeConversation.title}.md`); setMessageMenuId('') }}><FileDown /> 导出 MD</button>
                    <button type="button" onClick={() => { void navigator.clipboard.writeText(message.content); setMessageMenuId('') }}><Copy /> 复制</button>
                  </div>}
                </div>
              </article>)}
              {loading && <article className="chat-message assistant pending"><span><Bot /></span><div><small>{model.name}</small><p>正在整理 Markdown<span className="typing-dots">•••</span></p></div></article>}
            </div>
            <div className="chat-composer">
              {error && <p className="creative-error">{error}</p>}
              {attachments.length > 0 && <div className="composer-attachments">{attachments.map((attachment) => <span key={attachment.id}>{attachment.type.startsWith('image/') ? <ImagePlus /> : <FileText />}{attachment.name}<button type="button" aria-label={`移除${attachment.name}`} onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}><X /></button></span>)}</div>}
              <textarea ref={promptRef} aria-label="发送给语言模型" placeholder={`向 ${model.name} 提问…`} value={prompt} maxLength={32000} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() } }} />
              <div>
                <div className="composer-tools">
                  <input ref={attachmentInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,.txt,.md,.json,.csv,.html,.xml,.js,.ts,.tsx,.jsx,.css" onChange={(event) => { void addAttachments(event.target.files); event.target.value = '' }} />
                  <button type="button" aria-label="添加图片或文件" onClick={() => attachmentInputRef.current?.click()}><Paperclip /></button>
                  <button type="button" className={listening ? 'active' : ''} aria-label={listening ? '停止语音输入' : '开始语音输入'} onClick={toggleDictation}>{listening ? <MicOff /> : <Mic />}</button>
                  <small>{supportsImages ? '支持图片' : '文本附件'} · {prompt.length.toLocaleString()} / 32,000</small>
                </div>
                {loading ? <button type="button" className="send-button stop" onClick={() => abortRef.current?.abort()}><Square /> 停止</button> : <button type="button" className="send-button" disabled={!prompt.trim() && !attachments.length} onClick={() => void submit()}><Send /> 发送</button>}
              </div>
            </div>
          </>}
        </section>
      </div>
    </main>
  )
}
