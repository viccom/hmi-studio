import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'
import { seedHomeTabScreens } from './fixtures'
import { HOME_G_TABS, HOME_E_TABS } from '../src/lib/home-tab-screens'

// W10 页签切换 + 自适应缩放汇总门（机制依据见 home-tab-screens.ts 文件头）：
// - 页签 = click→changeAttr(hide) 纯组态：2# 面板出厂全隐（v-if 不渲染），点击互斥翻转 +
//   按钮激活背景色互换（sys-button type: primary #409eff / info #909399，z 走 setTimeout(0)）。
// - 隐藏面板 binds 照常直写（vP 不判 hide）→ 切到 2# 后值牌立即有活数据（无需等首帧）。
// - 自适应 = 宿主 wrapper transform（fit-scale.ts contain 数学），data-fit 属性为断言锚点。
// 数据面 = 真实活数据（周期 2s），非 SSE mock。

test.describe('W10 页签屏 + 自适应', () => {
  test.beforeAll(async () => { await seedHomeTabScreens() })

  test('燃气页签屏：初始 1# 显 / 2# 不渲染；点击 2# 互斥翻转 + 激活色移动', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${HOME_G_TABS}`)
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 10_000 })

    // 初始：1# 面板渲染、2# 面板 v-if 不在 DOM（逐元素 hide）
    await expect(page.locator('#ah-gas-meter-hgt1')).toBeVisible()
    await expect(page.locator('#ah-gas-meter-hgt2')).toHaveCount(0)
    await expect(page.locator('#text-vue-hgt1-v-total .break-words')).toBeVisible()
    await expect(page.locator('#text-vue-hgt2-v-total')).toHaveCount(0)

    // 页签按钮激活态：1# primary（蓝）、2# info（灰）
    const btn1 = page.getByRole('button').filter({ hasText: '1# 表' })
    const btn2 = page.getByRole('button').filter({ hasText: '2# 表' })
    await expect(btn1).toHaveCSS('background-color', 'rgb(64, 158, 255)')
    await expect(btn2).toHaveCSS('background-color', 'rgb(144, 147, 153)')

    // 点击 2#：面板互斥翻转 + 激活色随页签移动（changeAttr 深路径 setter）
    await btn2.click()
    await expect(page.locator('#ah-gas-meter-hgt2')).toBeVisible()
    await expect(page.locator('#ah-gas-meter-hgt1')).toHaveCount(0)
    await expect(btn2).toHaveCSS('background-color', 'rgb(64, 158, 255)')
    await expect(btn1).toHaveCSS('background-color', 'rgb(144, 147, 153)')

    // 隐藏期间 binds 持续喂数：2# 累计值牌切回后立即有活数据（非 '—' 初值）
    await expect.poll(async () => (await page.locator('#text-vue-hgt2-v-total .break-words').textContent()) ?? '',
      { timeout: 10_000 }).not.toBe('—')

    // 切回 1#：面板回到初始态
    await btn1.click()
    await expect(page.locator('#ah-gas-meter-hgt1')).toBeVisible()
    await expect(page.locator('#ah-gas-meter-hgt2')).toHaveCount(0)
  })

  test('自适应缩放：contain 数学随视口变化（data-fit 属性 = min(w比,h比)）', async ({ page }) => {
    await loginAsAdmin(page)

    // 期望值从真实布局量取（状态栏 32px+1px 边框，硬编码会漂）：
    // data-fit 应恒等于 min(视宽/800, 可视区高/600)
    const expectFit = async (vw: number, _vh: number): Promise<string> => {
      const box = page.locator('.fit-viewport')
      const h = await box.evaluate((el) => el.clientHeight)
      return (Math.min(vw / 800, h / 600)).toFixed(4)
    }

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`/view/${HOME_E_TABS}`)
    const stage = page.locator('.fit-stage')
    await expect(stage).toHaveAttribute('data-fit', await expectFit(1280, 800), { timeout: 10_000 })

    // 缩小（ResizeObserver 实时重算）
    await page.setViewportSize({ width: 640, height: 480 })
    await expect(stage).toHaveAttribute('data-fit', await expectFit(640, 480), { timeout: 10_000 })

    // 放大到 4K：大屏等比放大铺满
    await page.setViewportSize({ width: 3840, height: 2160 })
    await expect(stage).toHaveAttribute('data-fit', await expectFit(3840, 2160), { timeout: 10_000 })
  })
})
