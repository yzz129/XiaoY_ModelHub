const sessionCookieName = 'xiaoy_session'

function bytesToBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

async function encryptionKey(secret) {
  if (!secret || secret.length < 24) throw new Error('服务端尚未配置凭据加密密钥')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptCredentialPayload(secret, payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify({
    apiKey: typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '',
    accountId: typeof payload.accountId === 'string' ? payload.accountId.trim() : '',
  }))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(secret),
    plaintext,
  )
  return {
    encryptedPayload: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  }
}

export async function decryptCredentialPayload(secret, encryptedPayload, iv) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) },
    await encryptionKey(secret),
    base64ToBytes(encryptedPayload),
  )
  return JSON.parse(new TextDecoder().decode(plaintext))
}

export function maskCredential(value) {
  if (!value) return ''
  if (value.length <= 8) return `${value.slice(0, 2)}••••${value.slice(-1)}`
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`
}

function cookieValue(request) {
  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${sessionCookieName}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : ''
}

async function currentUserId(env, request) {
  const token = cookieValue(request)
  if (!token || !env.DB) return ''
  const session = await env.DB.prepare(`
    SELECT sessions.user_id
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.disabled_at IS NULL
  `).bind(await sha256Hex(token), Date.now()).first()
  return session?.user_id || ''
}

export async function resolveProviderCredentials(env, request, providerId) {
  const userId = await currentUserId(env, request)
  if (!userId) return { apiKey: '', accountId: '', source: 'none' }
  if (userId) {
    const personal = await env.DB.prepare(`
      SELECT encrypted_payload, iv
      FROM user_provider_credentials
      WHERE user_id = ? AND provider_id = ?
    `).bind(userId, providerId).first()
    if (personal) {
      const credentials = await decryptCredentialPayload(env.KEY_ENCRYPTION_SECRET, personal.encrypted_payload, personal.iv)
      if (credentials.apiKey) return { ...credentials, source: 'personal' }
    }
  }

  const global = await env.DB.prepare(`
    SELECT encrypted_payload, iv
    FROM global_provider_credentials
    WHERE provider_id = ?
  `).bind(providerId).first()
  if (global) {
    const credentials = await decryptCredentialPayload(env.KEY_ENCRYPTION_SECRET, global.encrypted_payload, global.iv)
    if (credentials.apiKey) return { ...credentials, source: 'global' }
  }
  return { apiKey: '', accountId: '', source: 'none' }
}
