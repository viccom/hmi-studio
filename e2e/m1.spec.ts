import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

// G-M1 段1：登录与守卫（列表页本体 T3 落地，此段只断言登录/跳转契约）
test.describe('M1 登录', () => {
  test('错误密码：el-alert 透传 401 文案，停留 /login', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('用户名').fill('admin')
    await page.getByPlaceholder('密码').fill('wrong-pass')
    await page.getByRole('button', { name: '登录' }).click()
    await expect(page.locator('.el-alert')).toBeVisible()
    await expect(page.locator('.el-alert')).toContainText(/invalid/i)
    await expect(page).toHaveURL(/\/login$/)
  })

  test('admin/admin：登录成功跳转 /（列表页 TBD 壳也接受，断言 URL）', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('用户名').fill('admin')
    await page.getByPlaceholder('密码').fill('admin')
    await page.getByRole('button', { name: '登录' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('已登录访问 /login 被守卫弹回 /', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/login')
    await expect(page).toHaveURL(/\/$/)
  })

  test('loginAsAdmin 注入 token 可直达业务页（供后续段复用）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    expect(await page.evaluate(() => localStorage.getItem('hmi_token'))).toBeTruthy()
  })
})
