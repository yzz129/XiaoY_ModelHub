import type { CatalogModel } from '../data/providerCatalog'
import type { ProviderCredentials } from './providerCredentials'

export interface AccountUser {
  id: string
  email: string
  displayName: string
  role: 'user' | 'admin'
  createdAt: number
  lastLoginAt?: number
}

export interface ActivityPayload {
  clientEventId: string
  type: 'chat' | 'image' | 'video' | 'audio' | 'transcription' | '3d' | 'model_select'
  modelId?: string
  provider?: string
  inputText?: string
  outputText?: string
  mediaUrl?: string
  metadata?: Record<string, unknown>
  status?: 'success' | 'failed'
  createdAt?: number
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  })
  const payload = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`)
  return payload
}

export async function getCurrentAccount() {
  return requestJson<{ user: AccountUser }>('/api/auth/me')
}

export async function loginAccount(email: string, password: string) {
  return requestJson<{ user: AccountUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function registerAccount(displayName: string, email: string, password: string) {
  return requestJson<{ user: AccountUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ displayName, email, password }),
  })
}

export async function logoutAccount() {
  await requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
}

export async function updateAccountProfile(displayName: string, email: string) {
  return requestJson<{ user: AccountUser }>('/api/account/profile', {
    method: 'PUT',
    body: JSON.stringify({ displayName, email }),
  })
}

export async function logActivity(payload: ActivityPayload) {
  try {
    await requestJson<{ id: string }>('/api/activity', {
      method: 'POST',
      body: JSON.stringify(payload),
      keepalive: true,
    })
  } catch {
    // Activity logging must never interrupt a generation or conversation result.
  }
}

export interface AccountCredential {
  providerId: string
  maskedApiKey: string
  accountIdConfigured: boolean
  updatedAt: number
}

export async function getAccountCredentials() {
  return requestJson<{ credentials: AccountCredential[], configuredProviders: string[] }>('/api/credentials')
}

export async function saveAccountCredential(providerId: string, credentials: ProviderCredentials) {
  return requestJson<{ providerId: string, updatedAt: number }>(`/api/credentials/${encodeURIComponent(providerId)}`, {
    method: 'PUT',
    body: JSON.stringify(credentials),
  })
}

export async function deleteAccountCredential(providerId: string) {
  return requestJson<{ ok: boolean }>(`/api/credentials/${encodeURIComponent(providerId)}`, {
    method: 'DELETE',
  })
}

export async function getCustomCatalogModels() {
  return requestJson<{ models: CatalogModel[] }>('/api/catalog/custom-models')
}

export async function getAdminOverview() {
  return requestJson<{
    totalUsers: number
    activeUsers24h: number
    totalRecords: number
    byType: Array<{ type: string, count: number }>
    latest: AdminRecord[]
  }>('/api/admin/overview')
}

export async function getAdminUsers(query = '') {
  return requestJson<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(query)}`)
}

export async function getAdminRecords(filters: { type?: string, userId?: string, query?: string } = {}) {
  const params = new URLSearchParams()
  if (filters.type) params.set('type', filters.type)
  if (filters.userId) params.set('userId', filters.userId)
  if (filters.query) params.set('q', filters.query)
  return requestJson<{ records: AdminRecord[] }>(`/api/admin/records?${params}`)
}

export interface AdminCredential {
  id: string
  scope: 'personal' | 'global'
  providerId: string
  userId?: string
  email?: string
  displayName?: string
  maskedApiKey: string
  accountId?: string
  updatedAt: number
}

export interface AdminCustomModel extends CatalogModel {
  databaseId: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface CustomModelInput {
  providerId: string
  providerName: string
  apiModel: string
  name: string
  category: CatalogModel['category']
  pricing: CatalogModel['pricing']
  description?: string
  docsUrl?: string
  keyUrl?: string
}

export async function getAdminCredentials() {
  return requestJson<{ personal: AdminCredential[], global: AdminCredential[] }>('/api/admin/credentials')
}

export async function getAdminCredentialSecret(scope: AdminCredential['scope'], id: string) {
  return requestJson<{ apiKey: string }>(
    `/api/admin/credentials/${encodeURIComponent(scope)}/${encodeURIComponent(id)}/secret`,
  )
}

export async function saveGlobalCredential(providerId: string, credentials: ProviderCredentials) {
  return requestJson<{ providerId: string, updatedAt: number }>(`/api/admin/global-credentials/${encodeURIComponent(providerId)}`, {
    method: 'PUT',
    body: JSON.stringify(credentials),
  })
}

export async function deleteGlobalCredential(providerId: string) {
  return requestJson<{ ok: boolean }>(`/api/admin/global-credentials/${encodeURIComponent(providerId)}`, {
    method: 'DELETE',
  })
}

export async function getAdminCustomModels() {
  return requestJson<{ models: AdminCustomModel[] }>('/api/admin/models')
}

export async function createAdminCustomModel(model: CustomModelInput) {
  return requestJson<{ id: string }>('/api/admin/models', {
    method: 'POST',
    body: JSON.stringify(model),
  })
}

export async function setAdminCustomModelEnabled(id: string, enabled: boolean) {
  return requestJson<{ ok: boolean }>(`/api/admin/models/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
}

export async function deleteAdminCustomModel(id: string) {
  return requestJson<{ ok: boolean }>(`/api/admin/models/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export interface AdminUser {
  id: string
  email: string
  display_name: string
  role: 'user' | 'admin'
  created_at: number
  last_login_at?: number
  disabled_at?: number
  record_count: number
}

export interface AdminRecord {
  id: string
  user_id?: string
  email: string
  display_name: string
  type: string
  model_id?: string
  provider?: string
  input_text?: string
  output_text?: string
  media_url?: string
  metadata?: Record<string, unknown>
  status: string
  created_at: number
}
