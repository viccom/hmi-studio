import { test, expect } from '@playwright/test'
import { loginAsAdmin, rsiotSweepScreens } from './helpers'
import { seedCommandScreen, seedScreen } from './fixtures'

// G-M2 段1（T6）：运行页数据驱动——seed 文本图元（bind rsiot.uptime_s → props.text.val）
// → /view/:slug → SSE snapshot/datachange 推 uptime → DOM 文本两次采样不等。
// 断言路径实测结论：vue 图元渲染为真实 DOM 文本（`[id^="text-vue-"] .break-words`），
// 无需 img dataURI 对比（那是 svg 图元路径，T4 经验）。
// 注意：uptime_s 由采集器 ~5s 写一次（curl 实测 datachange 节奏）——变化等待上限 20s，
// 不是任务书的 3s（首帧 snapshot 即达，第二次采样差异取决于采集周期）。
test.describe('M2 数据驱动', () => {
  const slug = `e2e-t6-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  test.afterAll(async () => {
    await rsiotSweepScreens(/^e2e-t6-/)
  })

  test('运行页：绑 rsiot.uptime_s 的文本随 SSE 流变化（两次采样不等）', async ({ page }) => {
    await seedScreen(slug)
    await loginAsAdmin(page)

    const sseReq = page.waitForResponse((r) => r.url().includes('/api/v1/rtdatas/subscribe'))
    await page.goto(`/view/${slug}`)
    // SSE 经 vite proxy 同源建立（Cookie 鉴权通道）
    expect((await sseReq).status()).toBe(200)

    // 状态灯 online（onState 桥接）
    await expect(page.locator('.state.online')).toBeVisible({ timeout: 10_000 })

    // snapshot 到达 → setDevicePointByID 直写 props.text.val → DOM 文本变 uptime 数字
    const txt = page.locator('[id^="text-vue-"] .break-words')
    await expect.poll(async () => /^\d+$/.test((await txt.textContent()) ?? ''), { timeout: 10_000 }).toBe(true)
    const first = (await txt.textContent())?.trim()

    // uptime_s 单调增（F7）：下一次 datachange 后文本必变（采集周期 ~5s，上限 20s）
    await expect.poll(async () => (await txt.textContent())?.trim() !== first, { timeout: 20_000 }).toBe(true)
  })
})

// G-M2 段2（T7）：命令桥——图元 click custom_code 调 $rsiot.send → ElMessageBox 确认
// → POST /api/v1/command/send → ElMessage 结果。payload 断言 {instance,devid,cmd,data}：
// instance='self' 来自真实 GET /api/v1/devices 的 owner_inst（rsiot 系统设备归属 self 实例）。
test.describe('M2 命令桥', () => {
  const slug = `e2e-t7-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  test.afterAll(async () => {
    await rsiotSweepScreens(/^e2e-t7-/)
  })

  test('点击图元 → 确认框（含 devid.tag）→ 确定 → 下发 ok + payload 契约', async ({ page }) => {
    await seedCommandScreen(slug)
    await loginAsAdmin(page)

    // 拦截命令端点（确定性：不依赖 self 实例真实消费 write）
    const payloads: unknown[] = []
    await page.route('**/api/v1/command/send', async (route) => {
      payloads.push(route.request().postDataJSON())
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' })
    })

    await page.goto(`/view/${slug}`)
    await page.locator('[id^="text-vue-"]').click()

    // 确认框出现且文案含 devid.tag（运行态按钮=确定）
    const box = page.locator('.el-message-box')
    await expect(box).toBeVisible({ timeout: 5_000 })
    await expect(box).toContainText('rsiot.uptime_s')
    await expect(box.locator('.el-message-box__btns .el-button--primary')).toHaveText('确定')

    await box.locator('.el-message-box__btns .el-button--primary').click()

    // 成功提示 + payload 契约（data 为 JSON 字符串）
    await expect(page.locator('.el-message--success')).toBeVisible({ timeout: 5_000 })
    expect(payloads).toEqual([{
      instance: 'self', devid: 'rsiot', cmd: 'write',
      data: '{"tag":"uptime_s","value":1}',
    }])
  })
})
