// P2 BI 图元族契约测试（结构 + 组件行为）。
//
// 覆盖三类契约：
// 1. 结构：注册项在 registry + 组件表、lint 全绿、props 描述符与组件 props 一一对应
// 2. 数据通道：信封（props.data）→ 渲染（组件侧 watch → 解析 → 画/显示）
// 3. 边界：空信封 / 无值 / 单条报错——局部失败不拖全屏
//
// echarts 以模块 mock 替身（jsdom 无 canvas）——断言的是「数据进了 setOption」
// 与「DOM 呈现了什么」，不是像素（像素断言归 e2e）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive, type Component } from 'vue'
import { lintSymbol } from './symbol-lint'
import { allSymbols } from './registry'
import { VUE_SYMBOL_COMPONENTS, vueTagFor } from './index'
import { biKpi } from './bi-kpi'
import { biTrend } from './bi-trend'
import { biRank } from './bi-rank'
import { biPie } from './bi-pie'
import { biStack } from './bi-stack'
import { biHeat } from './bi-heat'
import { biTable } from './bi-table'
import { biSpike, spikeThreshold } from './bi-spike'
import { biAlarms } from './bi-alarms'
import { biWindow } from './bi-window'
import AhBiKpi from './AhBiKpi.vue'
import AhBiSpike from './AhBiSpike.vue'
import AhBiAlarms from './AhBiAlarms.vue'
import AhBiWindow from './AhBiWindow.vue'
import AhBiTrend from './AhBiTrend.vue'
import AhBiRank from './AhBiRank.vue'
import AhBiPie from './AhBiPie.vue'
import AhBiStack from './AhBiStack.vue'
import AhBiHeat from './AhBiHeat.vue'
import AhBiTable from './AhBiTable.vue'
import type { HmiSymbol } from './types'

// ---- echarts 模块替身（jsdom 无 canvas；替身必须先于组件导入生效）----
const echartsMock = vi.hoisted(() => {
  const chart = { setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn(), clear: vi.fn() }
  return { chart, core: { use: vi.fn(), init: vi.fn(() => chart) } }
})
vi.mock('echarts/core', () => echartsMock.core)
vi.mock('echarts/charts', () => ({
  LineChart: {}, BarChart: {}, PieChart: {}, HeatmapChart: {},
}))
vi.mock('echarts/components', () => ({
  GridComponent: {}, LegendComponent: {}, TooltipComponent: {}, VisualMapComponent: {},
  MarkLineComponent: {},
}))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))

/** jsdom 实挂载 harness（同 meters-batch：props 归宿主所有，改宿主 state 才是绑定形态） */
function mountReactive(comp: unknown, initial: Record<string, unknown>) {
  const state = reactive({ ...initial })
  const set = (k: string, v: unknown): void => { state[k] = v }
  const wrapper = defineComponent({
    setup() {
      return () => h(comp as Component, { ...state })
    },
  })
  const el = document.createElement('div')
  const app = createApp(wrapper)
  app.mount(el)
  return { el, set, unmount: () => app.unmount() }
}

/** 构造信封 JSON 串 */
function envelope(series: Array<Record<string, unknown>>): string {
  return JSON.stringify({
    v: 1,
    window: { start: 1_800_000_000 - 3600, end: 1_800_000_000 },
    generatedAt: 1_800_000_000,
    series,
  })
}

const ONE_VALUE = envelope([{
  key: 'd1.power', label: '1#电表', unit: 'kW', color: '#f5a623',
  mode: 'instant', metric: 'avg', value: 1.5, points: [], error: null,
}])

const TWO_POINTS = envelope([
  {
    key: 'd1.power', label: '1#电表', unit: 'kW', color: '#f5a623',
    mode: 'instant', metric: 'avg', value: null,
    points: [{ ts: 1_800_000_000, value: 2.5 }], error: null,
  },
])

// ---- 结构契约：7 个 BI 图元 ----
const FAMILY: Array<[string, HmiSymbol, unknown]> = [
  ['KPI 数字卡', biKpi, AhBiKpi],
  ['多序列趋势图', biTrend, AhBiTrend],
  ['排名条形图', biRank, AhBiRank],
  ['占比环图', biPie, AhBiPie],
  ['构成堆叠条', biStack, AhBiStack],
  ['时段热力图', biHeat, AhBiHeat],
  ['明细数据表', biTable, AhBiTable],
  ['尖峰柱图', biSpike, AhBiSpike],
]

describe.each(FAMILY)('BI 图元：%s', (_name, s, comp) => {
  it('过约定 lint（fill 承载位 / 宽高 / 描述符三键 / 缩略图锚点 / 无空串）', () => {
    expect(lintSymbol(s)).toEqual([])
  })

  it('注册项已在 registry + 组件表（id↔PascalCase 名一一对应）', () => {
    expect(allSymbols()).toContain(s)
    expect(VUE_SYMBOL_COMPONENTS[vueTagFor(s.id)]).toBeDefined()
  })

  it('props 描述符与组件 props 名一一对应（jT 平面化直传，多余/缺失即静默失联）', () => {
    const declared = (comp as { props?: Record<string, unknown> }).props
      ? Object.keys((comp as { props: Record<string, unknown> }).props).sort()
      : []
    expect(declared).toEqual(Object.keys(s.props).sort())
  })

  it('id 带 ah-bi- 前缀（宿主据此识别「需聚合喂数」的图元）', () => {
    expect(s.id.startsWith('ah-bi-')).toBe(true)
  })

  it('数据通道 prop 为 textArea（JSON 串承载，jsonEdit 是坐标专用 UI）', () => {
    expect(s.props.data?.type).toBe('textArea')
    expect(s.props.series?.type).toBe('textArea')
  })

  it('series 默认值是合法 JSON 串（非空串）', () => {
    const raw = String(s.props.series?.val ?? '')
    expect(raw.length).toBeGreaterThan(0)
    expect(() => JSON.parse(raw)).not.toThrow()
  })
})

describe('BI 图元：KPI 数字卡（通道 B 读数渲染）', () => {
  beforeEach(() => {
    echartsMock.chart.setOption.mockClear()
  })

  it('信封 value → 大号读数 + 单位 + 标签', async () => {
    const { el, unmount } = mountReactive(AhBiKpi, { data: ONE_VALUE, fill: '#f5a623', title: '有功功率' })
    await nextTick()
    expect(el.textContent).toContain('1.5')
    expect(el.textContent).toContain('kW')
    expect(el.textContent).toContain('1#电表')
    unmount()
  })

  it('value=null → 显示 --（无数据不是 0）', async () => {
    const { el, unmount } = mountReactive(AhBiKpi, { data: envelope([{ key: 'k', label: 'X', value: null, points: [], error: null }]) })
    await nextTick()
    expect(el.textContent).toContain('--')
    unmount()
  })

  it('error 非空 → 展示错误文案（不静默）', async () => {
    const { el, unmount } = mountReactive(AhBiKpi, { data: envelope([{ key: 'k', label: 'X', value: null, points: [], error: 'boom' }]) })
    await nextTick()
    expect(el.textContent).toContain('boom')
    unmount()
  })

  it('空信封 → 空态占位', async () => {
    const { el, unmount } = mountReactive(AhBiKpi, { data: '[]' })
    await nextTick()
    expect(el.textContent).toContain('暂无历史数据')
    unmount()
  })
})

describe('BI 图元：趋势图（序列 → setOption）', () => {
  beforeEach(() => {
    echartsMock.chart.setOption.mockClear()
    echartsMock.core.init.mockClear()
  })

  it('挂载即初始化 echarts 并绘一次', () => {
    const { unmount } = mountReactive(AhBiTrend, { data: '[]' })
    expect(echartsMock.core.init).toHaveBeenCalledTimes(1)
    expect(echartsMock.chart.setOption).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('信封 points → 折线 series 的数据点', async () => {
    const { unmount } = mountReactive(AhBiTrend, { data: TWO_POINTS })
    await nextTick()
    const opt = echartsMock.chart.setOption.mock.calls.at(-1)![0] as { series: Array<{ data: unknown[] }> }
    expect(opt.series).toHaveLength(1)
    expect(opt.series[0].data).toHaveLength(1)
    unmount()
  })

  it('卸载 dispose（防 echarts 实例泄漏）', () => {
    const { unmount } = mountReactive(AhBiTrend, { data: '[]' })
    expect(echartsMock.chart.dispose).not.toHaveBeenCalled()
    unmount()
    expect(echartsMock.chart.dispose).toHaveBeenCalledTimes(1)
  })
})

describe('BI 图元：排名图（降序 + 无数据标注）', () => {
  beforeEach(() => {
    echartsMock.chart.setOption.mockClear()
  })

  it('多条序列按 value 降序入图（echarts 类目轴自下而上 → 反转后最大值在顶部）', async () => {
    const data = envelope([
      { key: 'a', label: 'A', value: 1, points: [], error: null },
      { key: 'b', label: 'B', value: 9, points: [], error: null },
    ])
    const { unmount } = mountReactive(AhBiRank, { data })
    await nextTick()
    const opt = echartsMock.chart.setOption.mock.calls.at(-1)![0] as { yAxis: { data: string[] } }
    // 类目轴 data 顺序 = 自下而上：B(9) 在下、A(1) 在上 → 最大值贴顶
    expect(opt.yAxis.data).toEqual(['A', 'B'])
    unmount()
  })

  it('全无值 → 空态提示（不画 0 长条图）', async () => {
    const data = envelope([{ key: 'a', label: 'A', value: null, points: [], error: null }])
    const { el, unmount } = mountReactive(AhBiRank, { data })
    await nextTick()
    expect(el.textContent).toContain('暂无历史数据')
    unmount()
  })
})

describe('BI 图元：占比环图（排除零值序列）', () => {
  beforeEach(() => {
    echartsMock.chart.setOption.mockClear()
  })

  it('value<=0 的序列不进环（不是 0 值饼块）', async () => {
    const data = envelope([
      { key: 'a', label: 'A', value: 5, points: [], error: null },
      { key: 'b', label: 'B', value: 0, points: [], error: null },
    ])
    const { unmount } = mountReactive(AhBiPie, { data })
    await nextTick()
    const opt = echartsMock.chart.setOption.mock.calls.at(-1)![0] as { series: Array<{ data: Array<{ name: string }> }> }
    expect(opt.series[0].data).toHaveLength(1)
    expect(opt.series[0].data[0].name).toBe('A')
    unmount()
  })

  it('全零/全空 → 空态提示', async () => {
    const data = envelope([{ key: 'a', label: 'A', value: null, points: [], error: null }])
    const { el, unmount } = mountReactive(AhBiPie, { data })
    await nextTick()
    expect(el.textContent).toContain('暂无历史数据')
    unmount()
  })
})

describe('BI 图元：构成堆叠条（占比 + 图例）', () => {
  beforeEach(() => {
    echartsMock.chart.setOption.mockClear()
  })

  it('多序列 → 百分比堆叠（x 轴上限 100）', async () => {
    const data = envelope([
      { key: 'a', label: '电', value: 25, points: [], error: null },
      { key: 'b', label: '水', value: 75, points: [], error: null },
    ])
    const { el, unmount } = mountReactive(AhBiStack, { data })
    await nextTick()
    const opt = echartsMock.chart.setOption.mock.calls.at(-1)![0] as { xAxis: { max: number }; series: Array<{ data: number[] }> }
    expect(opt.xAxis.max).toBe(100)
    expect(opt.series[0].data[0]).toBeCloseTo(25, 5)
    expect(opt.series[1].data[0]).toBeCloseTo(75, 5)
    expect(el.textContent).toContain('25.0%')
    unmount()
  })

  it('value=null 的序列不进构成（不谎报 0 占比）', async () => {
    const data = envelope([
      { key: 'a', label: '电', value: 25, points: [], error: null },
      { key: 'b', label: '水', value: null, points: [], error: null },
    ])
    const { el, unmount } = mountReactive(AhBiStack, { data })
    await nextTick()
    expect(el.textContent).not.toContain('水')
    unmount()
  })
})

describe('BI 图元：明细表（行渲染 + 局部失败）', () => {
  it('每条序列一行：标签/数值/单位/口径', async () => {
    const data = envelope([
      { key: 'a', label: '1#电表 功率', unit: 'kW', metric: 'avg', value: 1.5, points: [], error: null },
      { key: 'b', label: '2#电表 功率', unit: 'kW', metric: 'avg', value: 2.5, points: [], error: null },
    ])
    const { el, unmount } = mountReactive(AhBiTable, { data })
    await nextTick()
    const rows = Array.from(el.querySelectorAll('tbody tr'))
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('1#电表 功率')
    expect(rows[0].textContent).toContain('1.5')
    expect(rows[1].textContent).toContain('2.5')
    unmount()
  })

  it('单行报错只标该行，其余行照常（局部失败不拖全屏）', async () => {
    const data = envelope([
      { key: 'a', label: '好的', unit: 'kW', metric: 'avg', value: 1.5, points: [], error: null },
      { key: 'b', label: '坏的', unit: 'kW', metric: 'avg', value: null, points: [], error: 'boom' },
    ])
    const { el, unmount } = mountReactive(AhBiTable, { data })
    await nextTick()
    const rows = Array.from(el.querySelectorAll('tbody tr'))
    expect(rows).toHaveLength(2)
    expect(rows[1].textContent).toContain('boom')
    expect(rows[1].className).toContain('err')
    expect(rows[0].className).not.toContain('err')
    unmount()
  })
})

describe('BI 图元：热力图（桶对齐）', () => {
  beforeEach(() => {
    echartsMock.chart.setOption.mockClear()
  })

  it('多条序列 → 矩阵格（x 桶 × y 序列）', async () => {
    const data = envelope([
      { key: 'a', label: 'A', value: null, points: [{ ts: 100, value: 1 }, { ts: 200, value: 2 }], error: null },
      { key: 'b', label: 'B', value: null, points: [{ ts: 100, value: 3 }], error: null },
    ])
    const { unmount } = mountReactive(AhBiHeat, { data })
    await nextTick()
    const opt = echartsMock.chart.setOption.mock.calls.at(-1)![0] as { series: Array<{ data: unknown[][] }> }
    expect(opt.series[0].data).toHaveLength(3) // 2 桶 + 1 桶
    unmount()
  })

  it('无序列点 → 空态提示', async () => {
    const { el, unmount } = mountReactive(AhBiHeat, { data: '[]' })
    await nextTick()
    expect(el.textContent).toContain('暂无历史数据')
    unmount()
  })
})

describe('BI 图元：刷新节流与陈旧数据', () => {
  it('宿主写回新信封 → 组件重绘（数据通道闭环）', async () => {
    const { set, unmount } = mountReactive(AhBiTrend, { data: '[]' })
    echartsMock.chart.setOption.mockClear()
    set('data', TWO_POINTS)
    await nextTick()
    expect(echartsMock.chart.setOption).toHaveBeenCalled()
    unmount()
  })

  it('坏 JSON 信封 → 组件不炸（降级为空态）', async () => {
    const { el, unmount } = mountReactive(AhBiKpi, { data: '{not json' })
    await nextTick()
    expect(el.textContent).toContain('暂无历史数据')
    unmount()
  })
})

// ---- 补三件（2026-10-29）：尖峰柱图行为 + 无 series 面板（告警/窗口切换）----

const SPIKE_POINTS = envelope([
  {
    key: 'd1.power', label: '1#电表', unit: 'kW', color: '#f5a623',
    mode: 'instant', metric: 'avg', value: null,
    points: [
      { ts: 1_800_000_000 - 300, value: 1 },
      { ts: 1_800_000_000 - 240, value: 2 },
      { ts: 1_800_000_000 - 180, value: 9 },
      { ts: 1_800_000_000 - 120, value: 3 },
      { ts: 1_800_000_000 - 60, value: 2 },
    ],
    error: null,
  },
])

describe('BI 图元：尖峰柱图（阈值着色）', () => {
  beforeEach(() => {
    echartsMock.chart.setOption.mockClear()
  })

  it('信封 points → 柱数据；≥阈值的桶染尖峰色', async () => {
    const { unmount } = mountReactive(AhBiSpike, { data: SPIKE_POINTS, fill: '#f5a623', spikeMode: 'p90' })
    await nextTick()
    const opt = echartsMock.chart.setOption.mock.calls.at(-1)![0] as {
      series: Array<{ data: Array<{ itemStyle: { color: string } }> }>
    }
    expect(opt.series[0].data).toHaveLength(5)
    const colors = opt.series[0].data.map((d) => d.itemStyle.color)
    expect(colors.filter((c) => c === '#f85149')).toHaveLength(1) // 只有 9 超过 p90=3
    unmount()
  })

  it('阈值虚线画在第一条柱序列上（markLine.yAxis = p90）', async () => {
    const { unmount } = mountReactive(AhBiSpike, { data: SPIKE_POINTS, spikeMode: 'p90' })
    await nextTick()
    const opt = echartsMock.chart.setOption.mock.calls.at(-1)![0] as {
      series: Array<{ markLine?: { data: Array<{ yAxis: number }> } }>
    }
    // 值 [1,2,3,9,2] → p90 nearest-rank = ceil(4.5)=5 位 = 9? 排序 [1,2,2,3,9] 第 5 位 = 9
    expect(opt.series[0].markLine?.data[0].yAxis).toBe(9)
    unmount()
  })

  it('fixed 模式阈值非正 → 不画 markLine（不染尖峰）', async () => {
    const { unmount } = mountReactive(AhBiSpike, { data: SPIKE_POINTS, spikeMode: 'fixed', spikeThreshold: 0 })
    await nextTick()
    const opt = echartsMock.chart.setOption.mock.calls.at(-1)![0] as {
      series: Array<{ markLine?: unknown; data: Array<{ itemStyle: { color: string } }> }>
    }
    expect(opt.series[0].markLine).toBeUndefined()
    expect(opt.series[0].data.every((d) => d.itemStyle.color !== '#f85149')).toBe(true)
    unmount()
  })

  it('空信封 → 空态提示（不初始化空柱）', async () => {
    const { el, unmount } = mountReactive(AhBiSpike, { data: '[]' })
    await nextTick()
    expect(el.textContent).toContain('暂无历史数据')
    unmount()
  })
})

describe('spikeThreshold（纯函数）', () => {
  it('p90 = 升序第 ceil(0.9n) 位（nearest-rank）', () => {
    expect(spikeThreshold([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'p90', 2, 0)).toBe(9)
    expect(spikeThreshold([5], 'p90', 2, 0)).toBe(5)
  })

  it('times = 均值 × 倍数（非正倍数回落 2）', () => {
    expect(spikeThreshold([2, 4], 'times', 3, 0)).toBeCloseTo(9, 6)
    expect(spikeThreshold([2, 4], 'times', -1, 0)).toBeCloseTo(6, 6)
  })

  it('fixed 正值直通；非正 → null；空数据 → null', () => {
    expect(spikeThreshold([1, 2], 'fixed', 2, 7.5)).toBe(7.5)
    expect(spikeThreshold([1, 2], 'fixed', 2, 0)).toBeNull()
    expect(spikeThreshold([], 'p90', 2, 0)).toBeNull()
  })
})

// 无 series 面板族（不吃历史信封）：告警统计 / 窗口切换器
const CONTROL_FAMILY: Array<[string, HmiSymbol, unknown]> = [
  ['告警统计', biAlarms, AhBiAlarms],
  ['窗口切换器', biWindow, AhBiWindow],
]

describe.each(CONTROL_FAMILY)('BI 控制面板：%s', (_name, s, comp) => {
  it('过约定 lint + 已注册 + props 一一对应', () => {
    expect(lintSymbol(s)).toEqual([])
    expect(allSymbols()).toContain(s)
    expect(VUE_SYMBOL_COMPONENTS[vueTagFor(s.id)]).toBeDefined()
    const declared = (comp as { props?: Record<string, unknown> }).props
      ? Object.keys((comp as { props: Record<string, unknown> }).props).sort()
      : []
    expect(declared).toEqual(Object.keys(s.props).sort())
  })

  it('id 带 ah-bi- 前缀 + 无 series prop（不吃历史信封）', () => {
    expect(s.id.startsWith('ah-bi-')).toBe(true)
    expect(s.props.series).toBeUndefined()
    expect(s.props.data?.type).toBe('textArea')
  })
})

describe('BI 图元：告警统计面板', () => {
  const ALARM_ENV = JSON.stringify({
    v: 1, generatedAt: 1_800_000_000, total: 3,
    levels: [{ level: 'error', count: 1 }, { level: 'warn', count: 2 }, { level: 'info', count: 0 }],
    sources: [{ source: 'dev-a.power', count: 2 }, { source: 'dev-b.flow', count: 1 }],
    latest: [
      { key: 'k2', level: 'error', source: 'dev-a.power', message: '超上限', ts: 1_800_000_000, count: 2 },
      { key: 'k1', level: 'warn', source: 'dev-b.flow', message: '流量波动', ts: 1_799_999_000, count: 1 },
    ],
  })

  it('告警信封 → 总数 + 分级 + 来源 + 最新列表', async () => {
    const { el, unmount } = mountReactive(AhBiAlarms, { data: ALARM_ENV, title: '活动告警' })
    await nextTick()
    const t = el.textContent ?? ''
    expect(t).toContain('3')
    expect(t).toContain('严重')
    expect(t).toContain('警告')
    expect(t).toContain('dev-a.power')
    expect(t).toContain('超上限')
    expect(t).toContain('×2')
    unmount()
  })

  it('total=0 → 安宁态（无活动告警，不是空数据）', async () => {
    const env = JSON.stringify({
      v: 1, generatedAt: 1, total: 0,
      levels: [{ level: 'error', count: 0 }, { level: 'warn', count: 0 }, { level: 'info', count: 0 }],
      sources: [], latest: [],
    })
    const { el, unmount } = mountReactive(AhBiAlarms, { data: env })
    await nextTick()
    expect(el.textContent).toContain('无活动告警')
    unmount()
  })

  it('坏 JSON → 空数据占位（与「无告警」区分）', async () => {
    const { el, unmount } = mountReactive(AhBiAlarms, { data: '{bad' })
    await nextTick()
    expect(el.textContent).toContain('暂无告警数据')
    expect(el.textContent).not.toContain('无活动告警')
    unmount()
  })
})

describe('BI 图元：窗口切换器', () => {
  it('options JSON → 档位按钮；点击发全局事件（detail.secs）', async () => {
    const got: Array<number | undefined> = []
    const onEvt = (e: Event): void => { got.push((e as CustomEvent<{ secs?: number }>).detail?.secs) }
    window.addEventListener('ah-bi-window-change', onEvt)
    try {
      const { el, unmount } = mountReactive(AhBiWindow, {
        options: '[{"label":"默认","secs":0},{"label":"1时","secs":3600}]',
        fill: '#f5a623',
      })
      await nextTick()
      const btns = Array.from(el.querySelectorAll('button'))
      expect(btns.map((b) => b.textContent)).toEqual(['默认', '1时'])
      ;(btns[1] as HTMLButtonElement).click()
      await nextTick()
      expect(got).toEqual([3600])
      unmount()
    } finally {
      window.removeEventListener('ah-bi-window-change', onEvt)
    }
  })

  it('宿主写回 {"activeSecs":86400} → 对应档位高亮（回显权威在宿主）', async () => {
    const { el, set, unmount } = mountReactive(AhBiWindow, {
      options: '[{"label":"默认","secs":0},{"label":"24时","secs":86400}]',
      data: '[]',
    })
    await nextTick()
    // 未写回时 activeSecs=0 → 「默认」档高亮（面板自然态就是默认窗）
    const initial = Array.from(el.querySelectorAll('button')).find((b) => b.className.includes('on'))
    expect(initial?.textContent).toBe('默认')
    set('data', JSON.stringify({ activeSecs: 86400 }))
    await nextTick()
    const on = Array.from(el.querySelectorAll('button')).find((b) => b.className.includes('on'))
    expect(on?.textContent).toBe('24时')
    unmount()
  })

  it('坏 options JSON → 缺省档（默认/1时/24时/7天）', async () => {
    const { el, unmount } = mountReactive(AhBiWindow, { options: '{bad' })
    await nextTick()
    const labels = Array.from(el.querySelectorAll('button')).map((b) => b.textContent)
    expect(labels).toEqual(['默认', '1时', '24时', '7天'])
    unmount()
  })
})
