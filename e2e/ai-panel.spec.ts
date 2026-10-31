import { expect, test, type Page } from '@playwright/test'
import { loginAsAdmin } from './helpers'

/**
 * AI 面板 mock e2e（P2，设计 §5.2）：全量拦截 /api/agent/*（不打真实 reasonix——
 * 测试面与 LLM 解耦）。断言面：入口降级（status 失败按钮隐藏）/ 面板开合 /
 * 提交上下文注入 / SSE 帧渲染（消息 + 工具卡）/ 审批弹窗往返（approve body 契约）。
 *
 * SSE 帧形态 = serve 同款「无 event: 头、data: 前缀 JSON」（agent store onmessage
 * 按 body 内 kind 分发）；首连发完帧后 close，重连请求挂起不再给帧（防重复聚合）。
 */

type Frame = Record<string, unknown>

interface AgentMocks {
  /** status 探测返回码（503 = 入口隐藏）；缺省 200。 */
  statusStatus?: number
  /** events 首连发送的帧（submit 后手动放行）。 */
  frames?: Frame[]
}

async function mockAgent(page: Page, opts: AgentMocks = {}): Promise<{
  submitBodies: Array<Record<string, unknown>>
  approveBodies: Array<Record<string, unknown>>
  workspaceCalls: string[]
  release: () => void
}> {
  const submitBodies: Array<Record<string, unknown>> = []
  const approveBodies: Array<Record<string, unknown>> = []
  const workspaceCalls: string[] = []
  let framesRequested = false
  let release: () => void = () => {}
  const gate = new Promise<void>((r) => { release = r })

  await page.route('**/api/agent/status', (route) =>
    route.fulfill({ status: opts.statusStatus ?? 200, body: JSON.stringify({ label: 'mock', running: false, plan: false, autoApproveTools: false, bypass: false, toolApprovalMode: 'ask' }) }))
  await page.route('**/api/agent/sessions', (route) => route.fulfill({ body: '[]' }))
  await page.route('**/api/agent/history', (route) => route.fulfill({ body: '[]' }))
  await page.route('**/api/agent/models', (route) => route.fulfill({
    body: JSON.stringify({ models: [{ ref: 'deepseek/ds-v4', provider: 'deepseek', model: 'ds-v4', active: true }] }),
  }))
  await page.route('**/api/agent/providers', (route) => route.fulfill({
    body: JSON.stringify({ providers: [{ name: 'deepseek', kind: 'openai', base_url: 'https://api.example.com', models: ['ds-v4'], api_key_env: 'K', has_key: true }], default_model: 'deepseek/ds-v4' }),
  }))
  // 附件上传（2026-10-31 功能对齐）：gateway 返回落盘路径，前端以 @ 引用前置。
  await page.route(/\/api\/agent\/attachments/, (route) =>
    route.fulfill({ body: JSON.stringify({ files: [{ path: '.reasonix/attachments/upload-e2e.txt' }] }) }))
  // 工作区目录（沙箱一层列表）。
  await page.route(/\/api\/agent\/workspace/, (route) => {
    workspaceCalls.push(route.request().url())
    return route.fulfill({ body: JSON.stringify({ entries: [{ name: 'docs', is_dir: true }, { name: 'reasonix.toml', is_dir: false }] }) })
  })
  await page.route('**/api/agent/submit', async (route) => {
    submitBodies.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({ status: 204, body: '' })
  })
  await page.route('**/api/agent/approve', async (route) => {
    approveBodies.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({ body: JSON.stringify({ status: 'ok' }) })
  })
  await page.route('**/api/agent/events', async (route) => {
    if (!framesRequested) {
      framesRequested = true
      await gate
      const body = (opts.frames ?? []).map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body })
    } else {
      // 重连挂起：不发帧（否则 turn_started 重复聚合新 assistant 消息）
      await new Promise(() => {})
    }
  })
  return { submitBodies, approveBodies, workspaceCalls, release: () => release() }
}

test.describe('AI 面板（mock /api/agent/*）', () => {
  test('status 探测失败 → 入口按钮不出现（appliance 档降级）', async ({ page }) => {
    await mockAgent(page, { statusStatus: 503 })
    await loginAsAdmin(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: '打开 AI 助手' })).toHaveCount(0)
  })

  // H1 回归（审查修复固化）：真实登录路径——未登录进 /login（此时 onMounted 无 token 短路），
  // 登录成功 replace('/') 不重挂载 App——入口必须经路由 watch 重探测才出现。
  // loginAsAdmin 预注入 token 的其他用例覆盖不了这条路径。
  test('真实登录路径：/login 登录成功 → 入口经重探测出现（H1 回归）', async ({ page }) => {
    await mockAgent(page) // status=200（模拟 reasonix 已部署）
    await page.goto('/login') // 未登录——AiDrawerHost onMounted 在此短路（无 token）
    await page.getByPlaceholder('用户名').fill('admin')
    await page.getByPlaceholder('密码').fill('admin')
    await page.getByPlaceholder('密码').press('Enter')
    await expect(page).toHaveURL(/\/$|\/\?/) // 登录成功跳列表页（真实 rs-iot）
    await expect(page.getByRole('button', { name: '打开 AI 助手' })).toBeVisible({ timeout: 5_000 })
  })

  test('入口开合：点击 → 抽屉就绪 + 控件工具栏 + ⚙（providers 可用）', async ({ page }) => {
    await mockAgent(page)
    await loginAsAdmin(page)
    await page.goto('/')
    const entry = page.getByRole('button', { name: '打开 AI 助手' })
    await expect(entry).toBeVisible()
    await entry.click()
    const drawer = page.getByRole('complementary', { name: 'AI 助手面板' })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText('就绪')).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'LLM 供应商管理' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: '发送' })).toBeVisible()
    // 关闭 → 抽屉消失 → 入口回归
    await drawer.getByRole('button', { name: '关闭' }).click()
    await expect(drawer).toHaveCount(0)
    await expect(page.getByRole('button', { name: '打开 AI 助手' })).toBeVisible()
  })

  test('提交注入页面上下文 + SSE 帧渲染消息与工具卡', async ({ page }) => {
    const mocks = await mockAgent(page, {
      frames: [
        { kind: 'turn_started' },
        { kind: 'text', text: '已读取画面并生成绑定建议。' },
        { kind: 'tool_dispatch', tool: { id: 'c1', name: 'hmi_get_screen', args: '{"id":"water-demo-m3"}' } },
        { kind: 'tool_result', tool: { id: 'c1', name: 'hmi_get_screen', output: '{"version":3}', durationMs: 21 } },
        { kind: 'turn_done' },
      ],
    })
    await loginAsAdmin(page)
    await page.goto('/view/water-demo-m3')
    await page.getByRole('button', { name: '打开 AI 助手' }).click()
    const drawer = page.getByRole('complementary', { name: 'AI 助手面板' })
    await drawer.getByRole('textbox').fill('给 2# 泵加运行状态色绑定')
    await drawer.getByRole('button', { name: '发送' }).click()

    // 上下文注入（设计 §5.1）：请求体附 [页面上下文] 模式/画面/路径
    await expect.poll(() => mocks.submitBodies.length).toBe(1)
    const input = (mocks.submitBodies[0] as { input: string }).input
    expect(input).toContain('给 2# 泵加运行状态色绑定')
    expect(input).toContain('[页面上下文]')
    expect(input).toContain('模式: view')
    expect(input).toContain('画面: water-demo-m3')
    expect(input).toContain('页面路径: /view/water-demo-m3')

    // 用户气泡即时出现；放行 SSE 帧后 assistant 文本 + 工具卡渲染
    await expect(drawer.getByText('给 2# 泵加运行状态色绑定').first()).toBeVisible()
    mocks.release()
    await expect(drawer.getByText('已读取画面并生成绑定建议。')).toBeVisible()
    const toolCard = drawer.getByRole('button', { name: /hmi_get_screen/ })
    await expect(toolCard).toBeVisible()
    await expect(toolCard.getByText('完成')).toBeVisible()
  })

  test('approval_request → 审批弹窗 → 批准 POST body {id, allow}', async ({ page }) => {
    const mocks = await mockAgent(page, {
      frames: [
        { kind: 'turn_started' },
        { kind: 'approval_request', approval: { id: 'a1', tool: 'hmi_put_screen', subject: 'water-demo-m3', reason: '修改画面内容' } },
      ],
    })
    await loginAsAdmin(page)
    await page.goto('/')
    await page.getByRole('button', { name: '打开 AI 助手' }).click()
    const drawer = page.getByRole('complementary', { name: 'AI 助手面板' })
    await drawer.getByRole('textbox').fill('改画面')
    await drawer.getByRole('button', { name: '发送' }).click()
    mocks.release()

    const modal = page.getByRole('dialog', { name: '权限请求' })
    await expect(modal).toBeVisible()
    await expect(modal.getByText('hmi_put_screen')).toBeVisible()
    await modal.getByRole('button', { name: '批准' }).click()
    await expect.poll(() => mocks.approveBodies.length).toBe(1)
    expect(mocks.approveBodies[0]).toEqual({ id: 'a1', allow: true })
    await expect(modal).toHaveCount(0)
  })

  // 2026-10-31 功能对齐（控制台面板 → hmi 面板）：附件上传 + 工作区 @ 引用。
  test('📎 附件上传 → chip → 仅附件可发送（@ 引用前置）→ 发送后清空', async ({ page }) => {
    const mocks = await mockAgent(page)
    await loginAsAdmin(page)
    await page.goto('/')
    await page.getByRole('button', { name: '打开 AI 助手' }).click()
    const drawer = page.getByRole('complementary', { name: 'AI 助手面板' })

    await drawer.locator('input[type=file]').setInputFiles({
      name: 'e2e-note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello'),
    })
    const chip = drawer.locator('.attach-chip')
    await expect(chip).toHaveCount(1)
    await expect(chip).toContainText('e2e-note.txt')

    // 仅附件（无文字）也可发送
    const send = drawer.getByRole('button', { name: '发送' })
    await expect(send).toBeEnabled()
    await send.click()
    await expect.poll(() => mocks.submitBodies.length).toBe(1)
    const input = (mocks.submitBodies[0] as { input: string }).input
    expect(input.startsWith('@.reasonix/attachments/upload-e2e.txt')).toBe(true)
    await expect(chip).toHaveCount(0)
  })

  test('📎 chip 可移除（移除后无文字则发送禁用）', async ({ page }) => {
    await mockAgent(page)
    await loginAsAdmin(page)
    await page.goto('/')
    await page.getByRole('button', { name: '打开 AI 助手' }).click()
    const drawer = page.getByRole('complementary', { name: 'AI 助手面板' })
    await drawer.locator('input[type=file]').setInputFiles({
      name: 'e2e-note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello'),
    })
    await expect(drawer.locator('.attach-chip')).toHaveCount(1)
    await drawer.getByRole('button', { name: '移除附件' }).click()
    await expect(drawer.locator('.attach-chip')).toHaveCount(0)
    await expect(drawer.getByRole('button', { name: '发送' })).toBeDisabled()
  })

  test('📁 工作区选择器：列目录 → 下钻 → 选文件插入 @ 引用', async ({ page }) => {
    const mocks = await mockAgent(page)
    await loginAsAdmin(page)
    await page.goto('/')
    await page.getByRole('button', { name: '打开 AI 助手' }).click()
    const drawer = page.getByRole('complementary', { name: 'AI 助手面板' })

    await drawer.getByTitle('引用文件或文件夹：从当前工作区选择上下文').click()
    const picker = page.locator('.modal-mask').filter({ hasText: '引用文件或文件夹' })
    await expect(picker).toBeVisible()
    // 根目录一次列一层
    await expect(picker.getByRole('button', { name: /reasonix\.toml/ })).toBeVisible()
    expect(mocks.workspaceCalls.some((u) => u.includes('path='))).toBe(true)

    // 目录下钻 → path=docs
    await picker.getByRole('button', { name: /docs/ }).click()
    await expect.poll(() => mocks.workspaceCalls.some((u) => u.includes('path=docs'))).toBe(true)
    // 返回根 → 选文件 → 插入 @ 引用并关闭
    await picker.getByRole('button', { name: '工作区' }).click()
    await picker.getByRole('button', { name: /reasonix\.toml/ }).click()
    await expect(picker).toHaveCount(0)
    await expect(drawer.locator('textarea')).toHaveValue(/@reasonix\.toml/)
  })
})
