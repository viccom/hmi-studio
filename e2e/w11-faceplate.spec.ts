import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'
import { seedFaceplateScreen } from './fixtures'
import { HOME_E_FACEPLATE } from '../src/lib/home-faceplate-screen'

// W11 参数化样板屏（传统 HMI 画面模板 + 标签前缀）汇总门：
// - bind_id 前缀 @dev. 由 ViewView 按激活设备重写（dev-context.ts），一屏服务 N 台设备；
// - 深链 ?dev=<devid> 直接激活；canvas 按钮（customCode dev 词表）/ 选择器切换 =
//   重映射 + setImportJson 重挂 + resubscribe（订阅面随设备收敛）；
// - @meta.dev 宿主直推 → 画面内标题回显当前设备；状态栏 active-dev 徽标同步。
// 无 ?dev 时参数屏无订阅面（值牌保持 '—'），选中后才活——e2e 冻结该语义。

test.describe('W11 参数化画面（faceplate）', () => {
  test.beforeAll(async () => { await seedFaceplateScreen() })

  test('深链 ?dev= 直接激活：标题/状态栏回显 + 值牌活数据 + 订阅面收敛到该设备', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${HOME_E_FACEPLATE}?dev=home-meter-e1`)
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 10_000 })

    // 画面内标题（@meta.dev 宿主直推）+ 状态栏徽标
    await expect(page.locator('#text-vue-hfp-dev .break-words')).toHaveText('home-meter-e1', { timeout: 10_000 })
    await expect(page.locator('[data-testid="active-dev"]')).toHaveText('设备 home-meter-e1')

    // 活数据：重映射后的 @dev.power → home-meter-e1.power（面板图元行 + 值牌双证）
    await expect(page.locator('#text-vue-hfp-v-power .break-words')).not.toHaveText('—', { timeout: 10_000 })
    await expect(page.locator('#ah-meter-panel-hfp .ah-mp-row')).toHaveCount(5)
    await expect(page.locator('#ah-trend-chart-hfp canvas')).toHaveCount(1)
    // 订阅点数 = 去重 field 数（面板 7 + 趋势 2 + 值牌 6 → 9 个唯一字段，全落 e1）
    await expect(page.locator('.sb-points')).toHaveText('订阅 9 点')
  })

  test('无 ?dev 待选 + 按钮/选择器切换：重挂换源 + URL 同步 + 状态栏徽标移动', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${HOME_E_FACEPLATE}`)
    await expect(page.locator('.state.offline')).toBeVisible({ timeout: 10_000 })
    // 待选态：无订阅、值牌保持初值
    await expect(page.locator('.sb-points')).toContainText('订阅 0 点')
    await expect(page.locator('#text-vue-hfp-v-power .break-words')).toHaveText('—')

    // 设备按钮切 2#：词表 dev → 重映射重挂，URL query 同步，值牌转活
    await page.getByRole('button').filter({ hasText: '2# 电表' }).click()
    await expect(page).toHaveURL(new RegExp(`dev=home-meter-e2`))
    await expect(page.locator('[data-testid="active-dev"]')).toHaveText('设备 home-meter-e2')
    await expect(page.locator('#text-vue-hfp-dev .break-words')).toHaveText('home-meter-e2', { timeout: 10_000 })
    await expect.poll(async () => (await page.locator('#text-vue-hfp-v-power .break-words').textContent()) ?? '',
      { timeout: 10_000 }).not.toBe('—')

    // 选择器切回 1#：下拉变更 → 词表 dev（组件直调 window.$mtEventCallBack）
    await page.locator('#ah-dev-selector-hfp .el-select').click()
    await page.getByRole('option', { name: '1# 电表' }).click()
    await expect(page).toHaveURL(new RegExp(`dev=home-meter-e1$`))
    await expect(page.locator('[data-testid="active-dev"]')).toHaveText('设备 home-meter-e1')
    await expect.poll(async () => (await page.locator('#text-vue-hfp-v-power .break-words').textContent()) ?? '',
      { timeout: 10_000 }).not.toBe('—')
  })
})
