import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Eye, EyeOff, KeyRound, Save, Trash2, X } from 'lucide-react'
import { imageModels, videoModels } from '../data/models'
import { catalogModels, providerDefinitions } from '../data/providerCatalog'
import { deleteAccountCredential, getAccountCredentials, saveAccountCredential } from '../lib/account'
import {
  applyProviderConfigurationStatus,
  clearProviderCatalogCache,
  getProviderCredentialFields,
  getProviderAuthMode,
  isProviderConfigured,
  isProviderPersonallyConfigured,
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
  const configuredCount = providerDefinitions.filter((provider) => isProviderPersonallyConfigured(provider.id)).length
  const provider = providerDefinitions.find((item) => item.id === providerId) ?? providerDefinitions[0]
  const personallyConfigured = isProviderPersonallyConfigured(provider.id)
  const globallyAvailable = isProviderConfigured(provider.id)
  const fields = getProviderCredentialFields(provider.id)
  const isTencentCloud = provider.id === 'tencent' && credentials.mode === 'tencent-cloud'
  const credentialReady = provider.id === 'tencent'
    ? (isTencentCloud ? Boolean(credentials.secretId?.trim() && credentials.secretKey?.trim()) : Boolean(credentials.apiKey.trim()))
    : Boolean(credentials.apiKey.trim())

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
    setCredentials(nextProviderId === 'tencent'
      ? { apiKey: '', mode: getProviderAuthMode(nextProviderId), region: 'ap-guangzhou' }
      : { apiKey: '' })
    setSavedMessage('')
    setShowSecret(false)
  }

  async function save() {
    if (!credentialReady) {
      setSavedMessage('请完整填写凭据')
      return
    }
    setSaving(true)
    setSavedMessage('')
    try {
      await saveAccountCredential(providerId, credentials)
      const status = await getAccountCredentials()
      applyProviderConfigurationStatus(status.configuredProviders, status.personalProviders, status.authModes ?? {})
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
      applyProviderConfigurationStatus(status.configuredProviders, status.personalProviders, status.authModes ?? {})
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
          <div><strong>{configuredCount ? `已配置 ${configuredCount} 个个人服务平台` : '尚未配置个人 API Key'}</strong><p>完全免费模型可使用平台公共凭据；其他模型必须使用你的个人 Key。</p></div>
        </div>

        <section className="credential-manager" aria-labelledby="credential-title">
          <div className="credential-head">
            <div><strong id="credential-title">服务商凭据</strong><p>选择模型平台并保存自己的 API Key。</p></div>
            <span className={personallyConfigured ? 'configured' : ''}>{personallyConfigured ? '个人 Key 已配置' : globallyAvailable ? '仅免费模型可用' : '未配置'}</span>
          </div>
          <label className="credential-provider">
            <span>服务平台</span>
            <select value={providerId} onChange={(event) => selectProvider(event.target.value)}>
              {providerDefinitions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>
          {provider.id === 'tencent' && <>
            <label className="credential-field"><span>接入方式<small>二选一</small></span><select value={credentials.mode ?? 'tokenhub'} onChange={(event) => setCredentials((current) => ({ ...current, mode: event.target.value as ProviderCredentials['mode'], apiKey: '', secretId: '', secretKey: '' }))}><option value="tokenhub">TokenHub API Key</option><option value="tencent-cloud">腾讯云 SecretId SecretKey</option></select></label>
            {isTencentCloud ? <>
              <label className="credential-field"><span>SecretId<small>服务端加密保存</small></span><div><input value={credentials.secretId ?? ''} onChange={(event) => setCredentials((current) => ({ ...current, secretId: event.target.value }))} placeholder="输入腾讯云 SecretId" autoComplete="off" /></div></label>
              <label className="credential-field"><span>SecretKey<small>服务端加密保存</small></span><div><input type={showSecret ? 'text' : 'password'} value={credentials.secretKey ?? ''} onChange={(event) => setCredentials((current) => ({ ...current, apiKey: event.target.value, secretKey: event.target.value }))} placeholder="输入腾讯云 SecretKey" autoComplete="off" /><button type="button" aria-label="切换 SecretKey 显示" onClick={() => setShowSecret((current) => !current)}>{showSecret ? <EyeOff /> : <Eye />}</button></div></label>
              <label className="credential-field"><span>Region<small>默认 ap-guangzhou</small></span><div><input value={credentials.region ?? 'ap-guangzhou'} onChange={(event) => setCredentials((current) => ({ ...current, region: event.target.value }))} placeholder="ap-guangzhou" autoComplete="off" /></div></label>
            </> : <label className="credential-field"><span>API Key<small>服务端加密保存</small></span><div><input type={showSecret ? 'text' : 'password'} value={credentials.apiKey} onChange={(event) => setCredentials((current) => ({ ...current, apiKey: event.target.value }))} placeholder="输入 TokenHub API Key" autoComplete="off" /><button type="button" aria-label="切换 API Key 显示" onClick={() => setShowSecret((current) => !current)}>{showSecret ? <EyeOff /> : <Eye />}</button></div></label>}
          </>}
          {fields.map((field) => (
            <label className="credential-field" key={field.key}>
              <span>{field.label}<small>服务端加密保存</small></span>
              <div>
                <input
                  type={field.secret && !showSecret ? 'password' : 'text'}
                  value={credentials[field.key] ?? ''}
                  placeholder={personallyConfigured ? '个人 Key 已保存；输入新值可覆盖' : field.placeholder}
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

        <dl className="model-list"><div><dt>语言模型</dt><dd>{catalogModels.filter((model) => model.category === 'chat' && model.pricing === 'free').length} 个完全免费模型</dd></div><div><dt>图片模型</dt><dd>{imageModels.filter((model) => model.pricing === 'free').length} 个完全免费模型</dd></div><div><dt>视频模型</dt><dd>{videoModels.filter((model) => model.pricing === 'free').length} 个完全免费模型</dd></div></dl>
        <div className="concurrency-row"><div><strong>视频最高并发</strong><p>同时提交并等待的视频任务数。</p></div><div className="concurrency-options" aria-label="视频最高并发数">{[1, 2, 3, 4].map((value) => <button type="button" key={value} aria-pressed={maxVideoConcurrency === value} className={maxVideoConcurrency === value ? 'active' : ''} onClick={() => onVideoConcurrencyChange(value)}>{value}</button>)}</div></div>
        <div className="concurrency-row"><div><strong>3D 最高并发</strong><p>同时提交并等待的图片转 3D 任务数。</p></div><div className="concurrency-options" aria-label="3D 最高并发数">{[1, 2, 3, 4].map((value) => <button type="button" key={value} aria-pressed={maxThreeDConcurrency === value} className={maxThreeDConcurrency === value ? 'active' : ''} onClick={() => onThreeDConcurrencyChange(value)}>{value}</button>)}</div></div>
        <div className="warning-card"><AlertTriangle size={18} /><p><strong>凭据安全</strong>个人 Key 会在服务端加密后保存，并仅用于当前账号调用模型；管理员可在后台按需查看和管理。</p></div>
        <div className="storage-row"><div><strong>本地创作历史</strong><p>生成记录不设数量上限，将一直保留到你手动清空。</p></div><button type="button" onClick={() => { if (window.confirm('确定清空当前浏览器中的全部创作历史吗？')) onClearHistory() }}><Trash2 size={16} /> 清空历史</button></div>
      </div>
      <button type="button" className="dialog-done" onClick={onClose}>完成</button>
    </dialog>
  )
}
