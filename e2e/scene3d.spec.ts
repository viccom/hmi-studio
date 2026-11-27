import { test, expect } from '@playwright/test'
import { loginAsAdmin, rsiotGetScene } from './helpers'
import { E2E_SCENE_A } from './fixtures'

/**
 * 3D 场景（v2）回归（P0.5，2026-11-26）。
 *
 * 覆盖三件此前完全没有门禁的事：
 *   1. 3D 场景走**独立 `scenes` 资源族**（不在 screens 里，避免 128 KiB 与 2D 混族）
 *   2. v2 运行页能加载并渲染（`/view3d/:id` 按文档形态分派）
 *   3. 保存往返不丢语义层（bindings/events/灯光/初始视角）
 *
 * 播种在 global-setup（`seed3DScenes`，只写 e2e 命名空间，不碰真实资产）。
 */
test.describe('3D 场景（v2）', () => {
  test('文档在 scenes 族且契约完整', async ({ request }) => {
    const d = await rsiotGetScene(E2E_SCENE_A)
    const doc = d.doc as Record<string, unknown>
    expect(doc.$schema).toBe('agent-hmi.scene3d/1')
    expect(Array.isArray(doc.objects)).toBe(true)
    expect((doc.objects as unknown[]).length).toBeGreaterThan(0)
    const scene = doc.scene as Record<string, unknown>
    expect((scene.lightingConfig as { enabled: boolean }).enabled).toBe(true)
    expect(scene.initialView).toBeTruthy()
    expect((doc.bindings as unknown[]).length).toBeGreaterThan(0)
    expect((doc.events as unknown[]).length).toBeGreaterThan(0)
    void request
  })

  test('不在 screens 族（两族物理分离）', async ({ request }) => {
    const base = process.env.RSIOT_BASE ?? 'http://127.0.0.1:8790'
    const login = await request.post(`${base}/api/v1/user/login`, {
      data: { user_id: 'admin', pass: 'admin' },
    })
    const { token } = (await login.json()) as { token: string }
    const res = await request.get(`${base}/api/v1/screens/${E2E_SCENE_A}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(404) // screens 族里没有它
  })

  test('v2 运行页加载并渲染（canvas + 顶栏徽标）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view3d/${E2E_SCENE_A}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('canvas', { timeout: 40_000 })
    // 分派到 v2：有 .run3d-bar（v1 页是 .scene3d-page）
    await expect(page.locator('.run3d-bar')).toBeVisible({ timeout: 30_000 })
    // 对象计数徽标来自 doc.objects.length
    await expect(page.locator('.run3d-badges')).toContainText('对象')
    // 无加载失败文案
    await expect(page.locator('.run3d-error')).toHaveCount(0)
  })

  test('编辑器页可打开（/edit3d）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/edit3d/${E2E_SCENE_A}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('canvas', { timeout: 40_000 })
    await expect(page.locator('.edit3d-topbar')).toBeVisible({ timeout: 30_000 })
    // 上游面板挂载成功（场景树/属性面板）
    await expect(page.locator('.edit3d-tabs')).toBeVisible()
  })

  /**
   * 列表页交互与 2D 同构（2026-11-27 修正）：
   *   - 点缩略图/卡片 → 当前标签页进**组态编辑** /edit3d/:id（此前直接开运行态，编辑器无入口）
   *   - 卡片「外部链接」小图标 → **新标签页**打开运行态 /view3d/:id
   */
  test('列表页：点缩略图进组态编辑（当前标签）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/screens3d', { waitUntil: 'domcontentloaded' })
    const card = page.locator(`[data-screen-id="${E2E_SCENE_A}"]`)
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.locator('.scene3d-thumb').click()
    await expect(page).toHaveURL(new RegExp(`/edit3d/${E2E_SCENE_A}$`))
    await expect(page.locator('.edit3d-topbar')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.edit3d-tabs')).toBeVisible()
  })

  test('列表页：外部链接图标在新标签打开运行态', async ({ page, context }) => {
    await loginAsAdmin(page)
    await page.goto('/screens3d', { waitUntil: 'domcontentloaded' })
    const card = page.locator(`[data-screen-id="${E2E_SCENE_A}"]`)
    await expect(card).toBeVisible({ timeout: 30_000 })
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      card.locator('button[title="在新标签页打开运行页"]').click(),
    ])
    await popup.waitForURL(new RegExp(`/view3d/${E2E_SCENE_A}$`), { timeout: 30_000 })
    // 运行页渲染出 3D 画布（v2 分派）
    await popup.waitForSelector('canvas', { timeout: 40_000 })
    await expect(popup.locator('.run3d-bar')).toBeVisible({ timeout: 30_000 })
    // 当前标签仍停在列表页（未被运行页占走）
    await expect(page).toHaveURL(/\/screens3d$/)
  })
})
