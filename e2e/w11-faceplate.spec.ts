import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'
import { seedFaceplateScreen } from './fixtures'
import { HOME_E_FACEPLATE } from '../src/screen-assets/home-faceplate-screen'

// W11 参数化样板屏（传统 HMI 画面模板 + 标签前缀）汇总门：
// - bind_id 前缀 @dev. 由 ViewView 按激活设备重写（dev-context.ts），一屏服务 N 台设备；
// - **默认激活**（W11.1 用户反馈修正）：首次进入（无 ?dev）即激活清单首台——界面显示了
//   选择（选择器/按钮高亮）就必须有数据，不存在"待选态"；默认设备写回 URL（刷新保持）；
// - 深链 ?dev=<devid> 覆盖默认；canvas 按钮（customCode dev 词表）/ 选择器切换 =
//   重映射 + setImportJson 重挂 + resubscribe（订阅面随设备收敛）；
// - @meta.dev 宿主直推 → 画面内标题/选择器回显当前设备；状态栏 active-dev 徽标同步。

test.describe('W11 参数化画面（faceplate）', () => {
  test.beforeAll(async () => { await seedFaceplateScreen() })

  test('深链 ?dev= 覆盖默认：标题/状态栏/选择器三处回显 + 值牌活数据 + 订阅面收敛', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${HOME_E_FACEPLATE}?dev=home-meter-e2`)
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 10_000 })

    // 三处回显：画面内标题（@meta.dev）+ 选择器（同通道）+ 状态栏徽标
    await expect(page.locator('#text-vue-hfp-dev .break-words')).toHaveText('home-meter-e2', { timeout: 10_000 })
    await expect(page.locator('#ah-dev-selector-hfp')).toContainText('2# 电表')
    await expect(page.locator('[data-testid="active-dev"]')).toHaveText('设备 home-meter-e2')

    // 活数据：重映射后的 @dev.power → home-meter-e2.power；订阅 = 该设备 9 个唯一字段
    await expect(page.locator('#text-vue-hfp-v-power .break-words')).not.toHaveText('—', { timeout: 10_000 })
    await expect(page.locator('#ah-meter-panel-hfp .ah-mp-row')).toHaveCount(5)
    await expect(page.locator('#ah-trend-chart-hfp canvas')).toHaveCount(1)
    await expect(page.locator('.sb-points')).toHaveText('订阅 9 点')
  })

  test('首次进入默认激活清单首台（无 ?dev）+ 默认设备写回 URL + 按钮/选择器切换', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${HOME_E_FACEPLATE}`)
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 10_000 })

    // 默认 = meta.devs 首台 e1：立即有数据（不允许"显示了选择却没数据"）
    await expect(page.locator('[data-testid="active-dev"]')).toHaveText('设备 home-meter-e1')
    await expect(page.locator('#text-vue-hfp-dev .break-words')).toHaveText('home-meter-e1', { timeout: 10_000 })
    await expect(page.locator('#text-vue-hfp-v-power .break-words')).not.toHaveText('—', { timeout: 10_000 })
    await expect(page.locator('.sb-points')).toHaveText('订阅 9 点')
    // 默认设备写回 URL（刷新/分享保持上下文）
    await expect(page).toHaveURL(new RegExp('dev=home-meter-e1'))

    // 设备按钮切 2#：词表 dev → 重映射重挂，URL query 同步，值牌转活
    await page.getByRole('button').filter({ hasText: '2# 电表' }).click()
    await expect(page).toHaveURL(new RegExp('dev=home-meter-e2'))
    await expect(page.locator('[data-testid="active-dev"]')).toHaveText('设备 home-meter-e2')
    await expect.poll(async () => (await page.locator('#text-vue-hfp-v-power .break-words').textContent()) ?? '',
      { timeout: 10_000 }).not.toBe('—')

    // 选择器切回 1#：下拉变更 → 词表 dev（组件直调 window.$mtEventCallBack）
    await page.locator('#ah-dev-selector-hfp .el-select').click()
    await page.getByRole('option', { name: '1# 电表' }).click()
    await expect(page).toHaveURL(new RegExp('dev=home-meter-e1$'))
    await expect(page.locator('[data-testid="active-dev"]')).toHaveText('设备 home-meter-e1')
    await expect.poll(async () => (await page.locator('#text-vue-hfp-v-power .break-words').textContent()) ?? '',
      { timeout: 10_000 }).not.toBe('—')
  })
})
