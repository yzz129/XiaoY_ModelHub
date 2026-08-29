import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { encryptCredentialPayload } from '../functions/_secure_keys.js'
import { agentState, normalizeModels, runAgent } from '../functions/_agent_runtime.js'
import { onRequest as handleApiRequest } from '../functions/api/[[path]].js'
import agentScheduler from '../workers/agent-scheduler.js'

class D1Database {
  constructor() {
    this.database = new DatabaseSync(':memory:')
    for (const name of ['0001_auth_and_activity.sql', '0002_credentials_and_custom_models.sql', '0004_agent_runtime.sql']) {
      this.database.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
    }
  }

  prepare(sql) {
    const database = this.database
    return {
      bind(...parameters) {
        return {
          async first() { return database.prepare(sql).get(...parameters) },
          async all() { return { results: database.prepare(sql).all(...parameters) } },
          async run() {
            const result = database.prepare(sql).run(...parameters)
            return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid || 0) } }
          },
        }
      },
    }
  }
}

const encryptionSecret = 'agent-runtime-test-secret-32-characters'
const freeModels = [
  { id: 'openrouter:qa-free', apiModel: 'qa/free', name: 'QA Free', providerId: 'openrouter', provider: 'OpenRouter', pricing: 'free' },
]

async function createEnvironment(providerIds = ['openrouter']) {
  const DB = new D1Database()
  const userId = 'agent-runtime-user'
  const now = Date.now()
  await DB.prepare("INSERT INTO users (id,email,display_name,password_hash,password_salt,role,created_at) VALUES (?,?,?,?,?,'user',?)")
    .bind(userId, 'runtime@example.com', 'Runtime QA', 'hash', 'salt', now).run()
  for (const providerId of providerIds) {
    const encrypted = await encryptCredentialPayload(encryptionSecret, { apiKey: `mock-${providerId}` })
    await DB.prepare('INSERT INTO user_provider_credentials (id,user_id,provider_id,encrypted_payload,iv,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), userId, providerId, encrypted.encryptedPayload, encrypted.iv, now, now).run()
  }
  return { env: { DB, KEY_ENCRYPTION_SECRET: encryptionSecret, TAVILY_API_KEY: 'mock-tavily' }, userId }
}

function installFetchMock(handler) {
  const original = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = original }
}

test('免费模型输入会过滤付费、未知服务商和重复模型', () => {
  assert.deepEqual(normalizeModels([
    ...freeModels,
    { ...freeModels[0], id: 'duplicate' },
    { ...freeModels[0], id: 'paid', apiModel: 'qa/paid', pricing: 'paid' },
    { ...freeModels[0], id: 'unknown', apiModel: 'qa/unknown', providerId: 'unknown-provider' },
  ]), freeModels)
})

test('Agent 可连续执行联网、记忆与定时任务工具并持久化结果', async () => {
  const { env, userId } = await createEnvironment()
  let modelCalls = 0
  const restore = installFetchMock(async (url, init) => {
    if (String(url).includes('api.tavily.com')) {
      return Response.json({ results: [{ title: '官方模型目录', url: 'https://example.com/models', content: 'free model list', score: 0.98 }] })
    }
    modelCalls += 1
    const decisions = [
      { type: 'tool', tool: 'save_memory', arguments: { kind: 'preference', content: '偏好简洁中文', tags: ['输出'], importance: 4 }, reason: '保存稳定偏好' },
      { type: 'tool', tool: 'create_task', arguments: { title: '每日免费模型巡检', prompt: '联网检查最新免费模型', scheduleType: 'interval', intervalMinutes: 1 }, reason: '建立巡检任务' },
      { type: 'final', content: '已核验并完成设置。[官方模型目录](https://example.com/models)' },
    ]
    const request = JSON.parse(init.body)
    assert.equal(request.model, 'qa/free')
    return Response.json({ choices: [{ message: { content: JSON.stringify(decisions[modelCalls - 1]) } }] })
  })
  try {
    const result = await runAgent(env, userId, { prompt: '联网检查最新免费模型，记住我偏好简洁中文，并建立每日巡检', mode: 'chat', models: freeModels })
    assert.equal(modelCalls, 3)
    assert.deepEqual(result.trace.map((item) => item.tool), ['web_search', 'save_memory', 'create_task'])
    assert.equal(result.sources[0].url, 'https://example.com/models')
    assert.equal(result.model.apiModel, 'qa/free')
    const state = await agentState(env, userId)
    assert.equal(state.memories[0].content, '偏好简洁中文')
    assert.equal(state.tasks[0].title, '每日免费模型巡检')
    assert.equal(state.tasks[0].interval_minutes, 5)
    assert.equal(state.messages.at(-1).content, result.message.content)
  } finally {
    restore()
  }
})

test('Agent 会解析免费模型输出的 XML 工具协议且不向用户泄露内部标签', async () => {
  const { env, userId } = await createEnvironment()
  let modelCalls = 0
  const restore = installFetchMock(async (url) => {
    if (String(url).includes('api.tavily.com')) {
      return Response.json({ results: [{ title: '趋势来源', url: 'https://example.com/trends', content: 'verified trend', score: 0.97 }] })
    }
    modelCalls += 1
    const content = modelCalls === 1
      ? '<tool_call>web_search\n<arg_key>query</arg_key>\n<arg_value>2026 生成式 AI 趋势</arg_value>\n</tool_call>'
      : JSON.stringify({ type: 'final', content: '已完成联网核验。[趋势来源](https://example.com/trends)' })
    return Response.json({ choices: [{ message: { content } }] })
  })
  try {
    const result = await runAgent(env, userId, { prompt: '分析生成式 AI 趋势', mode: 'chat', models: freeModels })
    assert.equal(modelCalls, 2)
    assert.equal(result.trace[0].tool, 'web_search')
    assert.equal(result.trace[0].status, 'success')
    assert.equal(result.sources[0].url, 'https://example.com/trends')
    assert.doesNotMatch(result.message.content, /<tool_call>|<arg_key>|<arg_value>/i)
  } finally {
    restore()
  }
})

test('Agent 会隐藏无法解析的内部工具协议并要求模型重新输出', async () => {
  const { env, userId } = await createEnvironment()
  let modelCalls = 0
  const restore = installFetchMock(async () => {
    modelCalls += 1
    const content = modelCalls === 1
      ? '<tool_call>web_search<arg_key>query</arg_key><arg_value>损坏的协议'
      : JSON.stringify({ type: 'final', content: '已恢复并输出正常结果。' })
    return Response.json({ choices: [{ message: { content } }] })
  })
  try {
    const result = await runAgent(env, userId, { prompt: '分析一个稳定主题', mode: 'chat', models: freeModels })
    assert.equal(modelCalls, 2)
    assert.equal(result.trace[0].tool, 'tool_protocol')
    assert.equal(result.trace[0].status, 'failed')
    assert.equal(result.message.content, '已恢复并输出正常结果。')
  } finally {
    restore()
  }
})

test('首个免费模型故障时会切换到下一服务商', async () => {
  const { env, userId } = await createEnvironment(['openrouter', 'groq'])
  const models = [...freeModels, { id: 'groq:qa-free', apiModel: 'qa-groq-free', name: 'Groq QA', providerId: 'groq', provider: 'Groq', pricing: 'free' }]
  const restore = installFetchMock(async (url) => {
    if (String(url).includes('openrouter.ai')) return Response.json({ error: { message: 'injected outage' } }, { status: 503 })
    return Response.json({ choices: [{ message: { content: JSON.stringify({ type: 'final', content: '备用免费模型已接管' }) } }] })
  })
  try {
    const result = await runAgent(env, userId, { prompt: '完成稳定性回归', mode: 'chat', models })
    assert.equal(result.model.providerId, 'groq')
    assert.equal(result.trace[0].tool, 'model')
    assert.equal(result.trace[0].status, 'failed')
    assert.match(result.message.content, /备用免费模型/)
  } finally {
    restore()
  }
})

test('定时 Worker 通过受保护的 Pages 端点执行任务', async () => {
  let pending
  let request
  const restore = installFetchMock(async (url, init) => {
    request = { url: String(url), init }
    return Response.json({ ok: true, processed: 1, results: [{ id: 'task-qa', status: 'success' }] })
  })
  try {
    await agentScheduler.scheduled({}, {
      SCHEDULER_ENDPOINT: 'https://example.com/api/agent/scheduled/run',
      SCHEDULER_HEALTH_TOKEN: 'scheduler-test-token',
    }, { waitUntil(value) { pending = value } })
    await pending
    assert.equal(request.url, 'https://example.com/api/agent/scheduled/run')
    assert.equal(request.init.method, 'POST')
    assert.equal(request.init.headers.Authorization, 'Bearer scheduler-test-token')
  } finally {
    restore()
  }
})

test('Pages 调度端点拒绝错误令牌并允许正确令牌', async () => {
  const { env } = await createEnvironment()
  const schedulerEnv = { ...env, SCHEDULER_HEALTH_TOKEN: 'scheduler-test-token' }
  const denied = await handleApiRequest({
    request: new Request('https://example.com/api/agent/scheduled/run', { method: 'POST', headers: { Authorization: 'Bearer wrong-token' } }),
    env: schedulerEnv,
  })
  assert.equal(denied.status, 404)
  const accepted = await handleApiRequest({
    request: new Request('https://example.com/api/agent/scheduled/run', { method: 'POST', headers: { Authorization: 'Bearer scheduler-test-token' } }),
    env: schedulerEnv,
  })
  assert.equal(accepted.status, 200)
  assert.deepEqual(await accepted.json(), { ok: true, processed: 0, results: [] })
})
