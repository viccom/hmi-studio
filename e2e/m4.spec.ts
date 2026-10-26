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
