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

  /**
   * 运行页的设备详情面板（2026-11-27 补）：点设备 → **右上角出同页详情，不跳页**
   * （v1 DEMO 的契约；迁移时误做成「点击直接跳 2D」）。面板里的「进入 2D 设备面板」
   * 按钮才跳 2D。
   *
   * 点击坐标由对象投影算出（运行页暴露 `window.__run3d.sm`）——不靠屏幕坐标猜，
   * 否则换个相机就点空了。
   */
  test('运行页：点设备出同页详情面板（不跳页），面板按钮跳 2D 设备面板', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view3d/${E2E_SCENE_A}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('canvas', { timeout: 40_000 })
    await page.waitForSelector('.run3d-bar', { timeout: 30_000 })
    await page.waitForTimeout(3000)

    const pt = await page.evaluate(() => {
      const sm = (window as unknown as { __run3d?: { sm?: any } }).__run3d?.sm
      const obj = sm?.findObjectByBid('bid_e2e_box')
      if (!obj) return null
      const v = obj.position.clone().project(sm.camera)
      const r = sm.renderer.domElement.getBoundingClientRect()
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
    })
    expect(pt, '运行页应暴露 __run3d.sm 以便定位对象').toBeTruthy()
    await page.mouse.click(pt!.x, pt!.y)

    const panel = page.locator('[aria-label="设备详情"]')
    await expect(panel).toBeVisible({ timeout: 10_000 })
    // 点的是**无绑定的子件**（箱体），仍要能反查回设备（按设备名分组）
    await expect(panel.locator('.dp-tag')).toHaveText('WM-101')
    // 不跳页：URL 仍在运行页
    await expect(page).toHaveURL(new RegExp(`/view3d/${E2E_SCENE_A}$`))
    // 面板按钮 → 2D 设备面板
    await panel.locator('.dp-enter').click()
    await expect(page).toHaveURL(/\/view\/iot-faceplate-wm1\?dev=dev_wm1/)
  })

  /**
   * 3D 列表页删除闸（2026-11-28 补）：长期资产（`PROTECTED_SCENE_SLUGS`）不可删除。
   *
   * 回归成因：`isProtectedSceneSlug` 此前**零调用方**——清单登记了 iot-plant-3d 等长期
   * 资产，UI 删除却无拦截。本用例盯住「点删除 → 被拒 → 场景仍在」。
   */
  test('3D 列表页：长期资产删除被保护闸拦住', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/screens3d', { waitUntil: 'domcontentloaded' })
    const card = page.locator('[data-screen-id="iot-plant-3d"]')
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.locator('button.danger').click()
    await page.locator('.el-popconfirm button', { hasText: '删除' }).click()
    await expect(page.locator('.el-message--warning')).toContainText('长期资产', { timeout: 10_000 })
    // 场景仍在（未被删）
    await expect(page.locator('[data-screen-id="iot-plant-3d"]')).toBeVisible()
  })

  /**
   * 详情面板的实时值必须**持续更新**（2026-11-28 修冻结回归）。
   *
   * 回归成因：面板的值来自 `values`（field → 最新值），若它是普通 Map，Vue 的 computed
   * 读 `values.get()` 时不建立依赖 → SSE 推新值不触发重算 → 面板定格在打开瞬间那一个
   * （v1 页有同款注记，v2 曾重犯）。本用例盯住「值会变」这一可观察行为。
   */
  test('运行页：详情面板的实时值持续更新（不是冻结在打开瞬间）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view3d/${E2E_SCENE_A}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('canvas', { timeout: 40_000 })
    await page.waitForSelector('.run3d-bar', { timeout: 30_000 })
    await page.waitForTimeout(3000)

    const pt = await page.evaluate(() => {
      const sm = (window as unknown as { __run3d?: { sm?: any } }).__run3d?.sm
      const obj = sm?.findObjectByBid('bid_e2e_lamp')
      if (!obj) return null
      const v = obj.position.clone().project(sm.camera)
      const r = sm.renderer.domElement.getBoundingClientRect()
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
    })
    expect(pt).toBeTruthy()
    await page.mouse.click(pt!.x, pt!.y)

    const panel = page.locator('[aria-label="设备详情"]')
    await expect(panel).toBeVisible({ timeout: 10_000 })
    const value = panel.locator('.dp-value')
    // 先拿到一个**有数据**的读数（等 SSE 首次推送）
    await expect.poll(async () => (await value.textContent())?.trim() ?? '', { timeout: 15_000 })
      .not.toBe('暂无数据')
    const first = (await value.textContent())?.trim()
    // 再等它变化（流量点在持续波动；值不变即说明面板没跟着 SSE 重算）
    await expect
      .poll(async () => (await value.textContent())?.trim() ?? '', { timeout: 20_000 })
      .not.toBe(first)
  })

  /**
   * v1 运行页：读不到就**报错**，不再回退内置 demo 冒充真实场景（2026-11-28 修静默兜底）。
   *
   * 回归成因：v1 页原读 screens 族，而 v1 文档在 scenes 族 → 永远读不到 → 一律回退
   * 硬编码 demo；于是「v1 备份打不开」，且**任何未知 id 都静默显示假厂区**。
   */
  test('v1 运行页：未知场景 id 明确报错，不显示内置 demo', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/view3d/e2e-no-such-scene', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.load-error')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.load-error')).toContainText('场景加载失败')
    // 设备下拉（内置 demo 的设备列表）不应出现
    await expect(page.locator('.dev-picker')).toHaveCount(0)
  })

  /**
   * 编辑器预览（2026-11-27）：顶栏眼睛图标 → **先保存当前编辑态**，再在新标签打开
   * `/view3d/:id` 运行态（3D 与 2D 预览的关键差异：预览必须等于所见）。
   *
   * 顺带覆盖了此前 e2e 缺失的「编辑器保存往返」路径——预览必然先落库一次。
   */
  test('编辑器预览：先保存，再在新标签打开运行态', async ({ page, context }) => {
    await loginAsAdmin(page)
    await page.goto(`/edit3d/${E2E_SCENE_A}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.edit3d-topbar')).toBeVisible({ timeout: 30_000 })
    await page.waitForSelector('canvas', { timeout: 40_000 })

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('[data-testid="preview3d-btn"]').click(),
    ])
    await popup.waitForURL(new RegExp(`/view3d/${E2E_SCENE_A}$`), { timeout: 30_000 })
    await popup.waitForSelector('canvas', { timeout: 40_000 })
    await expect(popup.locator('.run3d-bar')).toBeVisible({ timeout: 30_000 })
    await expect(popup.locator('.run3d-error')).toHaveCount(0)
    // 原标签仍停在编辑器（预览不占走编辑页）
    await expect(page).toHaveURL(new RegExp(`/edit3d/${E2E_SCENE_A}$`))
    // 预览前的保存已落库，且**语义层没被保存清空**（上游 saveScene 不带 bindings/events，
    // 靠适配器合并——这里断言服务端文档里绑定与事件仍在）
    const after = (await rsiotGetScene(E2E_SCENE_A)).doc as Record<string, unknown>
    expect((after.bindings as unknown[]).length).toBeGreaterThan(0)
    expect((after.events as unknown[]).length).toBeGreaterThan(0)
  })
})
