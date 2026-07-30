export interface ProviderCredentials {
  apiKey: string
  accountId?: string
}

export interface ProviderCredentialField {
  key: keyof ProviderCredentials
  label: string
  placeholder: string
  secret?: boolean
}

const storageKey = 'xiaoy-provider-credentials-v1'
const enabledCredentialProviders = new Set(['agnes', 'openrouter'])

const environmentCredentials: Record<string, ProviderCredentials> = {
  agnes: { apiKey: import.meta.env.VITE_AGNES_API_KEY ?? '' },
  openrouter: { apiKey: import.meta.env.VITE_OPENROUTER_API_KEY ?? '' },
}

const providersWithAccountId = new Set(['cloudflare', 'fireworks'])

function readSavedCredentials(): Record<string, ProviderCredentials> {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, ProviderCredentials>
    if (!saved || typeof saved !== 'object') return {}
    const retained = Object.fromEntries(
      Object.entries(saved).filter(([providerId]) => enabledCredentialProviders.has(providerId)),
    )
    if (Object.keys(retained).length !== Object.keys(saved).length) {
      localStorage.setItem(storageKey, JSON.stringify(retained))
    }
    return retained
  } catch {
    return {}
  }
}

export function getProviderCredentials(providerId: string): ProviderCredentials {
  const environment = environmentCredentials[providerId] ?? { apiKey: '' }
  const saved = readSavedCredentials()[providerId]
  if (!saved) return environment
  return {
    apiKey: saved.apiKey?.trim() || environment.apiKey,
    accountId: saved.accountId?.trim() || environment.accountId,
  }
}

export function getSavedProviderCredentials(providerId: string): ProviderCredentials {
  return readSavedCredentials()[providerId] ?? { apiKey: '' }
}

export function isProviderConfigured(providerId: string) {
  const credentials = getProviderCredentials(providerId)
  return Boolean(credentials.apiKey && (!providersWithAccountId.has(providerId) || credentials.accountId))
}

export function getProviderCredentialFields(providerId: string): ProviderCredentialField[] {
  const fields: ProviderCredentialField[] = [
    { key: 'apiKey', label: providerId === 'cloudflare' ? 'API Token' : 'API Key', placeholder: '粘贴服务商提供的密钥', secret: true },
  ]
  if (providersWithAccountId.has(providerId)) {
    fields.push({ key: 'accountId', label: 'Account ID', placeholder: '填写平台账户 ID' })
  }
  return fields
}

export function saveProviderCredentials(providerId: string, credentials: ProviderCredentials) {
  const saved = readSavedCredentials()
  const normalized = {
    apiKey: credentials.apiKey.trim(),
    accountId: credentials.accountId?.trim() || undefined,
  }
  if (!normalized.apiKey && !normalized.accountId) delete saved[providerId]
  else saved[providerId] = normalized
  localStorage.setItem(storageKey, JSON.stringify(saved))
  window.dispatchEvent(new CustomEvent('xiaoy-provider-credentials-changed', { detail: { providerId } }))
}

export function clearProviderCredentials(providerId: string) {
  const saved = readSavedCredentials()
  delete saved[providerId]
  localStorage.setItem(storageKey, JSON.stringify(saved))
  window.dispatchEvent(new CustomEvent('xiaoy-provider-credentials-changed', { detail: { providerId } }))
}

export function clearProviderCatalogCache() {
  localStorage.removeItem('xiaoy-provider-model-catalog-v3')
}
