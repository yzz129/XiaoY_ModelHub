import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Plus, Save, Trash2 } from 'lucide-react'
import {
  categoryLabels,
  pricingLabels,
  providerDefinitions,
  type ModelCategory,
  type PricingTier,
} from '../data/providerCatalog'
import {
  createAdminCustomModel,
  deleteAdminCustomModel,
  deleteGlobalCredential,
  getAdminCredentials,
  getAdminCustomModels,
  saveGlobalCredential,
  setAdminCustomModelEnabled,
  type AdminCredential,
  type AdminCustomModel,
  type CustomModelInput,
} from '../lib/account'

interface AdminConfigurationProps {
  mode: 'keys' | 'models'
}

const emptyModel = (): CustomModelInput => ({
  providerId: 'openrouter',
  providerName: 'OpenRouter',
  apiModel: '',
  name: '',
  category: 'chat',
  pricing: 'variable',
  description: '',
  docsUrl: 'https://openrouter.ai/docs',
  keyUrl: 'https://openrouter.ai/settings/keys',
})

function dateTime(value?: number) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—'
}

export function AdminConfiguration({ mode }: AdminConfigurationProps) {
  const [personal, setPersonal] = useState<AdminCredential[]>([])
  const [global, setGlobal] = useState<AdminCredential[]>([])
  const [models, setModels] = useState<AdminCustomModel[]>([])
  const [providerId, setProviderId] = useState('openrouter')
  const [apiKey, setApiKey] = useState('')
  const [accountId, setAccountId] = useState('')
  const [model, setModel] = useState<CustomModelInput>(emptyModel)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const provider = useMemo(
    () => providerDefinitions.find((item) => item.id === providerId) ?? providerDefinitions[0],
    [providerId],
  )

  async function refresh() {
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'keys') {
        const result = await getAdminCredentials()
        setPersonal(result.personal)
        setGlobal(result.global)
      } else {
        setModels((await getAdminCustomModels()).models)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '配置数据加载失败')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let active = true
    const request = mode === 'keys'
      ? getAdminCredentials().then((result) => {
          if (!active) return
          setPersonal(result.personal)
          setGlobal(result.global)
        })
      : getAdminCustomModels().then((result) => {
          if (active) setModels(result.models)
        })
    request.catch((error) => {
      if (active) setMessage(error instanceof Error ? error.message : '配置数据加载失败')
    })
    return () => { active = false }
  }, [mode])

  async function submitGlobalKey() {
    setBusy(true)
    setMessage('')
    try {
      await saveGlobalCredential(providerId, { apiKey, accountId })
      setApiKey('')
      setAccountId('')
      setMessage(`${provider.name} 全局 Key 已加密保存`)
      const result = await getAdminCredentials()
      setPersonal(result.personal)
      setGlobal(result.global)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '全局 Key 保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function removeGlobal(item: AdminCredential) {
    if (!window.confirm(`确定删除 ${item.providerId} 的全局 API Key 吗？`)) return
    await deleteGlobalCredential(item.providerId)
    await refresh()
  }

  function selectModelProvider(nextProviderId: string) {
    const nextProvider = providerDefinitions.find((item) => item.id === nextProviderId) ?? providerDefinitions[0]
    setModel((current) => ({
      ...current,
      providerId: nextProvider.id,
      providerName: nextProvider.name,
      docsUrl: nextProvider.docsUrl,
      keyUrl: nextProvider.keyUrl,
    }))
  }

  async function submitModel() {
    setBusy(true)
    setMessage('')
    try {
      await createAdminCustomModel(model)
      setModel(emptyModel())
      setMessage('自定义模型已添加到模型广场')
      setModels((await getAdminCustomModels()).models)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '模型添加失败')
    } finally {
      setBusy(false)
    }
  }

  async function toggleModel(item: AdminCustomModel) {
    await setAdminCustomModelEnabled(item.databaseId, !item.enabled)
    await refresh()
  }

  async function removeModel(item: AdminCustomModel) {
    if (!window.confirm(`确定删除模型 ${item.name} 吗？`)) return
    await deleteAdminCustomModel(item.databaseId)
    await refresh()
  }

  if (mode === 'keys') {
    return <div className="admin-config-page">
      <section className="admin-config-card">
        <header><div><KeyRound /><span><h2>添加全局 API Key</h2><p>普通用户没有个人 Key 时，服务端会自动使用这里的全局 Key。</p></span></div></header>
        <div className="admin-config-form key-form">
          <label><span>服务商</span><select value={providerId} onChange={(event) => setProviderId(event.target.value)}>{providerDefinitions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label><span>API Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="输入全局 API Key" autoComplete="off" /></label>
          <label><span>Account ID（可选）</span><input value={accountId} onChange={(event) => setAccountId(event.target.value)} placeholder="Cloudflare / Fireworks 等平台需要" /></label>
          <button disabled={busy || !apiKey.trim()} onClick={() => void submitGlobalKey()}><Save />保存全局 Key</button>
        </div>
      </section>
      {message && <p className="admin-config-message" role="status">{message}</p>}
      <section className="admin-config-card">
        <header><div><KeyRound /><span><h2>全局凭据</h2><p>后台统一提供给所有用户的服务商密钥。</p></span></div><b>{global.length}</b></header>
        <CredentialTable items={global} onDelete={removeGlobal} />
      </section>
      <section className="admin-config-card">
        <header><div><KeyRound /><span><h2>用户个人凭据</h2><p>仅显示遮罩和配置状态，完整 Key 永不下发到浏览器。</p></span></div><b>{personal.length}</b></header>
        <CredentialTable items={personal} />
      </section>
    </div>
  }

  return <div className="admin-config-page">
    <section className="admin-config-card">
      <header><div><Plus /><span><h2>添加模型</h2><p>保存后会立即加入所有用户的模型广场。</p></span></div></header>
      <div className="admin-config-form model-form">
        <label><span>服务商</span><select value={model.providerId} onChange={(event) => selectModelProvider(event.target.value)}>{providerDefinitions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label><span>模型名称</span><input value={model.name} onChange={(event) => setModel((current) => ({ ...current, name: event.target.value }))} placeholder="例如 GPT-5 Mini" /></label>
        <label><span>模型 API ID</span><input value={model.apiModel} onChange={(event) => setModel((current) => ({ ...current, apiModel: event.target.value }))} placeholder="服务商实际调用 ID" /></label>
        <label><span>分类</span><select value={model.category} onChange={(event) => setModel((current) => ({ ...current, category: event.target.value as ModelCategory }))}>{Object.entries(categoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>费用类型</span><select value={model.pricing} onChange={(event) => setModel((current) => ({ ...current, pricing: event.target.value as PricingTier }))}>{Object.entries(pricingLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="wide"><span>模型介绍</span><textarea value={model.description} onChange={(event) => setModel((current) => ({ ...current, description: event.target.value }))} placeholder="模型能力、场景或限制" /></label>
        <button disabled={busy || !model.name.trim() || !model.apiModel.trim()} onClick={() => void submitModel()}><Plus />添加模型</button>
      </div>
    </section>
    {message && <p className="admin-config-message" role="status">{message}</p>}
    <section className="admin-config-card">
      <header><div><Plus /><span><h2>后台模型</h2><p>可停用或删除管理员添加的模型。</p></span></div><b>{models.length}</b></header>
      <div className="admin-table"><table><thead><tr><th>模型</th><th>服务商</th><th>分类</th><th>费用</th><th>状态</th><th>更新时间</th><th /></tr></thead><tbody>
        {models.map((item) => <tr key={item.databaseId}><td><strong>{item.name}</strong><small>{item.apiModel}</small></td><td>{item.provider}</td><td>{categoryLabels[item.category]}</td><td>{pricingLabels[item.pricing]}</td><td><button className={`status-toggle ${item.enabled ? 'enabled' : ''}`} onClick={() => void toggleModel(item)}>{item.enabled ? '已上架' : '已停用'}</button></td><td>{dateTime(item.updatedAt)}</td><td><button className="icon-danger" onClick={() => void removeModel(item)}><Trash2 /></button></td></tr>)}
      </tbody></table></div>
    </section>
  </div>
}

function CredentialTable({
  items,
  onDelete,
}: {
  items: AdminCredential[]
  onDelete?: (item: AdminCredential) => void
}) {
  return <div className="admin-table"><table><thead><tr><th>服务商</th><th>用户</th><th>API Key</th><th>Account ID</th><th>更新时间</th><th /></tr></thead><tbody>
    {items.map((item) => <tr key={item.id}><td><strong>{item.providerId}</strong><small>{item.scope === 'global' ? '全局' : '个人'}</small></td><td><strong>{item.displayName || '全部用户'}</strong><small>{item.email || '全局后备凭据'}</small></td><td><code>{item.maskedApiKey}</code></td><td>{item.accountId || '—'}</td><td>{dateTime(item.updatedAt)}</td><td><div className="table-actions">{onDelete && <button className="icon-danger" title="删除" onClick={() => void onDelete(item)}><Trash2 /></button>}</div></td></tr>)}
  </tbody></table></div>
}
