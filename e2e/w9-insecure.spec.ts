import { test, expect, type Page } from '@playwright/test'
import os from 'node:os'

// W9 打回修复回归：crypto.randomUUID 仅安全上下文可用——用户经 LAN IP
// （http://<ip>:18080/hmi/）访问是不安全上下文，原实现添加绑定直接抛
// TypeError 静默失败（e2e 此前全跑 127.0.0.1 = 安全上下文，盲区）。
// 本 spec 用 LAN IP 源复现用户环境，锁定绑定全流程。修复 = lib/uid 特性检测兜底。
// 长期资产纪律：跑前还原基线（清残留），跑后回写备份（w8 同款，water-demo-m3-b）。
const LAN = os.networkInterfaces()['eth0']?.find((i) => i.family === 'IPv4' && !i.internal)?.address
  ?? Object.values(os.networkInterfaces()).flat().find((i) => i!.family === 'IPv4' && !i.internal)!.address

const SLUG = 'water-demo-m3-b'

async function restoreDoc(auth: Record<string, string>, doc: unknown): Promise<void> {
  await fetch(`http://127.0.0.1:8790/api/v1/screens/${SLUG}`, {
    method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify(doc),
  })
}

async function runBindFlow(page: Page, auth: Record<string, string>, pageErrors: string[]): Promise<void> {
  await page.locator('#mtCanvasArea [id^="text-"]').first().click()
  await page.locator('.el-tabs__item', { hasText: '绑定' }).click()
  await page.locator('.bind-panel .el-tree-node__children .el-tree-node__content').first().click()
  await page.getByRole('button', { name: '添加绑定' }).click()

  const list = page.locator('.bind-panel .bp-section').filter({ hasText: '绑定列表' })
  await expect(list).toContainText('（1）')
  expect(pageErrors, '不安全上下文零页面异常').toEqual([])

  await page.locator('button .el-icon[title="保存"]').click()
  await expect(page.locator('.el-message--success')).toBeVisible()
  const doc = await fetch(`http://127.0.0.1:8790/api/v1/screens/${SLUG}`, { headers: auth })
    .then((r) => r.json())
  const textNode = doc.doc.json.find((n: { id?: string }) => String(n.id).startsWith('text-'))
  expect(textNode.binds?.length).toBeGreaterThanOrEqual(1)
  expect(textNode.binds[0].bind_id).toMatch(/^rsiot\./)
}

test.describe('W9 不安全上下文（LAN IP）绑定流', () => {
  test.skip(!LAN, '无非回环 IPv4（环境异常，跳过）')

  test('LAN IP 源：选点 → 添加绑定 → 列表出现且保存落库', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    const login = await fetch('http://127.0.0.1:8790/api/v1/user/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: 'admin', pass: 'admin' }),
    }).then((r) => r.json())
    await page.addInitScript((t: string) => localStorage.setItem('hmi_token', t), login.token)

    const auth = { Authorization: `Bearer ${login.token}` }
    const original = await fetch(`http://127.0.0.1:8790/api/v1/screens/${SLUG}`, { headers: auth })
      .then((r) => r.json())
    await restoreDoc(auth, original.doc) // 跑前还原基线（清此前运行残留，从 0 计数）
    await page.goto(`http://${LAN}:5290/edit/${SLUG}`)
    await page.waitForSelector('#mtCanvasArea', { timeout: 15_000 })

    try {
      await runBindFlow(page, auth, pageErrors)
    } finally {
      await restoreDoc(auth, original.doc)
    }
    await ctx.close()
  })
})
