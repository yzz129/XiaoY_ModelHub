import {
  catalogModels,
  providerDefinitionById,
  providerDefinitions,
  sortModelsByPricing,
  type CatalogModel,
  type ModelCategory,
  type PricingTier,
} from '../data/providerCatalog'
import { getProviderCredentials, isProviderConfigured } from './providerCredentials'

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

const cacheKey = 'xiaoy-provider-model-catalog-v3'
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
  return {
    id: `live:${providerId}:${apiModel}`,
    apiModel,
    name: model.name?.trim() || apiModel,
    provider: provider.name,
    providerId,
    category: model.category ?? 'chat',
    pricing: model.pricing ?? 'variable',
    quota: providerId === 'agnes'
      ? '当前输入和输出 Token 均为 $0；免费使用仍受 RPM、RPD 与并发限制'
      : '价格、配额和区域可用性以服务商控制台实时信息为准',
    quotaLookup: providerId === 'agnes'
      ? 'Agnes Token 方案页查看当前限流规则'
      : '模型由服务商官方目录动态同步',
    integration: 'catalog',
    description: model.description?.trim() || '由服务商官方模型目录动态同步',
    docsUrl: provider.docsUrl,
    keyUrl: provider.keyUrl,
  }
}

async function syncOneProvider(providerId: string) {
  const credentials = getProviderCredentials(providerId)
  const response = await fetch('/__provider_models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: providerId, ...credentials }),
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
  for (const model of discoveredModels) merged.set(`${model.providerId}:${model.apiModel}`, model)
  for (const model of baseModels) merged.set(`${model.providerId}:${model.apiModel}`, model)
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
