// BI 契约层单测（TDD 红→绿）：规格解析 / 查询计划 / 分批 / 信封组装。
//
// 契约层是 lib 与 symbols 两侧共享的**唯一事实源**（src/lib/bi-contract.ts）：
// 宿主聚合收集器（lib）按它产出查询计划与结果信封，图表图元（symbols）按它
// 解析信封渲染。check-layers 以 SYMBOLS_LIB_ALLOWLIST 白名单放行 symbols →
// bi-contract 这一个文件（纯类型 + 纯函数，无网络/无 maotu 依赖）。
//
// 契约要点（设计见 docs/plans/2026-10-29-bi-monitoring-dashboard-design.md）：
// - 通道 B 数据走 maotu props 直写（props.data.val 写 JSON 串），信封是唯一载荷形状
// - 累计量（cumulative）走**双窗 last 差**求窗口增量（后端 REST 未暴露 First 聚合）
// - shape=aggregate 取单值（KPI/排名/占比），shape=series 取时间序列（趋势/热力）
import { describe, it, expect } from 'vitest'
import {
  BI_MAX_BATCH,
  buildEnvelopes,
  chunkQueries,
  collectBiPanels,
  parseSeriesSpec,
  planQueries,
  type BiPanelSpec,
  type BiQueryPlan,
  type BiSeriesSpec,
} from './bi-contract'

const AGG = 'avg' as const

/** 造一个 pel（done_json 元素，保存态 props 为平面值） */
function pel(id: string, tag: string, props: Record<string, unknown>): Record<string, unknown> {
  return { id, tag, type: 'vue', props }
}

/** 造一个 BI panel 的 props 平面值 */
function panelProps(o: {
  series?: unknown
  agg?: string
  interval?: number
  windowSecs?: number
  shape?: string
}): Record<string, unknown> {
  return {
    series: o.series ?? '[{"dev_id":"d1","tag":"power"}]',
    agg: o.agg ?? AGG,
    interval: o.interval ?? 0,
    windowSecs: o.windowSecs ?? 3600,
    shape: o.shape ?? 'aggregate',
  }
}

describe('BI 契约：序列规格解析', () => {
  it('JSON 串 → 规格数组；label/unit 缺省回落 dev_id.tag / 空串', () => {
    const spec = parseSeriesSpec('[{"dev_id":"d1","tag":"power"}]')
    expect(spec).toEqual([
      { dev_id: 'd1', tag: 'power', label: 'd1.power', unit: '', mode: 'instant', color: '' },
    ])
  })

  it('mode 显式 cumulative 时保留；非法 mode 回落 instant', () => {
    expect(parseSeriesSpec('[{"dev_id":"d1","tag":"e","mode":"cumulative"}]')[0].mode).toBe('cumulative')
    expect(parseSeriesSpec('[{"dev_id":"d1","tag":"e","mode":"weird"}]')[0].mode).toBe('instant')
  })

  it('坏 JSON / 非数组 / 空串 → 空数组（组态中途态不炸）', () => {
    expect(parseSeriesSpec('{oops')).toEqual([])
    expect(parseSeriesSpec('{"a":1}')).toEqual([])
    expect(parseSeriesSpec('')).toEqual([])
    expect(parseSeriesSpec(undefined)).toEqual([])
  })

  it('缺 dev_id 或 tag 的条目丢弃；已解析数组形态直接受理', () => {
    expect(parseSeriesSpec('[{"dev_id":"d1"},{"tag":"t"}]')).toEqual([])
    const arr: BiSeriesSpec[] = [{ dev_id: 'd9', tag: 'x', label: 'L', unit: 'kW', mode: 'instant', color: '' }]
    expect(parseSeriesSpec(arr)).toEqual(arr)
  })
})

describe('BI 契约：面板扫描（collectBiPanels）', () => {
  it('只收 ah-bi- 前缀 pel；非 BI pel 忽略', () => {
    const done = {
      json: [
        pel('bi-kpi-1', 'ah-bi-kpi', panelProps({})),
        pel('pump-1', 'ah-pump-centrifugal', { fill: '#fff' }),
      ],
    }
    const panels = collectBiPanels(done)
    expect(panels).toHaveLength(1)
    expect(panels[0].id).toBe('bi-kpi-1')
    expect(panels[0].agg).toBe(AGG)
    expect(panels[0].windowSecs).toBe(3600)
    expect(panels[0].shape).toBe('aggregate')
    expect(panels[0].series).toHaveLength(1)
  })

  it('只扫顶层 pel：组合（group）内的 BI 图元不进扫描面（setItemAttrByID 定位不到）', () => {
    const done = {
      json: [
        { id: 'g1', tag: 'group', type: 'group', props: {}, children: [pel('bi-in-group', 'ah-bi-kpi', panelProps({}))] },
      ],
    }
    expect(collectBiPanels(done)).toEqual([])
  })

  it('series 为空的 pel 不产出面板（无查询可发）', () => {
    const done = { json: [pel('bi-1', 'ah-bi-kpi', panelProps({ series: '[]' }))] }
    expect(collectBiPanels(done)).toEqual([])
  })

  it('interval/shape 非法值兜底（shape 非法 → aggregate；interval 非正 → 0）', () => {
    const done = { json: [pel('bi-1', 'ah-bi-kpi', panelProps({ shape: 'weird', interval: -5 }))] }
    const panels = collectBiPanels(done)
    expect(panels[0].shape).toBe('aggregate')
    expect(panels[0].interval).toBe(0)
  })
})

describe('BI 契约：查询计划（planQueries）', () => {
  const now = 1_800_000_000

  it('instant + aggregate → 单条查询（agg + interval=窗口长，落一桶）', () => {
    const panels = collectBiPanels({
      json: [pel('bi-1', 'ah-bi-kpi', panelProps({ series: '[{"dev_id":"d1","tag":"power"}]', windowSecs: 3600 }))],
    })
    const q = planQueries(panels, now)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({
      panelId: 'bi-1', seriesIndex: 0, slot: 'main',
      dev_id: 'd1', tag: 'power',
      start: now - 3600, end: now, agg: AGG, interval: 3600,
    })
  })

  it('cumulative 用 raw 单查询（分段累加需逐点，见 cumulative 语义注释）', () => {
    const panels = collectBiPanels({
      json: [pel('bi-1', 'ah-bi-kpi', panelProps({
        series: '[{"dev_id":"d1","tag":"energy","mode":"cumulative"}]', windowSecs: 3600,
      }))],
    })
    const q = planQueries(panels, now)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ slot: 'main', start: now - 3600, end: now, agg: null, interval: 0 })
  })

  it('daily → 单条 last 查询（周期累计计数器取当前值，不做差）', () => {
    const panels = collectBiPanels({
      json: [pel('bi-1', 'ah-bi-kpi', panelProps({
        series: '[{"dev_id":"d1","tag":"energy_today","mode":"daily"}]', windowSecs: 86400,
      }))],
    })
    const q = planQueries(panels, now)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ agg: 'last', interval: 86400, start: now - 86400, end: now })
  })

  it('shape=series → 降采样查询（interval=桶宽），instant 用声明的 agg', () => {
    const panels = collectBiPanels({
      json: [pel('bi-1', 'ah-bi-trend', panelProps({
        series: '[{"dev_id":"d1","tag":"power"}]', shape: 'series', agg: 'max', interval: 60, windowSecs: 3600,
      }))],
    })
    const q = planQueries(panels, now)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ agg: 'max', interval: 60, start: now - 3600, end: now })
  })

  it('shape=series + interval 非正 → 兜底桶宽（防 raw 爆量）', () => {
    const panels = collectBiPanels({
      json: [pel('bi-1', 'ah-bi-trend', panelProps({ shape: 'series', interval: 0, windowSecs: 3600 }))],
    })
    const q = planQueries(panels, now)
    expect(q[0].interval).toBeGreaterThan(0)
    expect(q[0].interval).toBeLessThanOrEqual(3600)
  })

  it('cumulative + shape=series → 单条 last 降采样（累计曲线）', () => {
    const panels = collectBiPanels({
      json: [pel('bi-1', 'ah-bi-trend', panelProps({
        series: '[{"dev_id":"d1","tag":"energy","mode":"cumulative"}]', shape: 'series', interval: 300, windowSecs: 3600,
      }))],
    })
    const q = planQueries(panels, now)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ agg: 'last', interval: 300 })
  })
})

describe('BI 契约：分批（chunkQueries）', () => {
  it('≤32 条一批；>32 条拆多批且全局顺序保持', () => {
    const mk = (n: number): BiQueryPlan[] =>
      Array.from({ length: n }, (_, i) => ({
        panelId: `p${i}`, seriesIndex: 0, slot: 'main' as const,
        dev_id: 'd1', tag: 't', start: 0, end: 1, agg: 'avg' as const, interval: 1,
      }))
    const q = mk(70)
    const chunks = chunkQueries(q)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(32)
    expect(chunks[2]).toHaveLength(6)
    expect(chunks.flat()).toEqual(q)
  })

  it('空计划 → 无批次', () => {
    expect(chunkQueries([])).toEqual([])
    expect(BI_MAX_BATCH).toBe(32)
  })
})

describe('BI 契约：信封组装（buildEnvelopes）', () => {
  const now = 1_800_000_000
  const panels = (): BiPanelSpec[] => collectBiPanels({
    json: [
      pel('bi-kpi', 'ah-bi-kpi', panelProps({ series: '[{"dev_id":"d1","tag":"power","unit":"kW"}]' })),
      pel('bi-delta', 'ah-bi-kpi', panelProps({ series: '[{"dev_id":"d1","tag":"energy","mode":"cumulative"}]' })),
      pel('bi-trend', 'ah-bi-trend', panelProps({
        series: '[{"dev_id":"d1","tag":"power"}]', shape: 'series', interval: 60,
      })),
    ],
  })

  it('aggregate 单值装配（value 取桶值），信封带窗口与指标口径', () => {
    const ps = panels()
    const q = planQueries(ps, now)
    const results = q.map((x) => ({
      dev_id: x.dev_id, tag: x.tag, count: 1,
      points: [{ ts: x.start, value: 42 }],
    }))
    const envs = buildEnvelopes(ps, q, results, now)
    const kpi = envs.get('bi-kpi')!
    expect(kpi.v).toBe(1)
    expect(kpi.window).toEqual({ start: now - 3600, end: now })
    expect(kpi.series).toHaveLength(1)
    expect(kpi.series[0]).toMatchObject({ key: 'd1.power', label: 'd1.power', unit: 'kW', mode: 'instant', metric: AGG })
    expect(kpi.series[0].value).toBe(42)
    expect(kpi.series[0].points).toEqual([])
  })

  it('cumulative 分段累加（无回退时 = 末值 − 首值）', () => {
    const ps = collectBiPanels({
      json: [pel('bi-delta', 'ah-bi-kpi', panelProps({
        series: '[{"dev_id":"d1","tag":"energy","mode":"cumulative"}]', windowSecs: 3600,
      }))],
    })
    const q = planQueries(ps, now)
    const results = [{
      dev_id: 'd1', tag: 'energy', count: 2,
      points: [{ ts: 1, value: 90 }, { ts: 2, value: 100 }],
    }]
    const envs = buildEnvelopes(ps, q, results, now)
    const d = envs.get('bi-delta')!
    expect(d.series[0].metric).toBe('usage')
    expect(d.series[0].value).toBe(10)
  })

  it('cumulative 分段累加：回退点切段，段内增量求和（表计复位后不出现负用量）', () => {
    const ps = collectBiPanels({
      json: [pel('bi-delta', 'ah-bi-kpi', panelProps({
        series: '[{"dev_id":"d1","tag":"energy","mode":"cumulative"}]', windowSecs: 3600,
      }))],
    })
    const q = planQueries(ps, now)
    // 序列：10 → 16.59（段1 增量 6.59）→ 复位到 10 → 10.32（段2 增量 0.32）
    const results = [{
      dev_id: 'd1', tag: 'energy', count: 4,
      points: [
        { ts: 1, value: 10 }, { ts: 2, value: 16.59 },
        { ts: 3, value: 10 }, { ts: 4, value: 10.32 },
      ],
    }]
    const envs = buildEnvelopes(ps, q, results, now)
    const d = envs.get('bi-delta')!
    expect(d.series[0].value).toBeCloseTo(6.91, 6)
    expect(d.series[0].value).toBeGreaterThan(0)
  })

  it('daily 取末值原样（周期累计计数器的当前值，不做差）', () => {
    const ps = collectBiPanels({
      json: [pel('bi-d', 'ah-bi-kpi', panelProps({
        series: '[{"dev_id":"d1","tag":"energy_today","mode":"daily"}]', windowSecs: 86400,
      }))],
    })
    const q = planQueries(ps, now)
    const results = [{ dev_id: 'd1', tag: 'energy_today', count: 1, points: [{ ts: 1, value: 10.32 }] }]
    const envs = buildEnvelopes(ps, q, results, now)
    expect(envs.get('bi-d')!.series[0].value).toBe(10.32)
    expect(envs.get('bi-d')!.series[0].metric).toBe('current')
  })

  it('shape=series 装配时间序列点（非数值点丢弃）', () => {
    const ps = panels()
    const q = planQueries(ps, now)
    const results = q.map((x) => ({
      dev_id: x.dev_id, tag: x.tag, count: 2,
      points: [{ ts: 1, value: 3 }, { ts: 2, value: 'oops' }],
    }))
    const envs = buildEnvelopes(ps, q, results, now)
    const t = envs.get('bi-trend')!
    expect(t.series[0].points).toEqual([{ ts: 1, value: 3 }])
    expect(t.series[0].value).toBeNull()
  })

  it('单条查询失败 → 该 series 带 error，其余 series 不受影响（单图失败不拖全屏）', () => {
    const ps = panels()
    const q = planQueries(ps, now)
    const results = q.map((x) =>
      x.slot === 'main' && x.panelId === 'bi-kpi'
        ? { dev_id: x.dev_id, tag: x.tag, error: 'bad request: xxx' }
        : { dev_id: x.dev_id, tag: x.tag, count: 1, points: [{ ts: x.start, value: 5 }] })
    const envs = buildEnvelopes(ps, q, results, now)
    expect(envs.get('bi-kpi')!.series[0].error).toBe('bad request: xxx')
    expect(envs.get('bi-kpi')!.series[0].value).toBeNull()
    expect(envs.get('bi-trend')!.series[0].error).toBeNull()
  })

  it('cumulative 查询失败 → error 透出（不静默给 0）', () => {
    const ps = collectBiPanels({
      json: [pel('bi-delta', 'ah-bi-kpi', panelProps({
        series: '[{"dev_id":"d1","tag":"energy","mode":"cumulative"}]', windowSecs: 3600,
      }))],
    })
    const q = planQueries(ps, now)
    const results = [{ dev_id: 'd1', tag: 'energy', error: 'boom' }]
    const envs = buildEnvelopes(ps, q, results, now)
    const d = envs.get('bi-delta')!
    expect(d.series[0].value).toBeNull()
    expect(d.series[0].error).toBe('boom')
  })

  it('空结果（窗口无采样）→ value null 且无 error（不是 0 值）', () => {
    const ps = panels()
    const q = planQueries(ps, now)
    const results = q.map((x) => ({ dev_id: x.dev_id, tag: x.tag, count: 0, points: [] }))
    const envs = buildEnvelopes(ps, q, results, now)
    expect(envs.get('bi-kpi')!.series[0].value).toBeNull()
    expect(envs.get('bi-kpi')!.series[0].error).toBeNull()
  })
})
