import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'
import { seedHomeScreens } from './fixtures'
import { HOME_E, HOME_W, HOME_G } from '../src/lib/home-screens'

// P3 家庭三表三屏汇总门：长期资产（slug 恒定，PUT upsert 幂等，beforeAll 重播种，**无清扫**——
// 同 water-demo-m3 约定）。数据面 = 真实活数据 home-meter-e/w/g 系列（采集周期 2s，curl 实测
// datachange 节奏 ~2s），非 SSE mock——活数据断言走「两次采样不等」（m2 段1 手法）。
//
// 断言法（规范 §6）：趋势/面板 = vue 真实 DOM（canvas/.ah-mp-row/.ah-trc-n）；功率盘/三色灯/
// 水表/燃气表 = custom-svg SSR 串化 img（src 含 data:image/svg）。趋势攒点：bind 直写 tick →
// 环形缓冲（节流 ≥1s 重绘）——2s 周期数据 12s 应攒 ≥3 点，断言 ≥2（留重连退避余量）。

/** 活数据双采样：值牌 snapshot 到达（脱离初值）→ 下一次 datachange 后文本必变 */
async function assertLiveText(page: import('@playwright/test').Page, pelId: string): Promise<void> {
  const txt = page.locator(`#${pelId} .break-words`)
  await expect.poll(async () => (await txt.textContent()) ?? '', { timeout: 10_000 }).not.toBe('—')
  const first = (await txt.textContent())?.trim()
  await expect.poll(async () => (await txt.textContent())?.trim() !== first, { timeout: 15_000 }).toBe(true)
}

/** 趋势攒点：.ah-trc-n = 「N 点」（双曲线缓冲合计），2s 周期 + 1s 节流 → ≥2 点 */
async function assertTrendPoints(page: import('@playwright/test').Page, pelId: string): Promise<number> {
  const trend = page.locator(`#${pelId}`)
  await expect(trend.locator('canvas')).toHaveCount(1)
  const n = trend.locator('.ah-trc-n')
  await expect.poll(async () => parseInt((await n.textContent()) ?? '0', 10) || 0, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(2)
  return parseInt((await n.textContent()) ?? '0', 10)
}

test.describe('P3 家庭三表三屏', () => {
  test.beforeAll(async () => { await seedHomeScreens() })

  test('电屏：图元计数 + 面板五行/功率盘/趋势 canvas + 活数据双采样 + 趋势攒点', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${HOME_E}`)
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 10_000 })

    // 7 自绘：面板×2/功率盘/趋势/三色灯/导航×2
    await expect(page.locator('[id^="ah-"]')).toHaveCount(7)
    await expect(page.locator('#ah-meter-panel-hmp-1 .ah-mp-row')).toHaveCount(5)
    await expect(page.locator('#ah-meter-panel-hmp-2 .ah-mp-row')).toHaveCount(5)
    await expect(page.locator('#ah-power-gauge-hmp-1 img')).toBeVisible()
    await expect(page.locator('#ah-stack-light-hmp-1 img')).toBeVisible()
    await expect(page.locator('[id^="ah-nav-button-hmp-"]')).toHaveCount(2)

    // 活数据：总电能值牌（energy ~2s 递增）两次采样不等；状态码值牌 snapshot 到达
    await assertLiveText(page, 'text-vue-hmp-val-energy')
    await expect(page.locator('#text-vue-hmp-val-status .break-words')).not.toHaveText('—', { timeout: 10_000 })

    // 趋势攒点（power/current 双曲线合计）
    const points = await assertTrendPoints(page, 'ah-trend-chart-hmp-1')
    expect(points).toBeGreaterThanOrEqual(2)
  })

  test('水屏：双水表 img + 趋势 canvas + 累计活数据 + 逆流/阀门值牌到达 + 趋势攒点', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${HOME_W}`)
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 10_000 })

    // 5 自绘：水表×2/趋势/导航×2
    await expect(page.locator('[id^="ah-"]')).toHaveCount(5)
    for (const id of ['ah-water-meter-hmw-1', 'ah-water-meter-hmw-2']) {
      const src = await page.locator(`#${id} img`).getAttribute('src')
      expect(src, id).toContain('data:image/svg')
    }
    await expect(page.locator('#ah-trend-chart-hmw-1 canvas')).toHaveCount(1)

    // 活数据：1# 累计流量值牌（flow_total ~2s 递增）两次采样不等；逆流/阀门值牌 snapshot 到达
    await assertLiveText(page, 'text-vue-hmw-val-t1')
    for (const id of ['text-vue-hmw-val-rev1', 'text-vue-hmw-val-vlv1']) {
      await expect(page.locator(`#${id} .break-words`)).not.toHaveText('—', { timeout: 10_000 })
    }

    const points = await assertTrendPoints(page, 'ah-trend-chart-hmw-1')
    expect(points).toBeGreaterThanOrEqual(2)
  })

  test('气屏：双燃气表 img + 泄漏灯 + 趋势 canvas + 累计活数据 + 安全提示条 + 趋势攒点', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${HOME_G}`)
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 10_000 })

    // 6 自绘：燃气表×2/三色灯/趋势/导航×2
    await expect(page.locator('[id^="ah-"]')).toHaveCount(6)
    for (const id of ['ah-gas-meter-hmg-1', 'ah-gas-meter-hmg-2']) {
      const src = await page.locator(`#${id} img`).getAttribute('src')
      expect(src, id).toContain('data:image/svg')
    }
    await expect(page.locator('#ah-stack-light-hmg-1 img')).toBeVisible()
    await expect(page.locator('#ah-trend-chart-hmg-1 canvas')).toHaveCount(1)

    // 活数据：1# 累计气量值牌（gas_total ~2s 递增）两次采样不等；余额值牌 snapshot 到达
    await assertLiveText(page, 'text-vue-hmg-val-t1')
    await expect(page.locator('#text-vue-hmg-val-bal1 .break-words')).not.toHaveText('—', { timeout: 10_000 })

    // 安全提示条（静态）
    await expect(page.locator('#text-vue-hmg-lbl-safe .break-words')).toContainText('泄漏报警联动关阀')

    const points = await assertTrendPoints(page, 'ah-trend-chart-hmg-1')
    expect(points).toBeGreaterThanOrEqual(2)
  })
})
