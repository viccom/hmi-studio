import { existsSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { loginAsAdmin } from './helpers'

/**
 * AI 面板真实链路 e2e（2026-10-31 功能对齐）：不 mock /api/agent/*——
 * 打 dev gateway 的 `/api/agent/workspace` 与 `/api/agent/attachments`，
 * 验证「工作区选择器能列真实目录」「附件真的落到 reasonix 工作区」。
 * 测试结束清理本次上传（dev 工作区不积累测试附件）。
 */
const ATTACH_DIR = fileURLToPath(
  new URL('../../dist/run/dev/reasonix/work/.reasonix/attachments', import.meta.url),
)

test.describe('AI 面板（真实 gateway 端点）', () => {
  test('📁 列真实工作区 + 📎 上传落盘并生成 chip', async ({ page }) => {
    const before = new Set(existsSync(ATTACH_DIR) ? readdirSync(ATTACH_DIR) : [])
    try {
      await loginAsAdmin(page)
      await page.goto('/')
      await page.getByRole('button', { name: '打开 AI 助手' }).click()
      const drawer = page.getByRole('complementary', { name: 'AI 助手面板' })

      // 工作区选择器：真实 /api/agent/workspace（dev work 至少有 reasonix.toml）
      await drawer.getByTitle('引用文件或文件夹：从当前工作区选择上下文').click()
      const picker = page.locator('.modal-mask').filter({ hasText: '引用文件或文件夹' })
      await expect(picker.getByRole('button', { name: /reasonix\.toml/ })).toBeVisible({ timeout: 10_000 })
      await picker.getByRole('button', { name: '取消' }).click()
      await expect(picker).toHaveCount(0)

      // 上传：真实 /api/agent/attachments → gateway 落 .reasonix/attachments
      await drawer.locator('input[type=file]').setInputFiles({
        name: 'e2e-live-note.txt', mimeType: 'text/plain', buffer: Buffer.from('live'),
      })
      await expect(drawer.locator('.attach-chip')).toContainText('e2e-live-note.txt', { timeout: 10_000 })
      await expect.poll(
        () => (existsSync(ATTACH_DIR) ? readdirSync(ATTACH_DIR).length : 0),
        { timeout: 10_000 },
      ).toBeGreaterThan(before.size)

      await drawer.getByRole('button', { name: '移除附件' }).click()
      await expect(drawer.locator('.attach-chip')).toHaveCount(0)
    } finally {
      // 清理本次上传（按前后差集删除，避免误删既有附件）
      if (existsSync(ATTACH_DIR)) {
        for (const f of readdirSync(ATTACH_DIR)) {
          if (!before.has(f)) rmSync(`${ATTACH_DIR}/${f}`, { force: true })
        }
      }
    }
  })
})
