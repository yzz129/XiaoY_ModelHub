import type { CatalogModel } from '../data/providerCatalog'
import type { AgentPetMode } from './agentNavigation'
import type { ChatAttachment } from './creative'

export interface AgentSource {
  title: string
  url: string
  content: string
  score: number
}

export interface AgentTrace {
  tool: string
  reason?: string
  model?: string
  provider?: string
  status: 'success' | 'failed'
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
}

export type AgentWorkflowStage = 'moodboard' | 'script' | 'character' | 'scene' | 'storyboard' | 'image' | 'audio' | 'video' | 'editing'

export interface AgentWorkflowCommand {
  id: string
  workflowId: string
  stepId: string
  kind: 'image' | 'audio' | 'video'
  label: string
  payload: { prompt?: string; text?: string; ratio?: string; count?: number; duration?: number }
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
  signal?: AbortSignal
}) {
  return api<{
    conversationId: string
    userMessageId: string
    message: { id: string; content: string; createdAt: number }
    model: Pick<CatalogModel, 'id' | 'apiModel' | 'name' | 'provider' | 'providerId' | 'pricing'>
    trace: AgentTrace[]
    sources: AgentSource[]
  }>('/api/agent/run', {
    method: 'POST',
    signal: input.signal,
    body: JSON.stringify({
      conversationId: input.conversationId,
      prompt: input.prompt,
      mode: input.mode,
      attachments: input.attachments,
      models: input.models,
    }),
  })
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
