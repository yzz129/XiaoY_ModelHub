import type { CatalogModel } from '../data/providerCatalog'
import type { AgentPetMode } from './agentNavigation'
import type { ChatAttachment } from './creative'

export interface AgentSource {
  title: string
  url: string
  content: string
  score: number
}

export interface AgentRunEvent {
  runId: string
  phase: string
  status: string
  stepIndex: number
  tool?: string | null
  detail: Record<string, unknown>
  createdAt: number
}

export interface AgentTrace {
  tool: string
  reason?: string
  model?: string
  provider?: string
  status: 'success' | 'failed' | 'approval_required'
  risk?: 'read' | 'write' | 'destructive' | 'internal' | 'unknown'
  elapsedMs?: number
  error?: string
}

export interface AgentMemory {
  id: string
  kind: 'preference' | 'profile' | 'instruction' | 'project'
  content: string
  tags: string[]
  importance: number
  updated_at: number
}

export interface AgentTask {
  id: string
  title: string
  prompt: string
  mode: AgentPetMode
  schedule_type: 'once' | 'interval' | 'cron'
  status: 'active' | 'running' | 'completed' | 'failed' | 'cancelled'
  result?: string
  error?: string
  last_run_at?: number
  next_run_at?: number
}

export interface AgentPlanStep {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  note?: string
  updatedAt?: number
}

export interface AgentPlan {
  id: string
  conversationId: string
  goal: string
  status: 'active' | 'completed' | 'blocked' | 'cancelled'
  steps: AgentPlanStep[]
  version: number
  createdAt: number
  updatedAt: number
}

export interface AgentReview {
  pass: boolean
  score: number
  summary: string
  issues: string[]
  completedStepIds: string[]
  blockedStepIds: string[]
}

export interface AgentRunMetrics {
  orchestration: 'standard' | 'full'
  modelCalls: number
  toolCalls: number
  criticScore: number | null
  repaired: boolean
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedTokens: number
  costMicrousd: number
}

export interface AgentRun {
  id: string
  conversation_id?: string
  status: 'completed' | 'failed'
  orchestration: 'standard' | 'full'
  model_calls: number
  tool_calls: number
  failed_steps: number
  duration_ms: number
  critic_score?: number
  repaired: number
  error?: string
  created_at: number
  completed_at: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cached_tokens: number
  cost_microusd: number
}

export interface AgentApproval {
  id: string
  runId: string
  conversationId: string
  tool: string
  risk: 'write' | 'destructive' | 'unknown'
  reason: string
  arguments: Record<string, unknown>
  status: 'pending' | 'executing' | 'approved' | 'rejected' | 'failed'
  result?: unknown
  error?: string | null
  createdAt: number
  resolvedAt?: number | null
}

export interface AgentCheckpoint {
  run_id: string
  conversation_id?: string
  status: 'failed'
  phase: string
  step_index: number
  revision: number
  updated_at: number
}

export interface AgentStateMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments: ChatAttachment[]
  providerId?: string
  modelId?: string
  trace: AgentTrace[]
  sources: AgentSource[]
  createdAt: number
}

export interface AgentState {
  conversation?: { id: string; title: string; updated_at: number }
  messages: AgentStateMessage[]
  memories: AgentMemory[]
  tasks: AgentTask[]
  plan?: AgentPlan | null
  runs?: AgentRun[]
  pendingApprovals?: AgentApproval[]
  recoverableRuns?: AgentCheckpoint[]
}

export type AgentWorkflowStage = 'moodboard' | 'script' | 'character' | 'scene' | 'storyboard' | 'image' | 'audio' | 'video' | 'editing'

export interface AgentWorkflowCommand {
  id: string
  workflowId: string
  stepId: string
  kind: 'image' | 'audio' | 'video' | 'editing'
  label: string
  payload: {
    prompt?: string
    text?: string
    ratio?: string
    count?: number
    duration?: number
    prompts?: Array<{ shotId: string; prompt: string; overlayText?: string; continuityKey?: string }>
    segments?: Array<{ id: string; speaker?: string; text: string }>
    bgm?: { title?: string; mood?: string; duration?: number }
    shots?: Array<{ shotId: string; duration: number; prompt: string; continuityKey?: string }>
    title?: string
    clips?: Array<{ shotId?: string; duration?: number }>
    subtitles?: Array<{ start: number; end: number; text: string }>
    qualityChecklist?: unknown[]
    sourceQuality?: { video?: boolean; narration?: boolean; bgm?: boolean }
  }
}

export interface AgentWorkflowStep {
  id: string
  workflowId: string
  stage: AgentWorkflowStage
  label: string
  version: number
  parentStepId?: string
  status: string
  skills: string[]
  output: { content?: string; artifact?: Record<string, unknown> }
  review: { pass?: boolean; score?: number; summary?: string; issues?: string[]; suggestions?: string[] }
  command?: AgentWorkflowCommand
  attempt: number
  createdAt: number
  updatedAt: number
}

export interface AgentWorkflow {
  id: string
  title: string
  brief: string
  status: string
  currentStage: AgentWorkflowStage
  currentStageLabel: string
  autoApprove: boolean
  aspectRatio: string
  visualStyle: string
  stages: Array<{ id: AgentWorkflowStage; label: string }>
  skills: Array<{ id: string; name: string; stages: string[] }>
  steps: AgentWorkflowStep[]
  pendingCommand?: AgentWorkflowCommand | null
  finalArtifact?: {
    artifactId?: string
    url?: string
    fileName?: string
    mimeType?: string
    bytes?: number
    duration?: number
  } | null
  createdAt: number
  updatedAt: number
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `Agent 请求失败（${response.status}）`)
  return payload as T
}

export async function getAgentState(signal?: AbortSignal) {
  return api<AgentState>('/api/agent/state', { signal })
}

export async function runMultimodalAgent(input: {
  conversationId?: string
  prompt: string
  mode: AgentPetMode
  attachments: ChatAttachment[]
  models: CatalogModel[]
  orchestration?: 'standard' | 'full'
  budget?: { maxTotalTokens?: number; maxCostMicrousd?: number }
  signal?: AbortSignal
}) {
  return api<{
    conversationId: string
    userMessageId: string
    message: { id: string; content: string; createdAt: number }
    model: Pick<CatalogModel, 'id' | 'apiModel' | 'name' | 'provider' | 'providerId' | 'pricing'>
    trace: AgentTrace[]
    sources: AgentSource[]
    plan?: AgentPlan | null
    review?: AgentReview | null
    orchestration: 'standard' | 'full'
    metrics: AgentRunMetrics
    runId: string
    status: 'completed' | 'waiting_approval'
    pendingApproval?: AgentApproval | null
    budget: { maxTotalTokens: number; maxCostMicrousd: number; exceeded: boolean }
  }>('/api/agent/run', {
    method: 'POST',
    signal: input.signal,
    body: JSON.stringify({
      conversationId: input.conversationId,
      prompt: input.prompt,
      mode: input.mode,
      attachments: input.attachments,
      models: input.models,
      orchestration: input.orchestration ?? 'full',
      budget: input.budget,
    }),
  })
}

export async function streamMultimodalAgent(
  input: Parameters<typeof runMultimodalAgent>[0],
  onEvent?: (event: AgentRunEvent) => void,
): Promise<Awaited<ReturnType<typeof runMultimodalAgent>>> {
  const response = await fetch('/api/agent/run-stream', {
    method: 'POST',
    credentials: 'include',
    signal: input.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId: input.conversationId,
      prompt: input.prompt,
      mode: input.mode,
      attachments: input.attachments,
      models: input.models,
      orchestration: input.orchestration ?? 'full',
      budget: input.budget,
    }),
  })
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(payload.error || `Agent 流式请求失败（${response.status}）`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: Awaited<ReturnType<typeof runMultimodalAgent>> | null = null
  let streamError = ''
  const consume = (block: string) => {
    const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim()
    const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
    if (!event || !data) return
    const payload = JSON.parse(data) as AgentRunEvent & { error?: string }
    if (event === 'progress') onEvent?.(payload)
    else if (event === 'result') result = payload as unknown as Awaited<ReturnType<typeof runMultimodalAgent>>
    else if (event === 'error') streamError = payload.error || 'Agent 执行失败'
  }
  while (true) {
    const chunk = await reader.read()
    buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''
    blocks.forEach(consume)
    if (chunk.done) break
  }
  if (buffer.trim()) consume(buffer)
  if (streamError) throw new Error(streamError)
  if (!result) throw new Error('Agent 流式响应未返回最终结果')
  return result
}

export async function resolveAgentApproval(approvalId: string, action: 'approve' | 'reject') {
  return api<{
    approval: AgentApproval
    continuation: Awaited<ReturnType<typeof runMultimodalAgent>> | null
    continuationError?: string | null
  }>(`/api/agent/approvals/${encodeURIComponent(approvalId)}/${action}`, { method: 'POST', body: '{}' })
}

export async function resumeAgentRun(runId: string) {
  return api<Awaited<ReturnType<typeof runMultimodalAgent>>>(`/api/agent/runs/${encodeURIComponent(runId)}/resume`, { method: 'POST', body: '{}' })
}

export async function deleteAgentConversation(conversationId: string) {
  return api<{ ok: true }>(`/api/agent/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' })
}

export async function deleteAgentMemory(memoryId: string) {
  return api<{ ok: true }>(`/api/agent/memories/${encodeURIComponent(memoryId)}`, { method: 'DELETE' })
}

export async function cancelAgentTask(taskId: string) {
  return api<{ ok: true }>(`/api/agent/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' })
}

export async function sendAgentFeedback(messageId: string, rating: 1 | -1) {
  return api<{ ok: true }>('/api/agent/feedback', { method: 'POST', body: JSON.stringify({ messageId, rating }) })
}

export async function listAgentWorkflows(signal?: AbortSignal) {
  return api<{ workflows: AgentWorkflow[] }>('/api/agent/workflows', { signal })
}

export async function createAgentWorkflow(input: {
  brief: string
  title?: string
  autoApprove?: boolean
  aspectRatio?: string
  visualStyle?: string
  models: CatalogModel[]
}) {
  return api<AgentWorkflow>('/api/agent/workflows', { method: 'POST', body: JSON.stringify(input) })
}

export async function advanceAgentWorkflow(workflowId: string, signal?: AbortSignal) {
  return api<AgentWorkflow>(`/api/agent/workflows/${encodeURIComponent(workflowId)}/advance`, { method: 'POST', signal, body: '{}' })
}

export async function approveAgentWorkflow(workflowId: string) {
  return api<AgentWorkflow>(`/api/agent/workflows/${encodeURIComponent(workflowId)}/approve`, { method: 'POST', body: '{}' })
}

export async function reportAgentWorkflowCommand(workflowId: string, input: {
  stepId: string
  commandId: string
  ok: boolean
  output?: Record<string, unknown>
  error?: string
}) {
  return api<AgentWorkflow>(`/api/agent/workflows/${encodeURIComponent(workflowId)}/report`, { method: 'POST', body: JSON.stringify(input) })
}

export async function rollbackAgentWorkflow(workflowId: string, stepId: string) {
  return api<AgentWorkflow>(`/api/agent/workflows/${encodeURIComponent(workflowId)}/rollback`, { method: 'POST', body: JSON.stringify({ stepId }) })
}
