import {
  decryptCredentialPayload,
  encryptCredentialPayload,
  maskCredential,
} from '../_secure_keys.js'
import {
  agentState,
  cancelTask,
  deleteConversation,
  deleteMemory,
  executeDueAgentTasks,
  resolveAgentApproval,
  resumeAgentExecution,
  runAgent,
  saveFeedback,
} from '../_agent_runtime.js'
import {
  advanceProductionWorkflow,
  approveProductionWorkflow,
  createProductionWorkflow,
  getProductionWorkflow,
  listProductionWorkflows,
  reportProductionCommand,
  rollbackProductionWorkflow,
} from '../_agent_workflow.js'
import {
  hasQiniuStorage,
  qiniuDeleteObject,
  qiniuGetObject,
  qiniuPutObject,
} from '../_qiniu_storage.js'
import {
  hasUniCloudStorage,
  UNICLOUD_MAX_UPLOAD_BYTES,
  uniCloudDeleteObject,
  uniCloudGetObject,
  uniCloudPutObject,
} from '../_unicloud_storage.js'

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
  'editing',
  'model_select',
])
const assetTypes = new Set(['image', 'video', 'audio', '3d', 'editing'])
const workflowTextStages = new Set(['moodboard', 'script', 'character', 'scene', 'storyboard'])
const qiniuStorageBudget = Object.freeze({
  provider: 'qiniu',
  storageBytes: 8_000_000_000,
  writeOps: 90_000,
  readOps: 900_000,
  readBytes: 8_000_000_000,
})
const uniCloudStorageBudget = Object.freeze({
  provider: 'unicloud',
  storageBytes: 4_000_000_000,
  writeOps: 900,
  readOps: 1_500,
  readBytes: 8_000_000_000,
})

function storageProvider(env) {
  const configured = cleanText(env.MEDIA_STORAGE_PROVIDER, 32).trim().toLowerCase()
  if (configured === 'unicloud' || configured === 'qiniu') return configured
  return 'unicloud'
}

function storageBudgetFor(env) {
  return storageProvider(env) === 'unicloud' ? uniCloudStorageBudget : qiniuStorageBudget
}

function hasActiveStorage(env) {
  return storageProvider(env) === 'unicloud' ? hasUniCloudStorage(env) : hasQiniuStorage(env)
}

function storageProviderLabel(provider) {
  return provider === 'unicloud' ? 'uniCloud 支付宝云' : '七牛云'
}

function uniCloudFileId(storageKey) {
  return typeof storageKey === 'string' && storageKey.startsWith('unicloud:')
    ? storageKey.slice('unicloud:'.length)
    : ''
}

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

function safeJsonObject(value, maxLength = 40_000) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}'
  return JSON.stringify(value).slice(0, maxLength)
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string' || !value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function assetExtension(mimeType, fileName = '') {
  const byMime = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
    'audio/ogg': 'ogg', 'model/gltf-binary': 'glb', 'model/gltf+json': 'gltf',
  }
  if (byMime[mimeType]) return byMime[mimeType]
  const match = cleanText(fileName, 240).match(/\.([a-z0-9]{1,8})$/i)
  return match ? match[1].toLowerCase() : 'bin'
}

function isSafeRemoteAssetUrl(value) {
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol)) return false
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.local') || host === '::1') return false
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false
    const private172 = /^172\.(\d{1,3})\./.exec(host)
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false
    return true
  } catch {
    return false
  }
}

function publicAsset(row) {
  const metadata = parseJsonObject(row.metadata_json)
  const modelId = String(row.model_id || '').toLowerCase()
  const provider = String(row.provider || '').toLowerCase()
  const selfTest = metadata.selfTest === true || modelId.startsWith('storage-self-test')
  const preview = metadata.productionClass === 'preview' || modelId.startsWith('browser-') || (provider === 'local' && row.type !== 'editing')
  const promptRequiresRenderedText = row.type === 'image' && /文字依次|消息文字|白色文字|标题(?:为|文字)|标语[“'\"]|显示(?:文字|消息|数据)|来电显示文字|气泡[^。]{0,30}文字/i.test(String(row.prompt || ''))
  const productionClass = selfTest ? 'test' : preview ? 'preview' : metadata.productionClass === 'test' ? 'test' : 'generated'
  const qualityStatus = ['passed', 'failed', 'pending_review', 'not_applicable'].includes(metadata.qualityStatus)
    ? metadata.qualityStatus
    : selfTest ? 'not_applicable' : (preview || promptRequiresRenderedText) ? 'failed' : 'pending_review'
  return {
    id: row.id,
    clientAssetId: row.client_asset_id,
    type: row.type,
    modelId: row.model_id || undefined,
    provider: row.provider || undefined,
    prompt: row.prompt || undefined,
    url: row.media_url,
    fileName: row.file_name || undefined,
    mimeType: row.mime_type,
    bytes: row.bytes || 0,
    metadata,
    productionClass,
    qualityStatus,
    createdAt: row.created_at,
  }
}

function budgetMonth(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 7)
}

async function ensureBudgetRow(env, month) {
  await env.DB.prepare(`
    INSERT OR IGNORE INTO storage_usage_budget (month, storage_bytes, write_ops, read_ops, read_bytes, updated_at)
    VALUES (?, 0, 0, 0, 0, ?)
  `).bind(month, Date.now()).run()
}

async function storedAssetBytes(env) {
  const provider = storageProvider(env)
  const result = provider === 'unicloud'
    ? await env.DB.prepare("SELECT COALESCE(SUM(bytes), 0) AS bytes FROM generated_assets WHERE storage_key LIKE 'unicloud:%'").first()
    : await env.DB.prepare("SELECT COALESCE(SUM(bytes), 0) AS bytes FROM generated_assets WHERE storage_key NOT LIKE 'unicloud:%'").first()
  return Number(result?.bytes || 0)
}

async function claimStorageWriteBudget(env, bytes) {
  const storageBudget = storageBudgetFor(env)
  const month = budgetMonth()
  await ensureBudgetRow(env, month)
  const storageBytes = await storedAssetBytes(env)
  if (storageBytes + bytes > storageBudget.storageBytes) return { claimed: false, month }
  const result = await env.DB.prepare(`
    UPDATE storage_usage_budget
    SET storage_bytes = ?, write_ops = write_ops + 1, updated_at = ?
    WHERE month = ? AND write_ops < ?
  `).bind(storageBytes + bytes, Date.now(), month, storageBudget.writeOps).run()
  return { claimed: Number(result.meta?.changes || 0) === 1, month }
}

async function releaseStorageWriteBudget(env, month) {
  await env.DB.prepare(`
    UPDATE storage_usage_budget
    SET storage_bytes = ?, write_ops = MAX(0, write_ops - 1), updated_at = ?
    WHERE month = ?
  `).bind(await storedAssetBytes(env), Date.now(), month).run()
}

async function claimStorageReadBudget(env, bytes) {
  const storageBudget = storageBudgetFor(env)
  const month = budgetMonth()
  await ensureBudgetRow(env, month)
  const result = await env.DB.prepare(`
    UPDATE storage_usage_budget
    SET read_ops = read_ops + 1, read_bytes = read_bytes + ?, updated_at = ?
    WHERE month = ? AND read_ops < ? AND read_bytes + ? <= ?
  `).bind(bytes, Date.now(), month, storageBudget.readOps, bytes, storageBudget.readBytes).run()
  return { claimed: Number(result.meta?.changes || 0) === 1, month }
}

async function releaseStorageReadBudget(env, month, bytes) {
  await env.DB.prepare(`
    UPDATE storage_usage_budget
    SET read_ops = MAX(0, read_ops - 1), read_bytes = MAX(0, read_bytes - ?), updated_at = ?
    WHERE month = ?
  `).bind(bytes, Date.now(), month).run()
}

async function claimAdditionalStorageReadBytes(env, month, bytes) {
  if (bytes <= 0) return true
  const storageBudget = storageBudgetFor(env)
  const result = await env.DB.prepare(`
    UPDATE storage_usage_budget
    SET read_bytes = read_bytes + ?, updated_at = ?
    WHERE month = ? AND read_bytes + ? <= ?
  `).bind(bytes, Date.now(), month, bytes, storageBudget.readBytes).run()
  return Number(result.meta?.changes || 0) === 1
}

async function releaseStorageReadBytes(env, month, bytes) {
  if (bytes <= 0) return
  await env.DB.prepare(`
    UPDATE storage_usage_budget
    SET read_bytes = MAX(0, read_bytes - ?), updated_at = ?
    WHERE month = ?
  `).bind(bytes, Date.now(), month).run()
}

async function currentStorageBudget(env) {
  const storageBudget = storageBudgetFor(env)
  const month = budgetMonth()
  const usage = await env.DB.prepare(`
    SELECT write_ops, read_ops, read_bytes FROM storage_usage_budget WHERE month = ?
  `).bind(month).first()
  return {
    month,
    provider: storageBudget.provider,
    storageBytes: await storedAssetBytes(env),
    writeOps: Number(usage?.write_ops || 0),
    readOps: Number(usage?.read_ops || 0),
    readBytes: Number(usage?.read_bytes || 0),
    limits: storageBudget,
  }
}

function requestedAssetBytes(range, totalBytes, head = false) {
  if (head) return 0
  const total = Math.max(0, Number(totalBytes) || 0)
  const match = typeof range === 'string' && range.match(/^bytes=(\d*)-(\d*)$/i)
  if (!match) return total
  if (!match[1]) return Math.min(total, Number(match[2]) || 0)
  const start = Math.min(total, Number(match[1]) || 0)
  const end = match[2] ? Math.min(total - 1, Number(match[2])) : total - 1
  return Math.max(0, end - start + 1)
}

function responseAssetBytes(response, head = false) {
  if (head || response.status === 204 || response.status === 304) return 0
  const contentRange = response.headers.get('Content-Range') || ''
  const rangeMatch = contentRange.match(/^bytes\s+(\d+)-(\d+)\/(?:\d+|\*)$/i)
  if (rangeMatch) {
    const start = Number(rangeMatch[1])
    const end = Number(rangeMatch[2])
    if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && end >= start) return end - start + 1
  }
  const contentLength = Number(response.headers.get('Content-Length'))
  return Number.isSafeInteger(contentLength) && contentLength >= 0 ? contentLength : null
}

async function registerGeneratedAsset(env, request, user) {
  const activeProvider = storageProvider(env)
  const providerLabel = storageProviderLabel(activeProvider)
  if (!hasActiveStorage(env)) return errorResponse(`${providerLabel}媒体存储尚未配置`, 503)
  const contentType = request.headers.get('Content-Type') || ''
  let body = {}
  let file
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    body = Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string'))
    const candidate = form.get('file')
    if (candidate instanceof File && candidate.size) file = candidate
  } else {
    body = await request.json().catch(() => ({}))
  }

  const clientAssetId = cleanText(body.clientAssetId, 120).trim()
  const type = cleanText(body.type, 32).trim()
  if (!clientAssetId) return errorResponse('缺少客户端资产 ID')
  if (!assetTypes.has(type)) return errorResponse('不支持的资产类型')
  const existing = await env.DB.prepare(`
    SELECT * FROM generated_assets WHERE user_id = ? AND client_asset_id = ?
  `).bind(user.id, clientAssetId).first()
  if (existing) {
    const metadataPatch = parseJsonObject(body.metadata)
    if (Object.keys(metadataPatch).length) {
      const mergedMetadata = { ...parseJsonObject(existing.metadata_json), ...metadataPatch }
      await env.DB.prepare('UPDATE generated_assets SET metadata_json = ? WHERE id = ? AND user_id = ?')
        .bind(safeJsonObject(mergedMetadata), existing.id, user.id).run()
      existing.metadata_json = safeJsonObject(mergedMetadata)
    }
    return json({ asset: publicAsset(existing) })
  }

  const sourceUrl = cleanText(body.sourceUrl, 8_000).trim()
  let binary
  let mimeType = cleanText(body.mimeType, 160).trim() || file?.type || 'application/octet-stream'
  let fileName = cleanText(body.fileName, 240).trim() || file?.name || `${clientAssetId}.${assetExtension(mimeType)}`
  if (file) {
    binary = await file.arrayBuffer()
  } else {
    if (!isSafeRemoteAssetUrl(sourceUrl)) return errorResponse('缺少可归档的媒体文件或安全来源地址')
    const remote = await fetch(sourceUrl, { signal: request.signal })
    if (!remote.ok) return errorResponse(`源媒体下载失败（${remote.status}）`, 502)
    binary = await remote.arrayBuffer()
    mimeType = cleanText(remote.headers.get('Content-Type') || mimeType, 160).split(';')[0].trim() || mimeType
  }
  if (!binary?.byteLength) return errorResponse('媒体文件为空')
  const maxUploadBytes = activeProvider === 'unicloud' ? UNICLOUD_MAX_UPLOAD_BYTES : 80 * 1024 * 1024
  if (binary.byteLength > maxUploadBytes) {
    return errorResponse(`当前存储单个资产不能超过 ${Math.floor(maxUploadBytes / 1024 / 1024)} MB`, 413)
  }

  const budgetClaim = await claimStorageWriteBudget(env, binary.byteLength)
  if (!budgetClaim.claimed) return errorResponse('本月媒体存储免费额度安全阈值已达到，已停止上传以避免产生费用', 429)

  const id = crypto.randomUUID()
  const extension = assetExtension(mimeType, fileName)
  const objectKey = `private/xiaoy/users/${user.id}/${type}/${id}.${extension}`
  let storageKey = objectKey
  try {
    if (activeProvider === 'unicloud') {
      const stored = await uniCloudPutObject(env, objectKey, binary, { contentType: mimeType })
      storageKey = `unicloud:${stored.fileId}`
    } else {
      const qiniuKey = objectKey.replace(/^private\/xiaoy\//, '')
      const stored = await qiniuPutObject(env, qiniuKey, binary, {
        contentType: mimeType,
        cacheControl: 'private, max-age=300',
        userId: user.id,
        assetId: clientAssetId,
      })
      if (!stored.ok) throw new Error(`七牛上传失败（${stored.status}）`)
      storageKey = qiniuKey
    }
  } catch (error) {
    await releaseStorageWriteBudget(env, budgetClaim.month)
    throw error
  }
  const mediaUrl = `/api/assets/${encodeURIComponent(id)}/content`
  const metadata = parseJsonObject(body.metadata)
  const metadataJson = safeJsonObject(metadata)
  const createdAtValue = Number(body.createdAt)
  const createdAt = Number.isFinite(createdAtValue) ? createdAtValue : Date.now()
  const modelId = cleanText(body.modelId, 240).trim() || null
  const provider = cleanText(body.provider, 120).trim() || null
  const prompt = cleanText(body.prompt, 100_000) || null
  fileName = cleanText(fileName, 240) || `${clientAssetId}.${extension}`

  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO generated_assets (
          id, user_id, client_asset_id, type, model_id, provider, prompt, media_url,
          storage_key, source_url, file_name, mime_type, bytes, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, user.id, clientAssetId, type, modelId, provider, prompt, mediaUrl, storageKey,
        sourceUrl || null, fileName, mimeType, binary.byteLength, metadataJson, createdAt),
      env.DB.prepare(`
        INSERT OR IGNORE INTO activity_records (
          id, user_id, client_event_id, type, model_id, provider,
          input_text, output_text, media_url, metadata_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', ?)
      `).bind(crypto.randomUUID(), user.id, `asset:${clientAssetId}`, type, modelId, provider,
        prompt, null, mediaUrl, safeJsonObject({ ...metadata, assetId: id, bytes: binary.byteLength, mimeType }), createdAt),
    ])
  } catch (error) {
    if (activeProvider === 'unicloud') {
      await uniCloudDeleteObject(env, uniCloudFileId(storageKey)).catch(() => undefined)
    } else {
      await qiniuDeleteObject(env, storageKey).catch(() => undefined)
    }
    await releaseStorageWriteBudget(env, budgetClaim.month).catch(() => undefined)
    throw error
  }
  const row = await env.DB.prepare('SELECT * FROM generated_assets WHERE id = ?').bind(id).first()
  return json({ asset: publicAsset(row) }, 201)
}

async function verifyAdminStorage(env, request, user) {
  const activeProvider = storageProvider(env)
  const providerLabel = storageProviderLabel(activeProvider)
  const timestamp = Date.now()
  const clientAssetId = `storage-self-test-${timestamp}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" rx="20" fill="#6d3df5"/><circle cx="70" cy="90" r="34" fill="#fff" fill-opacity=".92"/><text x="124" y="83" font-family="Arial,sans-serif" font-size="20" font-weight="700" fill="#fff">XiaoY Storage</text><text x="124" y="111" font-family="Arial,sans-serif" font-size="14" fill="#ddd4ff">${providerLabel} verified</text></svg>`
  const form = new FormData()
  form.set('file', new File([svg], `${clientAssetId}.svg`, { type: 'image/svg+xml' }))
  form.set('clientAssetId', clientAssetId)
  form.set('type', 'image')
  form.set('modelId', 'storage-self-test')
  form.set('provider', activeProvider)
  form.set('prompt', `管理员${providerLabel}私有存储闭环自检`)
  form.set('createdAt', String(timestamp))
  form.set('metadata', JSON.stringify({ selfTest: true, storage: activeProvider }))
  const probeRequest = new Request(request.url, { method: 'POST', body: form })
  return registerGeneratedAsset(env, probeRequest, user)
}

async function assetContent(env, request, user, id) {
  const row = await env.DB.prepare(`
    SELECT storage_key, mime_type, file_name, user_id, bytes FROM generated_assets WHERE id = ?
  `).bind(id).first()
  if (!row) return errorResponse('资产不存在', 404)
  if (row.user_id !== user.id && user.role !== 'admin') return errorResponse('无权访问该资产', 403)
  const fileId = uniCloudFileId(row.storage_key)
  const rowProvider = fileId ? 'unicloud' : 'qiniu'
  if (rowProvider === 'qiniu' && storageProvider(env) === 'unicloud' && env.ALLOW_LEGACY_QINIU_READS !== 'true') {
    return errorResponse('该文件仍在七牛旧存储中；为避免继续扣费，已禁止回源读取', 410)
  }
  if (rowProvider === 'unicloud' && !hasUniCloudStorage(env)) return errorResponse('uniCloud 媒体存储尚未配置', 503)
  if (rowProvider === 'qiniu' && !hasQiniuStorage(env)) return errorResponse('七牛媒体存储尚未配置', 503)
  const range = request.headers.get('Range') || ''
  const claimedBytes = requestedAssetBytes(range, row.bytes, request.method === 'HEAD')
  const readClaim = await claimStorageReadBudget(env, claimedBytes)
  if (!readClaim.claimed) return errorResponse('本月媒体读取流量或操作次数上限已达到，已暂停访问', 429)
  let object
  try {
    object = rowProvider === 'unicloud'
      ? await uniCloudGetObject(env, fileId, { range, head: request.method === 'HEAD', signal: request.signal })
      : await qiniuGetObject(env, row.storage_key, { range, head: request.method === 'HEAD' })
  } catch (error) {
    await releaseStorageReadBudget(env, readClaim.month, claimedBytes)
    return errorResponse(error instanceof Error ? error.message : `${storageProviderLabel(rowProvider)}读取失败`, 502)
  }
  if (!object.ok) {
    await releaseStorageReadBudget(env, readClaim.month, claimedBytes)
    return object.status === 404
      ? errorResponse('资产文件不存在', 404)
      : errorResponse(`${storageProviderLabel(rowProvider)}读取失败（${object.status}）`, 502)
  }
  const actualBytes = responseAssetBytes(object, request.method === 'HEAD')
  if (actualBytes === null) {
    await object.body?.cancel().catch(() => undefined)
    await releaseStorageReadBudget(env, readClaim.month, claimedBytes)
    return errorResponse('存储响应缺少可验证的内容长度，已拒绝传输以保护月度流量上限', 502)
  }
  if (actualBytes > claimedBytes) {
    const additionalClaimed = await claimAdditionalStorageReadBytes(env, readClaim.month, actualBytes - claimedBytes)
    if (!additionalClaimed) {
      await object.body?.cancel().catch(() => undefined)
      await releaseStorageReadBudget(env, readClaim.month, claimedBytes)
      return errorResponse('本月媒体读取流量上限已达到，已暂停访问', 429)
    }
  } else if (actualBytes < claimedBytes) {
    await releaseStorageReadBytes(env, readClaim.month, claimedBytes - actualBytes)
  }
  const headers = new Headers({
    'Content-Type': row.mime_type || object.headers.get('Content-Type') || 'application/octet-stream',
    'Cache-Control': 'private, max-age=300',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.file_name || 'asset')}`,
    'X-Content-Type-Options': 'nosniff',
  })
  for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
    const value = object.headers.get(name)
    if (value) headers.set(name, value)
  }
  return new Response(request.method === 'HEAD' ? null : object.body, { status: object.status, headers })
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
  const [users, activeUsers, records, assets, textAssets, typeCounts, assetTypeCounts, latest, budget] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM users').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE last_login_at >= ?').bind(now - 24 * 60 * 60 * 1000).first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM activity_records').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM generated_assets').first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM agent_workflow_steps WHERE stage IN ('moodboard','script','character','scene','storyboard') AND status IN ('completed','approved')").first(),
    env.DB.prepare('SELECT type, COUNT(*) AS count FROM activity_records GROUP BY type ORDER BY count DESC').all(),
    env.DB.prepare('SELECT type, COUNT(*) AS count FROM generated_assets GROUP BY type ORDER BY count DESC').all(),
    env.DB.prepare(`
      SELECT activity_records.id, activity_records.type, activity_records.model_id, activity_records.provider,
             activity_records.status, activity_records.created_at, users.email, users.display_name
      FROM activity_records JOIN users ON users.id = activity_records.user_id
      ORDER BY activity_records.created_at DESC LIMIT 12
    `).all(),
    currentStorageBudget(env),
  ])
  return {
    totalUsers: users?.count || 0,
    activeUsers24h: activeUsers?.count || 0,
    totalRecords: records?.count || 0,
    totalAssets: Number(assets?.count || 0) + Number(textAssets?.count || 0),
    byType: typeCounts.results || [],
    assetsByType: [...(assetTypeCounts.results || []), { type: 'text', count: Number(textAssets?.count || 0) }],
    storageBudget: budget,
    latest: latest.results || [],
  }
}

async function adminUsers(env, url) {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 40))
  const search = cleanText(url.searchParams.get('q') || '', 120)
  const active24h = url.searchParams.get('active') === '24h'
  const conditions = []
  const bindings = []
  if (search) {
    conditions.push('(users.email LIKE ? OR users.display_name LIKE ?)')
    bindings.push(`%${search}%`, `%${search}%`)
  }
  if (active24h) {
    conditions.push('users.last_login_at >= ?')
    bindings.push(Date.now() - 24 * 60 * 60 * 1000)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM users ${where}`).bind(...bindings).first()
  const rows = await env.DB.prepare(`
    SELECT users.id, users.email, users.display_name, users.role, users.created_at, users.last_login_at,
           users.disabled_at, COUNT(activity_records.id) AS record_count
    FROM users LEFT JOIN activity_records ON activity_records.user_id = users.id
    ${where}
    GROUP BY users.id
    ORDER BY users.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, (page - 1) * limit).all()
  const total = Number(totalRow?.count || 0)
  return { items: rows.results || [], pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } }
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
  const totalRow = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM activity_records JOIN users ON users.id = activity_records.user_id
    ${where}
  `).bind(...bindings).first()
  const rows = await env.DB.prepare(`
    SELECT activity_records.*, users.email, users.display_name
    FROM activity_records JOIN users ON users.id = activity_records.user_id
    ${where}
    ORDER BY activity_records.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, (page - 1) * limit).all()
  const items = (rows.results || []).map((row) => ({
    ...row,
    metadata: JSON.parse(row.metadata_json || '{}'),
    metadata_json: undefined,
  }))
  const total = Number(totalRow?.count || 0)
  return { items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } }
}

async function adminAssets(env, url) {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 60))
  const fetchLimit = 500
  const conditions = []
  const bindings = []
  const type = cleanText(url.searchParams.get('type') || '', 32)
  const userId = cleanText(url.searchParams.get('userId') || '', 80)
  const search = cleanText(url.searchParams.get('q') || '', 200)
  const quality = cleanText(url.searchParams.get('quality') || '', 40)
  if (type && assetTypes.has(type)) {
    conditions.push('generated_assets.type = ?')
    bindings.push(type)
  }
  if (userId) {
    conditions.push('generated_assets.user_id = ?')
    bindings.push(userId)
  }
  if (search) {
    conditions.push('(generated_assets.prompt LIKE ? OR generated_assets.model_id LIKE ? OR generated_assets.provider LIKE ? OR users.email LIKE ? OR users.display_name LIKE ?)')
    bindings.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = type === 'text' ? { results: [] } : await env.DB.prepare(`
    SELECT generated_assets.*, users.email, users.display_name
    FROM generated_assets JOIN users ON users.id = generated_assets.user_id
    ${where}
    ORDER BY generated_assets.created_at DESC
    LIMIT ?
  `).bind(...bindings, fetchLimit).all()
  const mediaAssets = (rows.results || []).map((row) => ({
    ...publicAsset(row),
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
  }))
  let textAssets = []
  if (!type || type === 'text') {
    const textConditions = ["agent_workflow_steps.stage IN ('moodboard','script','character','scene','storyboard')", "agent_workflow_steps.status IN ('completed','approved')"]
    const textBindings = []
    if (userId) {
      textConditions.push('agent_workflow_steps.user_id = ?')
      textBindings.push(userId)
    }
    if (search) {
      textConditions.push('(agent_workflow_steps.output_json LIKE ? OR agent_workflows.title LIKE ? OR users.email LIKE ? OR users.display_name LIKE ?)')
      textBindings.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
    }
    const stepRows = await env.DB.prepare(`
      SELECT agent_workflow_steps.*, agent_workflows.title AS workflow_title, users.email, users.display_name
      FROM agent_workflow_steps
      JOIN agent_workflows ON agent_workflows.id = agent_workflow_steps.workflow_id
      JOIN users ON users.id = agent_workflow_steps.user_id
      WHERE ${textConditions.join(' AND ')}
      ORDER BY agent_workflow_steps.updated_at DESC
      LIMIT ?
    `).bind(...textBindings, fetchLimit).all()
    const stageLabels = { moodboard: '情绪板', script: '剧本', character: '角色设定', scene: '场景美术', storyboard: '分镜' }
    textAssets = (stepRows.results || []).filter((row) => workflowTextStages.has(row.stage)).map((row) => {
      const output = parseJsonObject(row.output_json)
      const review = parseJsonObject(row.review_json)
      const content = cleanText(output.content, 100_000)
      const model = output.model && typeof output.model === 'object' ? output.model : {}
      return {
        id: `workflow-step:${row.id}`,
        clientAssetId: row.id,
        userId: row.user_id,
        email: row.email,
        displayName: row.display_name,
        type: 'text',
        modelId: cleanText(model.id, 240) || undefined,
        provider: cleanText(model.provider, 120) || undefined,
        prompt: content,
        url: '',
        fileName: `${stageLabels[row.stage] || row.stage}-v${row.version}.md`,
        mimeType: 'text/markdown',
        bytes: new TextEncoder().encode(content).byteLength,
        metadata: { workflowId: row.workflow_id, workflowTitle: row.workflow_title, stage: row.stage, version: row.version, status: row.status, review },
        productionClass: 'generated',
        qualityStatus: review.pass === true ? 'passed' : review.pass === false ? 'failed' : 'pending_review',
        createdAt: row.updated_at,
      }
    })
  }
  const combined = [...mediaAssets, ...textAssets]
  const qualityFiltered = quality ? combined.filter((asset) => asset.qualityStatus === quality || asset.productionClass === quality) : combined
  const items = qualityFiltered
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice((page - 1) * limit, page * limit)
  const total = qualityFiltered.length
  return { items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } }
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
    env.DB.prepare('SELECT provider_id, encrypted_payload, iv FROM global_provider_credentials ORDER BY provider_id').all(),
  ])
  const credentials = await Promise.all((personalRows.results || []).map(async (row) => {
    const value = await decryptCredentialPayload(env.KEY_ENCRYPTION_SECRET, row.encrypted_payload, row.iv)
    return {
      providerId: row.provider_id,
      maskedApiKey: maskCredential(value.apiKey),
      accountIdConfigured: Boolean(value.accountId),
      authMode: value.mode === 'tencent-cloud' ? 'tencent-cloud' : 'tokenhub',
      updatedAt: row.updated_at,
    }
  }))
  const globalAuthModes = await Promise.all((globalRows.results || []).map(async (row) => {
    const value = await decryptCredentialPayload(env.KEY_ENCRYPTION_SECRET, row.encrypted_payload, row.iv)
    return [row.provider_id, value.mode === 'tencent-cloud' ? 'tencent-cloud' : 'tokenhub']
  }))
  const configuredProviders = [...new Set([
    ...credentials.filter((item) => item.maskedApiKey || item.authMode === 'tencent-cloud').map((item) => item.providerId),
    ...(globalRows.results || []).map((row) => row.provider_id),
  ])]
  const personalProviders = credentials
    .filter((item) => item.maskedApiKey || item.authMode === 'tencent-cloud')
    .map((item) => item.providerId)
  return { credentials, configuredProviders, personalProviders, authModes: Object.fromEntries([
    ...credentials.map((item) => [item.providerId, item.authMode]),
    ...globalAuthModes,
  ]) }
}

async function saveAccountCredential(env, userId, providerId, body) {
  const apiKey = cleanText(body.apiKey, 8_000).trim()
  const accountId = cleanText(body.accountId, 500).trim()
  const mode = body.mode === 'tencent-cloud' ? 'tencent-cloud' : 'tokenhub'
  const secretId = cleanText(body.secretId, 256).trim()
  const secretKey = cleanText(body.secretKey, 512).trim()
  const region = cleanText(body.region, 64).trim() || 'ap-guangzhou'
  if ((mode === 'tokenhub' && !apiKey) || (mode === 'tencent-cloud' && (!secretId || !secretKey))) {
    throw new Error(mode === 'tencent-cloud' ? '腾讯云 SecretId 和 SecretKey 不能为空' : 'API Key 不能为空')
  }
  const encrypted = await encryptCredentialPayload(env.KEY_ENCRYPTION_SECRET, { apiKey, accountId, mode, secretId, secretKey, region })
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
      maskedApiKey: maskCredential(credentials.apiKey || credentials.secretId),
      authMode: credentials.mode === 'tencent-cloud' ? 'tencent-cloud' : 'tokenhub',
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
      maskedApiKey: maskCredential(credentials.apiKey || credentials.secretId),
      authMode: credentials.mode === 'tencent-cloud' ? 'tencent-cloud' : 'tokenhub',
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
  return {
    apiKey: credentials.apiKey || '',
    secretId: credentials.secretId || '',
    secretKey: credentials.secretKey || '',
    region: credentials.region || '',
    authMode: credentials.mode === 'tencent-cloud' ? 'tencent-cloud' : 'tokenhub',
  }
}

async function saveGlobalCredential(env, adminId, providerId, body) {
  const apiKey = cleanText(body.apiKey, 8_000).trim()
  const accountId = cleanText(body.accountId, 500).trim()
  if (body.mode === 'tencent-cloud') {
    const secretId = cleanText(body.secretId, 256).trim()
    const secretKey = cleanText(body.secretKey, 512).trim()
    const region = cleanText(body.region, 64).trim() || 'ap-guangzhou'
    if (!secretId || !secretKey) throw new Error('腾讯云凭据不完整')
    const encrypted = await encryptCredentialPayload(env.KEY_ENCRYPTION_SECRET, { apiKey: '', accountId, mode: 'tencent-cloud', secretId, secretKey, region })
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
    `).bind(crypto.randomUUID(), providerId, encrypted.encryptedPayload, encrypted.iv, adminId, now, now).run()
    return { providerId, updatedAt: now }
  }
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
    if (path === '/api/catalog/custom-models' && request.method === 'GET') {
      return json({ models: await listCustomModels(env, false) })
    }
    if (path === '/api/agent/scheduled/run' && request.method === 'POST') {
      const expected = typeof env.SCHEDULER_HEALTH_TOKEN === 'string' ? env.SCHEDULER_HEALTH_TOKEN : ''
      const supplied = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || ''
      if (!expected || !constantTimeEqual(expected, supplied)) return errorResponse('接口不存在', 404)
      const results = await executeDueAgentTasks(env)
      return json({ ok: true, processed: results.length, results })
    }

    const user = await currentUser(env, request)
    if (path === '/api/auth/me' && request.method === 'GET') {
      return json({ user: user ? publicUser(user) : null })
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
    if (path === '/api/assets' && request.method === 'POST') {
      return await registerGeneratedAsset(env, request, user)
    }
    const assetContentMatch = path.match(/^\/api\/assets\/([^/]+)\/content$/)
    if (assetContentMatch && (request.method === 'GET' || request.method === 'HEAD')) {
      return await assetContent(env, request, user, decodeURIComponent(assetContentMatch[1]))
    }

    if (path === '/api/agent/run-stream' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          const send = (event, data) => {
            try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) } catch { /* 客户端已断开 */ }
          }
          void runAgent(env, user.id, body, request.signal, (event) => send('progress', event))
            .then((result) => send('result', result))
            .catch((error) => send('error', { error: error instanceof Error ? error.message : 'Agent 执行失败' }))
            .finally(() => { try { controller.close() } catch { /* 客户端已断开 */ } })
        },
      })
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } })
    }
    if (path === '/api/agent/run' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json(await runAgent(env, user.id, body, request.signal))
    }
    if (path === '/api/agent/state' && request.method === 'GET') {
      return json(await agentState(env, user.id))
    }
    const agentApprovalMatch = path.match(/^\/api\/agent\/approvals\/([^/]+)\/(approve|reject)$/)
    if (agentApprovalMatch && request.method === 'POST') {
      return json(await resolveAgentApproval(env, user.id, decodeURIComponent(agentApprovalMatch[1]), agentApprovalMatch[2], request.signal))
    }
    const agentResumeMatch = path.match(/^\/api\/agent\/runs\/([^/]+)\/resume$/)
    if (agentResumeMatch && request.method === 'POST') {
      return json(await resumeAgentExecution(env, user.id, decodeURIComponent(agentResumeMatch[1]), request.signal))
    }
    const agentConversationMatch = path.match(/^\/api\/agent\/conversations\/([^/]+)$/)
    if (agentConversationMatch && request.method === 'DELETE') {
      await deleteConversation(env, user.id, decodeURIComponent(agentConversationMatch[1]))
      return json({ ok: true })
    }
    const agentMemoryMatch = path.match(/^\/api\/agent\/memories\/([^/]+)$/)
    if (agentMemoryMatch && request.method === 'DELETE') {
      await deleteMemory(env, user.id, decodeURIComponent(agentMemoryMatch[1]))
      return json({ ok: true })
    }
    const agentTaskMatch = path.match(/^\/api\/agent\/tasks\/([^/]+)$/)
    if (agentTaskMatch && request.method === 'DELETE') {
      await cancelTask(env, user.id, decodeURIComponent(agentTaskMatch[1]))
      return json({ ok: true })
    }
    if (path === '/api/agent/feedback' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json(await saveFeedback(env, user.id, body))
    }
    if (path === '/api/agent/workflows' && request.method === 'GET') {
      return json({ workflows: await listProductionWorkflows(env, user.id) })
    }
    if (path === '/api/agent/workflows' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return json(await createProductionWorkflow(env, user.id, body), 201)
    }
    const agentWorkflowMatch = path.match(/^\/api\/agent\/workflows\/([^/]+)$/)
    if (agentWorkflowMatch && request.method === 'GET') {
      return json(await getProductionWorkflow(env, user.id, decodeURIComponent(agentWorkflowMatch[1])))
    }
    const agentWorkflowActionMatch = path.match(/^\/api\/agent\/workflows\/([^/]+)\/(advance|approve|report|rollback)$/)
    if (agentWorkflowActionMatch && request.method === 'POST') {
      const workflowId = decodeURIComponent(agentWorkflowActionMatch[1])
      const action = agentWorkflowActionMatch[2]
      const body = await request.json().catch(() => ({}))
      if (action === 'advance') return json(await advanceProductionWorkflow(env, user.id, workflowId, request.signal))
      if (action === 'approve') return json(await approveProductionWorkflow(env, user.id, workflowId))
      if (action === 'report') return json(await reportProductionCommand(env, user.id, workflowId, body))
      return json(await rollbackProductionWorkflow(env, user.id, workflowId, cleanText(body.stepId, 80)))
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
    if (!path.startsWith('/api/admin/')) return errorResponse('接口不存在', 404)
    if (user.role !== 'admin') return errorResponse('需要管理员权限', 403)

    if (path === '/api/admin/overview' && request.method === 'GET') {
      return json(await adminOverview(env))
    }
    if (path === '/api/admin/users' && request.method === 'GET') {
      const result = await adminUsers(env, url)
      return json({ users: result.items, pagination: result.pagination })
    }
    if (path === '/api/admin/records' && request.method === 'GET') {
      const result = await adminRecords(env, url)
      return json({ records: result.items, pagination: result.pagination })
    }
    if (path === '/api/admin/assets' && request.method === 'GET') {
      const result = await adminAssets(env, url)
      return json({ assets: result.items, pagination: result.pagination })
    }
    if (path === '/api/admin/storage/verify' && request.method === 'POST') {
      return await verifyAdminStorage(env, request, user)
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
