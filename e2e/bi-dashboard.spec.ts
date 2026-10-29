import { test, expect } from '@playwright/test'
import { loginAsAdmin, rsiotGetScreen } from './helpers'
import { seedBiStationScreen } from './fixtures'
import { BI_STATION } from '../src/screen-assets/bi-screen'

// P2 监控站 BI 大屏汇总门：长期资产（slug 恒定 bi-station，PUT upsert 幂等，
// **无清扫**——同 water-demo-m3 约定）。
//
// 数据面 = **真实活数据**（rs-iot 时序库），非 SSE mock：宿主聚合收集器在运行页
// 扫出画面里的 ah-bi- 图元 → POST /api/v1/history/batch → 结果写回 props.data.val。
// 本门断言的是**通道 B 端到端闭环**：
//   ① 图元已装载（ah-bi- 前缀节点存在）
//   ② 宿主确实发起了 history/batch 请求（拦请求计数 + 参数形状）
//   ③ 图元拿到了数据（KPI 读数不是 '--'，表格有真实行，图表 canvas 已绘）
//
// 与 SSE 通道 A 的分工：A 走 bind 直写（实时值），B 走宿主聚合（历史分析）。
// 本门只覆盖 B；A 由 home-meters.spec 覆盖。

test.describe('P2 监控站 BI 大屏（通道 B 闭环）', () => {
  test.beforeAll(async () => { await seedBiStationScreen() })

  test('宿主发起 history/batch 聚合请求（跨图元合并 + 窗口参数）', async ({ page }) => {
    await loginAsAdmin(page)
    const batches: unknown[][] = []
    await page.route('**/api/v1/history/batch', async (route) => {
      const body = route.request().postDataJSON() as { queries?: Array<Record<string, unknown>> }
      batches.push(body.queries ?? [])
      await route.continue()
    })
    await page.goto(`/view/${BI_STATION}`)

    await expect.poll(() => batches.length, { timeout: 20_000 }).toBeGreaterThan(0)
    const queries = batches.flat()
    expect(queries.length).toBeGreaterThan(0)
    // 后端契约：秒级半开窗 + agg/interval 联动
    const q = queries[0] as { dev_id: string; tag: string; start: number; end: number; agg: string; interval: number }
    expect(q.dev_id).toContain('home-meter')
    expect(typeof q.tag).toBe('string')
    expect(Number.isFinite(q.start)).toBe(true)
    expect(Number.isFinite(q.end)).toBe(true)
    expect(q.end).toBeGreaterThan(q.start)
    expect(['avg', 'max', 'min', 'sum', 'count', 'last']).toContain(q.agg)
    expect(q.interval).toBeGreaterThan(0)
  })

  test('BI 图元已装载并拿到真实数据（KPI 读数非 --、表格有行、图表 canvas 已绘）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${BI_STATION}`)

    // ① 图元装载：画面含 14 个 BI 图元（6 KPI + stack-area/pie/rank + matrix/spike/table/alarms + window）
    await expect(page.locator('[id^="ah-bi-"]')).toHaveCount(14, { timeout: 20_000 })

    // ② KPI 卡拿到真实读数（不是 '--' 占位）——宿主写回 props.data.val 的直接证据
    const kpi = page.locator('#ah-bi-kpi-bist-1')
    await expect(kpi).toBeVisible()
    await expect.poll(async () => {
      const t = (await kpi.textContent()) ?? ''
      return t.includes('--') ? '' : t
    }, { timeout: 20_000 }).not.toBe('')

    // ③ 图表类图元渲染出 canvas（echarts 实例已初始化）
    await expect(page.locator('#ah-bi-rank-bist-1 canvas')).toHaveCount(1, { timeout: 20_000 })
    await expect(page.locator('#ah-bi-pie-bist-1 canvas')).toHaveCount(1)
    await expect(page.locator('#ah-bi-stack-area-bist-1 canvas')).toHaveCount(1)
    // 矩阵图元：echarts 多层渲染（canvas 数 >1），故断言「至少 1 个」
    await expect(page.locator('#ah-bi-matrix-bist-1 canvas').first()).toBeVisible()

    // ④ 明细表有真实行（每条序列一行）
    const rows = page.locator('#ah-bi-table-bist-1 tbody tr')
    await expect(rows).toHaveCount(8, { timeout: 20_000 })

    // ⑤ KPI 卡带迷你趋势（sparkline）：通道 B 的 both 形态同取单值 + 时序
    await expect(page.locator('#ah-bi-kpi-bist-1 polyline')).toHaveCount(1, { timeout: 20_000 })

    // ⑥ 尖峰柱图渲染出 canvas（P3-② ）
    await expect(page.locator('#ah-bi-spike-bist-1 canvas').first()).toBeVisible({ timeout: 20_000 })
  })

  test('窗口切换器：点击档位 → 宿主按覆盖窗重发 batch（回显高亮）', async ({ page }) => {
    await loginAsAdmin(page)
    const windows: Array<{ start: number; end: number }> = []
    await page.route('**/api/v1/history/batch', async (route) => {
      const body = route.request().postDataJSON() as { queries?: Array<{ start: number; end: number }> }
      const qs = body.queries ?? []
      if (qs.length) windows.push({ start: qs[0].start, end: qs[0].end })
      await route.continue()
    })
    await page.goto(`/view/${BI_STATION}`)
    await expect(page.locator('#ah-bi-window-bist-1')).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => windows.length, { timeout: 20_000 }).toBeGreaterThan(0)
    const span1 = windows[0].end - windows[0].start

    // 点击「7天」→ 下一拍 batch 的窗口跨度 = 604800（覆盖窗生效，不重播种画面）。
    // 刻意用 7 天：1h/24h 都有面板默认在用，判别度为零。
    await page.locator('#ah-bi-window-bist-1 button', { hasText: '7天' }).click()
    await expect.poll(() => windows.some((w) => w.end - w.start === 604_800), { timeout: 20_000 }).toBe(true)
    // 切换器高亮回显（宿主写回 props.data.val）
    await expect(page.locator('#ah-bi-window-bist-1 button.on')).toHaveText('7天', { timeout: 20_000 })
    // 采样跨度合法（首轮是面板各自窗：1h 或 24h）
    expect([3_600, 86_400]).toContain(span1)
  })

  test('告警统计面板：宿主写回告警信封（活动告警计数渲染）', async ({ page }) => {
    await loginAsAdmin(page)
    // 告警面板不产生 history/batch 查询（无 series）；但 30s 拍里会拉 /api/v1/alarms
    const alarmCalls: number[] = []
    await page.route('**/api/v1/alarms*', async (route) => {
      if (route.request().method() === 'GET') alarmCalls.push(1)
      await route.continue()
    })
    await page.goto(`/view/${BI_STATION}`)
    await expect(page.locator('#ah-bi-alarms-bist-1')).toBeVisible({ timeout: 20_000 })
    // 宿主拉过告警快照（画面加载拍 + AlarmBanner 初始快照至少各一次）
    await expect.poll(() => alarmCalls.length, { timeout: 20_000 }).toBeGreaterThan(0)
    // 面板渲染出「活动告警」读数区（数字或安宁态都算——取决于现场告警集）
    await expect(page.locator('#ah-bi-alarms-bist-1')).toContainText(/活动告警|无活动告警/, { timeout: 20_000 })
  })

  test('画面真相存 rs-iot 且 BI 图元的 data 通道未落库（保存态 sanitize）', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/view/${BI_STATION}`)

    // 运行时 props.data 被宿主写回（内存态）→ 图元有数据
    await expect(page.locator('#ah-bi-kpi-bist-1')).toContainText(/\d/, { timeout: 20_000 })

    // 但落库的文档里 props.data 是 '[]'（运行态数据不入库——sanitize 语义）
    // 注：rs-iot 直连（rs-iot :8790），Playwright 的 request 上下文不继承页面 cookie，
    // 故用 helpers 的 authedFetch（自持 Bearer 登录）而非 request.get。
    const body = await rsiotGetScreen(BI_STATION)
    const doc = body.doc as { json: Array<{ id: string; props: Record<string, unknown> }> }
    const biItems = doc.json.filter((i) => i.id.startsWith('ah-bi-'))
    expect(biItems.length).toBe(14)
    for (const it of biItems) {
      expect(it.props.data, `${it.id} 的 data 通道`).toBe('[]')
    }
  })
})
