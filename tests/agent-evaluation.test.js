import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { encryptCredentialPayload } from '../functions/_secure_keys.js'
import { agentState, runAgent } from '../functions/_agent_runtime.js'

class D1Database {
  constructor() {
    this.database = new DatabaseSync(':memory:')
    for (const name of ['0001_auth_and_activity.sql', '0002_credentials_and_custom_models.sql', '0004_agent_runtime.sql', '0010_agent_plans.sql', '0011_agent_runs.sql', '0012_agent_reliability.sql']) {
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

const encryptionSecret = 'agent-evaluation-secret-32-characters'
const models = [
  { id: 'openrouter:planner', apiModel: 'qa/planner', name: 'QA Planner', providerId: 'openrouter', provider: 'OpenRouter', pricing: 'free' },
  { id: 'groq:critic', apiModel: 'qa/critic', name: 'QA Critic', providerId: 'groq', provider: 'Groq', pricing: 'free' },
]

async function createEnvironment(providerIds = ['openrouter', 'groq']) {
  const DB = new D1Database()
  const userId = 'agent-evaluation-user'
  const now = Date.now()
  await DB.prepare("INSERT INTO users (id,email,display_name,password_hash,password_salt,role,created_at) VALUES (?,?,?,?,?,'user',?)")
    .bind(userId, 'agent-eval@example.com', 'Agent Evaluation', 'hash', 'salt', now).run()
  for (const providerId of providerIds) {
    const encrypted = await encryptCredentialPayload(encryptionSecret, { apiKey: `mock-${providerId}` })
    await DB.prepare('INSERT INTO user_provider_credentials (id,user_id,provider_id,encrypted_payload,iv,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), userId, providerId, encrypted.encryptedPayload, encrypted.iv, now, now).run()
  }
  return { env: { DB, KEY_ENCRYPTION_SECRET: encryptionSecret }, userId }
}

function installFetchMock(handler) {
  const original = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = original }
}

function roleFromRequest(init) {
  const request = JSON.parse(init.body)
  const system = request.messages[0]?.content || ''
  if (/Planner Agent/.test(system)) return { role: 'planner', request }
  if (/Critic Agent/.test(system)) return { role: 'critic', request }
  if (/Repair Agent/.test(system)) return { role: 'repair', request }
  return { role: 'executor', request }
}

test('完整编排由 Planner、Executor、Critic 协作并持久化运行指标', async () => {
  const { env, userId } = await createEnvironment()
  const roles = []
  const restore = installFetchMock(async (_url, init) => {
    const { role } = roleFromRequest(init)
    roles.push(role)
    if (role === 'planner') return Response.json({ choices: [{ message: { content: JSON.stringify({ goal: '核验资料并形成结论', steps: [{ id: 'verify', title: '核验资料' }, { id: 'answer', title: '形成结论' }] }) } }] })
    if (role === 'critic') return Response.json({ choices: [{ message: { content: JSON.stringify({ pass: true, score: 94, summary: '任务已完整完成', issues: [], completedStepIds: ['verify', 'answer'], blockedStepIds: [] }) } }] })
    return Response.json({ choices: [{ message: { content: JSON.stringify({ type: 'final', content: '已核验资料并形成结论。' }) } }] })
  })
  try {
    const result = await runAgent(env, userId, { prompt: '搜索并核验资料，然后整理和总结最终结论', mode: 'chat', models, orchestration: 'full' })
    assert.deepEqual(roles, ['planner', 'executor', 'critic'])
    assert.equal(result.review.pass, true)
    assert.equal(result.plan.status, 'completed')
    assert.equal(result.metrics.modelCalls, 3)
    assert.equal(result.metrics.criticScore, 94)
    const state = await agentState(env, userId)
    assert.equal(state.runs[0].id, result.runId)
    assert.equal(state.runs[0].orchestration, 'full')
    assert.equal(state.runs[0].critic_score, 94)
  } finally { restore() }
})

test('Critic 拒绝低质量答案后触发 Repair，并对修复结果二次审查', async () => {
  const { env, userId } = await createEnvironment()
  const roles = []
  let criticCalls = 0
  const restore = installFetchMock(async (_url, init) => {
    const { role } = roleFromRequest(init)
    roles.push(role)
    if (role === 'planner') return Response.json({ choices: [{ message: { content: JSON.stringify({ goal: '比较方案并给出依据', steps: [{ id: 'compare', title: '比较方案' }, { id: 'evidence', title: '补充依据' }] }) } }] })
    if (role === 'repair') return Response.json({ choices: [{ message: { content: JSON.stringify({ type: 'final', content: '修复后的答案包含比较依据和限制说明。' }) } }] })
    if (role === 'critic') {
      criticCalls += 1
      const review = criticCalls === 1
        ? { pass: false, score: 42, summary: '缺少比较依据', issues: ['没有说明限制'], completedStepIds: ['compare'], blockedStepIds: ['evidence'] }
        : { pass: true, score: 96, summary: '问题已修复', issues: [], completedStepIds: ['compare', 'evidence'], blockedStepIds: [] }
      return Response.json({ choices: [{ message: { content: JSON.stringify(review) } }] })
    }
    return Response.json({ choices: [{ message: { content: JSON.stringify({ type: 'final', content: '原始答案：都可以。' }) } }] })
  })
  try {
    const result = await runAgent(env, userId, { prompt: '比较两个实现方案，然后分析限制并给出有依据的结论', mode: 'chat', models, orchestration: 'full' })
    assert.deepEqual(roles, ['planner', 'executor', 'critic', 'repair', 'critic'])
    assert.equal(result.message.content, '修复后的答案包含比较依据和限制说明。')
    assert.equal(result.review.pass, true)
    assert.equal(result.metrics.repaired, true)
    assert.equal(result.metrics.criticScore, 96)
    assert.equal(result.plan.status, 'completed')
  } finally { restore() }
})

test('简单任务跳过 Planner，但完整模式仍执行独立审查', async () => {
  const { env, userId } = await createEnvironment()
  const roles = []
  const restore = installFetchMock(async (_url, init) => {
    const { role } = roleFromRequest(init)
    roles.push(role)
    if (role === 'critic') return Response.json({ choices: [{ message: { content: JSON.stringify({ pass: true, score: 90, summary: '回答有效', issues: [], completedStepIds: [], blockedStepIds: [] }) } }] })
    return Response.json({ choices: [{ message: { content: JSON.stringify({ type: 'final', content: '你好！' }) } }] })
  })
  try {
    const result = await runAgent(env, userId, { prompt: '你好', mode: 'chat', models, orchestration: 'full' })
    assert.deepEqual(roles, ['executor', 'critic'])
    assert.equal(result.plan, null)
    assert.equal(result.metrics.modelCalls, 2)
  } finally { restore() }
})

test('执行失败也写入可观测运行记录', async () => {
  const { env, userId } = await createEnvironment([])
  await assert.rejects(() => runAgent(env, userId, { prompt: '执行失败场景', mode: 'chat', models, orchestration: 'full' }), /没有已配置/)
  const state = await agentState(env, userId)
  assert.equal(state.runs[0].status, 'failed')
  assert.equal(state.runs[0].orchestration, 'full')
  assert.match(state.runs[0].error, /没有已配置/)
  assert.equal(state.recoverableRuns[0].run_id, state.runs[0].id)
})
