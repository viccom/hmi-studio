// 宿主聚合收集器单测（TDD 红→绿）：合并往返 / 结果配对 / 写回 / 失败隔离。
//
// 收集器是通道 B 的执行端（lib/bi-collector.ts）：画面扫描 → 合并查询 → 分批
// /history/batch → 结果按序配对 → 信封组装 → 写回各图元 props.data.val。
// 依赖注入（fetchBatch / write / now）使流层可单测——不碰网络也不碰 maotu。
import { describe, it, expect, vi } from 'vitest'
import {
  createBiCollector,
  type BiCollectorDeps,
  type BiCollectorOptions,
} from './bi-collector'
import { collectBiPanels, type BiPanelSpec } from './bi-contract'

const NOW = 1_800_000_000

function pel(id: string, tag: string, props: Record<string, unknown>): Record<string, unknown> {
  return { id, tag, type: 'vue', props }
}

function panelProps(o: { series: unknown; agg?: string; interval?: number; windowSecs?: number; shape?: string }): Record<string, unknown> {
  return {
    series: o.series,
    agg: o.agg ?? 'avg',
    interval: o.interval ?? 0,
    windowSecs: o.windowSecs ?? 3600,
    shape: o.shape ?? 'aggregate',
  }
}

/** 两个面板各一条 series → 合并成一次 batch 往返（跨面板合并的价值所在） */
const TWO_PANELS = {
  json: [
    pel('bi-kpi', 'ah-bi-kpi', panelProps({ series: '[{"dev_id":"d1","tag":"power","label":"P1"}]' })),
    pel('bi-rank', 'ah-bi-rank', panelProps({ series: '[{"dev_id":"d2","tag":"power","label":"P2"}]' })),
  ],
}

function makeDeps(over: Partial<BiCollectorDeps> = {}): BiCollectorDeps & {
  fetchBatch: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
} {
  const fetchBatch = vi.fn(async () => ({
    results: [
      { dev_id: 'd1', tag: 'power', count: 1, points: [{ ts: NOW - 10, value: 1.5 }] },
      { dev_id: 'd2', tag: 'power', count: 1, points: [{ ts: NOW - 10, value: 2.5 }] },
    ],
  }))
  const write = vi.fn()
  return {
    fetchBatch,
    write,
    now: () => NOW,
    ...over,
  } as BiCollectorDeps & { fetchBatch: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> }
}

describe('BI 收集器：跨面板合并往返', () => {
  it('两个面板的 series 合并为一次 batch 请求（省往返）', async () => {
    const deps = makeDeps()
    const c = createBiCollector(deps)
    const r = await c.collect(TWO_PANELS)
    expect(deps.fetchBatch).toHaveBeenCalledTimes(1)
    const body = deps.fetchBatch.mock.calls[0][0] as { queries: Array<{ dev_id: string }> }
    expect(body.queries).toHaveLength(2)
    expect(body.queries.map((q) => q.dev_id)).toEqual(['d1', 'd2'])
    expect(r.ok).toBe(true)
  })

  it('查询体字段与后端契约一致（秒级时间窗 + agg/interval 联动）', async () => {
    const deps = makeDeps()
    const c = createBiCollector(deps)
    await c.collect(TWO_PANELS)
    const body = deps.fetchBatch.mock.calls[0][0] as { queries: Array<Record<string, unknown>> }
    expect(body.queries[0]).toEqual({
      dev_id: 'd1', tag: 'power',
      start: NOW - 3600, end: NOW, agg: 'avg', interval: 3600,
    })
  })

  it('结果按序配对回各面板（不靠 dev_id 猜——同 series 多面板时靠序）', async () => {
    const deps = makeDeps()
    const c = createBiCollector(deps)
    await c.collect(TWO_PANELS)
    const calls = deps.write.mock.calls
    expect(calls).toHaveLength(2)
    const first = JSON.parse(calls[0][1] as string) as { series: Array<{ label: string; value: number | null }> }
    expect(first.series[0].label).toBe('P1')
    expect(first.series[0].value).toBe(1.5)
  })
})

describe('BI 收集器：写回通道', () => {
  it('按面板 id 写 props.data.val（JSON 串），路径符合 maotu 直写约定', async () => {
    const deps = makeDeps()
    const c = createBiCollector(deps)
    await c.collect(TWO_PANELS)
    expect(deps.write.mock.calls[0][0]).toBe('bi-kpi')
    expect(deps.write.mock.calls[0][2]).toBe('props.data.val')
    expect(typeof deps.write.mock.calls[0][1]).toBe('string')
  })

  it('信封含版本/窗口/生成时刻（前端可判陈旧）', async () => {
    const deps = makeDeps()
    const c = createBiCollector(deps)
    await c.collect(TWO_PANELS)
    const env = JSON.parse(deps.write.mock.calls[0][1] as string) as Record<string, unknown>
    expect(env.v).toBe(1)
    expect(env.generatedAt).toBe(NOW)
    expect(env.window).toEqual({ start: NOW - 3600, end: NOW })
  })
})

describe('BI 收集器：失败隔离与空画面', () => {
  it('画面无 BI 图元 → 不发请求、不写回', async () => {
    const deps = makeDeps()
    const c = createBiCollector(deps)
    const r = await c.collect({ json: [pel('pump-1', 'ah-pump-centrifugal', { fill: '#fff' })] })
    expect(deps.fetchBatch).not.toHaveBeenCalled()
    expect(deps.write).not.toHaveBeenCalled()
    expect(r.ok).toBe(true)
    expect(r.panels).toBe(0)
  })

  it('batch 整体失败（网络错）→ 不写回任何图元，返回失败态（画面不空不炸）', async () => {
    const deps = makeDeps({ fetchBatch: vi.fn(async () => { throw new Error('network down') }) })
    const c = createBiCollector(deps)
    const r = await c.collect(TWO_PANELS)
    expect(deps.write).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('network down')
  })

  it('单条查询字段化失败 → 只该 series 带 error，其它面板正常写回', async () => {
    const deps = makeDeps({
      fetchBatch: vi.fn(async () => ({
        results: [
          { dev_id: 'd1', tag: 'power', error: 'bad request: start must < end' },
          { dev_id: 'd2', tag: 'power', count: 1, points: [{ ts: NOW, value: 9 }] },
        ],
      })),
    })
    const c = createBiCollector(deps)
    await c.collect(TWO_PANELS)
    const calls = deps.write.mock.calls
    const bad = JSON.parse(calls[0][1] as string) as { series: Array<{ error: string | null }> }
    const good = JSON.parse(calls[1][1] as string) as { series: Array<{ value: number | null; error: string | null }> }
    expect(bad.series[0].error).toContain('bad request')
    expect(good.series[0].error).toBeNull()
    expect(good.series[0].value).toBe(9)
  })

  it('结果条数少于查询条数 → 缺条按错误处理，不静默丢序列', async () => {
    const deps = makeDeps({
      fetchBatch: vi.fn(async () => ({ results: [{ dev_id: 'd1', tag: 'power', count: 1, points: [{ ts: NOW, value: 1 }] }] })),
    })
    const c = createBiCollector(deps)
    await c.collect(TWO_PANELS)
    const calls = deps.write.mock.calls
    expect(calls).toHaveLength(2)
    const second = JSON.parse(calls[1][1] as string) as { series: Array<{ error: string | null }> }
    expect(second.series[0].error).toBeTruthy()
  })
})

describe('BI 收集器：超过单批上限时分批', () => {
  it('>32 条查询 → 多批请求，顺序拼接后配对', async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      pel(`bi-${i}`, 'ah-bi-kpi', panelProps({ series: `[{"dev_id":"d${i}","tag":"power"}]` })))
    const seen: unknown[][] = []
    const deps = makeDeps({
      fetchBatch: vi.fn(async (body: { queries: unknown[] }) => {
        seen.push(body.queries)
        return {
          results: body.queries.map((q) => {
            const qq = q as { dev_id: string; tag: string }
            return { dev_id: qq.dev_id, tag: qq.tag, count: 1, points: [{ ts: NOW, value: 1 }] }
          }),
        }
      }),
    })
    const c = createBiCollector(deps)
    const r = await c.collect({ json: many })
    expect(seen).toHaveLength(2)
    expect((seen[0] as unknown[]).length).toBe(32)
    expect((seen[1] as unknown[]).length).toBe(8)
    expect(r.panels).toBe(40)
    expect(deps.write).toHaveBeenCalledTimes(40)
  })
})

describe('BI 收集器：面板规格与契约层同源', () => {
  it('collectBiPanels 对同一画面产出稳定规格（收集器不另搞一套解析）', () => {
    const panels = collectBiPanels(TWO_PANELS)
    expect(panels).toHaveLength(2)
    const first: BiPanelSpec = panels[0]
    expect(first.id).toBe('bi-kpi')
    expect(first.series[0].dev_id).toBe('d1')
  })

  it('options.now 覆盖时间源（测试可控）', async () => {
    const deps = makeDeps()
    const opts: BiCollectorOptions = { now: () => 123 }
    const c = createBiCollector(deps, opts)
    await c.collect(TWO_PANELS)
    const body = deps.fetchBatch.mock.calls[0][0] as { queries: Array<{ end: number }> }
    expect(body.queries[0].end).toBe(123)
  })
})
