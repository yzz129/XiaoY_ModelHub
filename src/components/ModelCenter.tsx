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
  configuredProviders,
  pricingLabels,
  providerEnvironmentKeys,
  type CatalogModel,
  type PricingTier,
} from '../data/providerCatalog'
import { canQueryQuota, queryProviderQuota, type ProviderQuota } from '../lib/quota'

export type ModelFamily = 'language' | 'speech' | 'vision' | 'vector' | 'router'

interface ModelCenterProps {
  open: boolean
  initialFamily?: ModelFamily
  onClose: () => void
  onUseModel?: (model: CatalogModel) => void
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
  if (model.providerId === 'openrouter' || model.id.includes('router')) return 'router'
  if (model.category === 'chat') return 'language'
  if (model.category === 'audio') return 'speech'
  if (model.category === 'embedding' || model.category === 'reranker') return 'vector'
  return 'vision'
}

export function ModelCenter({ open, initialFamily = 'language', onClose, onUseModel }: ModelCenterProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [family, setFamily] = useState<ModelFamily>(initialFamily)
  const [query, setQuery] = useState('')
  const [pricing, setPricing] = useState<PricingTier | 'all'>('all')
  const [provider, setProvider] = useState('all')
  const [quotaByProvider, setQuotaByProvider] = useState<Record<string, ProviderQuota>>({})
  const [quotaLoading, setQuotaLoading] = useState<string>()
  const [quotaError, setQuotaError] = useState<Record<string, string>>({})

  useEffect(() => {
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
  }, [initialFamily, open])

  const familyModels = useMemo(
    () => catalogModels.filter((model) => modelFamily(model) === family),
    [family],
  )
  const providers = useMemo(
    () => [...new Set(familyModels.map((model) => model.provider))].sort(),
    [familyModels],
  )
  const models = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return familyModels.filter((model) =>
      (pricing === 'all' || model.pricing === pricing)
      && (provider === 'all' || model.provider === provider)
      && (!needle || `${model.name} ${model.provider} ${model.apiModel}`.toLowerCase().includes(needle)),
    )
  }, [familyModels, pricing, provider, query])

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

  return (
    <dialog ref={ref} className="model-center marketplace" onClose={onClose} aria-labelledby="model-center-title">
      <header className="marketplace-head">
        <div className="marketplace-title">
          <span>MODEL MARKETPLACE</span>
          <h2 id="model-center-title">模型广场</h2>
          <p>{catalogModels.length} 个模型 · {new Set(catalogModels.map((model) => model.providerId)).size} 个平台</p>
        </div>
        <div className="marketplace-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索模型、平台或模型 ID"
          />
        </div>
        <button type="button" className="marketplace-close" aria-label="关闭模型广场" onClick={onClose}><X /></button>
      </header>

      <nav className="model-family-tabs" role="tablist" aria-label="模型分类">
        {familyMeta.map((item) => {
          const Icon = item.icon
          const count = catalogModels.filter((model) => modelFamily(model) === item.id).length
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
            <button type="button" className={pricing === 'all' ? 'active' : ''} onClick={() => setPricing('all')}>
              <span>全部费用</span><b>{familyModels.length}</b>
            </button>
            {(Object.keys(pricingLabels) as PricingTier[]).map((value) => (
              <button
                type="button"
                className={pricing === value ? 'active' : ''}
                onClick={() => setPricing(value)}
                key={value}
              >
                <span>{pricingLabels[value]}</span>
                <b>{familyModels.filter((model) => model.pricing === value).length}</b>
              </button>
            ))}
          </fieldset>

          <fieldset>
            <legend>服务平台</legend>
            <button type="button" className={provider === 'all' ? 'active' : ''} onClick={() => setProvider('all')}>
              <span>全部平台</span><b>{providers.length}</b>
            </button>
            {providers.map((value) => (
              <button
                type="button"
                className={provider === value ? 'active' : ''}
                onClick={() => setProvider(value)}
                key={value}
              >
                <span>{value}</span>
                <b>{familyModels.filter((model) => model.provider === value).length}</b>
              </button>
            ))}
          </fieldset>
        </aside>

        <main className="marketplace-results">
          <div className="marketplace-results-head">
            <div>
              <span>{currentFamily.label}</span>
              <strong>{currentFamily.description}</strong>
            </div>
            <p>共 {familyModels.length} 个模型，当前显示 {models.length} 个</p>
          </div>

          <div className="marketplace-legend">
            <span><CheckCircle2 />“已接入”可直接切换到创作工作台</span>
            <span><CircleDollarSign />动态额度优先查询 API，其余提供控制台入口</span>
          </div>

          <div className="catalog-grid">
            {models.map((model) => {
              const configured = configuredProviders[model.providerId]
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
                        {model.integration === 'ready' ? '已接入' : '目录'}
                      </b>
                    </div>
                  </div>

                  <p className="catalog-description">{model.description}</p>
                  <code>{model.apiModel}</code>

                  <div className="catalog-tags">
                    <span>{categoryLabels[model.category]}</span>
                    <span className={configured ? 'configured' : ''}>
                      {configured ? 'Key 已配置' : `需 ${providerEnvironmentKeys[model.providerId]?.join(' + ') ?? 'API Key'}`}
                    </span>
                  </div>

                  <div className="catalog-quota">
                    <span>额度</span>
                    <p>{model.quota}</p>
                    <small>{quotaText}</small>
                  </div>

                  <div className="catalog-links">
                    {model.integration === 'ready' && onUseModel && (
                      <button type="button" className="use-model" onClick={() => onUseModel(model)}>在工作台使用</button>
                    )}
                    {canQueryQuota(model.providerId) && (
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
                    <a href={model.keyUrl} target="_blank" rel="noreferrer" title="申请 API Key"><KeyRound />Key</a>
                  </div>
                </article>
              )
            })}
            {!models.length && <div className="catalog-empty">没有符合当前筛选条件的模型</div>}
          </div>
        </main>
      </div>
    </dialog>
  )
}
