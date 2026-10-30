import { test, expect } from '@playwright/test'
import { loginAsAdmin, rsiotGetScreen, rsiotPutScreen, rsiotSweepScreens } from './helpers'
import { seedScreen } from './fixtures'

/**
 * P0 画面版本管理消费侧 e2e（走真实 rs-iot :8790）：
 * 1. 409 冲突路径（route 拦截 PUT 模拟他人先写 → 编辑器提示 + 重新加载）
 * 2. 连改 3 次 → 版本面板 3 条 + 回滚到第 1 版内容一致
 * 3. types=alarm,screen 单连接双事件：运行页收到本画面 put → 刷新横幅
 * 4. 播种幂等回归：同内容全量 upsert 不产生版本条目（rs-iot 判重的既有收益固化）
 */
const SLUG_409 = 'e2e-ver-409'
const SLUG_AI = 'e2e-ver-ai'
const SLUG_SSE = 'e2e-ver-sse'
const SLUG_IDEM = 'e2e-ver-idem'

test.beforeEach(async () => {
  await rsiotSweepScreens(/^e2e-ver-/)
})

const doc = (n: number) => ({
  name: `E2E-P0 v${n}`, canvasCfg: {
    width: 800, height: 600, scale: 1, color: '#141414', img: '',
    guide: true, adsorp: true, adsorp_diff: 3,
    transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
  },
  gridCfg: { enabled: true, align: true, size: 10 },
  json: [], eventList: [], eventFlow: [],
})

test.describe('P0 画面版本管理（真实 rs-iot）', () => {
  test('409 冲突：保存被拒 → 版本冲突提示 → 加载最新', async ({ page }) => {
    await seedScreen(SLUG_409) // 真实播种（v1）
    await loginAsAdmin(page)
    // 拦截本画面的 PUT：模拟"他人/AI 已先写"（409 + current_version）
    await page.route(`**/api/v1/screens/${SLUG_409}*`, async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'version conflict', current_version: 5 }) })
      } else {
        await route.fallback()
      }
    })
    await page.goto(`/edit/${SLUG_409}`)
    await page.locator('.edit-page').waitFor({ timeout: 15_000 })
    // 触发保存（maotu 顶栏保存钮——w8 同款锚点）
    await page.locator('button .el-icon[title="保存"]').click()
    const box = page.locator('.el-message-box')
    await expect(box).toContainText('版本冲突', { timeout: 10_000 })
    await expect(box).toContainText('已被他人或 AI 修改')
    await expect(box).toContainText('5') // current_version 可见
    // 选「加载最新」→ 恢复路由 → 画面重载（真实 GET v1）
    await page.route(`**/api/v1/screens/${SLUG_409}*`, async (route) => route.fallback())
    await box.getByRole('button', { name: '加载最新' }).click()
    await expect(box).toBeHidden({ timeout: 10_000 })
  })

  test('连改 3 次：版本面板 3 条 + 回滚到第 1 版内容一致', async ({ page }) => {
    // 模拟 AI 连改：首建 + 3 次内容变更（helpers 全量 upsert = 任何写者同款路径）
    for (let n = 1; n <= 4; n++) await rsiotPutScreen(SLUG_AI, doc(n))
    const headBefore = await rsiotGetScreen(SLUG_AI)
    expect((headBefore.doc as { name?: string }).name).toBe('E2E-P0 v4')

    await loginAsAdmin(page)
    await page.goto(`/edit/${SLUG_AI}`)
    await page.locator('.edit-page').waitFor({ timeout: 15_000 })
    // 版本面板：3 条（seq 3/2/1 降序）
    await page.getByTestId('version-btn').click()
    const panel = page.getByTestId('version-panel')
    await expect(panel).toBeVisible()
    const items = panel.locator('.ver-item')
    await expect(items).toHaveCount(3, { timeout: 10_000 })
    await expect(items.first()).toContainText('#3')
    await expect(items.last()).toContainText('#1')
    await expect(items.first()).toContainText('admin') // author 列

    // 回滚到 #1（head v4 先存为新版本——可再回滚）
    await items.last().locator('button', { hasText: '回滚' }).click()
    const confirm = page.locator('.el-message-box')
    await expect(confirm).toContainText('回滚到版本 1')
    await confirm.getByRole('button', { name: '回滚' }).click()
    await expect(page.locator('.el-message-box')).toBeHidden({ timeout: 10_000 })

    // head 内容回到 v1；versions 增至 4 条（回滚前 head v4 已快照）
    const head = await rsiotGetScreen(SLUG_AI)
    expect((head.doc as { name?: string }).name).toBe('E2E-P0 v1')
    expect(head.version).toBeGreaterThan(4)
    await expect(items).toHaveCount(4, { timeout: 10_000 })
  })

  test('单连接双事件：运行页收到本画面 put → 刷新横幅', async ({ page }) => {
    await seedScreen(SLUG_SSE)
    await loginAsAdmin(page)
    await page.goto(`/view/${SLUG_SSE}`)
    await page.locator('.view-statusbar').waitFor({ timeout: 15_000 })
    // SSE 已建立（alarm,screen 双 types 单连接）：稍等订阅就绪再从外部改画面
    await page.waitForTimeout(800)
    await rsiotPutScreen(SLUG_SSE, doc(2)) // 服务端发 screen 帧（put, version 2）
    await expect(page.getByTestId('screen-stale-banner')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('screen-stale-banner')).toContainText('画面已更新')
    // 点击刷新：横幅消失 + 画面重挂
    await page.getByTestId('screen-stale-banner').click()
    await expect(page.getByTestId('screen-stale-banner')).toBeHidden({ timeout: 10_000 })
  })

  test('播种幂等：同内容全量 upsert 不产生版本条目', async () => {
    await seedScreen(SLUG_IDEM)          // 第一次播种（首建）
    await seedScreen(SLUG_IDEM)          // 第二次播种（逐字节相同 → 判重命中）
    // 判重的既有收益（fixtures 全量 upsert 幂等）固化：版本端点必须为空
    const { token } = await (await fetch(`${process.env.RSIOT_BASE ?? 'http://127.0.0.1:8790'}/api/v1/user/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: 'admin', pass: 'admin' }),
    })).json() as { token: string }
    const res = await fetch(`${process.env.RSIOT_BASE ?? 'http://127.0.0.1:8790'}/api/v1/screens/${SLUG_IDEM}/versions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const { versions } = await res.json() as { versions: unknown[] }
    expect(versions).toEqual([])
  })
})
