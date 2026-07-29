export interface ProviderQuota {
  summary: string
  detail?: string
}

const quotaKeys: Record<string, string> = {
  openrouter: import.meta.env.VITE_OPENROUTER_API_KEY ?? '',
  elevenlabs: import.meta.env.VITE_ELEVENLABS_API_KEY ?? '',
}

export function canQueryQuota(providerId: string) {
  return Boolean(quotaKeys[providerId])
}

export async function queryProviderQuota(providerId: string): Promise<ProviderQuota> {
  const apiKey = quotaKeys[providerId]
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
