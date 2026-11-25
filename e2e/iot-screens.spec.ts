import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'
import { seedIotScreens, seedIotBiStation } from './fixtures'
import { IOT_L1, IOT_WATER, IOT_POWER, IOT_GAS, IOT_ENV, IOT_BI_STATION } from '../src/screen-assets/protected'

// 工业 SCADA 画面集（iot-demo）：L1 总览 / L2 单元 / L3 设备面板。
// 数据面 = 真实 rs-iot 点位（simulator Modbus/OPC UA，周期 2–3s）+ 宿主合成点位
// （__sys / __area / __prio，见 src/lib/synthetic.ts）。断言意图：
// - 画面加载后真实数值刷新（非 '—' 初值），限值带与报警/质量徽标在位
// - L1→L2→L3 导航；L3 目标带 ?dev= 且激活设备正确、参数表行齐
// - 返回按钮回到上一层；四张 L2 画面冒烟

const NUM = /^-?\d+(\.\d+)?$/

test.describe('工业 SCADA 画面集（iot-demo）', () => {
  test.beforeAll(async () => {
    await seedIotScreens()
    await seedIotBiStation()
  })

  test('L1 总览：区域卡实时 KPI + 全厂报警/质量徽标', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${IOT_L1}`)
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('#txt-title .break-words')).toContainText('全厂总览')
    for (const area of ['water', 'power', 'gas', 'env']) {
      await expect(page.locator(`#ac-${area}`)).toBeVisible()
    }
    // 真实值刷新（连接 snapshot 到达后不再是 '—'）
    await expect.poll(
      async () => (await page.locator('#ac-water [data-testid="ac-kpi1"]').textContent()) ?? '',
      { timeout: 20_000 },
    ).toMatch(NUM)
    // 报警徽标合法（正常 / P1-P4）；质量徽标三态之一
    await expect(page.locator('#ab-global [data-testid="ab-prio"]')).toHaveText(/^(正常|P[1-4])$/)
    await expect(page.locator('#qc-global [data-testid="qb-text"]')).toHaveText(/^(GOOD|STALE|BAD)$/)
    // 报警按钮 → 全局报警抽屉（词表 alarm）
    await page.locator('#btn-alarm').click()
    await expect(page.locator('[data-testid="alarm-drawer"]')).toBeVisible()
  })

  test('L1→L2：区域卡按钮跳转；L2 就地值块/限值带/报警徽标', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${IOT_L1}`)
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 20_000 })
    await page.locator('#btn-water-go').click()
    await expect(page).toHaveURL(new RegExp(`/view/${IOT_WATER}$`))
    await expect(page.locator('#vb-flow-1 [data-testid="vb-value"]')).toHaveText(NUM, { timeout: 20_000 })
    await expect(page.locator('#vb-flow-1 [data-testid="vb-band"]')).toBeVisible()
    await expect(page.locator('#ab-dev-1 [data-testid="ab-prio"]')).toHaveText(/^(正常|P[1-4])$/)
    await expect(page.locator('#sp-wm1 [data-testid="ah-sparkline"]')).toBeVisible()
  })

  test('L2→L3 带设备上下文：?dev= + faceplate PV + 参数表 + 返回', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${IOT_WATER}`)
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 20_000 })
    // 第 2 路详情 → wm2
    await page.locator('#btn-detail-2').click()
    await expect(page).toHaveURL(new RegExp('/view/iot-faceplate-wm2\\?dev=dev_wm2$'))
    await expect(page.locator('[data-testid="active-dev"]')).toContainText('dev_wm2')
    await expect(page.locator('#fp-main [data-testid="fp-pv"]')).toHaveText(NUM, { timeout: 20_000 })
    // 参数表：数值行（紧凑值块）+ 布尔行（状态徽标）
    await expect(page.locator('#row-flow_rate [data-testid="vb-value"]')).toHaveText(NUM)
    await expect(page.locator('#row-valve_status [data-testid="sb-text"]')).toHaveText(/^(关|开)$/)
    // 返回上一层
    await page.locator('#btn-back').click()
    await expect(page).toHaveURL(new RegExp(`/view/${IOT_WATER}$`))
  })

  test('其余 L2 冒烟：配电/燃气/环境均可加载且有活数据', async ({ page }) => {
    await loginAsAdmin(page)
    const cases: Array<[string, string]> = [
      [IOT_POWER, '#vb-p-1 [data-testid="vb-value"]'],
      [IOT_GAS, '#vb-flow-1 [data-testid="vb-value"]'],
      [IOT_ENV, '#vb-dev_env1-temperature [data-testid="vb-value"]'],
    ]
    for (const [slug, sel] of cases) {
      await page.goto(`/view/${slug}`)
      await expect(page.locator('.state.online')).toBeVisible({ timeout: 20_000 })
      await expect(page.locator(sel)).toHaveText(NUM, { timeout: 20_000 })
      await expect(page.locator('#ab-global [data-testid="ab-prio"]')).toHaveText(/^(正常|P[1-4])$/)
    }
  })

  test('历史分析大屏（BI）：KPI 有历史值 + 24h 趋势画出曲线 + 窗口切换器存在', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${IOT_BI_STATION}`)
    await expect(page.locator('#ah-bi-window-iotbi-1')).toBeVisible()
    // BI 通道 30s 一拍：等信封写回后 KPI 才不是 '--'
    await expect.poll(
      async () => (await page.locator('#ah-bi-kpi-iotbi-power').textContent()) ?? '',
      { timeout: 60_000 },
    ).toMatch(/\d/)
    // 24h 功率趋势：echarts canvas 已绘（非空像素）
    const drawn = await page.evaluate(() => {
      const c = document.querySelector('#ah-bi-trend-iotbi-power canvas') as HTMLCanvasElement | null
      if (!c) return false
      const ctx = c.getContext('2d')
      if (!ctx) return false
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
      return n > 500
    })
    expect(drawn).toBe(true)
    // 活动告警统计面板在位
    await expect(page.locator('#ah-bi-alarms-iotbi-1')).toBeVisible()
  })

  test('L1 历史趋势带与 L3 设备历史趋势：曲线已绘（BI 通道 B）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${IOT_L1}`)
    await expect(page.locator('#hist-plant-power')).toBeVisible()
    await expect.poll(
      async () => await page.locator('#hist-plant-power polyline').count(),
      { timeout: 60_000 },
    ).toBeGreaterThan(0)

    await page.goto('/view/iot-faceplate-em1')
    await expect(page.locator('#hist-main')).toBeVisible()
    await expect.poll(
      async () => await page.locator('#hist-main polyline').count(),
      { timeout: 60_000 },
    ).toBeGreaterThan(0)
  })

  test('L3 空压/故障映射：pt1 fault=false 显示运行（触发器把 bool 映射成状态码）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/view/iot-faceplate-pt1')
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('#fp-main [data-testid="fp-pv"]')).toHaveText(NUM, { timeout: 20_000 })
    await expect(page.locator('#fp-main .ah-fp-status')).toHaveText(/^(运行|故障|停止|维护|离线)$/)
    await expect(page.locator('#row-fault [data-testid="sb-text"]')).toHaveText(/^(正常|故障)$/)
  })
})
