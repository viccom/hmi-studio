import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, rsiotPutScreen, rsiotGetScreen, rsiotDeleteScreen, rsiotSweepScreens } from './helpers'
import { buildDemoScreen } from '../src/screen-assets/demo-screen'

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
    const before = await rsiotGetScreen(DEMO) // 长期资产备份（finally 回写还原——中途断言失败也不残留）
    await loginAsAdmin(page)
    try {
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
    } finally {
      await rsiotPutScreen(DEMO, before.doc) // 还原长期资产（审查 P2-4：原不在 finally，失败即残留）
    }
  })

  test('段2 画面分组：新建带组画面 → 列表分区 → 切换器 option-group', async ({ page }) => {
    const slug = `w8-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    await loginAsAdmin(page)

    try {
    // 列表页新建（分组=测试组，el-select allow-create：点击下拉选项创建）
    await page.goto('/')
    // 精确定位 header 的「新建画面」按钮（.new-btn）——分组卡片里的同名按钮
    // （.new-card，每组一个）会让 getByRole 命中多个 → strict mode violation
    await page.locator('header .new-btn').click()
    const dlg = page.locator('.el-dialog')
    await dlg.locator('.el-form-item', { hasText: '画面 ID' }).locator('input').fill(slug)
    await dlg.locator('.el-form-item', { hasText: '名称' }).locator('input').fill('W8 分组验证')
    const groupInput = dlg.locator('.el-form-item', { hasText: '分组' }).locator('input')
    await groupInput.fill('测试组')
    // 选中分组：**点击下拉里的选项**而非 press('Enter')——
    // Enter 依赖 element-plus 的键盘创建时序，全量并发下偶发不生效（分组静默落空 →
    //   画面建成「未分组」→ 列表无「测试组」区块 → 断言失败）。点击不依赖键盘时序。
    await page.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: '测试组' })
      .first().click()
    await dlg.locator('button', { hasText: '创建' }).click()

    // 列表出现「测试组」区头（组名+数量徽章），卡片在该区内
    // 超时放宽到 15s：全量并行（多 worker × 真浏览器 × maotu 编辑器）下渲染延迟可超
    // expect 默认 5s——本用例单跑必过，属并发负载型 flaky，非断言语义问题。
    const section = page.locator('.group-block', { hasText: '测试组' })
    await expect(section.locator('.group-name')).toHaveText('测试组', { timeout: 15_000 })
    await expect(section.locator('.group-head .el-tag')).toHaveText('1', { timeout: 15_000 })
    await expect(section.locator('.card-name', { hasText: 'W8 分组验证' })).toBeVisible({ timeout: 15_000 })

    // 编辑器切换器含 option-group「测试组」且画面选项在组内
    // （element-plus 结构：li.el-select-group__title 与选项 ul.el-select-group 是
    //   ul.el-select-group__wrap 下的兄弟节点——按 wrap 容器圈组）
    await page.goto(`/edit/${DEMO}`)
    await expect(page.locator('#mtCanvasArea')).toBeVisible()
    await page.locator('.edit-topbar .screen-switcher').click()
    const wrap = page.locator('.el-select-dropdown:visible .el-select-group__wrap', { hasText: '测试组' })
    await expect(wrap.locator('.el-select-group__title')).toHaveText('测试组')
    await expect(wrap.locator('.el-select-dropdown__item', { hasText: 'W8 分组验证' })).toBeVisible()

    } finally {
      await rsiotDeleteScreen(slug) // 清扫（失败也清——残留画面会污染「未分组」区块）
    }
  })

  test('段5 组管理：编辑信息改组 → 组重命名（批量改写）→ 解散（画面归未分组）', async ({ page }) => {
    const base = `w8gm-${Date.now().toString(36)}`
    const idA = `${base}-a`, idB = `${base}-b`
    const blank = {
      canvasCfg: {
        width: 800, height: 600, scale: 1, color: '#141414', img: '',
        guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
      },
      gridCfg: { enabled: true, align: true, size: 10 },
      json: [], eventList: [], eventFlow: [],
    }
    await rsiotPutScreen(idA, { ...blank, name: '组管理甲', group: 'W8管理组' })
    await rsiotPutScreen(idB, { ...blank, name: '组管理乙', group: 'W8管理组' })
    try {
      await loginAsAdmin(page)
      await page.goto('/')
      const section = page.locator('.group-block', { hasText: 'W8管理组' })
      await expect(section.locator('.group-head .el-tag')).toHaveText('2')

      // ① 卡片「编辑信息」：乙 改归已有组「家庭三表演示」→ 卡片跨区迁移
      const cardB = section.locator('.screen-card', { hasText: '组管理乙' })
      await cardB.locator('button[title^="编辑信息"]').click()
      const dlg = page.locator('.el-dialog')
      await expect(dlg).toContainText(idB) // 标题带画面 id；slug 只读
      await expect(dlg.locator('.el-form-item', { hasText: '画面 ID' }).locator('input')).toBeDisabled()
      const groupInput = dlg.locator('.el-form-item', { hasText: '分组' }).locator('input')
      await groupInput.fill('家庭三表演示') // 下拉已有组（filterable）
      await groupInput.press('Enter')
      await dlg.locator('button', { hasText: '保存' }).click()
      const famSection = page.locator('.group-block', { hasText: '家庭三表演示' })
      await expect(famSection.locator('.card-name', { hasText: '组管理乙' })).toBeVisible()
      await expect(section.locator('.group-head .el-tag')).toHaveText('1')

      // ② 组头「重命名」：W8管理组 → W8改名组（甲 随组迁移）
      await section.hover()
      await section.locator('button[title="重命名分组"]').click()
      const box = page.locator('.el-message-box')
      await box.locator('input').fill('W8改名组')
      await box.locator('button', { hasText: '重命名' }).click()
      const renamed = page.locator('.group-block', { hasText: 'W8改名组' })
      await expect(renamed.locator('.group-name')).toHaveText('W8改名组')
      await expect(renamed.locator('.card-name', { hasText: '组管理甲' })).toBeVisible()

      // ③ 组头「解散」：确认后画面归未分组（画面本身保留）
      await renamed.hover()
      await renamed.locator('button[title^="解散分组"]').click()
      await page.locator('.el-message-box').locator('button', { hasText: '解散' }).click()
      const ungrouped = page.locator('.group-block', { hasText: '未分组' })
      await expect(ungrouped.locator('.card-name', { hasText: '组管理甲' })).toBeVisible()
    } finally {
      await rsiotDeleteScreen(idA)
      await rsiotDeleteScreen(idB)
    }
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


  test('段4 跳转按钮目标画面下拉：select 面板化 → 下拉选画面 → 保存落库（W9 反馈）', async ({ page }) => {
    await loginAsAdmin(page)
    const slugB = 'water-demo-m3-b'
    // 长期资产纪律：基线 = buildDemoScreen().b 纯函数产物（固定基线，失败残留不跨轮累积——
    // 与 w9-insecure 同款；原"快照当前态"备份会把并行轮次的中间态固化回写，P2 竞态）。
    // 寻址经 helpers（RSIOT_BASE 可覆盖——原 7 处硬编码 127.0.0.1:8790 绕过了环境约定）。
    const baseline = buildDemoScreen().b
    const restore = () => rsiotPutScreen(slugB, baseline)
    await restore()
    try {
      await page.goto(`/edit/${slugB}`)
      await page.locator('#mtCanvasArea [id^="ah-nav-button-"]').click()
      // 属性面板：目标画面 = select 型（旧实例经 upgradeNavTargets 就地升级）
      const panel = page.locator('.mt-edit-aside:has(#mt-right-aside)')
      const targetRow = panel.locator('.el-form-item', { hasText: '目标画面' })
      await expect(targetRow.locator('.el-select')).toBeVisible()
      // 下拉 = 树形视觉：组头（▼ 组名，哨兵值）+ 缩进子项（W9b）——选「取水泵房」
      await targetRow.locator('.el-select').click()
      await expect(page.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: '▼ 水处理演示' })).toBeVisible()
      // W11 起 legacy 未分组画面（booster-pump-1 等 agent-hmi 旧格式）已不在库——组头断言改现存组
      await expect(page.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: '▼ 家庭三表演示' })).toBeVisible()
      await page.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: '　　取水泵房' }).click()
      // 保存 → doc 落库断言 target 变更
      const putReq = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes(`/screens/${slugB}`))
      await page.locator('button .el-icon[title="保存"]').click()
      await putReq
      const saved = await rsiotGetScreen(slugB)
      const nav = (saved.doc.json as Array<{ id?: string; props?: { target?: string } }>)
        .find((n) => String(n.id).startsWith('ah-nav-button-'))
      // maotu 保存态 props 为平面值（F12：保存扁平、导入 Jr 归一化回描述符）——select 落库即字符串
      expect(nav?.props?.target).toBe('water-demo-m3')
    } finally {
      await restore()
    }
  })

  test.afterAll(async () => {
    // 段2 slug 前缀 w8-<rand>、段3 前缀 e2e-w8-——失败残留两种都要扫
    await rsiotSweepScreens(/^e2e-w8-|^w8-[a-z0-9]/)
  })
})
