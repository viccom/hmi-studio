// P3a「我的符号」e2e（T9）：符号模板存储 → 启动注册 → 拖入展开；「存为符号」全流程。
// 驱动手法沿用探针报告 §4（HTML5 dragTo / 工具栏 i[title] / 保存按钮 payload）。
// 前置：dev rs-iot 已带 /api/v1/symbols 四端点（MetaKind symbol，2026-10-31 起）。
import { expect, test } from '@playwright/test'
import { loginAsAdmin, rsiotDeleteScreen, rsiotPutScreen } from './helpers'

const SLUG = 'e2e-mysym-canvas'
const SYM_ID = 'e2e-mysym-pump-tank'

function blankScreen(): Record<string, unknown> {
  return {
    name: SLUG, canvasCfg: {
      width: 800, height: 600, scale: 1, color: '#141414', img: '',
      guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
    }, gridCfg: { enabled: true, align: true, size: 10 }, json: [], eventList: [], eventFlow: [],
  }
}

/** 探针报告 §1 的 group 项（children 内存形态：symbol 私有部分 + 描述符 props + 百分比 binfo） */
function groupTemplate(): Record<string, unknown> {
  return {
    id: 'e2e-mysym-tpl', title: '组合', type: 'group', tag: 'group',
    binfo: { left: 0, top: 0, width: 220, height: 140, angle: 0 },
    resize: true, rotate: true, lock: false, active: true, hide: false,
    use_proportional_scaling: true, props: {},
    common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
    children: [
      { id: 'ms-pump', title: '泵', type: 'svg', tag: 'ah-pump', binfo: { left: 0, top: 0, width: 60, height: 60, angle: 0 }, props: { fill: { title: '主体色', type: 'color', val: '#52c41a' } }, symbol: { symbol_id: 'ah-pump', symbol_str: symbolStr('ah-pump'), width: 64, height: 64 }, binds: [], events: [], ports: [] },
      { id: 'ms-tank', title: '罐', type: 'svg', tag: 'ah-tank', binfo: { left: 70, top: 55, width: 30, height: 45, angle: 0 }, props: {}, symbol: { symbol_id: 'ah-tank', symbol_str: symbolStr('ah-tank'), width: 48, height: 64 }, binds: [], events: [], ports: [] },
    ],
    events: [], ports: [],
  }
}

/** symbol_str 与 registerConfig 归一化（kf）产物同构——直接喂注册表 svg 生成 <symbol> 包裹 */
function symbolStr(id: string): string {
  // 探针实证：拖入后渲染只读 symbol_id 定位 <use>；symbol_str 需为合法 <symbol> 标记。
  // 取注册表 svg 源并包 <symbol viewBox>（与 kf 输出形状一致；id/viewBox 与源 svg 同步）。
  const w = id === 'ah-pump' ? 64 : 48
  const h = 64
  return `<symbol viewBox="0 0 ${w} ${h}" id="${id}"></symbol>`
}

async function putSymbol(id: string, name: string): Promise<void> {
  const doc = { name, combin_json: groupTemplate(), width: 220, height: 140 }
  const login = await fetch('http://127.0.0.1:8790/api/v1/user/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: 'admin', pass: 'admin' }),
  })
  const { token } = await login.json() as { token: string }
  const res = await fetch(`http://127.0.0.1:8790/api/v1/symbols/${id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(doc),
  })
  if (!res.ok) throw new Error(`putSymbol: rs-iot ${res.status}`)
}

async function deleteSymbol(id: string): Promise<void> {
  const login = await fetch('http://127.0.0.1:8790/api/v1/user/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: 'admin', pass: 'admin' }),
  })
  const { token } = await login.json() as { token: string }
  await fetch(`http://127.0.0.1:8790/api/v1/symbols/${id}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${token}` },
  })
}

async function expandGroup(page: import('@playwright/test').Page, title: string) {
  await page.locator('.el-collapse-item__header', { hasText: title }).first().click()
  await page.waitForTimeout(300)
}

test.describe('我的符号（P3a）', () => {
  test.beforeEach(async ({ page }) => {
    await putSymbol(SYM_ID, '泵罐组合')
    await rsiotPutScreen(SLUG, blankScreen())
    await loginAsAdmin(page)
    await page.goto(`/edit/${SLUG}`)
    await page.waitForTimeout(1200)
  })

  test.afterEach(async () => {
    await deleteSymbol(SYM_ID)
    await rsiotDeleteScreen(SLUG)
  })

  test('已存符号注册进「我的符号」组，拖入画布展开渲染', async ({ page }) => {
    await expandGroup(page, '我的符号')
    // 注册项存在（reg-combin 拖把手）
    const handle = page.locator('.el-collapse-item__header', { hasText: '我的符号' })
      .locator('~ .el-collapse-item__wrap [draggable=true]')
    await expect(handle.first()).toBeVisible()
    // 拖入画布 → 模板展开：泵+罐两个 dataURI img
    await handle.first().dragTo(page.locator('#mtCanvasArea'), { targetPosition: { x: 300, y: 200 } })
    await page.waitForTimeout(600)
    const n = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('#mtCanvasArea img')]
        .filter(i => decodeURIComponent(i.src).match(/ah-(pump|tank)/)).length)
    expect(n).toBe(2)
  })

  test('「存为符号」全流程：组合 → 存 → API 落库 → 左面板即时出现', async ({ page }) => {
    // 画布上放两件普通图元（过程设备组）
    await expandGroup(page, '过程设备')
    const src = page.locator('.el-collapse-item__header', { hasText: '过程设备' })
      .locator('~ .el-collapse-item__wrap [draggable=true]')
    await src.first().dragTo(page.locator('#mtCanvasArea'), { targetPosition: { x: 300, y: 180 } })
    await page.waitForTimeout(300)
    await src.nth(4).dragTo(page.locator('#mtCanvasArea'), { targetPosition: { x: 520, y: 280 } })
    await page.waitForTimeout(400)
    // 框选 + 组合（全量套件下布局偏移会使坐标误触工具栏「返回」→ 路由跳走：
    // 起落点离顶部留裕量 + URL 守卫 + 整段重试一次）
    const cbox = await page.locator('#mtCanvasArea').boundingBox()
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.mouse.move(cbox!.x + 200, cbox!.y + 160)
      await page.mouse.down()
      await page.mouse.move(cbox!.x + 620, cbox!.y + 380, { steps: 8 })
      await page.mouse.up()
      await page.waitForTimeout(250)
      if (page.url().includes('/edit/')) break
      await page.goto(`/edit/${SLUG}`)
      await page.waitForTimeout(1200)
    }
    expect(page.url(), '框选不得触发工具栏导航').toContain('/edit/')
    await page.locator('.el-header button', { has: page.locator('i[title="组合"]') }).click()
    await page.waitForTimeout(400)
    // 选中组合 → 绑定 tab → 存为符号
    const imgPos = await page.evaluate(() => {
      const els = [...document.querySelectorAll<HTMLImageElement>('#mtCanvasArea img')]
      const r = els[0].getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    await page.mouse.click(imgPos.x, imgPos.y)
    await expect(page.locator('.el-tabs__item', { hasText: '绑定' })).toBeVisible({ timeout: 5000 })
    await page.locator('.el-tabs__item', { hasText: '绑定' }).click()
    const btn = page.locator('[data-testid="save-symbol-btn"]')
    await expect(btn).toBeVisible()
    await btn.click()
    await page.locator('.el-message-box__input input').fill('E2E 组合符号')
    await page.locator('.el-message-box__btns .el-button--primary').click()
    await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 5000 })
    // 左面板即时出现（同名刷新注册）
    await expandGroup(page, '我的符号')
    await expect(
      page.locator('.el-collapse-item__header', { hasText: '我的符号' })
        .locator('~ .el-collapse-item__wrap [draggable=true]'),
    ).toHaveCount(2, { timeout: 5000 })
    // 清理：删除 E2E 存的符号（名匹配那条）
    const login = await fetch('http://127.0.0.1:8790/api/v1/user/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: 'admin', pass: 'admin' }),
    })
    const { token } = await login.json() as { token: string }
    const list = await (await fetch('http://127.0.0.1:8790/api/v1/symbols', {
      headers: { authorization: `Bearer ${token}` },
    })).json() as { symbols: string[] }
    for (const id of list.symbols) {
      const g = await (await fetch(`http://127.0.0.1:8790/api/v1/symbols/${id}`, {
        headers: { authorization: `Bearer ${token}` },
      })).json() as { doc: { name: string } }
      if (g.doc.name === 'E2E 组合符号') await deleteSymbol(id)
    }
  })
})
