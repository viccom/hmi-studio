import { test, expect, type Page } from '@playwright/test'
import os from 'node:os'
import { buildDemoScreen } from '../src/screen-assets/demo-screen'
import { loginAsAdmin, rsiotGetScreen, rsiotPutScreen } from './helpers'

// W9 打回修复回归：crypto.randomUUID 仅安全上下文可用——用户经 LAN IP
// （http://<ip>:18080/hmi/）访问是不安全上下文，原实现添加绑定直接抛
// TypeError 静默失败（e2e 此前全跑 127.0.0.1 = 安全上下文，盲区）。
// 本 spec 用 LAN IP 源复现用户环境，锁定绑定全流程。修复 = lib/uid 特性检测兜底。
// 长期资产纪律：基线 = buildDemoScreen().b 纯函数产物（固定基线，失败残留不跨轮累积——
// 审查 P2-7：原"快照当前态"会把上一轮残留固化）；跑前还原基线，跑后回写同基线。
const LAN = os.networkInterfaces()['eth0']?.find((i) => i.family === 'IPv4' && !i.internal)?.address
  ?? Object.values(os.networkInterfaces()).flat().find((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)!.address

const SLUG = 'water-demo-m3-b'

// 寻址经 helpers（RSIOT_BASE 可覆盖——原硬编码 127.0.0.1:8790 绕过环境约定）
const restoreDoc = (doc: unknown): Promise<void> => rsiotPutScreen(SLUG, doc)

async function runBindFlow(page: Page, pageErrors: string[]): Promise<void> {
  await page.locator('#mtCanvasArea [id^="text-"]').first().click()
  await page.locator('.el-tabs__item', { hasText: '绑定' }).click()
  await page.locator('.bind-panel .el-tree-node__children .el-tree-node__content').first().click()
  await page.getByRole('button', { name: '添加绑定' }).click()

  const list = page.locator('.bind-panel .bp-section').filter({ hasText: '绑定列表' })
  await expect(list).toContainText('（1）')
  expect(pageErrors, '不安全上下文零页面异常').toEqual([])

  await page.locator('button .el-icon[title="保存"]').click()
  await expect(page.locator('.el-message--success')).toBeVisible()
  const { doc } = await rsiotGetScreen(SLUG)
  const textNode = (doc.json as Array<{ id?: string; binds?: { bind_id: string }[] }>)
    .find((n) => String(n.id).startsWith('text-'))
  expect(textNode?.binds?.length).toBeGreaterThanOrEqual(1)
  // 绑定的是选点器首叶——rs-iot 接入 home-meter-* 设备后首叶不再是 rsiot.*（数据面漂移），
  // 判据回归意图：落库的是合法 field 格式 <devid>.<tag>（P2 表计轮实测回填）
  expect(textNode?.binds?.[0]?.bind_id).toMatch(/^[a-z0-9_-]+\.[a-z0-9_]+$/i)
}

test.describe('W9 不安全上下文（LAN IP）绑定流', () => {
  test.skip(!LAN, '无非回环 IPv4（环境异常，跳过）')

  test('LAN IP 源：选点 → 添加绑定 → 列表出现且保存落库', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    await loginAsAdmin(page)
    const baseline = buildDemoScreen().b
    await restoreDoc(baseline) // 跑前还原固定基线（清此前运行残留，从 0 计数）
    await page.goto(`http://${LAN}:5290/edit/${SLUG}`)
    await page.waitForSelector('#mtCanvasArea', { timeout: 15_000 })

    try {
      await runBindFlow(page, pageErrors)
    } finally {
      await restoreDoc(baseline)
    }
    await ctx.close()
  })
})
