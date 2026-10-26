import { test, expect, type Locator } from '@playwright/test'
import { loginAsAdmin, rsiotGetScreen } from './helpers'
import { seedDemoScreens } from './fixtures'
import { DEMO_A, DEMO_B } from '../src/lib/demo-screen'

// G-M3 汇总门（T15）：演示画面 = T14 长期资产（slug 恒定，PUT upsert 幂等）——
// beforeAll 重播种保新鲜，**无 afterAll 清扫**（与 e2e-t* 语义相反，LAN 演示留存）。
//
// 段2 选型（任务书两路二选一，本仓取路 A）：真实 cpu_percent 不可控（采集器常态 0，永不越限）
// → page.route 拦截 **/rtdatas/subscribe* 用 route.fulfill 回自制 text/event-stream SSE 流
// （Playwright fulfill 可直接回完整 SSE 响应体；EventSource 按帧解析派发 snapshot 命名事件）。
// 断言走**渲染层**：svg 图元 = dataURI <img>，props 经 TP 序列化为 use 属性——decodeURIComponent(img.src)
// 直接读 fill/h 属性值（T11 像素实证同源通路，无需截图比色）。流完即断 → 客户端退避重连（~1s）→
// 改服务变量再断言回绿：变色-恢复全链（vP 直写+触发收口）经真实 maotu 管线验证。
// 结构层（bind+trigger 三元组冻结）已由 demo-screen.test.ts 14 单测背书——行为+结构双保险。

test.describe('M3 演示画面（T14 资产）', () => {
  test.beforeAll(async () => { await seedDemoScreens() })

  test('段1: 图元渲染计数——10 自绘 + 8 文本 = 18 ≥ 12（G-M3 规模判据）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${DEMO_A}`)
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 10_000 })

    // 自绘图元节点（id 前缀法，T4 实证；/view 无左面板，无 id 污染）
    await expect(page.locator('[id^="ah-"]')).toHaveCount(10)
    // 9 类注册图元全部在画（每类 ≥1：泵×2 + 7 类×1）
    for (const tag of ['ah-pump', 'ah-tank', 'ah-level-gauge', 'ah-gate-valve', 'ah-butterfly-valve',
      'ah-flow-meter', 'ah-motor', 'ah-dis-switch', 'ah-nav-button']) {
      expect(await page.locator(`[id^="${tag}-"]`).count()).toBeGreaterThanOrEqual(1)
    }
    // 值牌文本图元（m2 段1 断言路径：vue 图元真实 DOM 文本）
    await expect(page.locator('#text-vue-wdm3a-val-up .break-words')).toBeVisible()
    await expect(page.locator('#text-vue-wdm3a-val-cpu .break-words')).toBeVisible()
    // 总数 ≥12
    const total = await page.locator('[id^="ah-"], [id^="text-vue-"]').count()
    expect(total).toBeGreaterThanOrEqual(12)
  })

  test('段2: 阈值变色——SSE mock 注 cpu=95 泵变红 + 罐液位 h=95；cpu=20 回绿', async ({ page }) => {
    await loginAsAdmin(page)
    let cpu = 95 // 服务端变量：重连周期（流完即断 ~1s 退避）内可切换
    // cell 必须是**真数组** [ts,localTime,"值串"]（F11/F2 形状）——写成字符串会被 JSON.stringify
    // 二次编码，toPoint 的 Array.isArray 拒收 → 静默无数据（调试实证，勿回退）
    const cell = (v: string): [number, string, string] => [1792980000, '2026-10-26 10:00:00', v]
    await page.route('**/api/v1/rtdatas/subscribe*', (route) => route.fulfill({
      status: 200, contentType: 'text/event-stream',
      body: `event: snapshot\ndata: ${JSON.stringify({
        dev: 'rsiot',
        points: {
          'rsiot.cpu_percent': cell(String(cpu)),
          'rsiot.uptime_s': cell('63000'),
          'rsiot.alarm_active': cell('0'),
        },
      })}\n\n`,
    }))

    await page.goto(`/view/${DEMO_A}`)
    const pump1 = page.locator('#ah-pump-wdm3a-1 img')
    const tank = page.locator('#ah-tank-wdm3a-1 img')

    // 高载：>80 触发 → fill=#f5222d（TP 序列化进 use 属性 → dataURI 可读）
    await expect(pump1).toBeVisible({ timeout: 10_000 })
    await expect.poll(() => imgAttr(pump1, 'fill="#f5222d"'), { timeout: 15_000 }).toBe(true)
    // 同一数据驱动液位链：h=95（props.h.val 直写 → use[h="95"]）
    await expect.poll(() => imgAttr(tank, 'h="95"'), { timeout: 10_000 }).toBe(true)
    // 值牌同步数字（cpu=95 直写 props.text.val）
    await expect.poll(async () =>
      (await page.locator('#text-vue-wdm3a-val-cpu .break-words').textContent()) ?? '',
      { timeout: 10_000 }).toContain('95')

    // 恢复：cpu=20 → <=80 触发收口回绿（直写 20 是无效色，同 tick 被触发覆盖）
    cpu = 20
    await expect.poll(() => imgAttr(pump1, 'fill="#52c41a"'), { timeout: 20_000 }).toBe(true)
    await expect.poll(() => imgAttr(tank, 'h="20"'), { timeout: 10_000 }).toBe(true)
  })

  // 段3 告警横幅：复用 m2 段3 机制（route 拦截 /api/v1/alarms 假快照，确定性），
  // 画面换 T14 资产（demo 含告警链路用的 alarm_active 绑定图元）。
  test('段3a: 有活动告警 → 横幅可见且含内容', async ({ page }) => {
    await loginAsAdmin(page)
    await page.route('**/api/v1/alarms*', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{
        key: 'e2e.cpu_high', level: 'error', source: 'self',
        message: 'M3 演示告警：CPU 过载', ts: '2026-10-25T07:00:00Z', count: 3,
      }]),
    }))
    const alarmed = page.waitForResponse((r) => r.url().includes('/api/v1/alarms'))
    await page.goto(`/view/${DEMO_A}`)
    await alarmed
    await expect(page.getByTestId('alarm-banner')).toBeVisible()
    await expect(page.getByTestId('alarm-banner')).toContainText('M3 演示告警：CPU 过载')
  })

  test('段3b: 空告警 → 横幅隐藏', async ({ page }) => {
    await loginAsAdmin(page)
    await page.route('**/api/v1/alarms*', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '[]',
    }))
    const alarmed = page.waitForResponse((r) => r.url().includes('/api/v1/alarms'))
    await page.goto(`/view/${DEMO_A}`)
    await alarmed
    await expect(page.getByTestId('alarm-banner')).toBeHidden()
  })

  test('段4: 互跳闭环 demo→B→demo（__navCount=2）+ $rsiot.back() 弹栈回 B', async ({ page }) => {
    await loginAsAdmin(page)
    let subscribes = 0
    page.on('response', (r) => { if (r.url().includes('/api/v1/rtdatas/subscribe')) subscribes += 1 })

    await page.goto(`/view/${DEMO_A}`)
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 10_000 })

    // demo → B：nav-button 默认事件模板（F19①：target prop + $getItemAttrByID 运行时取值）
    await page.locator('#ah-nav-button-wdm3a-1').click()
    await expect.poll(
      () => page.evaluate(() => (window as unknown as { __navCount?: number }).__navCount ?? 0),
      { timeout: 10_000 },
    ).toBeGreaterThanOrEqual(1)
    await expect(page).toHaveURL(new RegExp(`/view/${DEMO_B}$`))
    // B 画面图元渲染 + 新流数据到达（B 值牌被 snapshot 推的 uptime 覆写为数字）
    await expect(page.locator('#ah-nav-button-wdm3b-1')).toHaveCount(1)
    await expect.poll(async () =>
      /^\d+$/.test((await page.locator('#text-vue-wdm3b-val-up .break-words').textContent()) ?? ''),
      { timeout: 10_000 }).toBe(true)

    // B → demo（回跳：栈 [demo,B,demo]——demo 非栈顶故压栈，nav.nav 重复画面仅拦同画自跳）
    await page.locator('#ah-nav-button-wdm3b-1').click()
    await expect.poll(
      () => page.evaluate(() => (window as unknown as { __navCount?: number }).__navCount ?? 0),
      { timeout: 10_000 },
    ).toBeGreaterThanOrEqual(2)
    await expect(page).toHaveURL(new RegExp(`/view/${DEMO_A}$`))

    // back 语义（栈深 3）：$rsiot.back() 弹栈 → 回 B（容器内跳转，URL 断言）
    await page.evaluate(() => (window as unknown as { $rsiot?: { back(): void } }).$rsiot?.back())
    await expect(page).toHaveURL(new RegExp(`/view/${DEMO_B}$`), { timeout: 10_000 })
  })

  test('段5: rs-iot 真相——doc 保真（18 图元 + 触发链三元组入库）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${DEMO_A}`)
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 10_000 })
    const { doc } = await rsiotGetScreen(DEMO_A)
    const json = doc.json as Array<{ type: string; binds?: Array<{ triggers?: unknown[] }> }>
    expect(json).toHaveLength(18)
    // 触发链入库完整性（结构层判据与段2 行为层互补）
    const pump = json.find((i) => i.id === 'ah-pump-wdm3a-1')!
    expect(pump.binds![0].triggers).toHaveLength(2)
  })
})

/** dataURI <img> 的 use 属性断言：decode(src) 含 `k="v"`（TP 序列化形） */
async function imgAttr(loc: Locator, needle: string): Promise<boolean> {
  const src = await loc.getAttribute('src')
  return src ? decodeURIComponent(src).includes(needle) : false
}
