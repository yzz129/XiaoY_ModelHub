import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Eye, EyeOff, KeyRound, Save, Trash2, X } from 'lucide-react'
import { imageModels, videoModels } from '../data/models'
import { catalogModels, providerDefinitions, providerEnvironmentKeys } from '../data/providerCatalog'
import {
  clearProviderCatalogCache,
  clearProviderCredentials,
  getProviderCredentialFields,
  getSavedProviderCredentials,
  isProviderConfigured,
  saveProviderCredentials,
  type ProviderCredentials,
} from '../lib/providerCredentials'

interface SettingsDialogProps {
  open: boolean
  selectedProviderId?: string
  maxVideoConcurrency: number
  maxThreeDConcurrency: number
  onVideoConcurrencyChange: (value: number) => void
  onThreeDConcurrencyChange: (value: number) => void
  onCredentialsChange?: (providerId: string) => void
  onClose: () => void
  onClearHistory: () => void
}

export function SettingsDialog({
  open,
  selectedProviderId,
  maxVideoConcurrency,
  maxThreeDConcurrency,
  onVideoConcurrencyChange,
  onThreeDConcurrencyChange,
  onCredentialsChange,
  onClose,
  onClearHistory,
}: SettingsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const initialProviderId = providerDefinitions.some((provider) => provider.id === selectedProviderId) ? selectedProviderId! : 'agnes'
  const [providerId, setProviderId] = useState(initialProviderId)
  const [credentials, setCredentials] = useState<ProviderCredentials>({ apiKey: '' })
  const [showSecret, setShowSecret] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')
  const configuredCount = providerDefinitions.filter((provider) => isProviderConfigured(provider.id)).length
  const provider = providerDefinitions.find((item) => item.id === providerId) ?? providerDefinitions[0]
  const fields = getProviderCredentialFields(provider.id)
  const environmentConfigured = isProviderConfigured(provider.id) && !getSavedProviderCredentials(provider.id).apiKey

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      const nextProviderId = providerDefinitions.some((provider) => provider.id === selectedProviderId) ? selectedProviderId! : 'agnes'
      selectProvider(nextProviderId)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open, selectedProviderId])

  function selectProvider(nextProviderId: string) {
    setProviderId(nextProviderId)
    setCredentials(getSavedProviderCredentials(nextProviderId))
    setSavedMessage('')
    setShowSecret(false)
  }

  function save() {
    saveProviderCredentials(providerId, credentials)
    clearProviderCatalogCache()
    setSavedMessage(isProviderConfigured(providerId) ? `${provider.name} API Key 已保存在当前浏览器` : '已清除本地覆盖，将继续使用环境变量配置')
    onCredentialsChange?.(providerId)
  }

  function clear() {
    clearProviderCredentials(providerId)
    clearProviderCatalogCache()
    setCredentials({ apiKey: '' })
    setSavedMessage(`已清除 ${provider.name} 的浏览器本地凭据`)
    onCredentialsChange?.(providerId)
  }

  return (
    <dialog ref={ref} className="settings-dialog" onClose={onClose} aria-labelledby="settings-title">
      <div className="dialog-head"><div><span>WORKSPACE</span><h2 id="settings-title">API 与工作台设置</h2></div><button type="button" aria-label="关闭设置" onClick={onClose}><X /></button></div>
      <div className="settings-scroll">
        <div className="connection-card">
          <div className={configuredCount ? 'status-dot online' : 'status-dot'}><KeyRound size={19} /></div>
          <div><strong>{configuredCount ? `已配置 ${configuredCount} 个免费服务平台` : '尚未配置 API Key'}</strong><p>当前仅保留 Agnes AI 与 OpenRouter 的免费模型。</p></div>
        </div>

        <section className="credential-manager" aria-labelledby="credential-title">
          <div className="credential-head">
            <div><strong id="credential-title">服务商凭据</strong><p>选择模型平台并保存自己的 API Key。</p></div>
            <span className={isProviderConfigured(provider.id) ? 'configured' : ''}>{isProviderConfigured(provider.id) ? '已配置' : '未配置'}</span>
          </div>
          <label className="credential-provider">
            <span>服务平台</span>
            <select value={providerId} onChange={(event) => selectProvider(event.target.value)}>
              {providerDefinitions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>
          {fields.map((field) => (
            <label className="credential-field" key={field.key}>
              <span>{field.label}<small>{providerEnvironmentKeys[provider.id]?.[field.key === 'accountId' ? 1 : 0]}</small></span>
              <div>
                <input
                  type={field.secret && !showSecret ? 'password' : 'text'}
                  value={credentials[field.key] ?? ''}
                  placeholder={environmentConfigured ? '已由环境变量配置；填写可在本浏览器覆盖' : field.placeholder}
                  autoComplete="off"
                  onChange={(event) => setCredentials((current) => ({ ...current, [field.key]: event.target.value }))}
                />
                {field.secret && <button type="button" aria-label={showSecret ? '隐藏 API Key' : '显示 API Key'} onClick={() => setShowSecret((current) => !current)}>{showSecret ? <EyeOff /> : <Eye />}</button>}
              </div>
            </label>
          ))}
          <div className="credential-actions">
            <button type="button" className="credential-save" onClick={save}><Save />保存 Key</button>
            <button type="button" onClick={clear}><Trash2 />清除本地 Key</button>
            <a href={provider.keyUrl} target="_blank" rel="noreferrer">注册 / 申请 Key</a>
          </div>
          {savedMessage && <p className="credential-message" role="status">{savedMessage}</p>}
        </section>

        <dl className="model-list"><div><dt>语言模型</dt><dd>{catalogModels.filter((model) => model.category === 'chat').length} 个免费模型</dd></div><div><dt>图片模型</dt><dd>{imageModels.length} 个 Agnes 免费模型</dd></div><div><dt>视频模型</dt><dd>{videoModels.length} 个 Agnes 免费模型</dd></div></dl>
        <div className="concurrency-row"><div><strong>视频最高并发</strong><p>同时提交并等待的视频任务数。</p></div><div className="concurrency-options" aria-label="视频最高并发数">{[1, 2, 3, 4].map((value) => <button type="button" key={value} aria-pressed={maxVideoConcurrency === value} className={maxVideoConcurrency === value ? 'active' : ''} onClick={() => onVideoConcurrencyChange(value)}>{value}</button>)}</div></div>
        <div className="concurrency-row"><div><strong>3D 最高并发</strong><p>同时提交并等待的图片转 3D 任务数。</p></div><div className="concurrency-options" aria-label="3D 最高并发数">{[1, 2, 3, 4].map((value) => <button type="button" key={value} aria-pressed={maxThreeDConcurrency === value} className={maxThreeDConcurrency === value ? 'active' : ''} onClick={() => onThreeDConcurrencyChange(value)}>{value}</button>)}</div></div>
        <div className="warning-card"><AlertTriangle size={18} /><p><strong>仅适合个人本地使用</strong>浏览器保存的 Key 位于 localStorage，环境变量也会进入前端构建产物。公开部署时应改为服务端加密保存与代理调用。</p></div>
        <div className="storage-row"><div><strong>本地创作历史</strong><p>最多保留 24 条记录，远端资源链接可能过期。</p></div><button type="button" onClick={() => { if (window.confirm('确定清空当前浏览器中的全部创作历史吗？')) onClearHistory() }}><Trash2 size={16} /> 清空历史</button></div>
      </div>
      <button type="button" className="dialog-done" onClick={onClose}>完成</button>
    </dialog>
  )
}
