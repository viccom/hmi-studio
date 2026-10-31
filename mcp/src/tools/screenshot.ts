/**
 * 截图工具（设计 §4.2 `hmi_screenshot`）：无头浏览器截运行页 /view/{id}。
 *
 * 前置（2026-10-30 核实）：playwright-core 走本机既有 chromium
 * （~/.cache/ms-playwright/chromium-*，不触发浏览器下载）；/hmi/view/:id 是受守卫
 * 路由（守卫读 localStorage webhmi_token——lib/api.ts tokenStore），SSE/API 靠同源
 * cookie——登录态 = cookie token + localStorage webhmi_token/webhmi_user **双注入**。
 * 环境变量：HMI_VIEW_ORIGIN（默认 http://127.0.0.1:18080/hmi）+ HMI_JWT + 可选
 * HMI_CHROMIUM_PATH 直接指浏览器可执行文件。
 */
import { readdirSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { readOnlyAnnotations } from '../risk'
import type { ToolRegistrar } from '../registrar'

// ---------- 纯函数（单测覆盖） ----------

export interface ChromiumCandidate { revisions: string[]; paths: string[] }

/** 解析本机 chromium 可执行文件候选（readdir 可注入测试；env 直指优先）。 */
export function resolveChromiumCandidates(browsersDir: string, readdir: typeof readdirSync): string[] {
  let dirs: string[]
  try {
    dirs = readdir(browsersDir).filter((d) => /^chromium-\d+$/.test(d))
  } catch {
    return []
  }
  dirs.sort((a, b) => Number(b.slice('chromium-'.length)) - Number(a.slice('chromium-'.length)))
  const paths: string[] = []
  for (const d of dirs) {
    paths.push(
      join(browsersDir, d, 'chrome-linux', 'chrome'),
      join(browsersDir, d, 'chrome-linux', 'headless_shell'),
    )
  }
  return paths
}

export function defaultBrowsersDir(): string {
  return process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), '.cache', 'ms-playwright')
}

/** 挑第一个存在的候选；全缺 → null（调用方给可操作报错）。 */
export function pickChromium(envPath: string | undefined, candidates: string[], exists: (p: string) => boolean): string | null {
  if (envPath) return exists(envPath) ? envPath : null
  for (const p of candidates) {
    if (exists(p)) return p
  }
  return null
}

/** 登录态注入脚本（addInitScript 每次导航前执行——守卫读 localStorage 先于任何 fetch）。 */
export function buildLoginStateScript(token: string): string {
  return [
    `localStorage.setItem('webhmi_token', ${JSON.stringify(token)})`,
    `localStorage.setItem('webhmi_user', ${JSON.stringify(JSON.stringify({ user_id: 'hmi-mcp' }))})`,
  ].join(';')
}

export interface CookieSpec {
  name: string
  value: string
  domain: string
  path: string
}

/** SSE/API 鉴权 cookie（EventSource 只认同源 cookie——endpoints.ts 契约）。 */
export function buildCookieSpec(jwt: string, origin: string): CookieSpec {
  return { name: 'token', value: jwt, domain: new URL(origin).hostname, path: '/' }
}

export function defaultViewOrigin(): string {
  return process.env.HMI_VIEW_ORIGIN ?? 'http://127.0.0.1:18080/hmi'
}

// ---------- 工具注册 ----------

export function registerScreenshotTools(server: ToolRegistrar): void {
  server.registerTool(
    'hmi_screenshot',
    {
      description: '截图运行页 /view/{id}（无头 chromium，带登录态）。返回 PNG 图像块 + 落盘路径。用于 AI 自检画面效果（建画面→查数→截图→修正闭环）。',
      inputSchema: {
        id: z.string().describe('画面 slug'),
        wait_ms: z.number().optional().describe('画布渲染后额外等待毫秒（默认 3000；慢数据画面可加大）'),
      },
      annotations: readOnlyAnnotations(),
    },
    async (args) => {
      const { id, wait_ms } = args as { id: string; wait_ms?: number }
      // 审计日志由 logging.ts 装饰器单点记录（tool/tier/ok/ms），此处不再自行埋点
      const shot = await runScreenshot(id, wait_ms ?? 3000)
      return {
        content: [
          { type: 'image', data: shot.png.toString('base64'), mimeType: 'image/png' },
          { type: 'text', text: `截图完成：${shot.path}（${shot.png.byteLength} 字节，viewport 1280x800）` },
        ],
      }
    },
  )
}

export interface ScreenshotResult { path: string; png: Buffer }

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/** 截图执行体（playwright-core 懒加载——不跑截图的会话不背浏览器开销）。 */
export async function runScreenshot(screenId: string, waitMs: number): Promise<ScreenshotResult> {
  const origin = defaultViewOrigin()
  const jwt = process.env.HMI_JWT ?? ''
  if (!jwt) throw new Error('HMI_JWT 未设置——截图需要登录态（rs-iot 签发 sub=hmi-mcp 的 JWT）')

  const chromiumPath = pickChromium(
    process.env.HMI_CHROMIUM_PATH,
    resolveChromiumCandidates(defaultBrowsersDir(), readdirSync),
    isFile,
  )
  if (!chromiumPath) {
    throw new Error(`未找到本机 chromium（查过 ${defaultBrowsersDir()}）；可设 HMI_CHROMIUM_PATH 直指可执行文件`)
  }

  const { chromium } = await import('playwright-core')
  const browser = await chromium.launch({ executablePath: chromiumPath, headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await context.addCookies([buildCookieSpec(jwt, origin)])
    await context.addInitScript(buildLoginStateScript(jwt))
    const page = await context.newPage()
    await page.goto(`${origin.replace(/\/$/, '')}/view/${encodeURIComponent(screenId)}`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    // SSE 常开导致 networkidle 永不满足——等画布出现 + 固定延时（风险登记 §4）
    await page.waitForSelector('canvas', { timeout: 15_000 }).catch(() => { /* 画布选择器未知时退化为纯延时 */ })
    await page.waitForTimeout(waitMs)
    const png = await page.screenshot({ type: 'png' })
    const dir = join(tmpdir(), 'hmi-mcp-screens')
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, `${screenId.replace(/[^a-z0-9-]/gi, '_')}-${Date.now()}.png`)
    writeFileSync(path, png)
    await context.close()
    return { path, png: Buffer.from(png) }
  } finally {
    await browser.close()
  }
}
