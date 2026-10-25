import { test, expect } from '@playwright/test'
import { loginAsAdmin, rsiotSweepScreens } from './helpers'

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

// G-M1 段2（T3）：画面列表——新建 → 卡片出现（名称可见）→ 删除 → 卡片消失
test.describe('M1 画面列表', () => {
  const slug = `e2e-t3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  test.afterAll(async () => {
    // 测试自洁：清扫本次及历史失败运行遗留的 e2e-t3-* 画面
    await rsiotSweepScreens(/^e2e-t3-/)
  })

  test('新建画面 → 卡片出现 → 删除 → 卡片消失', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/')
    await page.getByRole('button', { name: '新建画面' }).click()
    await page.getByPlaceholder('screen-id').fill(slug)
    await page.getByPlaceholder('画面名称').fill('E2E-T3 验证画面')
    await page.getByRole('button', { name: '创建', exact: true }).click()

    const card = page.locator('.el-card', { hasText: slug })
    await expect(card).toBeVisible()
    await expect(card).toContainText('E2E-T3 验证画面')

    await card.getByTitle('删除画面').click()
    await page.getByRole('button', { name: '删除', exact: true }).click()
    await expect(page.locator('.el-card', { hasText: slug })).toHaveCount(0)
  })

  test('slug 非法输入被表单校验拦截（不弹错误、不发 PUT）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/')
    await page.getByRole('button', { name: '新建画面' }).click()
    await page.getByPlaceholder('screen-id').fill('Bad_Slug!')
    await page.getByPlaceholder('画面名称').fill('x')
    await page.getByRole('button', { name: '创建', exact: true }).click()
    await expect(page.locator('.el-form-item__error').first()).toBeVisible()
    // 对话框仍开着（未提交）
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
})
