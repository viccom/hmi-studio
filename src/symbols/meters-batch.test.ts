// P2 表计轮单测（A 趋势 + B 三表）：结构契约（快照/lint/注册/配对）+ 组件最小单测
// （jsdom 实挂载，vue 直接依赖——不引 @vue/test-utils 新依赖，harness 同 control-batch-b）。
// 趋势组件的 echarts 以模块 mock 替身（jsdom 无 canvas）——验证意图（规则 7）：
// bind 直写（宿主改 prop）→ watch → 环形缓冲 → setOption 数据、节流 ≥1s、卸载 dispose。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive, type Component } from 'vue'
import { lintSymbol } from '../lib/symbol-lint'
import { allSymbols } from './registry'
import { VUE_SYMBOL_COMPONENTS, vueTagFor } from './index'
import { trendChart } from './trend-chart'
import AhTrendChart from './AhTrendChart.vue'
import type { HmiSymbol } from './types'

// ---- echarts 模块替身（jsdom 无 canvas；替身必须先于组件导入生效——vi.mock 自动提升） ----
const echartsMock = vi.hoisted(() => {
  const chart = { setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn() }
  return { chart, core: { use: vi.fn(), init: vi.fn(() => chart) } }
})
vi.mock('echarts/core', () => echartsMock.core)
vi.mock('echarts/charts', () => ({ LineChart: {} }))
vi.mock('echarts/components', () => ({ GridComponent: {} }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// ---- 结构契约：趋势图表 ----
describe('趋势图表（P2-A trend）', () => {
  it('结构快照（ILeftAsideConfigItemPublic）', () => {
    expect(trendChart).toMatchSnapshot()
  })

  it('过约定 lint（fill 承载位 / 宽高 / 描述符三键 / 无空串）', () => {
    expect(lintSymbol(trendChart)).toEqual([])
  })

  it('注册项已在 registry + 组件表（id↔PascalCase 名一一对应）', () => {
    expect(allSymbols()).toContain(trendChart)
    expect(VUE_SYMBOL_COMPONENTS[vueTagFor(trendChart.id)]).toBeDefined()
  })

  it('props 描述符与组件 props 名一一对应（jT 平面化直传，多余/缺失名即静默失联）', () => {
    expect(Object.keys(AhTrendChart.props ?? {}).sort()).toEqual(Object.keys(trendChart.props).sort())
  })

  it('数据通道描述符为 number 型（tick 直写语义；VUE_EMPTY_STR 禁 input 空串的实测裁定）', () => {
    for (const k of ['tick0', 'tick1', 'tick2']) {
      expect(trendChart.props[k]?.type).toBe('number')
    }
    expect(trendChart.props.points?.type).toBe('textArea')
  })
})

// ---- jsdom 实挂载 harness（同 control-batch-b：props 归宿主所有，改宿主 state 才是绑定形态） ----
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
const text = (el: Element, sel: string): string => el.querySelector(sel)?.textContent ?? ''

const ONE_SERIES = JSON.stringify([{ field: 'home-meter-e1.power', label: '有功功率', unit: 'kW', color: '#f5a623' }])

describe('AhTrendChart 组件（数据通道机制组件侧背书）', () => {
  beforeEach(() => {
    echartsMock.core.init.mockClear()
    echartsMock.chart.setOption.mockClear()
    echartsMock.chart.dispose.mockClear()
    echartsMock.chart.resize.mockClear()
  })

  it('挂载即绘空网格（echarts.init + 首次 setOption），强调色上边框', () => {
    const { el, unmount } = mountReactive(AhTrendChart, { points: ONE_SERIES, tick0: 0, windowSecs: 600 })
    expect(echartsMock.core.init).toHaveBeenCalledTimes(1)
    expect(echartsMock.chart.setOption).toHaveBeenCalledTimes(1)
    expect((el.querySelector('.ah-trc') as HTMLElement).style.border).toContain('rgb(245, 166, 35)')
    unmount()
  })

  it('bind 直写 → watch → 缓冲 → setOption：值/点数/图例读数全链（宿主 set 模拟 setDevicePointByID 直写）', async () => {
    const { el, set, unmount } = mountReactive(AhTrendChart, { points: ONE_SERIES, tick0: 0, windowSecs: 600 })
    echartsMock.chart.setOption.mockClear()
    set('tick0', 1.234)
    await nextTick()
    // 首推即刻重绘（节流窗空闲）：数据点 = [到达时刻, 值]
    expect(echartsMock.chart.setOption).toHaveBeenCalledTimes(1)
    const data = echartsMock.chart.setOption.mock.calls[0][0].series[0].data
    expect(data).toHaveLength(1)
    expect(data[0][1]).toBe(1.234)
    // DOM 侧证据（e2e 同款断言面）：采样计数 + 图例最新值/单位
    expect(text(el, '.ah-trc-n')).toBe('1 点')
    expect(text(el, '.ah-trc-last')).toBe('1.234')
    expect(text(el, '.ah-trc-unit')).toBe('kW')
    unmount()
  })

  it('节流 ≥1s：1s 窗内的后续直写不立即重绘，尾随定时器补绘且数据不丢', async () => {
    const { el, set, unmount } = mountReactive(AhTrendChart, { points: ONE_SERIES, tick0: 0, windowSecs: 600 })
    set('tick0', 1)  // 消耗空闲节流窗
    await nextTick()
    echartsMock.chart.setOption.mockClear()
    set('tick0', 2.5)
    await nextTick()
    expect(echartsMock.chart.setOption).not.toHaveBeenCalled() // 1s 窗内静默
    await sleep(1100)
    expect(echartsMock.chart.setOption).toHaveBeenCalledTimes(1) // 尾随补绘恰好一次
    const data = echartsMock.chart.setOption.mock.calls[0][0].series[0].data
    expect(data).toHaveLength(2)
    expect(data[1][1]).toBe(2.5)
    expect(text(el, '.ah-trc-n')).toBe('2 点')
    unmount()
  })

  it('脏数据防御：非数直写拒收、未配置曲线的通道忽略（鬼点不入缓冲）', async () => {
    const { el, set, unmount } = mountReactive(AhTrendChart, { points: ONE_SERIES, tick0: 0, windowSecs: 600 })
    set('tick0', 5)
    await nextTick()
    set('tick0', 'RUN')
    set('tick1', 99)
    set('tick2', 99)
    await nextTick()
    expect(text(el, '.ah-trc-n')).toBe('1 点')
    unmount()
  })

  it('卸载 dispose（防 echarts 实例泄漏）', () => {
    const { unmount } = mountReactive(AhTrendChart, { points: ONE_SERIES, tick0: 0, windowSecs: 600 })
    expect(echartsMock.chart.dispose).not.toHaveBeenCalled()
    unmount()
    expect(echartsMock.chart.dispose).toHaveBeenCalledTimes(1)
  })
})
