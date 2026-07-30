import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Eye, EyeOff, KeyRound, Save, Trash2, X } from 'lucide-react'
import { imageModels, videoModels } from '../data/models'
import { catalogModels, providerDefinitions } from '../data/providerCatalog'
import { deleteAccountCredential, getAccountCredentials, saveAccountCredential } from '../lib/account'
import {
  applyProviderConfigurationStatus,
  clearProviderCatalogCache,
  getProviderCredentialFields,
  isProviderConfigured,
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
  const [saving, setSaving] = useState(false)
  const configuredCount = providerDefinitions.filter((provider) => isProviderConfigured(provider.id)).length
  const provider = providerDefinitions.find((item) => item.id === providerId) ?? providerDefinitions[0]
  const fields = getProviderCredentialFields(provider.id)

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
    setCredentials({ apiKey: '' })
    setSavedMessage('')
    setShowSecret(false)
  }

  async function save() {
    setSaving(true)
    setSavedMessage('')
    try {
      await saveAccountCredential(providerId, credentials)
      const status = await getAccountCredentials()
      applyProviderConfigurationStatus(status.configuredProviders)
      clearProviderCatalogCache()
      setCredentials({ apiKey: '' })
      setSavedMessage(`${provider.name} API Key 已加密保存到后端，浏览器未保留副本`)
      onCredentialsChange?.(providerId)
    } catch (error) {
      setSavedMessage(error instanceof Error ? error.message : 'API Key 保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function clear() {
    setSaving(true)
    setSavedMessage('')
    try {
      await deleteAccountCredential(providerId)
      const status = await getAccountCredentials()
      applyProviderConfigurationStatus(status.configuredProviders)
      clearProviderCatalogCache()
      setCredentials({ apiKey: '' })
      setSavedMessage(`已清除 ${provider.name} 的个人凭据`)
      onCredentialsChange?.(providerId)
    } catch (error) {
      setSavedMessage(error instanceof Error ? error.message : 'API Key 清除失败')
    } finally {
      setSaving(false)
    }
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
              <span>{field.label}<small>服务端加密保存</small></span>
              <div>
                <input
                  type={field.secret && !showSecret ? 'password' : 'text'}
                  value={credentials[field.key] ?? ''}
                  placeholder={isProviderConfigured(provider.id) ? '已在后端配置；输入新值可覆盖' : field.placeholder}
                  autoComplete="off"
                  onChange={(event) => setCredentials((current) => ({ ...current, [field.key]: event.target.value }))}
                />
                {field.secret && <button type="button" aria-label={showSecret ? '隐藏 API Key' : '显示 API Key'} onClick={() => setShowSecret((current) => !current)}>{showSecret ? <EyeOff /> : <Eye />}</button>}
              </div>
            </label>
          ))}
          <div className="credential-actions">
            <button type="button" className="credential-save" disabled={saving || !credentials.apiKey.trim()} onClick={() => void save()}><Save />{saving ? '保存中…' : '保存到后端'}</button>
            <button type="button" disabled={saving} onClick={() => void clear()}><Trash2 />清除个人 Key</button>
            <a href={provider.keyUrl} target="_blank" rel="noreferrer">注册 / 申请 Key</a>
          </div>
          {savedMessage && <p className="credential-message" role="status">{savedMessage}</p>}
        </section>

        <dl className="model-list"><div><dt>语言模型</dt><dd>{catalogModels.filter((model) => model.category === 'chat').length} 个免费模型</dd></div><div><dt>图片模型</dt><dd>{imageModels.length} 个 Agnes 免费模型</dd></div><div><dt>视频模型</dt><dd>{videoModels.length} 个 Agnes 免费模型</dd></div></dl>
        <div className="concurrency-row"><div><strong>视频最高并发</strong><p>同时提交并等待的视频任务数。</p></div><div className="concurrency-options" aria-label="视频最高并发数">{[1, 2, 3, 4].map((value) => <button type="button" key={value} aria-pressed={maxVideoConcurrency === value} className={maxVideoConcurrency === value ? 'active' : ''} onClick={() => onVideoConcurrencyChange(value)}>{value}</button>)}</div></div>
        <div className="concurrency-row"><div><strong>3D 最高并发</strong><p>同时提交并等待的图片转 3D 任务数。</p></div><div className="concurrency-options" aria-label="3D 最高并发数">{[1, 2, 3, 4].map((value) => <button type="button" key={value} aria-pressed={maxThreeDConcurrency === value} className={maxThreeDConcurrency === value ? 'active' : ''} onClick={() => onThreeDConcurrencyChange(value)}>{value}</button>)}</div></div>
        <div className="warning-card"><AlertTriangle size={18} /><p><strong>凭据安全</strong>个人 Key 会在服务端加密后保存，并仅用于当前账号调用模型；管理员可在后台按需查看和管理。</p></div>
        <div className="storage-row"><div><strong>本地创作历史</strong><p>生成记录不设数量上限，将一直保留到你手动清空。</p></div><button type="button" onClick={() => { if (window.confirm('确定清空当前浏览器中的全部创作历史吗？')) onClearHistory() }}><Trash2 size={16} /> 清空历史</button></div>
      </div>
      <button type="button" className="dialog-done" onClick={onClose}>完成</button>
    </dialog>
  )
}
