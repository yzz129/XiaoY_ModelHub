import {
  catalogModels,
  categoryLabels,
  dailyRefreshQuotaByProvider,
  freeModelQuotaByProvider,
  freeQuotaByProvider,
  providerDefinitionById,
  providerDefinitions,
  sortModelsByPricing,
  type CatalogModel,
  type ModelCategory,
  type PricingTier,
} from '../data/providerCatalog'
import { isProviderConfigured } from './providerCredentials'

interface ProviderModelsResponse {
  provider?: string
  models?: Array<{
    apiModel?: string
    name?: string
    description?: string
    category?: ModelCategory
    pricing?: PricingTier
  }>
  syncedAt?: number
  error?: string
}

export interface ProviderCatalogSync {
  models: CatalogModel[]
  syncedProviders: string[]
  failedProviders: string[]
  skippedProviders: string[]
  syncedAt: number
  fromCache?: boolean
}

const cacheKey = 'xiaoy-provider-model-catalog-v14'
const cacheTtlMs = 30 * 60 * 1000
let pendingSync: Promise<ProviderCatalogSync> | undefined

function readCachedCatalog(): ProviderCatalogSync | undefined {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) ?? '') as ProviderCatalogSync
    if (!Array.isArray(cached.models) || typeof cached.syncedAt !== 'number') return undefined
    if (Date.now() - cached.syncedAt > cacheTtlMs) return undefined
    return { ...cached, fromCache: true }
  } catch {
    return undefined
  }
}

function saveCachedCatalog(result: ProviderCatalogSync) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(result))
  } catch {
    // A full or disabled storage area should not block the live catalog.
  }
}

function toCatalogModel(providerId: string, model: NonNullable<ProviderModelsResponse['models']>[number]): CatalogModel | undefined {
  const provider = providerDefinitionById[providerId]
  const apiModel = model.apiModel?.trim()
  if (!provider || !apiModel) return undefined
  const category = model.category ?? 'chat'
  const name = model.name?.trim() || apiModel
  const pricing = model.pricing ?? 'variable'
  const dailyRefreshQuota = (pricing === 'daily-refresh'
    || (pricing === 'free' && providerId === 'openrouter'))
    ? dailyRefreshQuotaByProvider[providerId]
    : undefined
  const freeQuota = pricing === 'free-quota' ? freeQuotaByProvider[providerId] : undefined
  const freeModelQuota = pricing === 'free' ? freeModelQuotaByProvider[providerId] : undefined
  const quotaDescription = dailyRefreshQuota ?? freeQuota ?? freeModelQuota
  return {
    id: `live:${providerId}:${apiModel}`,
    apiModel,
    name,
    provider: provider.name,
    providerId,
    category,
    pricing,
    quota: quotaDescription?.quota ?? (providerId === 'agnes'
      ? '当前输入和输出 Token 均为 $0；免费使用仍受 RPM、RPD 与并发限制'
      : '价格、配额和区域可用性以服务商控制台实时信息为准'),
    quotaLookup: quotaDescription?.quotaLookup ?? (providerId === 'agnes'
      ? 'Agnes Token 方案页查看当前限流规则'
      : '模型由服务商官方目录动态同步'),
    integration: category === 'chat' && openAiCompatibleChatProviders.has(providerId) ? 'ready' : 'catalog',
    description: localizeModelDescription(model.description, category, provider.name),
    docsUrl: provider.docsUrl,
    keyUrl: provider.keyUrl,
  }
}

const openAiCompatibleChatProviders = new Set([
  'agnes', 'alibaba', 'aimlapi', 'ark', 'baidu', 'cerebras', 'cohere', 'deepinfra',
  'deepseek', 'fireworks', 'groq', 'hyperbolic', 'minimax', 'mistral', 'modelscope',
  'moonshot', 'novita', 'nvidia', 'openai', 'openrouter', 'perplexity', 'pollinations',
  'sambanova', 'scaleway', 'siliconflow', 'stepfun', 'together', 'xai', 'zhipu',
])

const categoryUseCases: Record<ModelCategory, string> = {
  chat: '对话、文本生成与知识问答',
  image: '图片生成、图像编辑与视觉创作',
  video: '文生视频、图生视频与动态画面创作',
  audio: '语音识别、语音合成与音频处理',
  embedding: '文本向量化与语义检索',
  reranker: '搜索结果重排与相关性优化',
  '3d': '三维内容生成与空间资产创作',
}

function localizeModelDescription(description: string | undefined, category: ModelCategory, providerName: string) {
  const sourceText = description?.trim() ?? ''
  if (/[\u3400-\u9fff]/.test(sourceText)) return sourceText

  const source = sourceText.toLowerCase()
  const features: string[] = []
  const addFeature = (pattern: RegExp, label: string) => {
    if (pattern.test(source) && !features.includes(label)) features.push(label)
  }
  addFeature(/reasoning|chain.of.thought|problem.solving/, '复杂推理')
  addFeature(/code|coding|programming|software/, '编程与代码任务')
  addFeature(/multimodal|vision.language|image understanding/, '多模态理解')
  addFeature(/long.context|context window|document/, '长上下文与文档处理')
  addFeature(/agent|tool.call|function.call/, '工具调用与智能体工作流')
  addFeature(/reference.image|image.guided|first.frame|last.frame/, '参考图与关键帧控制')
  addFeature(/video edit|video extension|extend video/, '视频编辑与续写')
  addFeature(/text.to.speech|speech synthesis|\btts\b/, '文字转语音')
  addFeature(/speech.to.text|transcri|\basr\b/, '语音转文字')
  addFeature(/multilingual|multiple languages/, '多语言任务')

  return `由 ${providerName} 提供的${categoryLabels[category]}模型，主要用于${categoryUseCases[category]}${features.length ? `，支持${features.slice(0, 3).join('、')}` : ''}。`
}

async function syncOneProvider(providerId: string) {
  const response = await fetch('/__provider_models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: providerId }),
  })
  const payload = await response.json().catch(() => ({})) as ProviderModelsResponse
  if (!response.ok) throw new Error(payload.error || `模型目录同步失败（${response.status}）`)
  return (payload.models ?? []).flatMap((model) => {
    const normalized = toCatalogModel(providerId, model)
    return normalized ? [normalized] : []
  })
}

async function runProviderPool(providerIds: string[], concurrency = 4) {
  const results = new Map<string, CatalogModel[]>()
  const errors = new Map<string, string>()
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, providerIds.length) }, async () => {
    while (cursor < providerIds.length) {
      const providerId = providerIds[cursor]
      cursor += 1
      try {
        results.set(providerId, await syncOneProvider(providerId))
      } catch (error) {
        errors.set(providerId, error instanceof Error ? error.message : '同步失败')
      }
    }
  })
  await Promise.all(workers)
  return { results, errors }
}

export function mergeProviderCatalog(discoveredModels: CatalogModel[], baseModels = catalogModels) {
  const merged = new Map<string, CatalogModel>()
  const discoveredProviders = new Set(discoveredModels.map((model) => model.providerId))
  const completeLiveCatalogProviders = new Set(['openrouter', 'pollinations', 'groq', 'gemini', 'modelscope', 'minimax'])
  for (const model of baseModels) {
    if (discoveredProviders.has(model.providerId) && completeLiveCatalogProviders.has(model.providerId)) continue
    merged.set(`${model.providerId}:${model.apiModel}`, model)
  }
  // Live provider metadata is authoritative; local rows are only offline fallbacks.
  for (const model of discoveredModels) merged.set(`${model.providerId}:${model.apiModel}`, model)
  return sortModelsByPricing([...merged.values()])
}

export function syncProviderCatalog(force = false): Promise<ProviderCatalogSync> {
  if (!force) {
    const cached = readCachedCatalog()
    if (cached) return Promise.resolve(cached)
    if (pendingSync) return pendingSync
  }

  pendingSync = (async () => {
    const syncable = providerDefinitions.filter((provider) =>
      provider.publicModelCatalog || isProviderConfigured(provider.id),
    )
    const skippedProviders = providerDefinitions
      .filter((provider) => !syncable.some((candidate) => candidate.id === provider.id))
      .map((provider) => provider.name)
    const { results, errors } = await runProviderPool(syncable.map((provider) => provider.id))
    const models = [...results.values()].flat()
    const syncedProviders = [...results.keys()].map((providerId) => providerDefinitionById[providerId]?.name ?? providerId)
    const failedProviders = [...errors.keys()].map((providerId) => providerDefinitionById[providerId]?.name ?? providerId)
    const result: ProviderCatalogSync = {
      models,
      syncedProviders,
      failedProviders,
      skippedProviders,
      syncedAt: Date.now(),
    }
    saveCachedCatalog(result)
    return result
  })().finally(() => {
    pendingSync = undefined
  })

  return pendingSync
}
