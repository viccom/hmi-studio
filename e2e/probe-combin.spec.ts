// P3a reg-combin 探针 e2e（设计 §6.1 三问自动化取证；结论与驱动备忘见
// docs/plans/2026-10-31-reg-combin-probe.md）：
//  (a) 左面板注册 + 拖入画布：子树渲染、**模板展开语义**（顶层独立图元）、binds 保留
//  (b) maotu 自带组合：框选 + 工具栏「组合」→ 顶层收敛单个 type:'group' 项
//  (c) #deviceBind 槽位 = store 响应式选中项（存为符号的宿主读取面）
import { expect, test } from '@playwright/test'

type Probe = {
  leftAsideStore: { config: Map<string, Array<Record<string, unknown>>> }
  lastSave: { json: Array<Record<string, any>> } | null
}

const probeOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __probeCombin: Probe }).__probeCombin)

async function expandGroup(page: import('@playwright/test').Page, title: string) {
  await page.locator('.el-collapse-item__header', { hasText: title }).first().click()
  await page.waitForTimeout(300)
}

/** 左面板组内第 n 个可拖项 → HTML5 dragTo 画布（onDragstart 语义，见探针报告 §4）。 */
async function dragNth(
  page: import('@playwright/test').Page, group: string, n: number, x: number, y: number,
) {
  await page.locator('.el-collapse-item__header', { hasText: group })
    .locator('~ .el-collapse-item__wrap [draggable=true]').nth(n)
    .dragTo(page.locator('#mtCanvasArea'), { targetPosition: { x, y } })
  await page.waitForTimeout(400)
}

async function clickTool(page: import('@playwright/test').Page, title: string) {
  await page.locator('.el-header button', { has: page.locator(`i[title="${title}"]`) }).click()
  await page.waitForTimeout(400)
}

test.describe('reg-combin 探针', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/probe-combin')
    await page.waitForFunction(() => (window as { __probeCombin?: unknown }).__probeCombin !== undefined)
  })

  test('(a) 左面板出现「探针组合」组的 reg-combin 注册项', async ({ page }) => {
    const reg = await page.evaluate(() => {
      const p = (window as unknown as { __probeCombin: Probe }).__probeCombin
      return (p.leftAsideStore.config.get('探针组合') ?? []).map((i) => i.type)
    })
    expect(reg).toEqual(['reg-combin'])
    // 组头存在于左面板（展开后可见；懒渲染见探针报告 §4）
    await expandGroup(page, '探针组合')
    await expect(page.locator('.el-collapse-item__header', { hasText: '探针组合' })).toBeVisible()
  })

  test('(a) 拖入 = 模板展开：子树渲染、顶层独立图元、binds 保留', async ({ page }) => {
    await expandGroup(page, '探针组合')
    await dragNth(page, '探针组合', 0, 320, 200)
    // 子树渲染：泵+罐两个 dataURI img（types.ts ①）——poll：全量套件下 drop→渲染有延迟
    await expect
      .poll(async () => page.evaluate(() =>
        [...document.querySelectorAll<HTMLImageElement>('#mtCanvasArea img')]
          .filter(i => decodeURIComponent(i.src).match(/ah-(pump|tank)/)).length), { timeout: 8000 })
      .toBe(2)
    await clickTool(page, '保存')
    const p = await probeOf(page)
    expect(p.lastSave, '保存载荷到达').toBeTruthy()
    const top = p.lastSave!.json
    // 展开语义：顶层是两个独立 svg 项（非 group）
    expect(top.length).toBe(2)
    expect(top.every(i => i.type === 'svg')).toBe(true)
    const pump = top.find(i => String(i.id).startsWith('pc-pump'))
    expect(pump, '子项 id = 原 id + Ks 后缀').toBeTruthy()
    // binds 原样保留（探针报告 §2）
    expect(JSON.stringify(pump!.binds)).toContain('home-meter-e1.power')
    // 保存形态契约：props 拍平、symbol 私有部分剥离（types.ts ⑤）
    expect(pump!.props.fill).toBe('#52c41a')
    expect(pump!.symbol).toBeUndefined()
    await page.screenshot({ path: 'test-results/probe-combin-drag.png' })
  })

  test('(b) 框选 + 「组合」：顶层收敛单个 group 项（children 带私有 symbol 部分）', async ({ page }) => {
    await expandGroup(page, '过程设备')
    await dragNth(page, '过程设备', 0, 300, 180)
    await dragNth(page, '过程设备', 4, 520, 280)
    expect(await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('#mtCanvasArea img')].filter(i => decodeURIComponent(i.src).includes('ah-')).length)).toBe(2)
    // 框选两图元（canvas 屏幕坐标）
    const cbox = await page.locator('#mtCanvasArea').boundingBox()
    await page.mouse.move(cbox!.x + 200, cbox!.y + 100)
    await page.mouse.down()
    await page.mouse.move(cbox!.x + 620, cbox!.y + 380, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(250)
    await clickTool(page, '组合')
    await clickTool(page, '保存')
    const p = await probeOf(page)
    const top = p.lastSave!.json
    expect(top.length, '组合后顶层收敛').toBe(1)
    expect(top[0].type).toBe('group')
    expect(top[0].title).toBe('组合')
    expect(((top[0].children ?? []) as unknown[]).length).toBeGreaterThanOrEqual(2)
    // group children 在保存载荷保留：symbol 私有部分（渲染必读）+ 描述符 props + 百分比 binfo
    //（实测拍平只作用于顶层项——group 子树即「模板」原样入库，恰是 combin_json 的合法形状）
    const child = (top[0].children as Array<Record<string, any>>)[0]
    expect(child.binfo.width).toBeLessThanOrEqual(100)
    expect(child.symbol?.symbol_id).toMatch(/^ah-/)
    expect(child.props?.fill?.val ?? child.props?.fill).toBeTruthy()
    await page.screenshot({ path: 'test-results/probe-combin-group.png' })
  })

  test('(c) 选中项经 #deviceBind 槽位可读（store 响应式直达）', async ({ page }) => {
    await expandGroup(page, '探针组合')
    await dragNth(page, '探针组合', 0, 340, 220)
    // 展开后为多选态（批量设置面板）。清选（点画布左上空白）→ 点图元成单选，
    // 右面板出属性 tab 组（属性设置/样式/事件/绑定/触发器）→「绑定」tab 渲染槽位。
    // 单选是异步 UI 状态：轮询重试（点空 → 点图元），最多 3 轮。
    const cbox = await page.locator('#mtCanvasArea').boundingBox()
    let selected = false
    for (let i = 0; i < 3 && !selected; i++) {
      await page.mouse.click(cbox!.x + 40, cbox!.y + 40)
      await page.waitForTimeout(250)
      const imgPos = await page.evaluate(() => {
        const el = [...document.querySelectorAll<HTMLImageElement>('#mtCanvasArea img')][0]
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      })
      expect(imgPos, '画布上有图元').toBeTruthy()
      await page.mouse.click(imgPos!.x, imgPos!.y)
      await page.waitForTimeout(400)
      selected = await page.locator('.el-tabs__item', { hasText: '绑定' }).isVisible()
    }
    expect(selected, '单选后右面板出现属性 tab 组').toBe(true)
    await page.locator('.el-tabs__item', { hasText: '绑定' }).click()
    const slot = page.locator('[data-probe-slot]')
    await expect(slot).toBeVisible({ timeout: 5000 })
    await expect(slot).toContainText(/type=(svg|group)/)
  })
})
