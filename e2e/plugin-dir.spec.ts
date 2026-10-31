// P3b 插件目录 e2e（T13，设计 §6.2 验收三用例）：
//  1. 装 hello-card（scaffold）→ 编辑器「扩展图元（本站）」组可见、拖入画布渲染
//  2. 卸载 → 既有画面出占位框不崩；编辑侧保存不丢原数据（占位不入库）
//  3. lint 不过的插件（symbol 缺 fill）→ 安装可过（manifest 合法）但装载被拒 + 通知可见
// 串行（serial）：三例共享 widgets/ 目录的安装态，每例自装/自清。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { loginAsAdmin, rsiotDeleteScreen, rsiotGetScreen, rsiotPutScreen } from './helpers'

const SLUG = 'e2e-plugin-dir'
const INSTALL = (args: string[]) => execFileSync('node', ['scripts/install-plugin.mjs', ...args], { cwd: process.cwd() })

function blankWithCard(): Record<string, unknown> {
  return {
    name: SLUG, canvasCfg: {
      width: 800, height: 600, scale: 1, color: '#141414', img: '',
      guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
    }, gridCfg: { enabled: true, align: true, size: 10 },
    json: [{
      active: false, hide: false, lock: false, resize: true, rotate: true,
      id: 'card-1', title: 'Hello 卡片', type: 'vue', tag: 'hello-card',
      binfo: { angle: 0, height: 48, left: 120, top: 120, width: 160 },
      common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
      events: [], ports: [],
      props: { fill: '#1f3a5f', text: '播种的卡片' },
      binds: [],
    }],
    eventList: [], eventFlow: [],
  }
}

test.describe.serial('插件目录（P3b）', () => {
  test.beforeEach(async () => {
    INSTALL(['widgets-example/hello-card'])
    await rsiotPutScreen(SLUG, blankWithCard())
  })

  test.afterEach(async () => {
    INSTALL(['--remove', 'hello-card'])
    await rsiotDeleteScreen(SLUG)
  })

  test('装 example 后编辑器可见可拖可用', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/edit/${SLUG}`)
    await page.waitForTimeout(1500)
    // 「扩展图元（本站）」组 + hello-card 项（懒渲染：先展开）
    await page.locator('.el-collapse-item__header', { hasText: '扩展图元（本站）' }).click()
    await page.waitForTimeout(300)
    // 播种画面里的 hello-card 已渲染（vue 组件 DOM，非占位）
    await expect(page.locator('#mtCanvasArea .hello-card')).toHaveCount(1, { timeout: 5000 })
    // 拖入第二件 → 渲染两件
    await page.locator('.el-collapse-item__header', { hasText: '扩展图元（本站）' })
      .locator('~ .el-collapse-item__wrap [draggable=true]').first()
      .dragTo(page.locator('#mtCanvasArea'), { targetPosition: { x: 400, y: 260 } })
    await expect(page.locator('#mtCanvasArea .hello-card')).toHaveCount(2, { timeout: 5000 })
  })

  test('卸载后既有画面出占位框不崩，编辑保存不丢原数据', async ({ page }) => {
    INSTALL(['--remove', 'hello-card'])
    // 运行页：占位框 + tag 名标注，整画面不拒载
    await loginAsAdmin(page)
    await page.goto(`/view/${SLUG}`)
    await page.waitForTimeout(1200)
    const ph = page.locator('.ah-plugin-missing')
    await expect(ph).toHaveCount(1, { timeout: 5000 })
    await expect(ph).toContainText('hello-card')
    // 编辑页：占位 + 保存（还原原项，占位不入库）
    await page.goto(`/edit/${SLUG}`)
    await page.waitForTimeout(1500)
    // 降级提示先断言（ElMessage 3s 自动消散，后置断言会错过）
    await expect(page.locator('.el-message--warning').first()).toBeVisible({ timeout: 4000 })
    await expect(page.locator('#mtCanvasArea .ah-plugin-missing')).toHaveCount(1, { timeout: 5000 })
    await page.locator('.el-header button', { has: page.locator('i[title="保存"]') }).click()
    await expect(page.locator('.el-message--success').first()).toBeVisible({ timeout: 5000 })
    const { doc } = await rsiotGetScreen(SLUG)
    const json = (doc as { json: Array<Record<string, unknown>> }).json
    expect(json[0].tag).toBe('hello-card') // 原数据保留（未写成占位 tag）
    expect((json[0].props as Record<string, unknown>).text).toBe('播种的卡片')
  })

  test('lint 不过的插件被拒载且通知可见', async ({ page }) => {
    // manifest 合法（安装器放行）但 symbol 缺 fill（FILL_MISSING）→ loader 拒载
    const dir = mkdtempSync(join(tmpdir(), 'bad-plugin-'))
    try {
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
        id: 'bad-no-fill', name: '坏插件', version: '0.1.0', entry: 'dist.js',
      }))
      writeFileSync(join(dir, 'dist.js'), `export default function register(host) {
  host.registerSymbol({ id: 'bad-no-fill', title: 'X', type: 'vue', thumbnail: '',
    props: { text: { title: '文本', type: 'input', val: 'x' } }, width: 100, height: 40 })
}`)
      INSTALL([dir])
      await loginAsAdmin(page)
      await page.goto(`/edit/${SLUG}`)
      // 通知可见（ElNotification.warning），扩展图元组不含坏插件项
      await expect(page.locator('.el-notification').filter({ hasText: 'bad-no-fill' })
        .filter({ hasText: 'lint' })).toBeVisible({ timeout: 8000 })
      // hello-card 照常装载（坏插件不拖累同目录其它插件）
      await expect(page.locator('#mtCanvasArea .hello-card')).toHaveCount(1, { timeout: 5000 })
    } finally {
      INSTALL(['--remove', 'bad-no-fill'])
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
