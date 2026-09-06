import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { encryptCredentialPayload } from '../functions/_secure_keys.js'
import { agentState, resolveAgentApproval, runAgent } from '../functions/_agent_runtime.js'
import { evaluateToolCall, normalizeModelUsage, stableJson, toolPolicy } from '../functions/_agent_governance.js'
import { cosineSimilarity } from '../functions/_agent_memory.js'

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

const encryptionSecret = 'agent-reliability-secret-32-chars'
const models = [{ id: 'openrouter:qa', apiModel: 'qa/reliable', name: 'QA Reliable', providerId: 'openrouter', provider: 'OpenRouter', pricing: 'free' }]

async function createEnvironment() {
  const DB = new D1Database()
  const userId = 'agent-reliability-user'
  const now = Date.now()
  await DB.prepare("INSERT INTO users (id,email,display_name,password_hash,password_salt,role,created_at) VALUES (?,?,?,?,?,'user',?)")
    .bind(userId, 'reliability@example.com', 'Reliability', 'hash', 'salt', now).run()
  const encrypted = await encryptCredentialPayload(encryptionSecret, { apiKey: 'mock-openrouter' })
  await DB.prepare('INSERT INTO user_provider_credentials (id,user_id,provider_id,encrypted_payload,iv,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), userId, 'openrouter', encrypted.encryptedPayload, encrypted.iv, now, now).run()
  await DB.prepare(`INSERT INTO agent_tasks
    (id,user_id,title,prompt,mode,models_json,schedule_type,status,next_run_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,'once','active',?,?,?)`)
    .bind('task-to-cancel', userId, '待取消任务', 'noop', 'chat', '[]', now + 60_000, now, now).run()
  return { env: { DB, KEY_ENCRYPTION_SECRET: encryptionSecret }, userId }
}

test('工具治理对危险操作默认失败关闭，并识别用户明确授权', () => {
  assert.equal(toolPolicy('cancel_task').risk, 'destructive')
  assert.equal(evaluateToolCall({ tool: 'cancel_task', prompt: '取消这个任务' }).requiresApproval, true)
  assert.equal(evaluateToolCall({ tool: 'create_task', prompt: '每天九点提醒我' }).requiresApproval, false)
  assert.equal(evaluateToolCall({ tool: 'save_memory', prompt: '记住我偏好中文' }).requiresApproval, false)
  assert.equal(evaluateToolCall({ tool: 'unknown_tool', prompt: '' }).requiresApproval, true)
  assert.equal(stableJson({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}')
})

test('统一模型用量解析支持 Token、缓存和费用', () => {
  assert.deepEqual(normalizeModelUsage({ usage: {
    prompt_tokens: 120, completion_tokens: 30, total_tokens: 150,
    prompt_tokens_details: { cached_tokens: 40 }, cost: 0.00125,
  } }), { inputTokens: 120, outputTokens: 30, totalTokens: 150, cachedTokens: 40, costMicrousd: 1250 })
})

test('向量相似度为混合记忆排序提供稳定语义分数', () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1)
  assert.equal(cosineSimilarity([1, 0, 0], [0, 1, 0]), 0)
})

test('危险工具持久化等待审批，批准后幂等执行并继续 Agent', async () => {
  const { env, userId } = await createEnvironment()
  let modelCalls = 0
  const streamedEvents = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    modelCalls += 1
    const content = modelCalls === 1
      ? { type: 'tool', tool: 'cancel_task', arguments: { taskId: 'task-to-cancel' }, reason: '取消任务' }
      : { type: 'final', content: '已按批准结果完成任务取消。' }
    return Response.json({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, prompt_tokens_details: { cached_tokens: 2 }, cost: 0.00001 },
    })
  }
  try {
    const pending = await runAgent(env, userId, { prompt: '取消 task-to-cancel', mode: 'chat', models, orchestration: 'standard' }, undefined, (event) => streamedEvents.push(event))
    assert.equal(pending.status, 'waiting_approval')
    assert.equal(pending.pendingApproval.tool, 'cancel_task')
    assert.equal(pending.metrics.totalTokens, 15)
    let state = await agentState(env, userId)
    assert.equal(state.pendingApprovals.length, 1)
    const resolved = await resolveAgentApproval(env, userId, pending.pendingApproval.id, 'approve')
    assert.equal(resolved.approval.status, 'approved')
    assert.equal(resolved.continuation.message.content, '已按批准结果完成任务取消。')
    const task = await env.DB.prepare('SELECT status FROM agent_tasks WHERE id = ?').bind('task-to-cancel').first()
    assert.equal(task.status, 'cancelled')
    const replay = await resolveAgentApproval(env, userId, pending.pendingApproval.id, 'approve')
    assert.equal(replay.continuation, null)
    state = await agentState(env, userId)
    assert.equal(state.pendingApprovals.length, 0)
    const events = await env.DB.prepare('SELECT phase, status FROM agent_run_events WHERE run_id = ? ORDER BY created_at').bind(pending.runId).all()
    assert.ok(events.results.some((event) => event.status === 'waiting_approval'))
    assert.ok(events.results.some((event) => event.status === 'approved'))
    assert.ok(streamedEvents.some((event) => event.status === 'waiting_approval'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Token 预算在下一次模型调用前熔断并保留检查点', async () => {
  const { env, userId } = await createEnvironment()
  let modelCalls = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    modelCalls += 1
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ type: 'tool', tool: 'recall_memory', arguments: {}, reason: '读取上下文' }) } }],
      usage: { prompt_tokens: 2_000, completion_tokens: 500, total_tokens: 2_500 },
    })
  }
  try {
    const result = await runAgent(env, userId, {
      prompt: '读取上下文后继续分析', mode: 'chat', models, orchestration: 'standard', budget: { maxTotalTokens: 2_000, maxCostMicrousd: 0 },
    })
    assert.equal(modelCalls, 1)
    assert.equal(result.budget.exceeded, true)
    assert.match(result.message.content, /Token 或费用预算/)
    const checkpoint = await env.DB.prepare('SELECT status, phase FROM agent_run_checkpoints WHERE run_id = ?').bind(result.runId).first()
    assert.equal(checkpoint.status, 'completed')
  } finally {
    globalThis.fetch = originalFetch
  }
})
