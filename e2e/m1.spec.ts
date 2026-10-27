import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, rsiotSweepScreens, rsiotPutScreen, rsiotGetScreen } from './helpers'
import { allSymbols } from '../src/symbols/registry'

// G-M1 段1：登录与守卫（列表页本体 T3 落地，此段只断言登录/跳转契约）
test.describe('M1 登录', () => {
  test('错误密码：el-alert 透传 401 文案，停留 /login', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('用户名').fill('admin')
    await page.getByPlaceholder('密码').fill('wrong-pass')
    await page.getByRole('button', { name: '登录' }).click()
    await expect(page.locator('.el-alert')).toBeVisible()
    await expect(page.locator('.el-alert')).toContainText(/invalid/i)
    await expect(page).toHaveURL(/\/login$/)
  })

  test('admin/admin：登录成功跳转 /（列表页 TBD 壳也接受，断言 URL）', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('用户名').fill('admin')
    await page.getByPlaceholder('密码').fill('admin')
    await page.getByRole('button', { name: '登录' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('已登录访问 /login 被守卫弹回 /', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/login')
    await expect(page).toHaveURL(/\/$/)
  })

  test('loginAsAdmin 注入 token 可直达业务页（供后续段复用）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    expect(await page.evaluate(() => localStorage.getItem('webhmi_token'))).toBeTruthy()
  })
})

// G-M1 段2（T3）：画面列表——新建 → 卡片出现（名称可见）→ 删除 → 卡片消失
test.describe('M1 画面列表', () => {
  const slug = `e2e-t3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  test.afterAll(async () => {
    // 测试自洁：清扫本次及历史失败运行遗留的 e2e-t3-* 画面
    await rsiotSweepScreens(/^e2e-t3-/)
  })

  test('新建画面 → 卡片出现 → 删除 → 卡片消失', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/')
    await page.getByRole('button', { name: '新建画面' }).click()
    await page.getByPlaceholder('screen-id').fill(slug)
    await page.getByPlaceholder('画面名称').fill('E2E-T3 验证画面')
    await page.getByRole('button', { name: '创建', exact: true }).click()

    const card = page.locator('.el-card', { hasText: slug })
    await expect(card).toBeVisible()
    await expect(card).toContainText('E2E-T3 验证画面')

    await card.getByTitle('删除画面').click()
    await page.getByRole('button', { name: '删除', exact: true }).click()
    await expect(page.locator('.el-card', { hasText: slug })).toHaveCount(0)
  })

  test('slug 非法输入被表单校验拦截（不弹错误、不发 PUT）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/')
    await page.getByRole('button', { name: '新建画面' }).click()
    await page.getByPlaceholder('screen-id').fill('Bad_Slug!')
    await page.getByPlaceholder('画面名称').fill('x')
    await page.getByRole('button', { name: '创建', exact: true }).click()
    await expect(page.locator('.el-form-item__error').first()).toBeVisible()
    // 对话框仍开着（未提交）
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
})

// G-M1 段3（T4）：编辑器——拖入图元 → 保存 → 刷新保真（G-M1 核心判据）
//
// 拖拽自动化路径（探明于 T4，T12 起改按图元 id 锚定——注册顺序/数量变化不再移位）：
// - maotu 左面板图元 = el-collapse-item 组内 div[draggable=true]，HTML5 dragstart 设内部 intention
// - 画布 = #mtCanvasArea，监听 dragover(preventDefault)/drop 创建图元（无需 dataTransfer 数据）
// - Playwright locator.dragTo() 走浏览器拖拽拦截协议，原生触发 dragstart/drop —— 实测一次成功
// - 组内图元无 DOM id、title 只在 hover 弹层——kit.ts svgThumbnail 把 data-ah-id 注入缩略图 dataURI，
//   div[draggable]:has(img[src*="ah-xxx"]) 按图元 id 唯一定位；组内项数 = allSymbols() 事实源
// - 保存按钮 = button .el-icon[title="保存"]（maotu 工具栏 tooltip title）
test.describe('M1 编辑器', () => {
  const slug = `e2e-t4-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

  test.afterAll(async () => {
    await rsiotSweepScreens(/^e2e-t4-/)
  })

  async function openEditor(page: Page) {
    await page.goto(`/edit/${slug}`)
    await expect(page.locator('#mtCanvasArea')).toBeVisible()
  }

  async function expandHmiGroup(page: Page) {
    const group = page.locator('.el-collapse-item', { hasText: 'HMI 图元' }).first()
    await group.locator('.el-collapse-item__header').click()
    await expect(group.locator('div[draggable="true"]')).toHaveCount(allSymbols().length)
    return group
  }

  test('拖入离心泵 → 保存 → 刷新后图元仍在（doc 保真）', async ({ page }) => {
    // 预置空白画面（helper 直连 rs-iot，blankScreen 同形）
    await rsiotPutScreen(slug, {
      name: 'E2E-T4 编辑器验证', canvasCfg: {
        width: 800, height: 600, scale: 1, color: '#141414', img: '',
        guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
      }, gridCfg: { enabled: true, align: true, size: 10 }, json: [], eventList: [], eventFlow: [],
    })

    await loginAsAdmin(page)
    // 在线设备树接线：mount 即拉 /api/v1/devices（F5 在线原则）
    const devicesReq = page.waitForResponse((r) => r.url().includes('/api/v1/devices'))
    await openEditor(page)
    expect((await devicesReq).status()).toBe(200)

    // 顶部信息条：name + slug 只读展示
    await expect(page.locator('.edit-topbar')).toContainText('E2E-T4 编辑器验证')
    await expect(page.locator('.edit-topbar')).toContainText(slug)

    const canvas = page.locator('#mtCanvasArea')
    const group = await expandHmiGroup(page)
    // 拖入判据：画布出现 id 以 ah-pump- 开头的图元节点（拖入时内联 svg 渲染，重载后 img 渲染——以节点 id 为准）
    const pumpNode = canvas.locator('[id^="ah-pump-"]')

    // 拖入离心泵（按缩略图 data-ah-id 锚定，不随注册顺序漂移）到画布 (200,150)
    await group.locator('div[draggable="true"]:has(img[src*="ah-pump"])')
      .dragTo(canvas, { targetPosition: { x: 200, y: 150 } })
    await expect(pumpNode).toHaveCount(1)

    // 保存 → PUT /screens/:id
    const putReq = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes(`/screens/${slug}`))
    await page.locator('button .el-icon[title="保存"]').click()
    expect((await putReq).status()).toBe(200)
    await expect(page.locator('.el-message--success')).toBeVisible()

    // rs-iot 真相断言：doc.json 含拖入的泵（id 与画布节点一致），name 保留
    const saved = await rsiotGetScreen(slug)
    const json = saved.doc.json as { id: string }[]
    expect(json.length).toBe(1)
    expect(json[0].id.startsWith('ah-pump-')).toBe(true)
    const pumpId = await pumpNode.getAttribute('id')
    expect(json[0].id).toBe(pumpId)
    expect(saved.doc.name).toBe('E2E-T4 编辑器验证')

    // 刷新重进 → 图元仍在（同 id 节点 + doc 深等未失真）
    await openEditor(page)
    await expect(canvas.locator(`[id="${pumpId}"]`)).toHaveCount(1)
    const reloaded = await rsiotGetScreen(slug)
    expect(reloaded.doc).toEqual(saved.doc)
  })

  test('返回按钮 → 回列表页（on-return-click 路由契约）', async ({ page }) => {
    // 上一 test 已保存画面；此处验证编辑器导航契约（on-return-click → /）
    await loginAsAdmin(page)
    await openEditor(page)
    await page.locator('button .el-icon[title="返回"]').click()
    await expect(page).toHaveURL(/\/$/)
  })
})
