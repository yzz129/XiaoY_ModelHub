import { providerDefinitions } from '../data/providerCatalog'

export interface ProviderCredentials {
  apiKey: string
  accountId?: string
  mode?: 'tokenhub' | 'tencent-cloud'
  secretId?: string
  secretKey?: string
  region?: string
}

export interface ProviderCredentialField {
  key: keyof ProviderCredentials
  label: string
  placeholder: string
  secret?: boolean
}

const legacyStorageKey = 'xiaoy-provider-credentials-v1'
const enabledCredentialProviders = new Set(providerDefinitions.map((provider) => provider.id))
const configuredProviders = new Set<string>()
const personallyConfiguredProviders = new Set<string>()
const providersWithAccountId = new Set(['cloudflare', 'fireworks'])
const providerAuthModes = new Map<string, ProviderCredentials['mode']>()

export function applyProviderConfigurationStatus(providerIds: string[], personalProviderIds: string[] = [], authModes: Record<string, ProviderCredentials['mode']> = {}) {
  const nextConfigured = new Set(providerIds.filter((providerId) => enabledCredentialProviders.has(providerId)))
  const nextPersonal = new Set(personalProviderIds.filter((providerId) => enabledCredentialProviders.has(providerId)))
  const nextModes = new Map(Object.entries(authModes).filter(([providerId, mode]) => enabledCredentialProviders.has(providerId) && mode))
  const unchanged = configuredProviders.size === nextConfigured.size
    && personallyConfiguredProviders.size === nextPersonal.size
    && providerAuthModes.size === nextModes.size
    && [...nextConfigured].every((providerId) => configuredProviders.has(providerId))
    && [...nextPersonal].every((providerId) => personallyConfiguredProviders.has(providerId))
    && [...nextModes].every(([providerId, mode]) => providerAuthModes.get(providerId) === mode)
  configuredProviders.clear()
  personallyConfiguredProviders.clear()
  providerAuthModes.clear()
  for (const providerId of nextConfigured) configuredProviders.add(providerId)
  for (const providerId of nextPersonal) personallyConfiguredProviders.add(providerId)
  for (const [providerId, mode] of nextModes) providerAuthModes.set(providerId, mode)
  if (!unchanged) window.dispatchEvent(new CustomEvent('xiaoy-provider-credentials-changed', { detail: { providerId: 'all' } }))
}

export function setProviderConfigurationStatus(providerId: string, configured: boolean) {
  if (configured) configuredProviders.add(providerId)
  else configuredProviders.delete(providerId)
  window.dispatchEvent(new CustomEvent('xiaoy-provider-credentials-changed', { detail: { providerId } }))
}

export function isProviderConfigured(providerId: string) {
  return configuredProviders.has(providerId)
}

export function isProviderPersonallyConfigured(providerId: string) {
  return personallyConfiguredProviders.has(providerId)
}

export function getProviderAuthMode(providerId: string): ProviderCredentials['mode'] {
  return providerAuthModes.get(providerId) ?? 'tokenhub'
}

export function getProviderCredentialFields(providerId: string): ProviderCredentialField[] {
  if (providerId === 'tencent') return []
  const fields: ProviderCredentialField[] = [
    { key: 'apiKey', label: providerId === 'cloudflare' ? 'API Token' : 'API Key', placeholder: '输入后将直接加密保存到服务端', secret: true },
  ]
  if (providersWithAccountId.has(providerId)) {
    fields.push({ key: 'accountId', label: 'Account ID', placeholder: '填写平台账户 ID' })
  }
  return fields
}

export function clearLegacyBrowserCredentials() {
  localStorage.removeItem(legacyStorageKey)
}

export function clearProviderCatalogCache() {
  localStorage.removeItem('xiaoy-provider-model-catalog-v3')
  localStorage.removeItem('xiaoy-provider-model-catalog-v4')
  localStorage.removeItem('xiaoy-provider-model-catalog-v5')
  localStorage.removeItem('xiaoy-provider-model-catalog-v6')
  localStorage.removeItem('xiaoy-provider-model-catalog-v7')
  localStorage.removeItem('xiaoy-provider-model-catalog-v8')
  window.dispatchEvent(new Event('xiaoy:provider-catalog-invalidated'))
}
