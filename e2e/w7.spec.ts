import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

// W7 用户反馈轮（编辑器可用性三项）：顶部条画面切换器 / 预览新窗 / 登出 +
// 右面板 tab 头常驻（sticky）。预置画面 water-demo-m3 / water-demo-m3-b 为 M3
// 交付物常驻 rs-iot（lan.spec 同款前提），不播种不清扫。
// 右面板根因备忘：maotu 内置 element-plus 把 el-tabs 渲染成 [content, header]
// （tab 头在 DOM 底部），修复=flex+order:-1 重排到顶 + sticky top——本 spec
// 同时断言 computed sticky 与「滚到底仍钉在面板顶」的意图判据。
test.describe('W7 编辑器可用性', () => {
  test('画面切换器：/edit/water-demo-m3 → 选 B → URL 变且画布重载', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/edit/water-demo-m3')
    await expect(page.locator('#mtCanvasArea')).toBeVisible()

    const switcher = page.locator('.edit-topbar .screen-switcher')
    await expect(switcher).toBeVisible()
    await switcher.click()
    await page.locator('.el-select-dropdown__item', { hasText: '清水池 B（M3 互跳）' }).click()

    await expect(page).toHaveURL(/\/edit\/water-demo-m3-b$/)
    // 画布重载判据：B 画面标题图元节点出现（文本图元 DOM 断言法见 m2 段1）+ 顶栏 meta 跟随
    await expect(page.locator('#mtCanvasArea [id="text-vue-wdm3b-title"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.edit-topbar')).toContainText('清水池 B（M3 互跳）')
  })

  test('预览：maotu 工具栏预览按钮 → 新窗 /view/water-demo-m3', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/edit/water-demo-m3')
    await expect(page.locator('#mtCanvasArea')).toBeVisible()

    const popupPromise = page.context().waitForEvent('page')
    await page.locator('button .el-icon[title="预览"]').click()
    const popup = await popupPromise
    await expect(popup).toHaveURL(/\/view\/water-demo-m3$/)
    await popup.close()
  })

  test('登出：退出按钮 → /login', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/edit/water-demo-m3')
    await expect(page.locator('#mtCanvasArea')).toBeVisible()

    await page.getByRole('button', { name: '退出' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('右面板 tab 头 sticky：position=sticky 且长表单滚动时钉在面板顶', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/edit/water-demo-m3')
    await expect(page.locator('#mtCanvasArea')).toBeVisible()

    // 选中图元 → 配置 tab 长表单（「边界和属性」accordion 默认展开，bundle 实证 S(["1"])）
    const node = page.locator('#mtCanvasArea [id^="ah-"], #mtCanvasArea [id^="text-"]').first()
    await node.click()
    const aside = page.locator('.mt-edit-aside:has(#mt-right-aside)')
    const header = aside.locator('.el-tabs__header')

    // 任务判据：computed style position === 'sticky'
    expect(await header.evaluate((el) => getComputedStyle(el).position)).toBe('sticky')

    // 意图判据：aside 滚到底，header 仍钉在 aside 顶（偏移 <2px）——
    // 这正是用户痛点（长表单滚走 tab 头）的反例场景
    await page.evaluate(() => {
      const right = [...document.querySelectorAll('.mt-edit-aside')].find((a) => a.querySelector('#mt-right-aside'))
      right.scrollTop = right.scrollHeight
    })
    const pinnedOffset = await header.evaluate((el) => {
      const asideBox = (el.closest('.mt-edit-aside') as HTMLElement).getBoundingClientRect()
      return el.getBoundingClientRect().top - asideBox.top
    })
    expect(pinnedOffset).toBeLessThan(2)

    // 反馈原文场景：不滚回顶部，直接切「绑定」可达
    await aside.locator('.el-tabs__item', { hasText: '绑定' }).click()
    await expect(aside.locator('.el-tabs__item.is-active')).toHaveText('绑定')
  })

  test('版本横幅：footer 行整行移除——display:none 且零高（画布区 reclaim）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/edit/water-demo-m3')
    await expect(page.locator('#mtCanvasArea')).toBeVisible()

    const footer = page.locator('.edit-body footer.el-footer:has(> div > a[href*="npmjs.com/package/maotu"])')
    await expect(footer).toHaveCount(1) // DOM 仍在（maotu 渲染），仅视觉移除
    expect(await footer.evaluate((el) => getComputedStyle(el).display)).toBe('none')
    // 意图判据：行高归零——上次只藏内容层时 footer 仍占 40px（用户复测打回的正是这个）
    expect(await footer.evaluate((el) => el.getBoundingClientRect().height)).toBe(0)
  })
})
