import { test, expect, type Locator } from '@playwright/test'
import { loginAsAdmin } from './helpers'
import { seedCatalogDemo } from './fixtures'
import { DEMO_CATALOG } from '../src/lib/demo-screen'

// G-SYMBOLS 图元批量轮汇总门（批 A svg 6 + 批 B vue/custom-svg 6 + 批 C 陈列室）：
// 陈列室 = T14 同款长期资产（slug 恒定 catalog-demo，PUT upsert 幂等，无清扫）。
//
// 断言法（规范 §6 两类）：
// - svg 型 + custom-svg 型 → dataURI <img>，decodeURIComponent(img.src) 读 use 属性/SSR 串
//   （svg 走 TP 序列化、custom-svg 走 M_ SSR 串化——两条管线同落 dataURI）
// - vue 型 → 真实组件 DOM（数显 .ah-dsp-value 文本、选择开关 transform）
// SSE mock 沿用 F20 page.route fulfill 法：整帧 snapshot 后断流 → 客户端 ~1s 退避重连，
// 服务变量切换后二次断言（变色-恢复全链经真实 maotu 管线）。

// 21 类注册图元（registry 全量）：13 svg + 4 custom-svg/vue 仪表 + 4 操作（dis-switch/nav 为 svg 型）
const SVG_TYPES = [
  'ah-pump', 'ah-gate-valve', 'ah-butterfly-valve', 'ah-check-valve', 'ah-ball-valve',
  'ah-safety-valve', 'ah-solenoid-valve', 'ah-tank', 'ah-level-gauge', 'ah-flow-meter',
  'ah-fan', 'ah-agitator', 'ah-motor',
]
const CUSTOM_TYPES = ['ah-gauge-pressure', 'ah-thermometer', 'ah-stack-light']
const VUE_TYPES = ['ah-digital-display', 'ah-push-button', 'ah-selector-switch']
const OP_SVG_TYPES = ['ah-dis-switch', 'ah-nav-button']
const ALL = [...SVG_TYPES, ...OP_SVG_TYPES, ...CUSTOM_TYPES, ...VUE_TYPES]

test.describe('G-SYMBOLS 图元陈列室（批 C）', () => {
  test.beforeAll(async () => { await seedCatalogDemo() })

  test('段1: 21 类图元全渲染——svg/custom-svg img + vue DOM 两类断言', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${DEMO_CATALOG}`)
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 10_000 })

    // 每类 ≥1 节点（拖入建元 tag=注册项 id，节点 id = `${tag}-${n}`）
    for (const tag of ALL) {
      await expect(page.locator(`[id^="${tag}-"]`), tag).toHaveCount(1)
    }
    // svg 型：dataURI img 渲染（保存/导入态管线）
    await expect(page.locator('#ah-pump-cat-1 img')).toBeVisible()
    const pumpSrc = await page.locator('#ah-pump-cat-1 img').getAttribute('src')
    expect(pumpSrc).toContain('data:image/svg')
    // custom-svg 型：M_ SSR 串化 img（gauge 的刻度文本可 decode）
    await expect(page.locator('#ah-gauge-pressure-cat-1 img')).toBeVisible()
    // vue 型：真实组件 DOM
    await expect(page.locator('#ah-digital-display-cat-1 .ah-dsp-value')).toBeVisible()
    await expect(page.locator('#ah-selector-switch-cat-1 svg')).toBeVisible()
    // 总节点 = 21 自绘 + 陈列室文本（标题/分区/值牌）
    const total = await page.locator('[id^="ah-"], [id^="text-vue-"]').count()
    expect(total).toBe(21 + 8)
  })

  test('段2: 数显读数随 SSE 变化 + 泵阈值触发变色 + 压力表盘同步（cpu 95→20 往返）', async ({ page }) => {
    await loginAsAdmin(page)
    let cpu = 95
    // cell 必须是真数组 [ts, localTime, "值串"]（F11/F2 形状，勿回退字符串）
    const cell = (v: string): [number, string, string] => [1792980000, '2026-10-26 10:00:00', v]
    await page.route('**/api/v1/rtdatas/subscribe*', (route) => route.fulfill({
      status: 200, contentType: 'text/event-stream',
      body: `event: snapshot\ndata: ${JSON.stringify({
        dev: 'rsiot',
        points: {
          'rsiot.cpu_percent': cell(String(cpu)),
          'rsiot.uptime_s': cell('63000'),
          'rsiot.alarm_active': cell('0'),
        },
      })}\n\n`,
    }))

    await page.goto(`/view/${DEMO_CATALOG}`)
    const pumpImg = page.locator('#ah-pump-cat-1 img')
    const dsp = page.locator('#ah-digital-display-cat-1 .ah-dsp-value')
    const gaugeImg = page.locator('#ah-gauge-pressure-cat-1 img')

    // 高载：cpu=95 → 泵 >80 触发红（svg dataURI use 属性）+ 数显 95（vue DOM 直写）+ 表盘 95（SSR 串化文本）
    await expect(pumpImg).toBeVisible({ timeout: 10_000 })
    await expect.poll(() => imgAttr(pumpImg, 'fill="#f5222d"'), { timeout: 15_000 }).toBe(true)
    await expect.poll(() => dsp.textContent(), { timeout: 10_000 }).toBe('95')
    await expect.poll(() => imgAttr(gaugeImg, '95 kPa'), { timeout: 10_000 }).toBe(true)

    // 恢复：cpu=20 → <=80 触发收口回绿 + 数显 20
    cpu = 20
    await expect.poll(() => imgAttr(pumpImg, 'fill="#52c41a"'), { timeout: 20_000 }).toBe(true)
    await expect.poll(() => dsp.textContent(), { timeout: 10_000 }).toBe('20')
  })

  test('段3: alarm_active 触发链——三色灯红灯亮（custom-svg 串化含红色段）', async ({ page }) => {
    await loginAsAdmin(page)
    let alarm = 1
    const cell = (v: string): [number, string, string] => [1792980000, '2026-10-26 10:00:00', v]
    await page.route('**/api/v1/rtdatas/subscribe*', (route) => route.fulfill({
      status: 200, contentType: 'text/event-stream',
      body: `event: snapshot\ndata: ${JSON.stringify({
        dev: 'rsiot',
        points: {
          'rsiot.cpu_percent': cell('10'),
          'rsiot.uptime_s': cell('63000'),
          'rsiot.alarm_active': cell(String(alarm)),
        },
      })}\n\n`,
    }))

    await page.goto(`/view/${DEMO_CATALOG}`)
    const stackImg = page.locator('#ah-stack-light-cat-1 img')
    await expect(stackImg).toBeVisible({ timeout: 10_000 })
    // alarm=1 → red=true 触发（=1 亮/=0 灭互斥收口）→ 红段体色 #f5222d 进 SSR 串
    await expect.poll(() => imgAttr(stackImg, 'fill="#f5222d"'), { timeout: 15_000 }).toBe(true)

    // 恢复：alarm=0 → red=false → 红段回暗壳（#262d36）
    alarm = 0
    await expect.poll(() => imgAttr(stackImg, 'fill="#262d36"'), { timeout: 20_000 }).toBe(true)
  })
})

/** dataURI <img> 的属性/文本断言：decode(src) 含 `needle`（TP/SSR 序列化形） */
async function imgAttr(loc: Locator, needle: string): Promise<boolean> {
  const src = await loc.getAttribute('src')
  return src ? decodeURIComponent(src).includes(needle) : false
}
