import { test, expect } from '@playwright/test'

// T0 冒烟：应用可服务、登录页可达、未登录访问业务路由被守卫拦回 /login
test('login page serves; guard redirects unauthenticated', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('main')).toBeVisible()

  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})
