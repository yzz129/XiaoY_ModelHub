import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, CircleDollarSign, ExternalLink, KeyRound, RefreshCw, Search, X } from 'lucide-react'
import { catalogModels, categoryLabels, configuredProviders, pricingLabels, providerEnvironmentKeys, type ModelCategory, type PricingTier } from '../data/providerCatalog'
import { canQueryQuota, queryProviderQuota, type ProviderQuota } from '../lib/quota'

interface ModelCenterProps {
  open: boolean
  onClose: () => void
}

const categories: Array<ModelCategory | 'all'> = ['all', 'chat', 'image', 'video', 'audio', 'embedding', 'reranker', '3d']

export function ModelCenter({ open, onClose }: ModelCenterProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [category, setCategory] = useState<ModelCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const [pricing, setPricing] = useState<PricingTier | 'all'>('all')
  const [quotaByProvider, setQuotaByProvider] = useState<Record<string, ProviderQuota>>({})
  const [quotaLoading, setQuotaLoading] = useState<string>()
  const [quotaError, setQuotaError] = useState<Record<string, string>>({})

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const models = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return catalogModels.filter((model) =>
      (category === 'all' || model.category === category)
      && (pricing === 'all' || model.pricing === pricing)
      && (!needle || `${model.name} ${model.provider} ${model.apiModel}`.toLowerCase().includes(needle)),
    )
  }, [category, pricing, query])

  async function refreshQuota(providerId: string) {
    setQuotaLoading(providerId)
    setQuotaError((current) => ({ ...current, [providerId]: '' }))
    try {
      const result = await queryProviderQuota(providerId)
      setQuotaByProvider((current) => ({ ...current, [providerId]: result }))
    } catch (error) {
      setQuotaError((current) => ({ ...current, [providerId]: error instanceof Error ? error.message : '额度查询失败' }))
    } finally {
      setQuotaLoading(undefined)
    }
  }

  return <dialog ref={ref} className="model-center" onClose={onClose} aria-labelledby="model-center-title">
    <div className="model-center-head">
      <div><span>MODEL DIRECTORY</span><h2 id="model-center-title">模型中心</h2><p>{catalogModels.length} 个常用模型 · {new Set(catalogModels.map((model) => model.providerId)).size} 个平台</p></div>
      <button type="button" aria-label="关闭模型中心" onClick={onClose}><X /></button>
    </div>
    <div className="model-center-tools">
      <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型、平台或模型 ID" /></label>
      <select value={pricing} onChange={(event) => setPricing(event.target.value as PricingTier | 'all')} aria-label="费用类型">
        <option value="all">全部费用类型</option>
        {(Object.keys(pricingLabels) as PricingTier[]).map((value) => <option value={value} key={value}>{pricingLabels[value]}</option>)}
      </select>
    </div>
    <div className="model-category-tabs" role="tablist" aria-label="模型分类">
      {categories.map((value) => <button type="button" role="tab" aria-selected={category === value} className={category === value ? 'active' : ''} key={value} onClick={() => setCategory(value)}>{value === 'all' ? `全部 ${catalogModels.length}` : `${categoryLabels[value]} ${catalogModels.filter((model) => model.category === value).length}`}</button>)}
    </div>
    <div className="model-center-summary">
      <span><CheckCircle2 />绿色“已接入”可在创作工作台直接调用</span>
      <span><CircleDollarSign />额度是账户级动态数据，无法查询时会给出控制台入口</span>
    </div>
    <div className="catalog-grid">
      {models.map((model) => {
        const configured = configuredProviders[model.providerId]
        return <article className="catalog-card" key={model.id}>
          <div className="catalog-card-head"><div><span>{categoryLabels[model.category]}</span><h3>{model.name}</h3><p>{model.provider}</p></div><b className={`price-badge ${model.pricing}`}>{pricingLabels[model.pricing]}</b></div>
          <code>{model.apiModel}</code>
          <p className="catalog-description">{model.description}</p>
          <dl><div><dt>额度</dt><dd>{model.quota}</dd></div><div><dt>剩余额度</dt><dd>{quotaByProvider[model.providerId]?.summary ?? quotaError[model.providerId] ?? model.quotaLookup}{quotaByProvider[model.providerId]?.detail && <small>{quotaByProvider[model.providerId].detail}</small>}</dd></div></dl>
          <div className="catalog-state">
            <span className={model.integration === 'ready' ? 'ready' : ''}>{model.integration === 'ready' ? '已接入工作台' : '模型目录'}</span>
            <span className={configured ? 'configured' : ''}><KeyRound />{configured ? '密钥已配置' : `需 ${providerEnvironmentKeys[model.providerId]?.join(' + ') ?? 'API Key'}`}</span>
          </div>
          <div className="catalog-links">{canQueryQuota(model.providerId) && <button type="button" onClick={() => void refreshQuota(model.providerId)} disabled={quotaLoading === model.providerId}><RefreshCw className={quotaLoading === model.providerId ? 'spin-icon' : ''} />查询额度</button>}<a href={model.docsUrl} target="_blank" rel="noreferrer">API 文档<ExternalLink /></a><a href={model.keyUrl} target="_blank" rel="noreferrer">申请 Key<ExternalLink /></a></div>
        </article>
      })}
      {!models.length && <div className="catalog-empty">没有符合筛选条件的模型</div>}
    </div>
  </dialog>
}
