import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, rsiotPutScreen, rsiotGetScreen, rsiotDeleteScreen, rsiotSweepScreens } from './helpers'

// W8 用户反馈轮三段：绑定面板（deviceBind 官方插槽替换 + 直改 store item 驱动保存链——
// 本轮最大技术假设，此处落锤）/ 画面分组（列表分区 + 切换器两层）/ 触发器（结构落库）。
// water-demo-m3 为长期资产：段1 备份→变更→断言→**原样回写**（窗口期外不留痕）。
// 段2/段3 用 w8-* / e2e-w8-* 一次性画面，afterAll 清扫。

const DEMO = 'water-demo-m3'
const LBL = 'text-vue-wdm3a-lbl-up' // 段1 目标：无绑定标签图元

/** 选中文本图元并进入绑定 tab（面板替换生效的共同前置） */
async function openBindPanel(page: Page, pelId: string) {
  await page.locator(`#mtCanvasArea [id="${pelId}"]`).click()
  const aside = page.locator('.mt-edit-aside:has(#mt-right-aside)')
  await aside.locator('.el-tabs__item', { hasText: '绑定' }).click()
  await expect(page.locator('.bind-panel .bp-search input')).toBeVisible({ timeout: 10_000 })
  return aside
}

test.describe('W8 绑定面板与画面分组', () => {
  test('段1 绑定面板：搜索点位树 → 选点+选属性 → 添加绑定 → 保存 → binds 落库', async ({ page }) => {
    const before = await rsiotGetScreen(DEMO) // 长期资产备份（测试尾回写还原）
    await loginAsAdmin(page)
    await page.goto(`/edit/${DEMO}`)
    await expect(page.locator('#mtCanvasArea')).toBeVisible()

    await openBindPanel(page, LBL)

    // 搜索 uptime → 叶子含 devreg 描述文本（面板替换生效 = 搜索框存在）
    await page.locator('.bind-panel .bp-search input').fill('uptime')
    const leaf = page.locator('.bind-panel .bp-node.is-leaf', { hasText: '运行时长秒' })
    await expect(leaf.first()).toBeVisible()
    await leaf.first().click()

    // 选属性（下拉项含属性路径文本）
    await page.locator('.bind-panel .bp-prop').first().click()
    await page.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: 'props.text.val' }).click()

    // 添加绑定 → 列表出现 bind_id → 属性路径
    await page.locator('.bind-panel button', { hasText: '添加绑定' }).click()
    await expect(page.locator('.bind-panel .bp-bind')).toHaveCount(1)
    await expect(page.locator('.bind-panel .bp-bind-main')).toContainText('rsiot.uptime_s')
    await expect(page.locator('.bind-panel .bp-bind-main')).toContainText('props.text.val')

    // 保存 → GET doc 断言 binds[0]（直改 item → maotu 保存链路，落锤）
    const putReq = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes(`/screens/${DEMO}`))
    await page.locator('button .el-icon[title="保存"]').click()
    expect((await putReq).status()).toBe(200)
    const saved = await rsiotGetScreen(DEMO)
    const json = saved.doc.json as { id: string; binds?: { bind_id: string; bind_attr: string; pel_id: string }[] }[]
    const pel = json.find((j) => j.id === LBL)
    expect(pel?.binds).toHaveLength(1)
    expect(pel?.binds?.[0]?.bind_id).toBe('rsiot.uptime_s')
    expect(pel?.binds?.[0]?.bind_attr).toMatch(/^props\.[a-zA-Z]+\.val$/)
    expect(pel?.binds?.[0]?.pel_id).toBe(LBL)

    // 运行页数据驱动：原静态标签被 uptime 数值替换（SSE 直写通道）
    await page.goto(`/view/${DEMO}`)
    const val = page.locator(`[id="${LBL}"] .break-words`)
    await expect(val).not.toHaveText('运行时长(s)', { timeout: 15_000 })
    expect(Number.isFinite(Number(await val.textContent()))).toBe(true)

    await rsiotPutScreen(DEMO, before.doc) // 还原长期资产
  })

  test('段2 画面分组：新建带组画面 → 列表分区 → 切换器 option-group', async ({ page }) => {
    const slug = `w8-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    await loginAsAdmin(page)

    // 列表页新建（分组=测试组）
    await page.goto('/')
    await page.getByRole('button', { name: '新建画面' }).click()
    const dlg = page.locator('.el-dialog')
    await dlg.locator('.el-form-item', { hasText: '画面 ID' }).locator('input').fill(slug)
    await dlg.locator('.el-form-item', { hasText: '名称' }).locator('input').fill('W8 分组验证')
    await dlg.locator('.el-form-item', { hasText: '分组' }).locator('input').fill('测试组')
    await dlg.locator('button', { hasText: '创建' }).click()

    // 列表出现「测试组」区头（组名+数量徽章），卡片在该区内
    const section = page.locator('.group-block', { hasText: '测试组' })
    await expect(section.locator('.group-name')).toHaveText('测试组')
    await expect(section.locator('.group-head .el-tag')).toHaveText('1')
    await expect(section.locator('.card-name', { hasText: 'W8 分组验证' })).toBeVisible()

    // 编辑器切换器含 option-group「测试组」且画面选项在组内
    // （element-plus 结构：li.el-select-group__title 与选项 ul.el-select-group 是
    //   ul.el-select-group__wrap 下的兄弟节点——按 wrap 容器圈组）
    await page.goto(`/edit/${DEMO}`)
    await expect(page.locator('#mtCanvasArea')).toBeVisible()
    await page.locator('.edit-topbar .screen-switcher').click()
    const wrap = page.locator('.el-select-dropdown:visible .el-select-group__wrap', { hasText: '测试组' })
    await expect(wrap.locator('.el-select-group__title')).toHaveText('测试组')
    await expect(wrap.locator('.el-select-dropdown__item', { hasText: 'W8 分组验证' })).toBeVisible()

    await rsiotDeleteScreen(slug) // 清扫
  })

  test('段3 触发器：绑定加触发器（>50 → fill=#ff4d4f）→ 保存 → triggers[0] 结构落库', async ({ page }) => {
    const slug = `e2e-w8-trig-${Date.now().toString(36)}`
    const PEL = 'text-vue-w8trig1'
    // 预置已绑定画面（bind 形状 = fixtures 实证种子；无触发器）
    await rsiotPutScreen(slug, {
      name: 'E2E-W8 触发器', canvasCfg: {
        width: 800, height: 600, scale: 1, color: '#141414', img: '',
        guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
      }, gridCfg: { enabled: true, align: true, size: 10 },
      json: [{
        active: false, hide: false, lock: false, resize: true, rotate: true,
        id: PEL, title: '文字', type: 'vue', tag: 'text-vue',
        binfo: { angle: 0, height: 50, left: 200, top: 150, width: 220 },
        common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
        events: [], ports: [],
        props: { fill: '#FFF700', fontFamily: '黑体', fontSize: 18, text: '触发', vertical: false },
        binds: [{
          id: 'bd-w8trig', pel_id: PEL, bind_id: 'rsiot.uptime_s', bind_name: 'uptime_s',
          bind_attr: 'props.text.val', bind_mapping: [], triggers: [],
        }],
      }],
      eventList: [], eventFlow: [],
    })

    await loginAsAdmin(page)
    await page.goto(`/edit/${slug}`)
    await expect(page.locator('#mtCanvasArea')).toBeVisible()
    await openBindPanel(page, PEL)

    // 展开该绑定的触发器编辑器（默认运算符 >，阈值 50，目标属性切 fill，目标值 #ff4d4f）
    await page.locator('.bind-panel .bp-trig-toggle').click()
    const form = page.locator('.bind-panel .bp-trig-form')
    await expect(form.locator('.bp-op')).toContainText('>') // 默认运算符（选中项文本）
    await form.locator('.bp-th input').fill('50')
    await form.locator('.bp-prop').click()
    await page.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: 'props.fill.val' }).click()
    await form.locator('.bp-tv input').fill('#ff4d4f')
    await form.locator('button', { hasText: '加触发' }).click()

    // 触发器列表出现（面板即时反馈）
    await expect(page.locator('.bind-panel .bp-trig-item')).toHaveCount(1)

    // 保存 → GET doc 断言 triggers[0] 结构（形状 = demo-screen trig() 实证：rule+changeAttr+change_attr）
    const putReq = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes(`/screens/${slug}`))
    await page.locator('button .el-icon[title="保存"]').click()
    expect((await putReq).status()).toBe(200)
    const saved = await rsiotGetScreen(slug)
    const json = saved.doc.json as { id: string; binds?: { triggers?: {
      id: string; rule: { operator?: string; value?: unknown }; action: string; custom_code: string
      change_attr: { target_id: string; target_attr?: string; target_value: unknown }[]
    }[] }[] }[]
    const trig = json.find((j) => j.id === PEL)?.binds?.[0]?.triggers?.[0]
    expect(trig?.rule).toEqual({ operator: '>', value: 50 })
    expect(trig?.action).toBe('changeAttr')
    expect(trig?.change_attr).toHaveLength(1)
    expect(trig?.change_attr?.[0]).toMatchObject({ target_id: PEL, target_attr: 'props.fill.val', target_value: '#ff4d4f' })
    expect(trig?.custom_code).toBe('')

    await rsiotDeleteScreen(slug)
  })

  test.afterAll(async () => {
    // 段2 slug 前缀 w8-<rand>、段3 前缀 e2e-w8-——失败残留两种都要扫
    await rsiotSweepScreens(/^e2e-w8-|^w8-[a-z0-9]/)
  })
})
