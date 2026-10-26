import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'
import { seedCommandScreen } from './fixtures'
import { DEMO_A } from '../src/lib/demo-screen'

// M4（T16/T17）：主题（dark 默认）/状态栏/命令历史/断线 UX/缩略图。
// LAN 部署冒烟（gateway origin）另见 e2e/lan.spec.ts（T18）。

test.describe('M4 主题（T16-A）', () => {
  test('默认深色：html.dark 挂载；编辑器隐藏 maotu 自带夜间按钮（单主题源）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/login')
    // 每测试独立 context——localStorage 空 → 默认 dark
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)

    // 编辑页：maotu 自带 toggle 隐藏（其 useDark 只切 #mt-edit，与全局分叉）
    await page.goto(`/edit/${DEMO_A}`)
    await expect(page.locator('#mtCanvasArea')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)
    expect(await page.locator('[title="切换到夜间模式"], [title="切换到日间模式"]').count()).toBe(0)
  })

  test('切换亮色持久化：toggle → html 无 dark；reload 仍亮（localStorage）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/login')
    await page.locator('[data-testid="theme-toggle"]').click()
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/)

    await page.reload()
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/)
    expect(await page.evaluate(() => localStorage.getItem('hmi_theme'))).toBe('light')
  })
})

test.describe('M4 状态栏与命令历史（T16-B）', () => {
  const cmdSlug = `e2e-t16-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  test.afterAll(async () => {
    const { rsiotSweepScreens } = await import('./helpers')
    await rsiotSweepScreens(/^e2e-t16-/)
  })

  test('状态栏：画面名/在线灯/订阅点数（demo A 8 bind 收敛 3 去重点）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${DEMO_A}`)
    const bar = page.locator('[data-testid="status-bar"]')
    await expect(bar).toBeVisible({ timeout: 10_000 })
    await expect(bar.locator('.state.online')).toBeVisible({ timeout: 10_000 })
    await expect(bar).toContainText('取水泵房（M3 演示）')
    await expect(bar).toContainText('订阅 3 点')
  })

  test('deadFields：mock 流只喂 1 点 → 无数据 2 点 + popover 列表', async ({ page }) => {
    await loginAsAdmin(page)
    const cell = (v: string): [number, string, string] => [1792980000, '2026-10-26 10:00:00', v]
    await page.route('**/api/v1/rtdatas/subscribe*', (route) => route.fulfill({
      status: 200, contentType: 'text/event-stream',
      body: `event: snapshot\ndata: ${JSON.stringify({
        dev: 'rsiot',
        // 只喂 uptime——cpu_percent/alarm_active 两点无数据（F20：cell 必须真数组）
        points: { 'rsiot.uptime_s': cell('63000') },
      })}\n\n`,
    }))
    await page.goto(`/view/${DEMO_A}`)
    const dead = page.locator('[data-testid="dead-trigger"]')
    await expect(dead).toBeVisible({ timeout: 10_000 })
    await expect(dead).toContainText('无数据 2 点')
    await dead.click()
    const pop = page.locator('.el-popover:visible')
    await expect(pop).toContainText('rsiot.cpu_percent')
    await expect(pop).toContainText('rsiot.alarm_active')
  })

  test('命令历史：下发一条 → 入口计数 1 → popover 含点位/值/confirmed', async ({ page }) => {
    await seedCommandScreen(cmdSlug)
    await loginAsAdmin(page)
    await page.route('**/api/v1/command/send', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }))

    await page.goto(`/view/${cmdSlug}`)
    await page.locator('[id^="text-vue-"]').click()
    const box = page.locator('.el-message-box')
    await box.locator('.el-message-box__btns .el-button--primary').click()
    await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 5_000 })

    const entry = page.locator('[data-testid="history-trigger"]')
    await expect(entry).toContainText('1')
    await entry.click()
    const pop = page.locator('.el-popover:visible')
    await expect(pop).toContainText('rsiot.uptime_s')
    await expect(pop).toContainText('confirmed')
  })

  test('登出：状态栏按钮 → 清 token 回 /login', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${DEMO_A}`)
    await expect(page.locator('[data-testid="status-bar"]')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: '登出' }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(await page.evaluate(() => localStorage.getItem('hmi_token'))).toBeNull()
  })

  test('断线 UX：subscribe 掐断 → 状态灯 offline + 状态条整条警示；解除 → 恢复', async ({ page }) => {
    await loginAsAdmin(page)
    await page.route('**/api/v1/rtdatas/subscribe*', (route) => route.abort())
    await page.goto(`/view/${DEMO_A}`)
    await expect(page.locator('.state.offline')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="status-bar"].offline')).toBeVisible()

    await page.unroute('**/api/v1/rtdatas/subscribe*')
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-testid="status-bar"].offline')).toHaveCount(0)
  })

  test('SSE 凭证失效：subscribe 恒 401 → 探测 auth-failed → 自动登出回 /login', async ({ page }) => {
    await loginAsAdmin(page)
    await page.route('**/api/v1/rtdatas/subscribe*', (route) =>
      route.fulfill({ status: 401, contentType: 'text/plain', body: 'invalid token' }))
    await page.goto(`/view/${DEMO_A}`)
    // 连续失败 ≥3（退避 1s/2s/4s ≈ 7s）后 fetch 探测 401 → auth-failed → 登出链
    await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 })
    expect(await page.evaluate(() => localStorage.getItem('hmi_token'))).toBeNull()
  })
})

// T17 缩略图：MtPreview 实测成本（+11MB 堆/6 实例 ≈1.8MB/例，全列表懒挂载 ~2.3s）——
// 6 画面量级可接受，直接用真渲染；占位降级仅针对非 maotu 格式（agent-hmi 旧画面兼容守卫：
// 其 doc 无 json/canvasCfg，MtPreview mounted hook 抛 TypeError 且中断同批兄弟挂载——实测）。
test.describe('M4 缩略图（T17）', () => {
  const legacySlug = `e2e-t17-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  test.afterAll(async () => {
    const { rsiotSweepScreens } = await import('./helpers')
    await rsiotSweepScreens(/^e2e-t17-/)
  })

  test('卡片缩略区：maotu 画面挂 MtPreview 真渲染（svg 图元 dataURI img 可见）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/')
    const demoCard = page.locator('.el-card', { hasText: 'water-demo-m3' }).first()
    await demoCard.scrollIntoViewIfNeeded()
    const thumb = demoCard.locator('[data-testid="card-thumb"]')
    await expect(thumb).toBeVisible()
    // 进视口 → 懒挂载 → MtPreview 渲染出图元（svg 族 = dataURI <img>；文本图元真实 DOM）
    await expect(thumb.locator('.thumb-scale img')).not.toHaveCount(0, { timeout: 10_000 })
  })

  test('兼容守卫：agent-hmi 旧格式画面降级占位徽章（不炸列表）', async ({ page }) => {
    const { rsiotPutScreen } = await import('./helpers')
    // agent-hmi 旧格式：无 json/canvasCfg（$schema 布局形）
    await rsiotPutScreen(legacySlug, {
      $schema: 'agent-hmi.screen/1', id: legacySlug,
      meta: { name: `E2E-T17 旧格式 ${legacySlug}` },
      layout: {}, edges: [],
    } as unknown as Parameters<typeof rsiotPutScreen>[1])
    await loginAsAdmin(page)
    await page.goto('/')
    const card = page.locator('.el-card', { hasText: legacySlug })
    await card.scrollIntoViewIfNeeded()
    await expect(card.locator('.thumb-fallback')).toBeVisible({ timeout: 10_000 })
    // 其余卡片不受波及（守卫前：一卡抛错中断同批挂载）
    const demoCard = page.locator('.el-card', { hasText: 'water-demo-m3' }).first()
    await demoCard.scrollIntoViewIfNeeded()
    await expect(demoCard.locator('.thumb-scale img').first()).toBeVisible({ timeout: 10_000 })
  })
})
