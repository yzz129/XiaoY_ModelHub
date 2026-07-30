export interface ProviderQuota {
  summary: string
  detail?: string
}

import { getProviderCredentials } from './providerCredentials'

const queryableProviders = new Set(['openrouter', 'pollinations', 'elevenlabs'])

export function canQueryQuota(providerId: string) {
  return queryableProviders.has(providerId) && Boolean(getProviderCredentials(providerId).apiKey)
}

export async function queryProviderQuota(providerId: string): Promise<ProviderQuota> {
  const apiKey = getProviderCredentials(providerId).apiKey
  if (!apiKey) throw new Error('请先配置该平台 API Key')
  const response = await fetch('/__provider_quota', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: providerId, apiKey }),
  })
  const payload = await response.json().catch(() => ({})) as ProviderQuota & { error?: string }
  if (!response.ok) throw new Error(payload.error ?? '额度查询失败')
  return payload
}
