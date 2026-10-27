import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

// P2 覆盖缺口补齐：告警抽屉（打开/活动列表/人工清除）此前零 e2e——它是用户可见交互 +
// 真实写操作（DELETE /api/v1/alarms?key=，F14③ 实证的幂等清除路径）。
// 快照 mock 属规范 §3.2 允许的第三类（确定性：不依赖脚本真实 fire 告警）；
// 活动告警用固定 key，与真实 SSE 增量互不干扰（双源合并语义单测另锁）。
const KEY = 'e2e-alarm-drawer-1'
const ACTIVE = [{
  key: KEY, level: 'warn', source: 'rsiot', message: 'E2E 抽屉验证告警', ts: '2026-10-27T12:00:00Z', count: 1,
}]

test('告警抽屉：横幅点击打开 → 活动列表 → 确认清除 → DELETE 契约 + 状态转已清除', async ({ page }) => {
  await loginAsAdmin(page)

  await page.route('**/api/v1/alarms', (route) => route.fulfill({ json: ACTIVE })) // GET 快照（无 query）
  const deletes: string[] = []
  await page.route(/\/api\/v1\/alarms\?key=/, (route) => {
    deletes.push(route.request().url())
    void route.fulfill({ json: { status: 'ok' } })
  })

  await page.goto('/view/water-demo-m3')
  await expect(page.getByTestId('alarm-banner')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('alarm-banner').click()

  // 抽屉打开：标题 + 我们的活动行（告警中状态）。data-testid 落在 .el-drawer 元素自身
  //（teleport 到 body，role=dialog）——按 testid 直取，不做祖先包含选择器。
  const drawer = page.getByTestId('alarm-drawer')
  await expect(drawer).toBeVisible()
  const row = drawer.locator('tbody tr', { hasText: 'E2E 抽屉验证告警' })
  await expect(row).toBeVisible()
  await expect(row.locator('.st')).toHaveText('告警中')

  // 确认清除 → DELETE 契约（key 查询参）+ 本地转历史态（已清除）
  await row.locator('button', { hasText: '确认清除' }).click()
  await expect.poll(() => deletes.length).toBe(1)
  expect(deletes[0]).toContain(`key=${encodeURIComponent(KEY)}`)
  await expect(row.locator('.st')).toHaveText('已清除', { timeout: 10_000 })
})
