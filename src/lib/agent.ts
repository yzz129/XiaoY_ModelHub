import { sortModelsByPricing, type CatalogModel } from '../data/providerCatalog'
import { isProviderConfigured } from './providerCredentials'
import { sendLanguageMessage, type ChatMessage } from './creative'

export const agentFreePricing = new Set(['free', 'daily-refresh', 'free-quota'])

export interface AgentRouteAttempt {
  modelId: string
  modelName: string
  providerId: string
  providerName: string
  status: 'running' | 'success' | 'failed'
  elapsedMs?: number
  error?: string
}

export interface AgentRouteResult {
  content: string
  model: CatalogModel
  attempts: AgentRouteAttempt[]
}

const routeCursorKey = 'xiaoy-agent-free-route-cursor-v1'

function uniqueModels(models: CatalogModel[]) {
  const seen = new Set<string>()
  return models.filter((model) => {
    const key = `${model.providerId}:${model.apiModel}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function getFreeAgentModels(models: CatalogModel[], configuredOnly = false) {
  const eligible = uniqueModels(sortModelsByPricing(models.filter((model) =>
    model.category === 'chat'
      && model.integration === 'ready'
      && agentFreePricing.has(model.pricing),
  )))
  return configuredOnly ? eligible.filter((model) => isProviderConfigured(model.providerId)) : eligible
}

function readCursor(size: number) {
  if (!size) return 0
  try {
    return Math.abs(Number(localStorage.getItem(routeCursorKey)) || 0) % size
  } catch {
    return 0
  }
}

function rotateModels(models: CatalogModel[]) {
  if (models.length < 2) return models
  const cursor = readCursor(models.length)
  return [...models.slice(cursor), ...models.slice(0, cursor)]
}

function advanceCursor(models: CatalogModel[], selected: CatalogModel) {
  try {
    const selectedIndex = models.findIndex((model) => model.id === selected.id)
    localStorage.setItem(routeCursorKey, String((selectedIndex + 1 + models.length) % models.length))
  } catch {
    // Routing still works when browser storage is unavailable.
  }
}

export async function routeFreeAgentMessage({
  models,
  messages,
  systemPrompt,
  temperature = 0.55,
  signal,
  onAttempt,
}: {
  models: CatalogModel[]
  messages: ChatMessage[]
  systemPrompt: string
  temperature?: number
  signal?: AbortSignal
  onAttempt?: (attempts: AgentRouteAttempt[]) => void
}): Promise<AgentRouteResult> {
  const configured = getFreeAgentModels(models, true)
  if (!configured.length) {
    throw new Error('还没有可调用的免费模型，请先配置任一免费服务商的 API Key。')
  }

  const ordered = rotateModels(configured)
  const attempts: AgentRouteAttempt[] = []
  let lastError = '所有已配置的免费模型暂时都不可用'

  for (const model of ordered) {
    if (signal?.aborted) throw new DOMException('已停止本次请求', 'AbortError')
    const startedAt = performance.now()
    attempts.push({
      modelId: model.id,
      modelName: model.name,
      providerId: model.providerId,
      providerName: model.provider,
      status: 'running',
    })
    onAttempt?.([...attempts])
    try {
      const content = await sendLanguageMessage(model, messages, systemPrompt, temperature, signal)
      attempts[attempts.length - 1] = {
        ...attempts[attempts.length - 1],
        status: 'success',
        elapsedMs: Math.round(performance.now() - startedAt),
      }
      advanceCursor(configured, model)
      onAttempt?.([...attempts])
      return { content, model, attempts }
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error instanceof Error ? error.message : '模型请求失败'
      attempts[attempts.length - 1] = {
        ...attempts[attempts.length - 1],
        status: 'failed',
        elapsedMs: Math.round(performance.now() - startedAt),
        error: lastError,
      }
      onAttempt?.([...attempts])
    }
  }

  throw new Error(`${lastError}。已轮询 ${attempts.length} 个免费模型。`)
}
