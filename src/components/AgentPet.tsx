import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  Brain,
  Box,
  CalendarClock,
  Check,
  ChevronDown,
  CircleStop,
  Copy,
  Download,
  EyeOff,
  Film,
  Image,
  KeyRound,
  LockKeyhole,
  LoaderCircle,
  LogIn,
  MessageSquareText,
  Mic2,
  MoveDiagonal2,
  Paperclip,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react'
import type { CatalogModel } from '../data/providerCatalog'
import { pricingLabels } from '../data/providerCatalog'
import { logActivity } from '../lib/account'
import { getAgentModelConfigurationSource, getAgentModels, type AgentRouteAttempt } from '../lib/agent'
import { requestAgentAppAction, subscribeAgentAppActions, type AgentPetMode } from '../lib/agentNavigation'
import { getAgentMediaUrl } from '../lib/agentMedia'
import {
  advanceAgentWorkflow,
  approveAgentWorkflow,
  cancelAgentTask,
  createAgentWorkflow,
  deleteAgentConversation,
  deleteAgentMemory,
  getAgentState,
  listAgentWorkflows,
  rollbackAgentWorkflow,
  streamMultimodalAgent,
  resolveAgentApproval,
  resumeAgentRun,
  sendAgentFeedback,
  type AgentApproval,
  type AgentCheckpoint,
  type AgentMemory,
  type AgentPlan,
  type AgentRun,
  type AgentSource,
  type AgentTask,
  type AgentTrace,
  type AgentWorkflow,
  type AgentWorkflowStep,
} from '../lib/agentRuntime'
import type { ChatAttachment, ChatMessage } from '../lib/creative'
import { MarkdownContent } from './MarkdownContent'
import '../agent-pet.css'

export type { AgentPetMode } from '../lib/agentNavigation'

interface AgentPetProps {
  models: CatalogModel[]
  locked?: boolean
  onRequireAuth?: () => void
  onOpenSettings: (providerId: string) => void
  onOpenModels: () => void
  onOpenWorkspace: (mode: AgentPetMode, prompt: string) => void
}

interface PetMessage extends ChatMessage {
  streaming?: boolean
  model?: Pick<CatalogModel, 'id' | 'name' | 'provider' | 'providerId' | 'pricing'>
  attempts?: AgentRouteAttempt[]
  sourcePrompt?: string
  mode?: AgentPetMode
  trace?: AgentTrace[]
  sources?: AgentSource[]
}

interface PetPosition { x: number; y: number }
interface PetPanelSize { width: number; height: number }

const memoryKey = 'xiaoy-modelhub-agent-pet-v1'
const positionKey = 'xiaoy-modelhub-agent-position-v1'
const panelSizeKey = 'xiaoy-modelhub-agent-panel-size-v1'
const hiddenKey = 'xiaoy-modelhub-agent-hidden-v1'
const selectedModelKey = 'xiaoy-modelhub-agent-selected-model-v1'

function readSelectedModelId() {
  try {
    return localStorage.getItem(selectedModelKey) || ''
  } catch {
    return ''
  }
}

const memoryKindLabels: Record<AgentMemory['kind'], string> = {
  preference: '偏好',
  profile: '资料',
  instruction: '指令',
  project: '项目',
}

const modes: Array<{
  id: AgentPetMode
  label: string
  shortLabel: string
  icon: typeof Bot
  image: string
  description: string
  quickPrompts: string[]
}> = [
  {
    id: 'chat',
    label: '聊天与推理',
    shortLabel: '对话',
    icon: MessageSquareText,
    image: '/images/capabilities/chat-writing-poop-clean.png',
    description: '拆需求、查思路、写内容，把答案整理成可继续执行的 Markdown。',
    quickPrompts: ['把我的想法拆成执行步骤', '帮我审查这段方案的风险', '写一份可直接交付的文档'],
  },
  {
    id: 'image',
    label: '图片创作',
    shortLabel: '图片',
    icon: Image,
    image: '/images/capabilities/image-generation-poop-transparent.png',
    description: '把一句话扩成完整画面方案，并可一键带入图片工作台。',
    quickPrompts: ['做一张电影感产品海报', '设计一个紫色未来城市场景', '把这个点子整理成生图提示词'],
  },
  {
    id: 'video',
    label: '视频导演',
    shortLabel: '视频',
    icon: Film,
    image: '/images/capabilities/video-generation-poop-transparent.png',
    description: '输出镜头、动作、运镜和声音提示，并可带入视频工作台。',
    quickPrompts: ['把这段故事拆成 5 个镜头', '写一个 10 秒产品视频提示词', '优化我的图生视频动作描述'],
  },
  {
    id: 'audio',
    label: '声音助手',
    shortLabel: '声音',
    icon: Mic2,
    image: '/images/capabilities/voice-audio-poop-transparent.png',
    description: '整理口播、配音情绪、节奏和声音制作清单。',
    quickPrompts: ['把这段文案改成自然口播', '设计温暖克制的配音节奏', '给短片做一份声音清单'],
  },
  {
    id: '3d',
    label: '3D 搭建',
    shortLabel: '3D',
    icon: Box,
    image: '/images/capabilities/three-d-assets-poop-transparent.png',
    description: '把概念拆成造型、材质、视角和 3D 生成要求。',
    quickPrompts: ['把角色整理成 3D 建模需求', '写一份产品模型的材质清单', '优化这张图转 3D 的描述'],
  },
]

function clampPosition(position: PetPosition): PetPosition {
  const size = window.innerWidth <= 480 ? 60 : window.innerWidth <= 720 ? 68 : 82
  return {
    x: Math.max(8, Math.min(window.innerWidth - size - 8, Number(position.x) || 8)),
    y: Math.max(8, Math.min(window.innerHeight - size - 8, Number(position.y) || 8)),
  }
}

function launcherSize() {
  return window.innerWidth <= 480 ? 60 : window.innerWidth <= 720 ? 68 : 82
}

function clampPanelSize(size: PetPanelSize): PetPanelSize {
  const mobile = window.innerWidth <= 720
  const maxWidth = Math.max(240, window.innerWidth - 16)
  const maxHeight = Math.max(280, window.innerHeight - (mobile ? 118 : 16))
  const minWidth = Math.min(mobile ? 280 : 340, maxWidth)
  const minHeight = Math.min(mobile ? 320 : 430, maxHeight)
  return {
    width: Math.round(Math.max(minWidth, Math.min(maxWidth, Number(size.width) || minWidth))),
    height: Math.round(Math.max(minHeight, Math.min(maxHeight, Number(size.height) || minHeight))),
  }
}

function defaultPanelSize(): PetPanelSize {
  const mobile = window.innerWidth <= 720
  return clampPanelSize({
    width: mobile ? Math.min(360, window.innerWidth - 24) : 520,
    height: mobile ? Math.min(520, window.innerHeight - 220) : 690,
  })
}

function readPanelSize() {
  try {
    const saved = JSON.parse(localStorage.getItem(panelSizeKey) || 'null') as PetPanelSize | null
    return saved ? clampPanelSize(saved) : defaultPanelSize()
  } catch {
    return defaultPanelSize()
  }
}

function defaultPosition(): PetPosition {
  const mobile = window.innerWidth <= 720
  const size = window.innerWidth <= 480 ? 60 : mobile ? 68 : 82
  return clampPosition({ x: window.innerWidth - size - (mobile ? 14 : 22), y: window.innerHeight - size - (mobile ? 104 : 86) })
}

function readPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(positionKey) || 'null') as PetPosition | null
    return saved ? clampPosition(saved) : defaultPosition()
  } catch {
    return defaultPosition()
  }
}

function readMessages(): PetMessage[] {
  try {
    const saved = JSON.parse(localStorage.getItem(memoryKey) || '[]') as PetMessage[]
    return Array.isArray(saved) ? saved.slice(-30).map((message) => ({
      ...message,
      content: message.role === 'assistant' ? sanitizeAgentMessageContent(message.content) : message.content,
      streaming: false,
    })) : []
  } catch {
    return []
  }
}

function sanitizeAgentMessageContent(content: string) {
  if (!/<\/?(?:tool_call|arg_key|arg_value|tool_result)\b|<function=/i.test(content)) return content
  return '上一次工具调用没有正确完成，内部指令已隐藏。请重新发送原问题，Agent 会自动执行并只展示最终结果。'
}

function isProductionRequest(content: string) {
  const action = /(?:制作|生成|创作|完成|做一?[个部支条]?|剪辑|全流程|一键|自动执行|发布任务|开始|执行|调用|使用|用.{0,8}(?:模型|生图|生视频)|进行|一步一步|直接做|自己做)/i.test(content)
  const product = /(?:成片|短片|短剧|视频|影片|广告片|宣传片|微电影|动画|动漫|MV|剧集|电影|生图|生视频|图生视频|关键帧|配音后剪辑)/i.test(content)
  const internalExecution = /(?:现有|当前|平台|站内|这里).{0,12}(?:可用|接入|已有|免费)?.{0,12}(?:模型|生图|生视频|工具)|(?:生图.{0,8}生视频|图片.{0,8}视频).{0,12}(?:模型|完成|执行)/i.test(content)
  const explanation = /^(?:请)?(?:解释|分析|介绍|告诉我|怎么|如何|教程|步骤|方案|提示词)/i.test(content)
  return !explanation && product && (action || internalExecution)
}

function workflowStepModels(step?: AgentWorkflowStep) {
  if (!step?.output?.artifact) return ''
  if (step.stage === 'editing') return '浏览器站内剪辑器'
  const artifact = step.output.artifact
  const assets = Array.isArray(artifact.assets) ? artifact.assets : []
  const names = assets.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const value = item as Record<string, unknown>
    const name = String(value.modelName || value.modelId || value.provider || '').trim()
    return name ? [name] : []
  })
  return [...new Set(names)].join('、')
}

function downloadMarkdown(message: PetMessage) {
  const content = `# 小屎仙 Agent 输出\n\n${sanitizeAgentMessageContent(message.content)}\n\n---\n\n模型：${message.model?.provider || '已配置模型路由'} / ${message.model?.name || '自动选择'}\n`
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `小屎仙-Agent-${new Date().toISOString().slice(0, 10)}.md`
  anchor.click()
  URL.revokeObjectURL(url)
}

async function revealMessage(id: string, content: string, update: (id: string, value: string, streaming: boolean) => void) {
  const characters = Array.from(content)
  const chunkSize = Math.max(1, Math.ceil(characters.length / 190))
  let cursor = 0
  while (cursor < characters.length) {
    cursor = Math.min(characters.length, cursor + chunkSize)
    update(id, characters.slice(0, cursor).join(''), cursor < characters.length)
    await new Promise((resolve) => window.setTimeout(resolve, 14))
  }
}

export function AgentPet({ models: catalogModels, locked = false, onRequireAuth, onOpenSettings, onOpenModels, onOpenWorkspace }: AgentPetProps) {
  const [open, setOpen] = useState(() => !locked && window.matchMedia('(max-width: 720px)').matches && localStorage.getItem(hiddenKey) !== '1')
  const [hidden, setHidden] = useState(() => localStorage.getItem(hiddenKey) === '1')
  const [mode, setMode] = useState<AgentPetMode>('chat')
  const [messages, setMessages] = useState<PetMessage[]>(() => locked ? [] : readMessages())
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [conversationId, setConversationId] = useState('')
  const [memories, setMemories] = useState<AgentMemory[]>([])
  const [plan, setPlan] = useState<AgentPlan | null>(null)
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [approvals, setApprovals] = useState<AgentApproval[]>([])
  const [recoverableRuns, setRecoverableRuns] = useState<AgentCheckpoint[]>([])
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [workflows, setWorkflows] = useState<AgentWorkflow[]>([])
  const [finalFilms, setFinalFilms] = useState<Record<string, { url: string; fileName: string }>>({})
  const [showControlCenter, setShowControlCenter] = useState(false)
  const [feedback, setFeedback] = useState<Record<string, 1 | -1>>({})
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState('待命')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState<AgentRouteAttempt[]>([])
  const [selectedModelId, setSelectedModelId] = useState(readSelectedModelId)
  const [position, setPosition] = useState<PetPosition>(readPosition)
  const [panelSize, setPanelSize] = useState<PetPanelSize>(readPanelSize)
  const [dragging, setDragging] = useState(false)
  const [credentialVersion, setCredentialVersion] = useState(0)
  const abortRef = useRef<AbortController | undefined>(undefined)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | undefined>(undefined)
  const resizeRef = useRef<{ pointerId: number; startX: number; startY: number; originWidth: number; originHeight: number; width: number; height: number } | undefined>(undefined)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const currentMode = modes.find((item) => item.id === mode) ?? modes[0]
  const allAgentModels = useMemo(() => getAgentModels(catalogModels), [catalogModels])
  const readyAgentModels = useMemo(() => {
    void credentialVersion
    return getAgentModels(catalogModels, true)
  }, [catalogModels, credentialVersion])
  const selectedModel = useMemo(
    () => readyAgentModels.find((model) => model.id === selectedModelId),
    [readyAgentModels, selectedModelId],
  )
  const { userConfiguredModels, adminConfiguredModels, providerCount } = useMemo(() => {
    const userModels: CatalogModel[] = []
    const adminModels: CatalogModel[] = []
    const providerIds = new Set<string>()
    for (const model of readyAgentModels) {
      providerIds.add(model.providerId)
      if (getAgentModelConfigurationSource(model) === 'user') userModels.push(model)
      else adminModels.push(model)
    }
    return { userConfiguredModels: userModels, adminConfiguredModels: adminModels, providerCount: providerIds.size }
  }, [readyAgentModels])
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant' && !message.streaming)
  const activeImage = loading ? currentMode.image : (lastAssistant?.mode ? modes.find((item) => item.id === lastAssistant.mode)?.image : currentMode.image) ?? currentMode.image

  useEffect(() => {
    if (!locked) localStorage.setItem(memoryKey, JSON.stringify(messages.slice(-30).map((message) => ({ ...message, streaming: false }))))
  }, [locked, messages])

  useEffect(() => {
    if (locked) return
    const controller = new AbortController()
    void getAgentState(controller.signal).then((state) => {
      setConversationId(state.conversation?.id || '')
      setMemories(state.memories)
      setTasks(state.tasks)
      setPlan(state.plan || null)
      setRuns(state.runs || [])
      setApprovals(state.pendingApprovals || [])
      setRecoverableRuns(state.recoverableRuns || [])
      setMessages(state.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.role === 'assistant' ? sanitizeAgentMessageContent(message.content) : message.content,
          attachments: message.attachments,
          createdAt: message.createdAt,
          trace: message.trace,
          sources: message.sources,
          model: message.role === 'assistant' && message.modelId ? {
            id: message.modelId,
            name: message.modelId,
            provider: message.providerId || '已配置模型路由',
            providerId: message.providerId || '',
            pricing: 'variable',
          } : undefined,
        })))
    }).catch(() => {
      // A local preview may not have the Pages API running; sending still reports the actionable error.
    })
    void listAgentWorkflows(controller.signal).then((result) => {
      setWorkflows(result.workflows)
      const resumable = result.workflows.find((workflow) => (workflow.status === 'waiting_client' && workflow.pendingCommand) || workflow.status === 'running')
      if (resumable) void driveWorkflow(resumable.id, controller.signal).catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : '自动恢复生产流程失败')
      })
    }).catch(() => undefined)
    return () => controller.abort()
  }, [locked])

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    const refresh = () => setCredentialVersion((current) => current + 1)
    window.addEventListener('xiaoy-provider-credentials-changed', refresh)
    return () => window.removeEventListener('xiaoy-provider-credentials-changed', refresh)
  }, [])

  useEffect(() => subscribeAgentAppActions((action) => {
    if (action.type !== 'agent') return
    setHidden(false)
    localStorage.removeItem(hiddenKey)
    setMode(action.mode ?? 'chat')
    if (action.prompt !== undefined) setInput(action.prompt)
    setOpen(true)
    window.setTimeout(() => composerRef.current?.focus(), 40)
  }), [])

  useEffect(() => {
    if (!open) return
    const target = scrollRef.current
    if (!target) return
    target.scrollTo({ top: messages.length || loading ? target.scrollHeight : 0, behavior: messages.length || loading ? 'smooth' : 'auto' })
  }, [attempts, loading, messages, open])

  useEffect(() => {
    if (showControlCenter) scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [showControlCenter])

  useEffect(() => {
    const keepVisible = () => {
      setPosition((current) => clampPosition(current))
      setPanelSize((current) => clampPanelSize(current))
    }
    window.addEventListener('resize', keepVisible)
    return () => window.removeEventListener('resize', keepVisible)
  }, [])

  function updateMessage(id: string, content: string, streaming: boolean) {
    setMessages((current) => current.map((message) => message.id === id ? { ...message, content, streaming } : message))
  }

  function startDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y, moved: false }
    setDragging(true)
  }

  function movePet(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.hypot(dx, dy) > 4) drag.moved = true
    setPosition(clampPosition({ x: drag.originX + dx, y: drag.originY + dy }))
  }

  function finishDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = undefined
    setDragging(false)
    const next = clampPosition(position)
    setPosition(next)
    localStorage.setItem(positionKey, JSON.stringify(next))
    if (!drag.moved) setOpen((current) => !current)
  }

  function startResize(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: panelSize.width,
      originHeight: panelSize.height,
      width: panelSize.width,
      height: panelSize.height,
    }
  }

  function resizePanel(event: React.PointerEvent<HTMLButtonElement>) {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const next = clampPanelSize({
      width: resize.originWidth + event.clientX - resize.startX,
      height: resize.originHeight + event.clientY - resize.startY,
    })
    resize.width = next.width
    resize.height = next.height
    setPanelSize(next)
  }

  function finishResize(event: React.PointerEvent<HTMLButtonElement>) {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const next = clampPanelSize({ width: resize.width, height: resize.height })
    resizeRef.current = undefined
    setPanelSize(next)
    localStorage.setItem(panelSizeKey, JSON.stringify(next))
  }

  function hidePet() {
    setOpen(false)
    setHidden(true)
    localStorage.setItem(hiddenKey, '1')
  }

  function showPet() {
    setHidden(false)
    localStorage.removeItem(hiddenKey)
    setOpen(true)
  }

  async function clearConversation() {
    if (messages.length && !window.confirm('清空小屎仙的云端对话记录？长期记忆和定时任务会保留。')) return
    try {
      if (conversationId) await deleteAgentConversation(conversationId)
      setConversationId('')
      setMessages([])
      setAttempts([])
      setPlan(null)
      setError('')
      localStorage.removeItem(memoryKey)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '清空对话失败')
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files) return
    const remaining = Math.max(0, 5 - attachments.length)
    const next: ChatAttachment[] = []
    for (const file of Array.from(files).slice(0, remaining)) {
      if (file.size > 8_000_000) {
        setError(`${file.name} 超过 8 MB，未添加。`)
        continue
      }
      const base = { id: crypto.randomUUID(), name: file.name, type: file.type || 'text/plain', size: file.size }
      if (/^image\/(?:png|jpeg|webp)$/.test(file.type)) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        })
        next.push({ ...base, dataUrl })
      } else if (file.type.startsWith('text/') || /\.(?:md|txt|json|csv|js|jsx|ts|tsx|css|html|py|java|c|cpp|h|sh|sql|xml|ya?ml)$/i.test(file.name)) {
        next.push({ ...base, text: (await file.text()).slice(0, 20_000) })
      } else {
        setError(`${file.name} 暂不支持。可添加 PNG/JPEG/WebP 或文本、代码文件。`)
      }
    }
    setAttachments((current) => [...current, ...next].slice(0, 5))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function refreshAgentState() {
    const [state, workflowState] = await Promise.all([getAgentState(), listAgentWorkflows()])
    setConversationId(state.conversation?.id || '')
    setMemories(state.memories)
    setTasks(state.tasks)
    setPlan(state.plan || null)
    setRuns(state.runs || [])
    setApprovals(state.pendingApprovals || [])
    setRecoverableRuns(state.recoverableRuns || [])
    setWorkflows(workflowState.workflows)
  }

  async function decideAgentApproval(approvalId: string, action: 'approve' | 'reject') {
    setLoading(true)
    setError('')
    setPhase(action === 'approve' ? '正在执行已批准操作' : '正在拒绝操作')
    try {
      const result = await resolveAgentApproval(approvalId, action)
      if (result.continuation) {
        const continuation = result.continuation
        setConversationId(continuation.conversationId)
        setPlan(continuation.plan || null)
        setMessages((current) => [...current, {
          id: continuation.message.id,
          role: 'assistant',
          content: sanitizeAgentMessageContent(continuation.message.content),
          createdAt: continuation.message.createdAt,
          trace: continuation.trace,
          sources: continuation.sources,
          model: continuation.model,
          mode,
        }])
      }
      if (result.continuationError) setError(`操作已执行，但自动续跑失败：${result.continuationError}`)
      await refreshAgentState()
      setPhase(action === 'approve' ? (result.continuationError ? '操作已执行，等待手动续跑' : '已批准并继续完成') : '已拒绝操作')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '处理审批失败')
      setPhase('审批处理失败')
    } finally {
      setLoading(false)
    }
  }

  async function resumeFailedRun(runId: string) {
    setLoading(true)
    setError('')
    setPhase('正在从持久检查点恢复')
    try {
      const result = await resumeAgentRun(runId)
      setConversationId(result.conversationId)
      setPlan(result.plan || null)
      setMessages((current) => [...current, {
        id: result.message.id, role: 'assistant', content: sanitizeAgentMessageContent(result.message.content), createdAt: result.message.createdAt,
        trace: result.trace, sources: result.sources, model: result.model, mode,
      }])
      await refreshAgentState()
      setPhase(result.status === 'waiting_approval' ? '恢复后等待安全审批' : '已从检查点恢复完成')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '恢复运行失败')
      setPhase('恢复失败')
    } finally {
      setLoading(false)
    }
  }

  async function driveWorkflow(workflowId: string, signal?: AbortSignal) {
    for (let index = 0; index < 12; index += 1) {
      setPhase('正在执行影视生产流程')
      const state = await advanceAgentWorkflow(workflowId, signal)
      setWorkflows((current) => [state, ...current.filter((item) => item.id !== state.id)].slice(0, 12))
      if (state.pendingCommand) {
        requestAgentAppAction({ type: 'workflow-command', command: state.pendingCommand })
        setPhase(`页面正在执行：${state.pendingCommand.label}`)
        return
      }
      if (state.status !== 'running') return
    }
  }

  async function startProductionWorkflow(brief: string, models: CatalogModel[], signal?: AbortSignal) {
    const vertical = /(?:竖屏|9\s*[:：]\s*16|抖音|短视频)/i.test(brief)
    const workflow = await createAgentWorkflow({
      brief,
      autoApprove: true,
      aspectRatio: vertical ? '9:16' : '16:9',
      models,
    })
    setWorkflows((current) => [workflow, ...current.filter((item) => item.id !== workflow.id)].slice(0, 12))
    await driveWorkflow(workflow.id, signal)
  }

  async function rateMessage(messageId: string, rating: 1 | -1) {
    try {
      await sendAgentFeedback(messageId, rating)
      setFeedback((current) => ({ ...current, [messageId]: rating }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '反馈提交失败')
    }
  }

  async function submit(value = input) {
    if (locked) {
      onRequireAuth?.()
      return
    }
    const content = value.trim()
    if ((!content && !attachments.length) || loading) return
    if (!readyAgentModels.length) {
      setError('当前没有已配置且可调用的语言模型。请先由管理员配置全局模型，或添加你自己的服务商 API Key。')
      return
    }
    const modelsForRun = selectedModel ? [selectedModel] : readyAgentModels
    const outgoingAttachments = attachments
    const productionRequest = isProductionRequest(content)
    const requestMode: AgentPetMode = productionRequest ? 'video' : 'chat'
    setMode(requestMode)
    const userMessage: PetMessage = { id: crypto.randomUUID(), role: 'user', content, attachments: outgoingAttachments, createdAt: Date.now(), mode: requestMode, sourcePrompt: content }
    const contextMessages = [...messages, userMessage].slice(-24)
    setMessages(contextMessages)
    setInput('')
    setAttachments([])
    setError('')
    setAttempts([])
    setLoading(true)
    setPhase(selectedModel ? `正在调用 ${selectedModel.name}` : '正在自动选择模型')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      if (productionRequest) {
        setShowControlCenter(true)
        setPhase('正在创建自动生产项目')
        const assistant: PetMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '已接管为自动生产任务。我会自行完成需求审查、剧本、角色、场景、分镜、关键帧、配音、视频生成、剪辑和成片质检；中途失败会自动重试，最终在“影视生产项目”中提供可播放、可下载的成片。媒体生成和本地合成期间请保持当前页面打开。',
          createdAt: Date.now(),
          mode: 'video',
          sourcePrompt: content,
        }
        setMessages((current) => [...current, assistant].slice(-30))
        await startProductionWorkflow(content, modelsForRun, controller.signal)
        setPhase('自动生产中')
        return
      }
      setPhase('正在拆解任务并选择工具')
      const result = await streamMultimodalAgent({
        conversationId,
        prompt: content,
        mode: requestMode,
        attachments: outgoingAttachments,
        models: modelsForRun,
        signal: controller.signal,
      }, (event) => {
        const labels: Record<string, string> = {
          started: '已建立持久运行检查点', planner: '规划器已完成任务拆解', executor: '执行器已形成候选结果',
          tool: event.tool ? `工具已完成：${event.tool}` : '工具执行完成', critic: '审查器正在核验结果', repair: '已完成自动修复',
          approval: '等待你的安全审批', budget: '已达到运行预算', completed: '执行完成', waiting_approval: '等待你的安全审批',
        }
        setPhase(labels[event.phase] || `执行中：${event.phase}`)
      })
      setConversationId(result.conversationId)
      setPlan(result.plan || null)
      if (result.pendingApproval) {
        setApprovals((current) => [result.pendingApproval!, ...current.filter((item) => item.id !== result.pendingApproval!.id)])
        setShowControlCenter(true)
      }
      const routedAttempts: AgentRouteAttempt[] = result.trace.filter((item) => item.tool === 'model').map((item, index) => ({
        modelId: `${item.provider || 'provider'}:${item.model || index}`,
        modelName: item.model || '已配置模型',
        providerId: item.provider || '',
        providerName: item.provider || '',
        status: item.status === 'success' ? 'success' : 'failed',
        elapsedMs: item.elapsedMs,
        error: item.error,
      }))
      setAttempts(routedAttempts)
      const assistantId = result.message.id
      const assistant: PetMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        streaming: true,
        model: result.model,
        attempts: routedAttempts,
        sourcePrompt: content,
        mode: requestMode,
        trace: result.trace,
        sources: result.sources,
      }
      setMessages((current) => [...current, assistant].slice(-30))
      setPhase('正在输出结果')
      const assistantContent = sanitizeAgentMessageContent(result.message.content)
      await revealMessage(assistantId, assistantContent, updateMessage)
      setPhase(result.status === 'waiting_approval' ? '等待你的安全审批' : '已完成')
      void refreshAgentState().catch(() => undefined)
      void logActivity({
        clientEventId: `agent:${userMessage.id}`,
        type: 'chat',
        modelId: result.model.apiModel,
        provider: result.model.provider,
        inputText: content,
        outputText: assistantContent,
        metadata: { agent: 'xiaoshixian', mode: requestMode, trace: result.trace, sources: result.sources.map((source) => source.url) },
        createdAt: userMessage.createdAt,
      })
    } catch (caught) {
      const message = controller.signal.aborted ? '本次任务已停止。' : caught instanceof Error ? caught.message : '模型调用失败'
      setError(message)
      setPhase(controller.signal.aborted ? '已停止' : '暂时失败')
    } finally {
      setLoading(false)
      abortRef.current = undefined
    }
  }

  const size = launcherSize()
  const panelWidth = panelSize.width
  const panelHeight = panelSize.height
  const panelLeft = Math.max(8, Math.min(window.innerWidth - panelWidth - 8, position.x + size / 2 - panelWidth / 2))
  const spaceAbove = position.y - 20
  const spaceBelow = window.innerHeight - position.y - size - 20
  const panelAbove = spaceAbove >= panelHeight || spaceAbove >= spaceBelow
  const desiredTop = panelAbove ? position.y - panelHeight - 12 : position.y + size + 12
  const panelTop = Math.max(8, Math.min(window.innerHeight - panelHeight - 8, desiredTop))
  const tailLeft = Math.max(28, Math.min(panelWidth - 28, position.x + size / 2 - panelLeft))

  useEffect(() => {
    const update = (event: Event) => {
      const workflow = (event as CustomEvent<AgentWorkflow>).detail
      if (!workflow?.id) return
      setWorkflows((current) => [workflow, ...current.filter((item) => item.id !== workflow.id)].slice(0, 12))
      if (workflow.status === 'completed') setPhase('成片已完成')
      else if (workflow.status === 'failed') setPhase('生产失败，可回退重试')
      else setPhase(`自动生产中：${workflow.currentStageLabel}`)
      if (workflow.finalArtifact?.artifactId && !finalFilms[workflow.id]) {
        void getAgentMediaUrl(workflow.finalArtifact.artifactId).then((url) => {
          if (url) setFinalFilms((current) => ({ ...current, [workflow.id]: { url, fileName: workflow.finalArtifact?.fileName || '小屎仙-Agent-成片.webm' } }))
        })
      }
    }
    const filmReady = (event: Event) => {
      const film = (event as CustomEvent<{ workflowId: string; url: string; fileName: string }>).detail
      if (film?.workflowId && film.url) setFinalFilms((current) => ({ ...current, [film.workflowId]: { url: film.url, fileName: film.fileName } }))
    }
    window.addEventListener('xiaoy-agent-workflow-updated', update)
    window.addEventListener('xiaoy-agent-film-ready', filmReady)
    return () => {
      window.removeEventListener('xiaoy-agent-workflow-updated', update)
      window.removeEventListener('xiaoy-agent-film-ready', filmReady)
    }
  }, [finalFilms])

  if (hidden) {
    return <button type="button" className="agent-pet-hidden-tab" onClick={showPet} aria-label="唤回小屎仙 Agent"><Sparkles /><span>小屎仙</span></button>
  }

  return <>
    <div className={`agent-pet-launcher-wrap ${open ? 'is-open' : ''} ${dragging ? 'is-dragging' : ''}`} style={{ left: position.x, top: position.y }}>
      <button type="button" className="agent-pet-hide" aria-label="隐藏小屎仙" title="贴边隐藏" onClick={hidePet}><EyeOff /></button>
      <button
        type="button"
        className={`agent-pet-launcher ${loading ? 'is-working' : ''}`}
        aria-label={open ? '收起小屎仙 Agent' : '打开小屎仙 Agent'}
        aria-expanded={open}
        onPointerDown={startDrag}
        onPointerMove={movePet}
        onPointerUp={finishDrag}
        onPointerCancel={() => { dragRef.current = undefined; setDragging(false) }}
      >
        <img src={activeImage} alt="小屎仙 Agent" draggable={false} />
        <i className={locked ? 'locked' : loading ? 'busy' : readyAgentModels.length ? 'online' : ''} />
      </button>
    </div>

    <section
      className={`agent-pet-panel agent-pet-tail-${panelAbove ? 'bottom' : 'top'} ${open ? 'is-open' : ''}`}
      style={{ left: panelLeft, top: panelTop, width: panelWidth, height: panelHeight }}
      role="dialog"
      aria-modal="false"
      aria-label="小屎仙 Agent"
    >
      <span className="agent-pet-tail" style={{ left: tailLeft }} aria-hidden="true" />
      <header className="agent-pet-header">
        <span className="agent-pet-avatar"><img src={activeImage} alt="" /></span>
        <div><strong>小屎仙 Agent</strong><small><i className={locked ? 'locked' : loading ? 'busy' : readyAgentModels.length ? 'online' : ''} />{locked ? '登录后可用' : phase}</small></div>
        <button type="button" title={locked ? '登录后可清空对话' : '清空对话'} aria-label={locked ? '登录后可清空对话' : '清空对话'} disabled={locked} onClick={clearConversation}>{locked ? <LockKeyhole /> : <Trash2 />}</button>
        <button type="button" title={locked ? '登录解锁' : '记忆与任务'} aria-label={locked ? '登录解锁小屎仙' : '打开记忆与任务'} onClick={() => locked ? onRequireAuth?.() : setShowControlCenter((current) => !current)}>{locked ? <LogIn /> : <Settings2 />}</button>
        <button type="button" title="关闭" aria-label="关闭" onClick={() => setOpen(false)}><X /></button>
      </header>

      <div className="agent-pet-scroll" ref={scrollRef}>
        {locked ? <section className="agent-pet-locked">
          <div><img src={currentMode.image} alt="" /><span><LockKeyhole /></span></div>
          <small>AGENT LOCKED</small>
          <h2>登录后，小屎仙才开工</h2>
          <p>登录即可选择管理员或自己已配置的模型，包括免费模型，继续聊天和多模态创作。</p>
          <button type="button" onClick={onRequireAuth}><LogIn />登录 / 注册后解锁</button>
          <em>未登录不会调用模型，也不会读取或保存对话</em>
        </section> : <>
        {showControlCenter && <section className="agent-pet-control-center">
          <header><div><LockKeyhole /><span><strong>安全审批</strong><small>写入和危险操作执行前由你确认</small></span></div><b>{approvals.length}</b></header>
          {approvals.length ? <ul>{approvals.map((approval) => <li key={approval.id}><span><b>{approval.risk === 'destructive' ? '高风险' : '需确认'}</b>{approval.tool}<small>{approval.reason} · {JSON.stringify(approval.arguments)}</small></span><div className="agent-pet-approval-actions"><button type="button" aria-label="批准操作" disabled={loading} onClick={() => void decideAgentApproval(approval.id, 'approve')}><Check /></button><button type="button" aria-label="拒绝操作" disabled={loading} onClick={() => void decideAgentApproval(approval.id, 'reject')}><X /></button></div></li>)}</ul> : <p>当前没有等待确认的操作。</p>}
          <header><div><Sparkles /><span><strong>当前执行计划</strong><small>复杂任务自动拆解并跨轮保存</small></span></div><b>{plan ? `${plan.steps.filter((step) => step.status === 'completed').length}/${plan.steps.length}` : '0'}</b></header>
          {plan ? <div className="agent-pet-plan"><strong>{plan.goal}</strong><ul>{plan.steps.map((step) => <li key={step.id} className={step.status}><span><b>{step.status === 'completed' ? '完成' : step.status === 'in_progress' ? '执行中' : step.status === 'blocked' ? '阻断' : '待办'}</b>{step.title}{step.note && <small>{step.note}</small>}</span></li>)}</ul></div> : <p>复杂任务会先生成计划，并在工具执行后持续更新。</p>}
          <header><div><Brain /><span><strong>运行质量</strong><small>Planner / Executor / Critic 可观测记录</small></span></div><b>{runs[0]?.critic_score ?? '-'}</b></header>
          {runs.length ? <ul>{runs.slice(0, 5).map((run) => <li key={run.id}><span><b>{run.orchestration === 'full' ? '完整' : '标准'}</b>{run.status === 'completed' ? `完成 · ${run.duration_ms}ms` : `失败 · ${run.error || '未知错误'}`}<small>模型 {run.model_calls} 次 · 工具 {run.tool_calls} 次 · Token {run.total_tokens || 0} · 缓存 {run.cached_tokens || 0}{run.cost_microusd ? ` · $${(run.cost_microusd / 1_000_000).toFixed(4)}` : ''} · 失败步骤 {run.failed_steps}{run.repaired ? ' · 已自动修复' : ''}</small></span>{recoverableRuns.some((item) => item.run_id === run.id) && <button type="button" aria-label="从检查点恢复" disabled={loading} onClick={() => void resumeFailedRun(run.id)}><RotateCcw /></button>}</li>)}</ul> : <p>完成一次 Agent 任务后会显示运行质量记录。</p>}
          <header><div><Film /><span><strong>影视生产项目</strong><small>Skill 按阶段注入，产物可审查与回退</small></span></div><b>{workflows.filter((item) => item.status === 'running').length}</b></header>
          {workflows.length ? <div className="agent-pet-workflows">{workflows.slice(0, 5).map((workflow) => <details key={workflow.id} open={workflow.status === 'running' || undefined}>
            <summary><span><b>{workflow.title}</b><small>{workflow.currentStageLabel} · {workflow.status}</small></span><ChevronDown /></summary>
            <ol>{workflow.stages.map((stage) => {
              const step = [...workflow.steps].reverse().find((item) => item.stage === stage.id && item.status !== 'superseded')
              return <li key={stage.id} className={step?.status || (workflow.currentStage === stage.id ? 'running' : 'pending')}>
                <span>{step?.review?.pass ? <Check /> : workflow.currentStage === stage.id ? <LoaderCircle /> : <i />}</span>
                <div><strong>{stage.label}</strong><small>{step ? `v${step.version} · 审查 ${step.review?.score ?? '-'} 分${workflowStepModels(step) ? ` · 模型 ${workflowStepModels(step)}` : ''}${step.skills.length ? ` · ${step.skills.join(' + ')}` : ''}` : '待执行'}</small></div>
                {step && ['completed', 'approved', 'needs_attention', 'failed', 'retrying'].includes(step.status) && <button type="button" title={['failed', 'retrying'].includes(step.status) ? '重试此阶段' : '回退到此阶段'} onClick={() => void rollbackAgentWorkflow(workflow.id, step.id).then((state) => { setWorkflows((current) => [state, ...current.filter((item) => item.id !== state.id)]); return driveWorkflow(state.id) }).catch((caught) => setError(caught instanceof Error ? caught.message : '回退失败'))}><RotateCcw /></button>}
              </li>
            })}</ol>
            {workflow.status === 'waiting_approval' && <button type="button" className="agent-pet-model-settings" onClick={() => void approveAgentWorkflow(workflow.id).then((state) => { setWorkflows((current) => [state, ...current.filter((item) => item.id !== state.id)]); return driveWorkflow(state.id) }).catch((caught) => setError(caught instanceof Error ? caught.message : '确认失败'))}><Check />确认并继续</button>}
            {finalFilms[workflow.id] && <div className="agent-pet-final-film">
              <video controls playsInline src={finalFilms[workflow.id].url} />
              <a href={finalFilms[workflow.id].url} download={finalFilms[workflow.id].fileName}><Download />下载成片</a>
            </div>}
          </details>)}</div> : <p>还没有生产项目。输入“全流程制作一支……短片”即可启动。</p>}
          <header><div><Brain /><span><strong>长期记忆</strong><small>仅保存稳定偏好，不保存密钥</small></span></div><b>{memories.length}</b></header>
          {memories.length ? <ul>{memories.map((memory) => <li key={memory.id}><span><b>{memoryKindLabels[memory.kind]}</b>{memory.content}</span><button type="button" aria-label="删除记忆" onClick={() => void deleteAgentMemory(memory.id).then(refreshAgentState).catch((caught) => setError(caught instanceof Error ? caught.message : '删除失败'))}><Trash2 /></button></li>)}</ul> : <p>还没有长期记忆。你可以说“记住我偏好简洁中文”。</p>}
          <header><div><CalendarClock /><span><strong>定时任务</strong><small>由云端调度，不依赖浏览器在线</small></span></div><b>{tasks.filter((task) => task.status === 'active').length}</b></header>
          {tasks.length ? <ul>{tasks.slice(0, 12).map((task) => <li key={task.id}><span><b>{task.status === 'active' ? '待执行' : task.status}</b>{task.title}<small>{task.next_run_at ? new Date(task.next_run_at).toLocaleString() : task.error || ''}</small></span>{task.status === 'active' && <button type="button" aria-label="取消任务" onClick={() => void cancelAgentTask(task.id).then(refreshAgentState).catch((caught) => setError(caught instanceof Error ? caught.message : '取消失败'))}><X /></button>}</li>)}</ul> : <p>还没有任务。你可以说“每天早上 9 点搜索 AI 新闻并总结”。</p>}
          <button type="button" className="agent-pet-model-settings" onClick={() => onOpenSettings(selectedModel?.providerId ?? readyAgentModels[0]?.providerId ?? allAgentModels[0]?.providerId ?? 'openrouter')}><KeyRound />配置模型</button>
        </section>}
        {!messages.length && <section className="agent-pet-welcome">
          <div className="agent-pet-welcome-art"><img src={currentMode.image} alt="" /><Sparkles /></div>
          <small>{currentMode.label}</small>
          <h2>{currentMode.description}</h2>
          <div className="agent-pet-quick-prompts">{currentMode.quickPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => { setInput(prompt); window.setTimeout(() => composerRef.current?.focus(), 30) }}><Sparkles />{prompt}</button>)}</div>
          <button type="button" className="agent-pet-full-pipeline" onClick={() => { setMode('video'); setInput('自动制作一支 30 秒短片：信息不足时采用稳妥默认值，不要停下来提问，自行完成脚本、角色、场景、分镜、图片、配音、视频、剪辑和成片质检。'); window.setTimeout(() => composerRef.current?.focus(), 30) }}><Film />启动影视全流程</button>
        </section>}

        {messages.length > 0 && <section className="agent-pet-messages" aria-live="polite" aria-busy={loading}>
          {messages.map((message) => <article className={`agent-pet-message ${message.role}`} key={message.id}>
            <span>{message.role === 'assistant' ? <Bot /> : '你'}</span>
            <div>
              {message.role === 'assistant' ? <MarkdownContent content={sanitizeAgentMessageContent(message.content)} /> : <p>{message.content || '已发送附件'}</p>}
              {!!message.attachments?.length && <div className="agent-pet-message-attachments">{message.attachments.map((attachment) => <span key={attachment.id}><Paperclip />{attachment.name}</span>)}</div>}
              {message.streaming && <i className="agent-pet-caret" />}
              {!!message.trace?.filter((item) => item.tool !== 'model').length && <details className="agent-pet-trace"><summary><Sparkles />执行了 {message.trace.filter((item) => item.tool !== 'model').length} 个工具步骤<ChevronDown /></summary><ol>{message.trace.filter((item) => item.tool !== 'model').map((item, index) => <li key={`${item.tool}-${index}`} className={item.status}><span>{item.tool === 'web_search' ? <Search /> : item.tool.includes('memory') ? <Brain /> : item.tool.includes('task') ? <CalendarClock /> : <Sparkles />}</span><div><strong>{item.tool}</strong><small>{item.reason || item.error || `${item.elapsedMs || 0}ms`}</small></div></li>)}</ol></details>}
              {!!message.sources?.length && <section className="agent-pet-sources"><strong><Search />联网来源</strong>{message.sources.map((source, index) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><b>{index + 1}</b><span>{source.title || source.url}<small>{new URL(source.url).hostname}</small></span></a>)}</section>}
              {message.role === 'assistant' && !message.streaming && message.model && <footer>
                <small>{message.model.provider} · {message.model.name} · {pricingLabels[message.model.pricing]}</small>
                <div>
                  <button type="button" onClick={() => void navigator.clipboard.writeText(sanitizeAgentMessageContent(message.content))}><Copy />复制</button>
                  <button type="button" onClick={() => downloadMarkdown(message)}><Download />MD</button>
                  <button type="button" className={feedback[message.id] === 1 ? 'selected' : ''} aria-label="回答有帮助" onClick={() => void rateMessage(message.id, 1)}><ThumbsUp /></button>
                  <button type="button" className={feedback[message.id] === -1 ? 'selected' : ''} aria-label="回答需改进" onClick={() => void rateMessage(message.id, -1)}><ThumbsDown /></button>
                  {message.mode && message.mode !== 'chat' && <button type="button" className="primary" onClick={() => onOpenWorkspace(message.mode!, message.sourcePrompt || '')}><Sparkles />带入{modes.find((item) => item.id === message.mode)?.shortLabel}工作台</button>}
                </div>
              </footer>}
            </div>
          </article>)}
        </section>}

        {loading && <section className="agent-pet-thinking"><LoaderCircle /><div><strong>{phase}</strong><small>{selectedModel ? '本次仅调用你指定的模型' : '失败会自动切换下一个已配置模型'}</small></div></section>}
        {error && <section className="agent-pet-error"><p>{error}</p><div><button type="button" onClick={() => void submit([...messages].reverse().find((message) => message.role === 'user')?.content || input)}><RotateCcw />重试</button><button type="button" onClick={() => onOpenSettings(selectedModel?.providerId ?? readyAgentModels[0]?.providerId ?? allAgentModels[0]?.providerId ?? 'openrouter')}><KeyRound />配置模型</button></div></section>}

        <details className="agent-pet-route" open={loading || undefined}>
          <summary><span><i className={readyAgentModels.length ? 'online' : ''} />Agent 模型路由</span><b>{readyAgentModels.length} 个可选 · {providerCount} 个平台</b><ChevronDown /></summary>
          <div className="agent-pet-route-summary">
            <p>{selectedModel ? `已指定 ${selectedModel.provider} / ${selectedModel.name}，本次不会自动换用其他模型。` : '自动模式会在管理员和用户已配置的语言模型中择优调用，故障时自动切换；免费模型也包含在内。'}</p>
            <button type="button" onClick={() => { setOpen(false); onOpenModels() }}>查看模型广场</button>
          </div>
          {attempts.length > 0 && <ol>{attempts.map((attempt, index) => <li key={`${attempt.modelId}-${index}`} className={attempt.status}><span>{attempt.status === 'success' ? <Check /> : attempt.status === 'running' ? <LoaderCircle /> : <X />}</span><div><strong>{attempt.modelName}</strong><small>{attempt.providerName}{attempt.elapsedMs ? ` · ${attempt.elapsedMs}ms` : ''}</small></div></li>)}</ol>}
        </details>
        </>}
      </div>

      {!locked && <footer className="agent-pet-composer">
        {!!attachments.length && <div className="agent-pet-pending-attachments">{attachments.map((attachment) => <span key={attachment.id}><Paperclip />{attachment.name}<button type="button" aria-label={`移除 ${attachment.name}`} onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}><X /></button></span>)}</div>}
        <label className="agent-pet-model-picker">
          <Bot /><span>调用模型</span>
          <select aria-label="选择宠物 Agent 模型" value={selectedModel?.id || ''} disabled={loading || !readyAgentModels.length} onChange={(event) => {
            const value = event.target.value
            setSelectedModelId(value)
            if (value) localStorage.setItem(selectedModelKey, value)
            else localStorage.removeItem(selectedModelKey)
          }}>
            <option value="">自动选择（{readyAgentModels.length} 个已配置模型）</option>
            {userConfiguredModels.length > 0 && <optgroup label="用户已配置">{userConfiguredModels.map((model) => <option value={model.id} key={model.id}>{model.name} · {model.provider} · {pricingLabels[model.pricing]}</option>)}</optgroup>}
            {adminConfiguredModels.length > 0 && <optgroup label="管理员已配置">{adminConfiguredModels.map((model) => <option value={model.id} key={model.id}>{model.name} · {model.provider} · {pricingLabels[model.pricing]}</option>)}</optgroup>}
          </select>
        </label>
        <input ref={fileInputRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,text/*,.md,.json,.csv,.js,.jsx,.ts,.tsx,.css,.html,.py,.java,.c,.cpp,.h,.sh,.sql,.xml,.yaml,.yml" onChange={(event) => void addFiles(event.target.files)} />
        <button type="button" className="attach" aria-label="添加图片或文本附件" title="添加图片或文本附件" onClick={() => fileInputRef.current?.click()}><Paperclip /></button>
        <textarea
          ref={composerRef}
          value={input}
          maxLength={16000}
          placeholder={`让${currentMode.label}形态帮你…`}
          aria-label="发送给小屎仙 Agent"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() } }}
        />
        {loading
          ? <button type="button" className="stop" aria-label="停止" onClick={() => abortRef.current?.abort()}><CircleStop /></button>
          : <button type="button" disabled={!input.trim() && !attachments.length} aria-label="发送" onClick={() => void submit()}><Send /></button>}
      </footer>}
      <button
        type="button"
        className="agent-pet-resize"
        aria-label="调整聊天框大小"
        title="拖动调整聊天框大小"
        onPointerDown={startResize}
        onPointerMove={resizePanel}
        onPointerUp={finishResize}
        onPointerCancel={() => { resizeRef.current = undefined }}
      ><MoveDiagonal2 /></button>
    </section>
  </>
}
