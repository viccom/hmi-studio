import { test, expect } from '@playwright/test'

// T18 LAN 部署冒烟（G-M4）：对 gateway origin（127.0.0.1:18080）打已部署 dist——
// **不依赖 dev webServer**（test.use 覆写 baseURL；全局 webServer 照常起 5290 但本 spec 不用）。
// 链路 = gateway 三类路由（app.rs）：/hmi 静态 + /api/gw/login（PUBLIC 转发）+
// /api/rsiot/*（Bearer REST / ?token= SSE——EventSource 无法设 header，网关层1 只认
// Bearer/query 不认 Cookie，故部署 build 烘 VITE_API_BASE=/api/rsiot + query token 形态）。
// 默认开启：gateway 是本机常驻（playwright.config 不做 skip）。
test.use({ baseURL: 'http://127.0.0.1:18080' })

test('LAN 冒烟：/hmi/ → 登录 → 列表见 demo → 运行页 ≥12 图元 + online（同源 SSE）→ 互跳', async ({ page }) => {
  // 1) 静态 SPA：未登录访问 /hmi/ 被守卫拦到 /hmi/login
  await page.goto('/hmi/')
  await expect(page).toHaveURL(/\/hmi\/login$/)
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/) // 部署产物深色默认（T16）

  // 2) 真实登录（经 /api/gw/login → rs-iot 验证 → 共享 secret JWT）
  await page.getByPlaceholder('用户名').fill('admin')
  await page.getByPlaceholder('密码').fill('admin')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page).toHaveURL(/\/hmi\/$/, { timeout: 10_000 })

  // 3) 列表（REST 经 /api/rsiot Bearer）：demo 卡片 + 缩略真渲染（T17 部署形态）
  const demoCard = page.locator('.el-card', { hasText: 'water-demo-m3' }).first()
  await demoCard.scrollIntoViewIfNeeded()
  await expect(demoCard).toBeVisible()
  await expect(demoCard.locator('.thumb-scale img').first()).toBeVisible({ timeout: 10_000 })

  // 4) 运行页：图元 ≥12 + 状态灯 online（SSE 同源经网关 ?token= 直连——snapshot 真数据）
  await page.goto('/hmi/view/water-demo-m3')
  await expect(page.locator('.state.online')).toBeVisible({ timeout: 15_000 })
  const count = await page.locator('[id^="ah-"], [id^="text-vue-"]').count()
  expect(count).toBeGreaterThanOrEqual(12)
  // 状态栏在位（T16）：订阅点数 = 3 去重点
  await expect(page.locator('[data-testid="status-bar"]')).toContainText('订阅 3 点')

  // 5) 互跳一发：nav-button → /hmi/view/water-demo-m3-b（容器内跳转，无整页刷新）
  await page.locator('#ah-nav-button-wdm3a-1').click()
  await expect(page).toHaveURL(/\/hmi\/view\/water-demo-m3-b$/, { timeout: 10_000 })
  await expect(page.locator('#ah-nav-button-wdm3b-1')).toHaveCount(1)
})
