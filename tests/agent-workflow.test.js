import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { encryptCredentialPayload } from '../functions/_secure_keys.js'
import {
  advanceProductionWorkflow,
  approveProductionWorkflow,
  createProductionWorkflow,
  reportProductionCommand,
  rollbackProductionWorkflow,
  validateClientArtifact,
} from '../functions/_agent_workflow.js'

class D1Database {
  constructor() {
    this.database = new DatabaseSync(':memory:')
    for (const name of ['0001_auth_and_activity.sql', '0002_credentials_and_custom_models.sql', '0004_agent_runtime.sql', '0005_agent_workflows.sql']) {
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

const encryptionSecret = 'workflow-test-secret-at-least-24-characters'
const freeModels = [
  { id: 'openrouter:test-free', apiModel: 'test/free', name: 'OpenRouter Test', providerId: 'openrouter', provider: 'OpenRouter', pricing: 'free' },
]

async function createEnvironment(providerIds = ['openrouter']) {
  const DB = new D1Database()
  const userId = 'user-test'
  const now = Date.now()
  await DB.prepare("INSERT INTO users (id,email,display_name,password_hash,password_salt,role,created_at) VALUES (?,?,?,?,?,'user',?)")
    .bind(userId, 'test@example.com', 'Test', 'hash', 'salt', now).run()
  for (const providerId of providerIds) {
    const encrypted = await encryptCredentialPayload(encryptionSecret, { apiKey: `mock-${providerId}` })
    await DB.prepare('INSERT INTO user_provider_credentials (id,user_id,provider_id,encrypted_payload,iv,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), userId, providerId, encrypted.encryptedPayload, encrypted.iv, now, now).run()
  }
  return { env: { DB, KEY_ENCRYPTION_SECRET: encryptionSecret }, userId }
}

function installFetchMock(handler = () => undefined) {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (url, init) => {
    calls += 1
    const body = JSON.parse(init.body)
    const custom = await handler({ url: String(url), body, calls })
    if (custom instanceof Response) return custom
    const system = body.messages?.[0]?.content || ''
    const content = system.includes('独立制片审查员')
      ? JSON.stringify({ pass: true, score: 92, summary: '结构完整且可执行', issues: [], suggestions: [] })
      : `稳定产物 ${calls}`
    return Response.json({ choices: [{ message: { content } }] })
  }
  return { calls: () => calls, restore: () => { globalThis.fetch = original } }
}

function validArtifact(command) {
  if (command.kind === 'image') return { assets: [{ id: 'image-1', url: 'https://assets.example/image.webp' }] }
  if (command.kind === 'audio') return { generated: true, bytes: 4_096, modelId: 'tts-free' }
  return { url: 'https://assets.example/video.mp4', taskId: 'video-task-1' }
}

async function completeWorkflow(env, userId, workflow) {
  let state = workflow
  for (let index = 0; index < 20 && state.status !== 'completed'; index += 1) {
    state = await advanceProductionWorkflow(env, userId, state.id)
    if (state.pendingCommand) {
      state = await reportProductionCommand(env, userId, state.id, {
        stepId: state.pendingCommand.stepId,
        commandId: state.pendingCommand.id,
        ok: true,
        output: validArtifact(state.pendingCommand),
      })
    }
  }
  return state
}

test('自动生产流程完成九个阶段，并为每个阶段保存审查与 Skill', async () => {
  const { env, userId } = await createEnvironment()
  const mocked = installFetchMock()
  try {
    const created = await createProductionWorkflow(env, userId, { brief: '自动完成一支 15 秒品牌短片', autoApprove: true, models: freeModels })
    const state = await completeWorkflow(env, userId, created)
    assert.equal(state.status, 'completed')
    assert.deepEqual(state.steps.map((step) => step.stage), ['moodboard', 'script', 'character', 'scene', 'storyboard', 'image', 'audio', 'video', 'editing'])
    assert.ok(state.steps.every((step) => step.review.pass === true))
    assert.ok(state.steps.filter((step) => ['moodboard', 'script', 'character', 'scene', 'storyboard', 'image', 'video', 'editing'].includes(step.stage)).every((step) => step.skills.length > 0))
    assert.ok(mocked.calls() >= 18)
  } finally { mocked.restore() }
})

test('非自动流程在情绪板确认门暂停，确认后继续', async () => {
  const { env, userId } = await createEnvironment()
  const mocked = installFetchMock()
  try {
    const created = await createProductionWorkflow(env, userId, { brief: '制作一支产品短片', autoApprove: false, models: freeModels })
    const waiting = await advanceProductionWorkflow(env, userId, created.id)
    assert.equal(waiting.status, 'waiting_approval')
    assert.equal(waiting.steps[0].status, 'waiting_approval')
    const approved = await approveProductionWorkflow(env, userId, created.id)
    assert.equal(approved.status, 'running')
    assert.equal(approved.currentStage, 'script')
  } finally { mocked.restore() }
})

test('审查失败会触发一次完整重写，并保留 attempt=2', async () => {
  const { env, userId } = await createEnvironment()
  let reviews = 0
  const mocked = installFetchMock(({ body }) => {
    if (!(body.messages?.[0]?.content || '').includes('独立制片审查员')) return undefined
    reviews += 1
    return Response.json({ choices: [{ message: { content: JSON.stringify(reviews === 1
      ? { pass: false, score: 45, summary: '缺少验收标准', issues: ['验收标准缺失'], suggestions: ['补充验收标准'] }
      : { pass: true, score: 91, summary: '修订通过', issues: [], suggestions: [] }) } }] })
  })
  try {
    const created = await createProductionWorkflow(env, userId, { brief: '自动制作测试短片', autoApprove: true, models: freeModels })
    const state = await advanceProductionWorkflow(env, userId, created.id)
    assert.equal(state.steps[0].attempt, 2)
    assert.equal(state.steps[0].review.repaired, true)
    assert.equal(state.steps[0].review.pass, true)
  } finally { mocked.restore() }
})

test('首选模型故障时自动切换下一个免费模型', async () => {
  const { env, userId } = await createEnvironment(['openrouter', 'groq'])
  const models = [...freeModels, { id: 'groq:test-free', apiModel: 'test-free', name: 'Groq Test', providerId: 'groq', provider: 'Groq', pricing: 'free' }]
  const mocked = installFetchMock(({ url }) => url.includes('openrouter.ai') ? new Response(JSON.stringify({ error: { message: 'injected outage' } }), { status: 503, headers: { 'Content-Type': 'application/json' } }) : undefined)
  try {
    const created = await createProductionWorkflow(env, userId, { brief: '自动制作故障切换短片', autoApprove: true, models })
    const state = await advanceProductionWorkflow(env, userId, created.id)
    const attempts = state.steps[0].output.routingAttempts
    assert.equal(attempts[0].status, 'failed')
    assert.equal(attempts[1].status, 'success')
    assert.equal(state.steps[0].output.model.provider, 'Groq')
  } finally { mocked.restore() }
})

test('并发 advance 只创建一个阶段版本', async () => {
  const { env, userId } = await createEnvironment()
  const mocked = installFetchMock(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
  try {
    const created = await createProductionWorkflow(env, userId, { brief: '自动制作并发测试短片', autoApprove: true, models: freeModels })
    await Promise.all([advanceProductionWorkflow(env, userId, created.id), advanceProductionWorkflow(env, userId, created.id)])
    const rows = await env.DB.prepare('SELECT COUNT(*) AS count FROM agent_workflow_steps WHERE workflow_id = ?').bind(created.id).first()
    assert.equal(Number(rows.count), 1)
  } finally { mocked.restore() }
})

test('页面结果上报幂等，回退后创建新版本', async () => {
  const { env, userId } = await createEnvironment()
  const mocked = installFetchMock()
  try {
    let state = await createProductionWorkflow(env, userId, { brief: '自动制作回退测试短片', autoApprove: true, models: freeModels })
    for (let index = 0; index < 6; index += 1) state = await advanceProductionWorkflow(env, userId, state.id)
    assert.equal(state.pendingCommand.kind, 'image')
    const body = { stepId: state.pendingCommand.stepId, commandId: state.pendingCommand.id, ok: true, output: validArtifact(state.pendingCommand) }
    const first = await reportProductionCommand(env, userId, state.id, body)
    const duplicate = await reportProductionCommand(env, userId, state.id, body)
    assert.equal(duplicate.currentStage, first.currentStage)
    const target = state.steps.find((step) => step.stage === 'storyboard')
    const rolledBack = await rollbackProductionWorkflow(env, userId, state.id, target.id)
    const regenerated = await advanceProductionWorkflow(env, userId, state.id)
    assert.equal(rolledBack.currentStage, 'storyboard')
    assert.equal(regenerated.steps.filter((step) => step.stage === 'storyboard').at(-1).version, 2)
  } finally { mocked.restore() }
})

test('页面产物校验拒绝空结果', () => {
  assert.equal(validateClientArtifact('image', {}).pass, false)
  assert.equal(validateClientArtifact('audio', { generated: true, bytes: 20, modelId: 'x' }).pass, false)
  assert.equal(validateClientArtifact('video', { taskId: 'task' }).pass, true)
})
