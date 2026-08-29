import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  AudioLines,
  Blocks,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  Eye,
  KeyRound,
  MessageSquareText,
  RefreshCw,
  Route,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import {
  catalogModels,
  categoryLabels,
  pricingLabels,
  providerDefinitions,
  type CatalogModel,
  type PricingTier,
} from '../data/providerCatalog'
import { canQueryQuota, queryProviderQuota, type ProviderQuota } from '../lib/quota'
import { isProviderConfigured, isProviderPersonallyConfigured } from '../lib/providerCredentials'

export type ModelFamily = 'language' | 'speech' | 'vision' | 'vector' | 'router'

interface ModelCenterProps {
  open?: boolean
  embedded?: boolean
  guest?: boolean
  initialFamily?: ModelFamily
  onClose?: () => void
  onUseModel?: (model: CatalogModel) => void
  models?: CatalogModel[]
  modelsRefreshing?: boolean
  modelSyncSummary?: string
  modelSyncDetail?: string
  onRefreshModels?: () => void
}

const familyMeta: Array<{
  id: ModelFamily
  label: string
  description: string
  icon: ComponentType<{ size?: number }>
}> = [
  { id: 'language', label: '语言模型', description: '对话、推理与多模态理解', icon: MessageSquareText },
  { id: 'speech', label: '语音模型', description: '语音识别与语音合成', icon: AudioLines },
  { id: 'vision', label: '视觉模型', description: '图片、视频与 3D 生成', icon: Eye },
  { id: 'vector', label: '向量模型', description: 'Embedding 与语义重排', icon: Blocks },
  { id: 'router', label: '智能路由模型', description: '自动选择当前可用模型', icon: Route },
]

function modelFamily(model: CatalogModel): ModelFamily {
  if (model.providerId === 'openrouter' && model.apiModel === 'openrouter/free') return 'router'
  if (model.category === 'chat') return 'language'
  if (model.category === 'audio') return 'speech'
  if (model.category === 'embedding' || model.category === 'reranker') return 'vector'
  return 'vision'
}

function modelMatchesQuery(model: CatalogModel, needle: string) {
  return !needle
    || `${model.name} ${model.provider} ${model.apiModel}`.toLowerCase().includes(needle)
}

export function ModelCenter({
  open = false,
  embedded = false,
  guest = false,
  initialFamily = 'language',
  onClose,
  onUseModel,
  models: availableModels = catalogModels,
  modelsRefreshing = false,
  modelSyncSummary = '使用内置模型目录',
  modelSyncDetail = '',
  onRefreshModels,
}: ModelCenterProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [family, setFamily] = useState<ModelFamily>(initialFamily)
  const [query, setQuery] = useState('')
  const [pricing, setPricing] = useState<PricingTier | 'all'>('all')
  const [provider, setProvider] = useState('all')
  const [quotaByProvider, setQuotaByProvider] = useState<Record<string, ProviderQuota>>({})
  const [quotaLoading, setQuotaLoading] = useState<string>()
  const [quotaError, setQuotaError] = useState<Record<string, string>>({})
  const [displayLimit, setDisplayLimit] = useState(72)

  useEffect(() => {
    if (embedded) {
      setFamily(initialFamily)
      setQuery('')
      setPricing('all')
      setProvider('all')
      return
    }
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setFamily(initialFamily)
      setQuery('')
      setPricing('all')
      setProvider('all')
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [embedded, initialFamily, open])

  const familyModels = useMemo(
    () => availableModels.filter((model) => modelFamily(model) === family),
    [availableModels, family],
  )
  const needle = query.trim().toLowerCase()
  const pricingCounts = useMemo(() => {
    const counts = new Map<PricingTier, number>()
    for (const model of familyModels) {
      if ((provider === 'all' || model.provider === provider) && modelMatchesQuery(model, needle)) {
        counts.set(model.pricing, (counts.get(model.pricing) ?? 0) + 1)
      }
    }
    return counts
  }, [familyModels, needle, provider])
  const providers = useMemo(() => {
    const familyCounts = new Map<string, number>()
    const filteredCounts = new Map<string, number>()
    const totalCounts = new Map<string, number>()
    for (const model of familyModels) {
      familyCounts.set(model.provider, (familyCounts.get(model.provider) ?? 0) + 1)
      if ((pricing === 'all' || model.pricing === pricing) && modelMatchesQuery(model, needle)) {
        filteredCounts.set(model.provider, (filteredCounts.get(model.provider) ?? 0) + 1)
      }
    }
    for (const model of availableModels) {
      totalCounts.set(model.provider, (totalCounts.get(model.provider) ?? 0) + 1)
    }
    return providerDefinitions.map((definition) => ({
      ...definition,
      count: familyCounts.get(definition.name) ?? 0,
      filteredCount: filteredCounts.get(definition.name) ?? 0,
      totalCount: totalCounts.get(definition.name) ?? 0,
    }))
  }, [availableModels, familyModels, needle, pricing])
  const models = useMemo(() => {
    return familyModels.filter((model) =>
      (pricing === 'all' || model.pricing === pricing)
      && (provider === 'all' || model.provider === provider)
      && modelMatchesQuery(model, needle),
    )
  }, [familyModels, needle, pricing, provider])

  async function refreshQuota(providerId: string) {
    setQuotaLoading(providerId)
    setQuotaError((current) => ({ ...current, [providerId]: '' }))
    try {
      const result = await queryProviderQuota(providerId)
      setQuotaByProvider((current) => ({ ...current, [providerId]: result }))
    } catch (error) {
      setQuotaError((current) => ({
        ...current,
        [providerId]: error instanceof Error ? error.message : '额度查询失败',
      }))
    } finally {
      setQuotaLoading(undefined)
    }
  }

  const currentFamily = familyMeta.find((item) => item.id === family)!
  const availableProviders = providers.filter((item) => item.count > 0)
  const unavailableProviders = providers.filter((item) => item.count === 0)
  const filteredProviderCount = availableProviders.filter((item) => item.filteredCount > 0).length
  const pricingModelCount = familyModels.filter((model) =>
    (provider === 'all' || model.provider === provider) && modelMatchesQuery(model, needle),
  ).length

  const content = (
    <>
      <header className="marketplace-head">
        <div className="marketplace-title">
          <span>MODEL MARKETPLACE</span>
          <h2 id="model-center-title">模型广场</h2>
          <p>{availableModels.length} 个模型 · {providerDefinitions.length} 个平台</p>
          <small className="model-sync-summary" title={modelSyncDetail}>{modelSyncSummary}</small>
        </div>
        <div className="marketplace-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setDisplayLimit(72) }}
            placeholder="搜索模型、平台或模型 ID"
          />
          </div>
        {onRefreshModels && (
          <button type="button" className="model-sync-button" disabled={modelsRefreshing} onClick={onRefreshModels}>
            <RefreshCw className={modelsRefreshing ? 'spin-icon' : ''} />
            {modelsRefreshing ? '同步中' : '同步模型'}
          </button>
        )}
        {embedded
          ? <div className={`marketplace-account ${guest ? 'guest' : ''}`}><span>{guest ? '访客浏览 · 登录后使用' : 'XiaoY_ModelHub 已连接'}</span><b>{guest ? '访' : 'XY'}</b></div>
          : <button type="button" className="marketplace-close" aria-label="关闭模型广场" onClick={onClose}><X /></button>}
      </header>

      <nav className="model-family-tabs" role="tablist" aria-label="模型分类">
        {familyMeta.map((item) => {
          const Icon = item.icon
          const count = availableModels.filter((model) => modelFamily(model) === item.id).length
          return (
            <button
              type="button"
              role="tab"
              aria-selected={family === item.id}
              className={family === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => {
                setFamily(item.id)
                setProvider('all')
                setDisplayLimit(72)
              }}
            >
              <Icon size={17} />
              <span>{item.label}<small>{item.description}</small></span>
              <b>{count}</b>
            </button>
          )
        })}
      </nav>

      <div className="marketplace-layout">
        <aside className="marketplace-filters" aria-label="模型筛选">
          <div className="filter-heading"><SlidersHorizontal size={15} /><strong>筛选</strong></div>

          <fieldset>
            <legend>费用类型</legend>
            <button type="button" className={pricing === 'all' ? 'active' : ''} onClick={() => { setPricing('all'); setDisplayLimit(72) }}>
              <span>全部费用</span><b>{pricingModelCount}</b>
            </button>
            {(Object.keys(pricingLabels) as PricingTier[]).map((value) => (
              <button
                type="button"
                className={pricing === value ? 'active' : ''}
                onClick={() => { setPricing(value); setDisplayLimit(72) }}
                key={value}
              >
                <span>{pricingLabels[value]}</span>
                <b>{pricingCounts.get(value) ?? 0}</b>
              </button>
            ))}
          </fieldset>

          <label className="mobile-provider-filter">
            <span>服务商</span>
            <select
              aria-label="按服务商筛选模型"
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value)
                setDisplayLimit(72)
              }}
            >
              <option value="all">全部平台（{filteredProviderCount}）</option>
              {availableProviders.map((item) => (
                <option value={item.name} key={item.id}>
                  {item.name}（{item.filteredCount}）
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend>服务平台</legend>
            <button type="button" className={provider === 'all' ? 'active' : ''} onClick={() => { setProvider('all'); setDisplayLimit(72) }}>
              <span>全部平台</span><b>{filteredProviderCount}</b>
            </button>
            {availableProviders.map((item) => (
              <button
                type="button"
                className={provider === item.name ? 'active' : ''}
                onClick={() => { setProvider(item.name); setDisplayLimit(72) }}
                disabled={item.filteredCount === 0 && provider !== item.name}
                key={item.id}
              >
                <span>{item.name}</span>
                <b>{item.filteredCount}</b>
              </button>
            ))}
            {unavailableProviders.length > 0 && (
              <details className="provider-unavailable">
                <summary>
                  <span>其他平台</span>
                  <b>{unavailableProviders.length}</b>
                </summary>
                <div className="provider-unavailable-list">
                  {unavailableProviders.map((item) => (
                    <a
                      href={item.keyUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={item.totalCount > 0 ? '该平台在其他模型分类中有可用模型' : '配置 API Key 后同步模型目录'}
                      key={item.id}
                    >
                      <span>
                        {item.name}
                        <small>{item.totalCount > 0 ? `其他分类 ${item.totalCount}` : '配置 Key 后同步'}</small>
                      </span>
                      <ExternalLink size={11} />
                    </a>
                  ))}
                </div>
              </details>
            )}
          </fieldset>
        </aside>

        <main className="marketplace-results">
          <div className="marketplace-results-head">
            <div>
              <span>{currentFamily.label}</span>
              <strong>{currentFamily.description}</strong>
            </div>
            <p>共 {familyModels.length} 个模型，符合条件 {models.length} 个，已加载 {Math.min(models.length, displayLimit)} 个</p>
          </div>

          <div className="marketplace-legend">
            <span><CheckCircle2 />{guest ? '所有模型均可公开浏览，点击使用时登录' : '所有模型都可点击使用；没有 Key 时会引导到 API 设置'}</span>
            <span><CircleDollarSign />{guest ? '登录后可配置 API Key、查询额度并开始创作' : '动态额度优先查询 API，其余提供控制台入口'}</span>
          </div>

          <div className="catalog-grid">
            {models.slice(0, displayLimit).map((model) => {
              const requiresPersonalKey = model.pricing !== 'free'
              const configured = !guest && (requiresPersonalKey
                ? isProviderPersonallyConfigured(model.providerId)
                : isProviderConfigured(model.providerId))
              const quotaText = quotaByProvider[model.providerId]?.summary
                ?? quotaError[model.providerId]
                ?? model.quotaLookup
              return (
                <article className="catalog-card" key={model.id}>
                  <div className="catalog-card-head">
                    <div className="catalog-mark" aria-hidden="true">{model.name.slice(0, 1).toUpperCase()}</div>
                    <div className="catalog-identity">
                      <h3>{model.name}</h3>
                      <p>{model.provider}</p>
                    </div>
                    <div className="catalog-badges">
                      <b className={`price-badge ${model.pricing}`}>{pricingLabels[model.pricing]}</b>
                      <b className={`integration-badge ${model.integration}`}>
                        {model.integration === 'ready' ? '已接入' : '待接入'}
                      </b>
                    </div>
                  </div>

                  <p className="catalog-description">{model.description}</p>
                  <code>{model.apiModel}</code>

                  <div className="catalog-tags">
                    <span>{categoryLabels[model.category]}</span>
                    <span className={configured ? 'configured' : ''}>
                      {guest ? '登录后配置 API Key' : configured ? requiresPersonalKey ? '个人 API Key 已配置' : '免费模型可用' : '需配置个人 API Key'}
                    </span>
                  </div>

                  <div className="catalog-quota">
                    <span>额度</span>
                    <p>{model.quota}</p>
                    <small>{quotaText}</small>
                  </div>

                  <div className="catalog-links">
                    {onUseModel && (
                      <button type="button" className="use-model" onClick={() => onUseModel(model)}>
                        {guest ? '登录后使用' : configured ? '使用此模型' : '配置后使用'}
                      </button>
                    )}
                    {!guest && canQueryQuota(model.providerId) && (
                      <button
                        type="button"
                        onClick={() => void refreshQuota(model.providerId)}
                        disabled={quotaLoading === model.providerId}
                      >
                        <RefreshCw className={quotaLoading === model.providerId ? 'spin-icon' : ''} />
                        查额度
                      </button>
                    )}
                    <a href={model.docsUrl} target="_blank" rel="noreferrer" title="API 文档"><ExternalLink />文档</a>
                    <a href={model.keyUrl} target="_blank" rel="noreferrer" title="申请 API Key"><KeyRound />申请 Key</a>
                  </div>
                </article>
              )
            })}
            {!models.length && <div className="catalog-empty">没有符合当前筛选条件的模型</div>}
            {models.length > displayLimit && (
              <button type="button" className="catalog-load-more" onClick={() => setDisplayLimit((current) => current + 72)}>
                再显示 72 个（剩余 {models.length - displayLimit}）
              </button>
            )}
          </div>
        </main>
      </div>
    </>
  )

  if (embedded) {
    return <section className="model-center marketplace embedded" aria-labelledby="model-center-title">{content}</section>
  }

  return <dialog ref={ref} className="model-center marketplace" onClose={onClose} aria-labelledby="model-center-title">{content}</dialog>
}
