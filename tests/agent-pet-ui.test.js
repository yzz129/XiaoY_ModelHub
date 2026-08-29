import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.env.XIAOY_UI_URL || 'http://127.0.0.1:43129'
const testEmail = 'agent-qa-20260829@example.com'
const testPassword = 'LocalQA-2026-Only'
const managedProcesses = []

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
    return response.status < 500
  } catch {
    return false
  }
}

async function waitUntilReachable(url, process, label) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (await reachable(url)) return
    if (process.exitCode !== null) throw new Error(`${label} 提前退出（exit ${process.exitCode}）`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`${label} 在 30 秒内未就绪`)
}

function startNodeScript(relativePath, args, env = {}) {
  const child = spawn(process.execPath, [fileURLToPath(new URL(relativePath, import.meta.url)), ...args], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, ...env },
    stdio: 'ignore',
    windowsHide: true,
  })
  managedProcesses.push(child)
  return child
}

function startCommand(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, ...env },
    stdio: 'ignore',
    windowsHide: true,
  })
  managedProcesses.push(child)
  return child
}

before(async () => {
  const target = new URL(baseUrl)
  if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname)) throw new Error('UI 回归测试默认只允许访问本地环境')

  if (!(await reachable('http://127.0.0.1:8788/api/auth/me'))) {
    const backend = process.platform === 'win32'
      ? startCommand(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npx wrangler pages dev dist --port 8788'])
      : startCommand('npx', ['wrangler', 'pages', 'dev', 'dist', '--port', '8788'])
    await waitUntilReachable('http://127.0.0.1:8788/api/auth/me', backend, '本地 Pages 后端')
  }
  if (!(await reachable(baseUrl))) {
    const frontend = startNodeScript('../node_modules/vite/bin/vite.js', ['--host', '127.0.0.1', '--port', '43129', '--strictPort'], {
      XIAOY_BACKEND_ORIGIN: 'http://127.0.0.1:8788',
    })
    await waitUntilReachable(baseUrl, frontend, 'Vite 前端')
  }

  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Agent QA', email: testEmail, password: testPassword }),
  })
  if (![201, 409].includes(response.status)) throw new Error(`无法准备本地 QA 账户：HTTP ${response.status}`)
})

async function stopManagedProcess(child) {
  if (child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
      killer.once('exit', resolve)
      killer.once('error', resolve)
    })
    return
  }
  child.kill('SIGTERM')
}

after(async () => {
  for (const child of managedProcesses.reverse()) await stopManagedProcess(child)
  await Promise.all(managedProcesses.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null) return resolve()
    child.once('exit', resolve)
    setTimeout(resolve, 2_000).unref()
  })))
})

async function openBrowser() {
  return chromium.launch({ channel: 'msedge', headless: true })
}

test('访客宠物可打开且保持登录锁定', async () => {
  const browser = await openBrowser()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const page = await context.newPage()
  const errors = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.getByLabel('打开小屎仙 Agent').click()
    const panel = page.getByRole('dialog', { name: '小屎仙 Agent' })
    await assert.doesNotReject(() => panel.waitFor({ state: 'visible' }))
    assert.match(await panel.innerText(), /登录后.*开工/)
    assert.equal(await panel.getByRole('button', { name: '登录 / 注册后解锁', exact: true }).isVisible(), true)
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
    await browser.close()
  }
})

test('模型广场组合筛选的计数与右侧结果保持一致', async () => {
  const browser = await openBrowser()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const page = await context.newPage()
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    const marketplace = page.locator('.model-center.marketplace.embedded')
    await marketplace.waitFor({ state: 'visible', timeout: 15_000 })
    const expectedOpenRouterFreeChat = await page.evaluate(async () => {
      const response = await fetch('/__provider_models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openrouter' }),
      })
      const payload = await response.json()
      return (payload.models || []).filter((model) => model.category === 'chat' && model.pricing === 'free' && model.apiModel !== 'openrouter/free').length
    })
    assert.ok(expectedOpenRouterFreeChat >= 15, `OpenRouter 官方免费语言模型异常：${expectedOpenRouterFreeChat}`)
    await page.waitForFunction(() => {
      const button = document.querySelector('.model-sync-button')
      return button instanceof HTMLButtonElement && !button.disabled
    }, undefined, { timeout: 30_000 })
    const filters = marketplace.locator('.marketplace-filters')
    await filters.getByRole('button', { name: /完全免费/ }).click()
    const openRouter = filters.getByRole('button', { name: /OpenRouter/ })
    await openRouter.waitFor({ state: 'visible', timeout: 15_000 })
    await openRouter.click()

    const cardCount = await marketplace.locator('.catalog-card').count()
    assert.ok(cardCount > 0, 'OpenRouter + 完全免费不应出现空白结果')
    const resultSummary = await marketplace.locator('.marketplace-results-head p').innerText()
    const matched = resultSummary.match(/符合条件\s*(\d+)\s*个，已加载\s*(\d+)\s*个/)
    assert.ok(matched, resultSummary)
    assert.equal(Number(matched[2]), cardCount)
    assert.equal(Number(matched[1]), expectedOpenRouterFreeChat)
    assert.ok(Number(matched[1]) >= cardCount)
    assert.equal(await marketplace.locator('.catalog-empty').count(), 0)
  } finally {
    await context.close()
    await browser.close()
  }
})

test('登录后显示影视生产时间线并支持工作流控制中心', async () => {
  const browser = await openBrowser()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const page = await context.newPage()
  const errors = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    const workflowTitle = `UI 回归测试项目 ${Date.now()}`
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '登录开始出货' }).click()
    await page.locator('input[name="username"]').fill(testEmail)
    await page.locator('input[name="password"]').fill(testPassword)
    await page.locator('form').getByRole('button', { name: /进场/ }).click()
    await page.locator('.account-root').waitFor({ state: 'visible', timeout: 15_000 })

    const workflowResponse = await page.evaluate(async (data) => {
      const response = await fetch('/api/agent/workflows', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      return { status: response.status, body: await response.json().catch(() => ({})) }
    }, {
        brief: 'UI 回归测试影视项目',
        title: workflowTitle,
        autoApprove: true,
        models: [{ id: 'qa-model', apiModel: 'qa/free', name: 'QA Model', providerId: 'openrouter', provider: 'OpenRouter', pricing: 'free' }],
    })
    assert.equal(workflowResponse.status, 201, JSON.stringify(workflowResponse.body))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByLabel('打开小屎仙 Agent').click()
    await page.getByLabel('打开记忆与任务').click()
    const panel = page.getByRole('dialog', { name: '小屎仙 Agent' })
    const workflowHeading = panel.getByText('影视生产项目', { exact: true })
    await page.waitForTimeout(350)
    assert.equal(await workflowHeading.isVisible(), true)
    const [panelBox, headingBox] = await Promise.all([panel.boundingBox(), workflowHeading.boundingBox()])
    assert.ok(panelBox && headingBox)
    assert.ok(headingBox.y >= panelBox.y && headingBox.y < panelBox.y + panelBox.height, JSON.stringify({ panelBox, headingBox }))
    const workflowTitleNode = panel.getByText(workflowTitle, { exact: true })
    await workflowTitleNode.waitFor({ state: 'visible', timeout: 10_000 })
    assert.equal(await workflowTitleNode.isVisible(), true)
    assert.equal(await panel.getByText('启动影视全流程', { exact: true }).isVisible(), true)
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
    await browser.close()
  }
})

test('语言工作台限制模型 DOM、支持搜索附件并正确渲染 Markdown 表格', async () => {
  const browser = await openBrowser()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const page = await context.newPage()
  const creativeBodies = []
  const errors = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/credentials', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ credentials: [], configuredProviders: ['openrouter', 'zhipu', 'pollinations'], personalProviders: [] }),
  }))
  await page.route('**/__creative_ai', async (route) => {
    creativeBodies.push(route.request().postDataJSON())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: '| 能力 | 说明 |\n| :--- | :--- |\n| **代码编写** | Python / C++ |\n| 文档撰写 | README 与报告 |' }),
    })
  })
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '登录开始出货' }).click()
    await page.locator('input[name="username"]').fill(testEmail)
    await page.locator('input[name="password"]').fill(testPassword)
    await page.locator('form').getByRole('button', { name: /进场/ }).click()
    await page.locator('.account-root').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.portal-sidebar').getByRole('button', { name: '语言模型' }).click()
    await page.locator('.creative-workspace-shell').waitFor({ state: 'visible' })

    const modelButtons = page.locator('.creative-model-list > button:not(.creative-model-more)')
    assert.ok(await modelButtons.count() <= 40, `初始模型节点过多：${await modelButtons.count()}`)
    const search = page.getByLabel('搜索可用语言模型')
    await search.fill('GLM-4.7')
    const filteredButtons = page.locator('.creative-model-list > button:not(.creative-model-more)')
    assert.ok(await filteredButtons.count() >= 1)
    await filteredButtons.first().click()

    await page.locator('.chat-composer input[type="file"]').setInputFiles({
      name: 'qa-notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('附件回归标记：XIAOY-QA-ATTACHMENT'),
    })
    await page.getByLabel('发送给语言模型').fill('请把附件内容整理为 Markdown 表格')
    await page.locator('.chat-composer').getByRole('button', { name: '发送' }).click()
    const table = page.locator('.chat-message.assistant table')
    await table.waitFor({ state: 'visible', timeout: 10_000 })
    assert.equal(await table.locator('th').count(), 2)
    assert.equal(await table.locator('tbody td').count(), 4)
    assert.equal(creativeBodies.length, 1)
    assert.match(JSON.stringify(creativeBodies[0]), /qa-notes\.txt/)
    assert.match(JSON.stringify(creativeBodies[0]), /XIAOY-QA-ATTACHMENT/)
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
    await browser.close()
  }
})

test('Agent 可展示联网来源、工具轨迹、长期记忆和定时任务', async () => {
  const browser = await openBrowser()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const page = await context.newPage()
  const errors = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  const state = {
    messages: [{
      id: 'legacy-tool-protocol',
      role: 'assistant',
      content: '我先搜索。\n<tool_call>web_search\n<arg_key>query</arg_key><arg_value>最新模型</arg_value>\n</tool_call>',
      attachments: [],
      trace: [],
      sources: [],
      createdAt: Date.now() - 1_000,
    }],
    memories: [{ id: 'memory-qa', kind: 'preference', content: '偏好简洁中文', tags: ['输出'], importance: 4, updated_at: Date.now() }],
    tasks: [{ id: 'task-qa', title: '每日免费模型巡检', prompt: '检查免费模型', mode: 'chat', schedule_type: 'cron', status: 'active', next_run_at: Date.now() + 86_400_000 }],
  }
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'agent-qa', displayName: 'Agent QA', email: testEmail, role: 'user' } }) }))
  await page.route('**/api/credentials', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ credentials: [], configuredProviders: ['openrouter'], personalProviders: [] }),
  }))
  await page.route('**/api/agent/state', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state) }))
  await page.route('**/api/agent/workflows', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ workflows: [] }) }))
  await page.route('**/api/agent/run', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      conversationId: 'conversation-qa',
      userMessageId: 'user-message-qa',
      message: { id: 'assistant-message-qa', content: '| 检查项 | 状态 |\n| --- | --- |\n| 联网搜索 | 通过 |', createdAt: Date.now() },
      model: { id: 'openrouter-qa', apiModel: 'qa/free', name: 'QA Free', provider: 'OpenRouter', providerId: 'openrouter', pricing: 'free' },
      trace: [
        { tool: 'web_search', reason: '核验最新免费模型', status: 'success', elapsedMs: 18 },
        { tool: 'save_memory', reason: '保存稳定偏好', status: 'success', elapsedMs: 3 },
        { tool: 'create_task', reason: '建立每日巡检', status: 'success', elapsedMs: 5 },
      ],
      sources: [{ title: 'OpenRouter Models', url: 'https://openrouter.ai/models', content: 'Free routes', score: 0.92 }],
    }),
  }))
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.locator('.account-root').waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByLabel('打开小屎仙 Agent').click()
    const panel = page.getByRole('dialog', { name: '小屎仙 Agent' })
    const legacyMessage = panel.locator('.agent-pet-message.assistant').first()
    assert.match(await legacyMessage.innerText(), /内部指令已隐藏/)
    assert.doesNotMatch(await legacyMessage.innerText(), /tool_call|arg_key|arg_value/i)
    const composer = panel.getByLabel('发送给小屎仙 Agent')
    await composer.fill('联网核验最新免费模型，并记住偏好和建立巡检任务')
    await panel.getByRole('button', { name: '发送', exact: true }).click()
    const table = panel.locator('.markdown-content table')
    await table.waitFor({ state: 'visible', timeout: 10_000 })
    assert.equal(await table.locator('th').count(), 2)
    await panel.locator('.agent-pet-trace summary').click()
    assert.deepEqual(await panel.locator('.agent-pet-trace li strong').allTextContents(), ['web_search', 'save_memory', 'create_task'])
    assert.equal(await panel.getByRole('link', { name: /OpenRouter Models/ }).getAttribute('href'), 'https://openrouter.ai/models')
    await panel.getByLabel('打开记忆与任务').click()
    await panel.locator('.agent-pet-control-center li').filter({ hasText: '偏好简洁中文' }).waitFor({ state: 'attached' })
    await panel.locator('.agent-pet-control-center li').filter({ hasText: '每日免费模型巡检' }).waitFor({ state: 'attached' })
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
    await browser.close()
  }
})

test('登录后的手机端主导航与 Agent 面板均在视口内可操作', async () => {
  const browser = await openBrowser()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN' })
  const page = await context.newPage()
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'mobile-qa', displayName: 'Mobile QA', email: testEmail, role: 'user' } }) }))
  await page.route('**/api/credentials', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ credentials: [], configuredProviders: ['openrouter'], personalProviders: [] }),
  }))
  await page.route('**/api/agent/state', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [], memories: [], tasks: [] }) }))
  await page.route('**/api/agent/workflows', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ workflows: [] }) }))
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.locator('.account-root').waitFor({ state: 'visible', timeout: 15_000 })
    const sidebar = page.locator('.portal-sidebar')
    assert.equal(await sidebar.getByRole('button', { name: '语言模型' }).isVisible(), true)
    assert.equal(await sidebar.getByRole('button', { name: '语音创作' }).isVisible(), true)
    assert.equal(await sidebar.getByRole('button', { name: '3D 生成' }).isVisible(), true)
    await sidebar.getByRole('button', { name: '语言模型' }).click()
    await page.getByRole('heading', { name: '语言模型' }).waitFor({ state: 'visible' })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)

    await page.getByLabel('打开小屎仙 Agent').click()
    const panel = page.getByRole('dialog', { name: '小屎仙 Agent' })
    const box = await panel.boundingBox()
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, JSON.stringify(box))
    const composer = panel.getByLabel('发送给小屎仙 Agent')
    const fontSize = await composer.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
    assert.ok(fontSize >= 14, `手机端输入文字过小：${fontSize}px`)
    assert.equal(await panel.locator('.agent-pet-scroll').evaluate((element) => element.scrollTop), 0)
  } finally {
    await context.close()
    await browser.close()
  }
})

test('登录后所有创作页面可直达，图片与语音可完成输出，视频和 3D 状态可反馈', async () => {
  const browser = await openBrowser()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const page = await context.newPage()
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const wav = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
  const errors = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/credentials', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ credentials: [], configuredProviders: ['agnes', 'openrouter', 'elevenlabs', 'groq', 'pollinations'], personalProviders: [] }),
  }))
  await page.route('**/__provider_models', async (route) => {
    const provider = route.request().postDataJSON()?.provider || 'qa'
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider, models: [], syncedAt: Date.now() }) })
  })
  await page.route('**/__generation_request', async (route) => {
    const request = route.request().postDataJSON()
    const body = String(request?.url || '').includes('/videos')
      ? { task_id: 'qa-video-task', video_id: 'qa-video-task', status: 'queued' }
      : { data: [{ b64_json: png }] }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.route('**/__save_generated_asset', (route) => route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ url: `data:image/png;base64,${png}`, path: 'output/images/qa.png' }),
  }))
  await page.route('**/__creative_ai', async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body.task === 'tts' ? { audioBase64: wav, contentType: 'audio/wav' } : { content: 'QA' }),
    })
  })
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '登录开始出货' }).click()
    await page.locator('input[name="username"]').fill(testEmail)
    await page.locator('input[name="password"]').fill(testPassword)
    await page.locator('form').getByRole('button', { name: /进场/ }).click()
    await page.locator('.account-root').waitFor({ state: 'visible', timeout: 15_000 })
    const sidebar = page.locator('.portal-sidebar')

    await sidebar.getByRole('button', { name: '图像生成' }).click()
    await page.getByLabel('画面描述').fill('紫色机器人，白色背景')
    await page.locator('.generate-button').click()
    const generatedImage = page.locator('.immersive-stage img')
    await generatedImage.waitFor({ state: 'attached', timeout: 10_000 })
    const imageState = await generatedImage.evaluate((element) => {
      const parents = []
      let current = element
      while (current && parents.length < 6) {
        const style = getComputedStyle(current)
        parents.push({ className: current.className, display: style.display, visibility: style.visibility, width: current.getBoundingClientRect().width, height: current.getBoundingClientRect().height })
        current = current.parentElement
      }
      return parents
    })
    assert.equal(await generatedImage.isVisible(), true, JSON.stringify(imageState))

    await sidebar.getByRole('button', { name: '视频生成' }).click()
    await page.getByLabel('画面描述').fill('紫色机器人挥手，5 秒')
    await page.locator('.generate-button').click()
    await page.locator('.task-strip, .video-task-strip').first().waitFor({ state: 'visible', timeout: 10_000 })

    await sidebar.getByRole('button', { name: '语音创作' }).click()
    await page.getByRole('heading', { name: '语音模型' }).waitFor({ state: 'visible' })
    await page.getByLabel('朗读文本').fill('这是一条语音回归测试。')
    await page.getByRole('button', { name: '生成语音' }).click()
    await page.locator('.audio-result').waitFor({ state: 'visible', timeout: 10_000 })

    await sidebar.getByRole('button', { name: '3D 生成' }).click()
    await page.locator('.generation-page-heading strong').getByText('3D 生成', { exact: true }).waitFor({ state: 'visible' })

    await sidebar.getByRole('button', { name: '创作历史' }).click()
    await page.locator('.history-card').first().waitFor({ state: 'visible' })
    await sidebar.getByRole('button', { name: 'API 与设置' }).click()
    await page.locator('.settings-dialog').waitFor({ state: 'visible' })
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
    await browser.close()
  }
})

test('手机端宠物使用气泡面板且没有全屏遮罩或视口溢出', async () => {
  const browser = await openBrowser()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN' })
  const page = await context.newPage()
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.getByLabel('打开小屎仙 Agent').click()
    const panel = page.getByRole('dialog', { name: '小屎仙 Agent' })
    await panel.waitFor({ state: 'visible' })
    const box = await panel.boundingBox()
    assert.ok(box)
    assert.ok(box.x >= 0 && box.y >= 0)
    assert.ok(box.x + box.width <= 390)
    assert.ok(box.y + box.height <= 844)
    assert.ok(box.width < 390 || box.height < 844)
    assert.equal(await page.locator('.agent-pet-panel').evaluate((element) => getComputedStyle(element).position), 'fixed')
    assert.equal(await page.locator('.agent-pet-panel').evaluate((element) => getComputedStyle(element, '::before').content), 'none')
  } finally {
    await context.close()
    await browser.close()
  }
})
