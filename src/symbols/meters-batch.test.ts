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
import { powerGauge } from './power-gauge'
import { meterPanel } from './meter-panel'
import { waterMeter } from './water-meter'
import { gasMeter } from './gas-meter'
import AhTrendChart from './AhTrendChart.vue'
import AhPowerGauge from './AhPowerGauge.vue'
import AhMeterPanel from './AhMeterPanel.vue'
import AhWaterMeter from './AhWaterMeter.vue'
import AhGasMeter from './AhGasMeter.vue'
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
function mountComp(comp: unknown, props: Record<string, unknown> = {}) {
  const el = document.createElement('div')
  const app = createApp(comp as Parameters<typeof createApp>[0], props)
  app.mount(el)
  return { el, unmount: () => app.unmount() }
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

// ---- 结构契约：三表图元（P2-B） ----
const METER_FAMILY: [name: string, s: HmiSymbol, comp: unknown][] = [
  ['电表功率盘', powerGauge, AhPowerGauge],
  ['电表面板', meterPanel, AhMeterPanel],
  ['水表盘', waterMeter, AhWaterMeter],
  ['燃气表盘', gasMeter, AhGasMeter],
]

describe.each(METER_FAMILY)('%s（P2-B 表计）', (_name, s, comp) => {
  it('结构快照（ILeftAsideConfigItemPublic）', () => {
    expect(s).toMatchSnapshot()
  })

  it('过约定 lint（fill 承载位 / 宽高 / 描述符三键 / 无空串）', () => {
    expect(lintSymbol(s)).toEqual([])
  })

  it('注册项已在 registry + 组件表（id↔PascalCase 名一一对应）', () => {
    expect(allSymbols()).toContain(s)
    expect(VUE_SYMBOL_COMPONENTS[vueTagFor(s.id)]).toBeDefined()
  })

  it('props 描述符与组件 props 名一一对应（jT 平面化直传，多余/缺失名即静默失联）', () => {
    const declared = (comp as { props?: Record<string, unknown> }).props
      ? Object.keys((comp as { props: Record<string, unknown> }).props).sort()
      : []
    expect(declared).toEqual(Object.keys(s.props).sort())
  })
})

describe('AhPowerGauge 组件（电表功率盘）', () => {
  it('指针几何随 value 变化（0~5kW 线性角）；值读数与量程文本渲染', () => {
    const tip = (v: number) => {
      const { el, unmount } = mountComp(AhPowerGauge, { value: v })
      const line = el.querySelector('line[stroke-width="2.5"]')!
      const p = { x: Number(line.getAttribute('x2')), y: Number(line.getAttribute('y2')) }
      unmount()
      return p
    }
    expect(tip(0)).not.toEqual(tip(5))
    expect(tip(2.5)).not.toEqual(tip(0))
    const { el, unmount } = mountComp(AhPowerGauge, { value: 2.34 })
    expect(text(el, 'svg')).toContain('2.34')
    expect(text(el, 'svg')).toContain('0.0 ~ 5.0 kW')
    unmount()
  })
  it('>4.5kW 报警红弧静态常画（不依赖触发链，越线即入区）', () => {
    const { el, unmount } = mountComp(AhPowerGauge, { value: 0 })
    const alarmArc = el.querySelector('path[stroke="#f5222d"]')
    expect(alarmArc).not.toBeNull()
    unmount()
  })
  it('pulse bool → 盘角指示灯亮（触发链组件侧终点）：亮 #ff4d4f / 灭暗壳', () => {
    const lampFills = (pulse: boolean) => {
      const { el, unmount } = mountComp(AhPowerGauge, { value: 1, pulse })
      const fills = Array.from(el.querySelectorAll('circle')).map((c) => c.getAttribute('fill'))
      unmount()
      return fills
    }
    expect(lampFills(true)).toContain('#ff4d4f')
    expect(lampFills(false)).toContain('#262d36')
  })
  it('脏数据：非数 value → 读数 --，指针不飞出盘面（回落 0 角）', () => {
    const { el, unmount } = mountComp(AhPowerGauge, { value: 'RUN' })
    expect(text(el, 'svg')).toContain('--')
    unmount()
  })
})

describe('AhMeterPanel 组件（电表面板）', () => {
  it('五行数显渲染（电压/电流/有功/功率因数/频率），数值格式化随 bind 直写变化', async () => {
    const { el, set, unmount } = mountReactive(AhMeterPanel, { v: 220.5, i: 1.25, p: 0.275, pf: 0.92, freq: 50 })
    const rows = Array.from(el.querySelectorAll('.ah-mp-row')).map((r) => r.textContent)
    expect(rows).toHaveLength(5)
    expect(rows[0]).toContain('220.5')
    expect(rows[2]).toContain('0.275')
    set('v', 218.4)
    await nextTick()
    expect(Array.from(el.querySelectorAll('.ah-mp-row'))[0].textContent).toContain('218.4')
    unmount()
  })
  it('pulse bool → 脉冲灯 on/off 类切换（CSS 闪烁由类驱动）', async () => {
    const { el, set, unmount } = mountReactive(AhMeterPanel, { pulse: false })
    expect(el.querySelector('.ah-mp-led')?.className).toContain('off')
    set('pulse', true)
    await nextTick()
    expect(el.querySelector('.ah-mp-led')?.className).toContain('on')
    unmount()
  })
  it('status 非 0 → 告警黄（status 文本 + 边框色），0 → 正常（u16 直写语义）', async () => {
    const { el, set, unmount } = mountReactive(AhMeterPanel, { status: 0 })
    expect(text(el, '.ah-mp-status')).toContain('正常')
    set('status', 3)
    await nextTick()
    expect(text(el, '.ah-mp-status')).toContain('告警 3')
    expect((el.querySelector('.ah-mp') as HTMLElement).style.border).toContain('rgb(250, 173, 20)')
    unmount()
  })
})

describe('AhWaterMeter 组件（水表盘）', () => {
  it('字轮定宽 0000.000：整数位白底黑字 + 小数位红底白字，读数文本随 total 变化', () => {
    const { el, unmount } = mountComp(AhWaterMeter, { total: 12.5 })
    const cells = Array.from(el.querySelectorAll('rect[fill="#f5f5f5"]'))
    const decs = Array.from(el.querySelectorAll('rect[fill="#a40e0e"]'))
    expect(cells).toHaveLength(4)
    expect(decs).toHaveLength(3)
    // 字轮位逐格断言（g>text）：整数位补零 0012 + 小数位 500 = 机械字轮定宽
    const wheel = Array.from(el.querySelectorAll('g > text')).map((t) => t.textContent).join('')
    expect(wheel).toBe('0012500')
    unmount()
  })
  it('瞬时指针几何随 flow 变化（0~1 m³/h）', () => {
    const tip = (v: number) => {
      const { el, unmount } = mountComp(AhWaterMeter, { flow: v })
      const line = el.querySelector('line[stroke-width="2"]')!
      const p = { x: Number(line.getAttribute('x2')), y: Number(line.getAttribute('y2')) }
      unmount()
      return p
    }
    expect(tip(0)).not.toEqual(tip(1))
  })
  it('reverse_flag → 红色逆向标记显现（箭头 path + 字样），常态无', () => {
    const off = mountComp(AhWaterMeter, { reverse: false })
    expect(off.el.querySelector('path[stroke="#f5222d"]')).toBeNull()
    off.unmount()
    const on = mountComp(AhWaterMeter, { reverse: true })
    expect(on.el.querySelector('path[stroke="#f5222d"]')).not.toBeNull()
    expect(on.el.textContent).toContain('逆向流')
    on.unmount()
  })
})

describe('AhGasMeter 组件（燃气表盘）', () => {
  it('字轮读数 + 余额数显；余额 <20 → 橙色预警（关阀前兆），≥20 常态色', () => {
    const warn = mountComp(AhGasMeter, { total: 456.789, balance: 8.5 })
    expect(warn.el.textContent).toContain('0456.789')
    const warnText = Array.from(warn.el.querySelectorAll('text')).find((t) => t.textContent === '8.50')
    expect(warnText?.getAttribute('fill')).toBe('#faad14')
    expect(warn.el.textContent).toContain('余额不足')
    warn.unmount()
    const ok = mountComp(AhGasMeter, { total: 456.789, balance: 112, fill: '#e6f7ff' })
    const okText = Array.from(ok.el.querySelectorAll('text')).find((t) => t.textContent === '112.00')
    expect(okText?.getAttribute('fill')).toBe('#e6f7ff')
    ok.unmount()
  })
  it('阀门状态标：开绿/关红切换（bool 触发链组件侧终点）', () => {
    const open = mountComp(AhGasMeter, { valve: true })
    expect(open.el.textContent).toContain('阀 · 开')
    expect(open.el.querySelector('rect[stroke="#52c41a"]')).not.toBeNull()
    open.unmount()
    const closed = mountComp(AhGasMeter, { valve: false })
    expect(closed.el.textContent).toContain('阀 · 关')
    expect(closed.el.querySelector('rect[stroke="#f5222d"]')).not.toBeNull()
    closed.unmount()
  })
  it('泄漏报警灯红闪：leak → SMIL <animate> 显现（声明式动画随 SSR 串化入 dataURI——实测：模板内 <style> 被 SFC 编译器剥除，SMIL 是唯一通路）', () => {
    const off = mountComp(AhGasMeter, { leak: false })
    expect(off.el.querySelector('circle[fill="#262d36"]')).not.toBeNull()
    expect(off.el.querySelector('animate')).toBeNull()
    off.unmount()
    const on = mountComp(AhGasMeter, { leak: true })
    expect(on.el.querySelectorAll('animate')).toHaveLength(2)
    expect(on.el.querySelector('animate')?.getAttribute('repeatCount')).toBe('indefinite')
    on.unmount()
  })
})
