import {
  decryptCredentialPayload,
  encryptCredentialPayload,
  maskCredential,
} from '../_secure_keys.js'

const sessionCookieName = 'xiaoy_session'
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000
const adminEmail = 'zy98970@gmail.com'
const activityTypes = new Set([
  'auth_register',
  'auth_login',
  'chat',
  'image',
  'video',
  'audio',
  'transcription',
  '3d',
  'model_select',
])

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  })
}

function errorResponse(message, status = 400) {
  return json({ error: message }, status)
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 254) : ''
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

function randomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

async function derivePassword(password, saltHex) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map((part) => Number.parseInt(part, 16)))
  return bytesToHex(await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt,
    iterations: 100_000,
  }, key, 256))
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

function cookieValue(request) {
  const cookie = request.headers.get('Cookie') || ''
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${sessionCookieName}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : ''
}

function sessionCookie(token, maxAge = Math.floor(sessionLifetimeMs / 1000)) {
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
  }
}

async function currentUser(env, request) {
  const token = cookieValue(request)
  if (!token) return undefined
  const tokenHash = await sha256(token)
  const now = Date.now()
  const user = await env.DB.prepare(`
    SELECT users.id, users.email, users.display_name, users.role, users.created_at, users.last_login_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.disabled_at IS NULL
  `).bind(tokenHash, now).first()
  if (!user) return undefined
  return user
}

async function createSession(env, userId) {
  const token = randomToken()
  const now = Date.now()
  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), userId, await sha256(token), now, now + sessionLifetimeMs, now).run()
  return token
}

function requestMetadata(request) {
  return {
    ip: request.headers.get('CF-Connecting-IP') || '',
    country: request.headers.get('CF-IPCountry') || '',
    userAgent: cleanText(request.headers.get('User-Agent') || '', 500),
  }
}

async function insertActivity(env, userId, payload) {
  const type = activityTypes.has(payload.type) ? payload.type : ''
  if (!type) throw new Error('不支持的记录类型')
  const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}
  const metadataJson = JSON.stringify(metadata).slice(0, 40_000)
  const id = crypto.randomUUID()
  await env.DB.prepare(`
    INSERT OR IGNORE INTO activity_records (
      id, user_id, client_event_id, type, model_id, provider,
      input_text, output_text, media_url, metadata_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    userId,
    cleanText(payload.clientEventId, 120) || null,
    type,
    cleanText(payload.modelId, 240) || null,
    cleanText(payload.provider, 120) || null,
    cleanText(payload.inputText, 100_000) || null,
    cleanText(payload.outputText, 100_000) || null,
    cleanText(payload.mediaUrl, 4_000) || null,
    metadataJson,
    cleanText(payload.status, 32) || 'success',
    Number.isFinite(payload.createdAt) ? payload.createdAt : Date.now(),
  ).run()
  return id
}

function checkOrigin(request) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return true
  const origin = request.headers.get('Origin')
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

async function register(context) {
  const body = await context.request.json().catch(() => ({}))
  const email = normalizeEmail(body.email)
  const displayName = cleanText(body.displayName, 80).trim()
  const password = typeof body.password === 'string' ? body.password : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorResponse('请输入有效邮箱')
  if (displayName.length < 2) return errorResponse('昵称至少需要 2 个字符')
  if (password.length < 8 || password.length > 128) return errorResponse('密码长度需为 8–128 位')
  const exists = await context.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (exists) return errorResponse('该邮箱已注册', 409)

  const id = crypto.randomUUID()
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
  const passwordHash = await derivePassword(password, salt)
  const now = Date.now()
  const role = email === adminEmail ? 'admin' : 'user'
  await context.env.DB.prepare(`
    INSERT INTO users (id, email, display_name, password_hash, password_salt, role, created_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, email, displayName, passwordHash, salt, role, now, now).run()
  const token = await createSession(context.env, id)
  await insertActivity(context.env, id, {
    type: 'auth_register',
    clientEventId: `register:${id}`,
    metadata: requestMetadata(context.request),
    createdAt: now,
  })
  const user = await context.env.DB.prepare(`
    SELECT id, email, display_name, role, created_at, last_login_at FROM users WHERE id = ?
  `).bind(id).first()
  return json({ user: publicUser(user) }, 201, { 'Set-Cookie': sessionCookie(token) })
}

async function login(context) {
  const body = await context.request.json().catch(() => ({}))
  const email = normalizeEmail(body.email)
  const password = typeof body.password === 'string' ? body.password : ''
  const user = await context.env.DB.prepare(`
    SELECT id, email, display_name, role, password_hash, password_salt, created_at, last_login_at
    FROM users WHERE email = ? AND disabled_at IS NULL
  `).bind(email).first()
  if (!user) return errorResponse('邮箱或密码错误', 401)
  const candidate = await derivePassword(password, user.password_salt)
  if (!constantTimeEqual(candidate, user.password_hash)) return errorResponse('邮箱或密码错误', 401)

  const now = Date.now()
  const role = email === adminEmail ? 'admin' : 'user'
  await context.env.DB.prepare('UPDATE users SET last_login_at = ?, role = ? WHERE id = ?').bind(now, role, user.id).run()
  user.role = role
  const token = await createSession(context.env, user.id)
  await insertActivity(context.env, user.id, {
    type: 'auth_login',
    clientEventId: `login:${crypto.randomUUID()}`,
    metadata: requestMetadata(context.request),
    createdAt: now,
  })
  user.last_login_at = now
  return json({ user: publicUser(user) }, 200, { 'Set-Cookie': sessionCookie(token) })
}

async function logout(context) {
  const token = cookieValue(context.request)
  if (token) {
    await context.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  }
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) })
}

async function adminOverview(env) {
  const now = Date.now()
  const [users, activeUsers, records, typeCounts, latest] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM users').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE last_login_at >= ?').bind(now - 24 * 60 * 60 * 1000).first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM activity_records').first(),
    env.DB.prepare('SELECT type, COUNT(*) AS count FROM activity_records GROUP BY type ORDER BY count DESC').all(),
    env.DB.prepare(`
      SELECT activity_records.id, activity_records.type, activity_records.model_id, activity_records.provider,
             activity_records.status, activity_records.created_at, users.email, users.display_name
      FROM activity_records JOIN users ON users.id = activity_records.user_id
      ORDER BY activity_records.created_at DESC LIMIT 12
    `).all(),
  ])
  return {
    totalUsers: users?.count || 0,
    activeUsers24h: activeUsers?.count || 0,
    totalRecords: records?.count || 0,
    byType: typeCounts.results || [],
    latest: latest.results || [],
  }
}

async function adminUsers(env, url) {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 40))
  const search = cleanText(url.searchParams.get('q') || '', 120)
  const where = search ? 'WHERE users.email LIKE ? OR users.display_name LIKE ?' : ''
  const bindings = search ? [`%${search}%`, `%${search}%`] : []
  const rows = await env.DB.prepare(`
    SELECT users.id, users.email, users.display_name, users.role, users.created_at, users.last_login_at,
           users.disabled_at, COUNT(activity_records.id) AS record_count
    FROM users LEFT JOIN activity_records ON activity_records.user_id = users.id
    ${where}
    GROUP BY users.id
    ORDER BY users.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, (page - 1) * limit).all()
  return rows.results || []
}

async function adminRecords(env, url) {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50))
  const conditions = []
  const bindings = []
  const type = cleanText(url.searchParams.get('type') || '', 32)
  const userId = cleanText(url.searchParams.get('userId') || '', 80)
  const search = cleanText(url.searchParams.get('q') || '', 200)
  if (type && activityTypes.has(type)) {
    conditions.push('activity_records.type = ?')
    bindings.push(type)
  }
  if (userId) {
    conditions.push('activity_records.user_id = ?')
    bindings.push(userId)
  }
  if (search) {
    conditions.push('(activity_records.input_text LIKE ? OR activity_records.output_text LIKE ? OR activity_records.model_id LIKE ? OR users.email LIKE ?)')
    bindings.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = await env.DB.prepare(`
    SELECT activity_records.*, users.email, users.display_name
    FROM activity_records JOIN users ON users.id = activity_records.user_id
    ${where}
    ORDER BY activity_records.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, (page - 1) * limit).all()
  return (rows.results || []).map((row) => ({
    ...row,
    metadata: JSON.parse(row.metadata_json || '{}'),
    metadata_json: undefined,
  }))
}

function normalizeProviderId(value) {
  const providerId = cleanText(value, 60).trim().toLowerCase()
  return /^[a-z0-9_-]+$/.test(providerId) ? providerId : ''
}

async function accountCredentials(env, userId) {
  const [personalRows, globalRows] = await Promise.all([
    env.DB.prepare(`
    SELECT provider_id, encrypted_payload, iv, updated_at
    FROM user_provider_credentials
    WHERE user_id = ?
    ORDER BY provider_id
  `).bind(userId).all(),
    env.DB.prepare('SELECT provider_id FROM global_provider_credentials ORDER BY provider_id').all(),
  ])
  const credentials = await Promise.all((personalRows.results || []).map(async (row) => {
    const value = await decryptCredentialPayload(env.KEY_ENCRYPTION_SECRET, row.encrypted_payload, row.iv)
    return {
      providerId: row.provider_id,
      maskedApiKey: maskCredential(value.apiKey),
      accountIdConfigured: Boolean(value.accountId),
      updatedAt: row.updated_at,
    }
  }))
  const configuredProviders = [...new Set([
    ...credentials.filter((item) => item.maskedApiKey).map((item) => item.providerId),
    ...(globalRows.results || []).map((row) => row.provider_id),
  ])]
  const personalProviders = credentials
    .filter((item) => item.maskedApiKey)
    .map((item) => item.providerId)
  return { credentials, configuredProviders, personalProviders }
}

async function saveAccountCredential(env, userId, providerId, body) {
  const apiKey = cleanText(body.apiKey, 8_000).trim()
  const accountId = cleanText(body.accountId, 500).trim()
  if (!apiKey && !accountId) {
    await env.DB.prepare(`
      DELETE FROM user_provider_credentials WHERE user_id = ? AND provider_id = ?
    `).bind(userId, providerId).run()
    return { deleted: true }
  }
  const encrypted = await encryptCredentialPayload(env.KEY_ENCRYPTION_SECRET, { apiKey, accountId })
  const now = Date.now()
  await env.DB.prepare(`
    INSERT INTO user_provider_credentials (
      id, user_id, provider_id, encrypted_payload, iv, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, provider_id) DO UPDATE SET
      encrypted_payload = excluded.encrypted_payload,
      iv = excluded.iv,
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(),
    userId,
    providerId,
    encrypted.encryptedPayload,
    encrypted.iv,
    now,
    now,
  ).run()
  return { providerId, updatedAt: now }
}

async function adminCredentialList(env) {
  const [personalRows, globalRows] = await Promise.all([
    env.DB.prepare(`
      SELECT user_provider_credentials.id, user_provider_credentials.provider_id,
             user_provider_credentials.encrypted_payload, user_provider_credentials.iv,
             user_provider_credentials.updated_at, users.id AS user_id,
             users.email, users.display_name
      FROM user_provider_credentials
      JOIN users ON users.id = user_provider_credentials.user_id
      ORDER BY user_provider_credentials.updated_at DESC
      LIMIT 300
    `).all(),
    env.DB.prepare(`
      SELECT id, provider_id, encrypted_payload, iv, updated_at
      FROM global_provider_credentials
      ORDER BY updated_at DESC
    `).all(),
  ])
  const personal = await Promise.all((personalRows.results || []).map(async (row) => {
    const credentials = await decryptCredentialPayload(env.KEY_ENCRYPTION_SECRET, row.encrypted_payload, row.iv)
    return {
      id: row.id,
      scope: 'personal',
      providerId: row.provider_id,
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      maskedApiKey: maskCredential(credentials.apiKey),
      accountId: credentials.accountId || '',
      updatedAt: row.updated_at,
    }
  }))
  const global = await Promise.all((globalRows.results || []).map(async (row) => {
    const credentials = await decryptCredentialPayload(env.KEY_ENCRYPTION_SECRET, row.encrypted_payload, row.iv)
    return {
      id: row.id,
      scope: 'global',
      providerId: row.provider_id,
      maskedApiKey: maskCredential(credentials.apiKey),
      accountId: credentials.accountId || '',
      updatedAt: row.updated_at,
    }
  }))
  return { personal, global }
}

async function adminCredentialSecret(env, scope, id) {
  const table = scope === 'global'
    ? 'global_provider_credentials'
    : 'user_provider_credentials'
  const row = await env.DB.prepare(`
    SELECT encrypted_payload, iv
    FROM ${table}
    WHERE id = ?
  `).bind(id).first()
  if (!row) return undefined
  const credentials = await decryptCredentialPayload(
    env.KEY_ENCRYPTION_SECRET,
    row.encrypted_payload,
    row.iv,
  )
  return { apiKey: credentials.apiKey || '' }
}

async function saveGlobalCredential(env, adminId, providerId, body) {
  const apiKey = cleanText(body.apiKey, 8_000).trim()
  const accountId = cleanText(body.accountId, 500).trim()
  if (!apiKey) throw new Error('全局 API Key 不能为空')
  const encrypted = await encryptCredentialPayload(env.KEY_ENCRYPTION_SECRET, { apiKey, accountId })
  const now = Date.now()
  await env.DB.prepare(`
    INSERT INTO global_provider_credentials (
      id, provider_id, encrypted_payload, iv, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider_id) DO UPDATE SET
      encrypted_payload = excluded.encrypted_payload,
      iv = excluded.iv,
      created_by = excluded.created_by,
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(),
    providerId,
    encrypted.encryptedPayload,
    encrypted.iv,
    adminId,
    now,
    now,
  ).run()
  return { providerId, updatedAt: now }
}

const modelCategories = new Set(['chat', 'image', 'video', 'audio', 'embedding', 'reranker', '3d'])
const pricingTiers = new Set(['free', 'daily-refresh', 'free-quota', 'paid', 'variable'])

function customModelPayload(body) {
  const providerId = normalizeProviderId(body.providerId)
  const providerName = cleanText(body.providerName, 100).trim()
  const apiModel = cleanText(body.apiModel, 240).trim()
  const name = cleanText(body.name, 160).trim()
  const category = modelCategories.has(body.category) ? body.category : ''
  const pricing = pricingTiers.has(body.pricing) ? body.pricing : ''
  if (!providerId || !providerName || !apiModel || !name || !category || !pricing) {
    throw new Error('请完整填写服务商、模型名称、模型 ID、分类和费用类型')
  }
  return {
    providerId,
    providerName,
    apiModel,
    name,
    category,
    pricing,
    description: cleanText(body.description, 1_000).trim(),
    docsUrl: cleanText(body.docsUrl, 1_000).trim(),
    keyUrl: cleanText(body.keyUrl, 1_000).trim(),
    quota: cleanText(body.quota, 1_000).trim() || '由管理员配置，额度以服务商账户为准',
    quotaLookup: cleanText(body.quotaLookup, 1_000).trim() || '请在服务商控制台查看',
    integration: body.integration === 'catalog' ? 'catalog' : 'ready',
  }
}

function publicCustomModel(row) {
  return {
    databaseId: row.id,
    id: `custom-${row.id}`,
    apiModel: row.api_model,
    name: row.name,
    provider: row.provider_name,
    providerId: row.provider_id,
    category: row.category,
    pricing: row.pricing,
    quota: row.quota,
    quotaLookup: row.quota_lookup,
    integration: row.integration,
    description: row.description || '管理员添加的模型',
    docsUrl: row.docs_url || '#',
    keyUrl: row.key_url || '#',
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function listCustomModels(env, includeDisabled = false) {
  const rows = await env.DB.prepare(`
    SELECT * FROM custom_models
    ${includeDisabled ? '' : 'WHERE enabled = 1'}
    ORDER BY updated_at DESC
  `).all()
  return (rows.results || []).map(publicCustomModel)
}

async function createCustomModel(env, adminId, body) {
  const model = customModelPayload(body)
  const now = Date.now()
  const id = crypto.randomUUID()
  await env.DB.prepare(`
    INSERT INTO custom_models (
      id, provider_id, provider_name, api_model, name, category, pricing,
      description, docs_url, key_url, quota, quota_lookup, integration,
      enabled, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).bind(
    id,
    model.providerId,
    model.providerName,
    model.apiModel,
    model.name,
    model.category,
    model.pricing,
    model.description,
    model.docsUrl,
    model.keyUrl,
    model.quota,
    model.quotaLookup,
    model.integration,
    adminId,
    now,
    now,
  ).run()
  return id
}

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (!checkOrigin(request)) return errorResponse('请求来源不受信任', 403)

  try {
    if (path === '/api/health' && request.method === 'GET') {
      const probe = await env.DB.prepare('SELECT 1 AS ok').first()
      return json({ ok: probe?.ok === 1, database: Boolean(env.DB) })
    }
    if (path === '/api/auth/register' && request.method === 'POST') return await register(context)
    if (path === '/api/auth/login' && request.method === 'POST') return await login(context)
    if (path === '/api/auth/logout' && request.method === 'POST') return await logout(context)

    const user = await currentUser(env, request)
    if (path === '/api/auth/me' && request.method === 'GET') {
      return user ? json({ user: publicUser(user) }) : errorResponse('未登录', 401)
    }
    if (!user) return errorResponse('请先登录', 401)

    if (path === '/api/account/profile' && request.method === 'PUT') {
      const body = await request.json().catch(() => ({}))
      const email = normalizeEmail(body.email)
      const displayName = cleanText(body.displayName, 80).trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorResponse('请输入有效邮箱')
      if (displayName.length < 2) return errorResponse('昵称至少需要 2 个字符')
      const exists = await env.DB.prepare(
        'SELECT id FROM users WHERE email = ? AND id <> ?',
      ).bind(email, user.id).first()
      if (exists) return errorResponse('该邮箱已被其他账号使用', 409)
      const role = email === adminEmail ? 'admin' : 'user'
      await env.DB.prepare(`
        UPDATE users SET email = ?, display_name = ?, role = ? WHERE id = ?
      `).bind(email, displayName, role, user.id).run()
      const updated = await env.DB.prepare(`
        SELECT id, email, display_name, role, created_at, last_login_at
        FROM users WHERE id = ?
      `).bind(user.id).first()
      return json({ user: publicUser(updated) })
    }

    if (path === '/api/activity' && request.method === 'POST') {
      const payload = await request.json().catch(() => ({}))
      const id = await insertActivity(env, user.id, payload)
      return json({ id }, 201)
    }

    if (path === '/api/credentials' && request.method === 'GET') {
      return json(await accountCredentials(env, user.id))
    }
    const credentialMatch = path.match(/^\/api\/credentials\/([^/]+)$/)
    if (credentialMatch) {
      const providerId = normalizeProviderId(decodeURIComponent(credentialMatch[1]))
      if (!providerId) return errorResponse('服务商 ID 无效')
      if (request.method === 'PUT') {
        const body = await request.json().catch(() => ({}))
        return json(await saveAccountCredential(env, user.id, providerId, body))
      }
      if (request.method === 'DELETE') {
        await env.DB.prepare(`
          DELETE FROM user_provider_credentials WHERE user_id = ? AND provider_id = ?
        `).bind(user.id, providerId).run()
        return json({ ok: true })
      }
    }
    if (path === '/api/catalog/custom-models' && request.method === 'GET') {
      return json({ models: await listCustomModels(env, false) })
    }

    if (!path.startsWith('/api/admin/')) return errorResponse('接口不存在', 404)
    if (user.role !== 'admin') return errorResponse('需要管理员权限', 403)

    if (path === '/api/admin/overview' && request.method === 'GET') {
      return json(await adminOverview(env))
    }
    if (path === '/api/admin/users' && request.method === 'GET') {
      return json({ users: await adminUsers(env, url) })
    }
    if (path === '/api/admin/records' && request.method === 'GET') {
      return json({ records: await adminRecords(env, url) })
    }
    if (path === '/api/admin/credentials' && request.method === 'GET') {
      return json(await adminCredentialList(env))
    }
    const credentialSecretMatch = path.match(/^\/api\/admin\/credentials\/(personal|global)\/([^/]+)\/secret$/)
    if (credentialSecretMatch && request.method === 'GET') {
      const secret = await adminCredentialSecret(
        env,
        credentialSecretMatch[1],
        decodeURIComponent(credentialSecretMatch[2]),
      )
      return secret ? json(secret) : errorResponse('API Key 不存在', 404)
    }
    const globalCredentialMatch = path.match(/^\/api\/admin\/global-credentials\/([^/]+)$/)
    if (globalCredentialMatch) {
      const providerId = normalizeProviderId(decodeURIComponent(globalCredentialMatch[1]))
      if (!providerId) return errorResponse('服务商 ID 无效')
      if (request.method === 'PUT') {
        const body = await request.json().catch(() => ({}))
        return json(await saveGlobalCredential(env, user.id, providerId, body))
      }
      if (request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM global_provider_credentials WHERE provider_id = ?').bind(providerId).run()
        return json({ ok: true })
      }
    }
    if (path === '/api/admin/models' && request.method === 'GET') {
      return json({ models: await listCustomModels(env, true) })
    }
    if (path === '/api/admin/models' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json({ id: await createCustomModel(env, user.id, body) }, 201)
    }
    const customModelMatch = path.match(/^\/api\/admin\/models\/([^/]+)$/)
    if (customModelMatch) {
      const modelId = decodeURIComponent(customModelMatch[1])
      if (request.method === 'PATCH') {
        const body = await request.json().catch(() => ({}))
        await env.DB.prepare(`
          UPDATE custom_models SET enabled = ?, updated_at = ? WHERE id = ?
        `).bind(body.enabled === false ? 0 : 1, Date.now(), modelId).run()
        return json({ ok: true })
      }
      if (request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM custom_models WHERE id = ?').bind(modelId).run()
        return json({ ok: true })
      }
    }
    const recordMatch = path.match(/^\/api\/admin\/records\/([^/]+)$/)
    if (recordMatch && request.method === 'GET') {
      const record = await env.DB.prepare(`
        SELECT activity_records.*, users.email, users.display_name
        FROM activity_records JOIN users ON users.id = activity_records.user_id
        WHERE activity_records.id = ?
      `).bind(decodeURIComponent(recordMatch[1])).first()
      if (!record) return errorResponse('记录不存在', 404)
      return json({
        record: {
          ...record,
          metadata: JSON.parse(record.metadata_json || '{}'),
          metadata_json: undefined,
        },
      })
    }
    return errorResponse('接口不存在', 404)
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : '服务器处理失败', 500)
  }
}
