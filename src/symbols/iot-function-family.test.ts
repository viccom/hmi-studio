// 工业功能件（HP-HMI / ISA-101）图元契约 + 组件行为测试。
// 目的（规则 7 意图验证）：
// - 结构：快照 + lint + registry/组件表 + props 名与描述符一一对应（静默失联防线）
// - 行为：PV 数值/限值带/优先级色/质量文字/状态形状/报警计数/趋势采样，全部走
//   真实 props 下发（mountReactive 模拟 setDevicePointByID → jT 平面化 → props）
import { describe, it, expect } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive, type Component } from 'vue'
import { lintSymbol } from './symbol-lint'
import { allSymbols } from './registry'
import { VUE_SYMBOL_COMPONENTS, vueTagFor } from './index'
import type { HmiSymbol } from './types'
import { valueBlock } from './value-block'
import { sparkline } from './sparkline'
import { statusBadge } from './status-badge'
import { alarmBadge } from './alarm-badge'
import { qualityBadge } from './quality-badge'
import { pipe } from './pipe'
import { areaCard } from './area-card'
import { devFaceplate } from './dev-faceplate'
import { histTrend } from './hist-trend'
import AhValueBlock from './AhValueBlock.vue'
import AhSparkline from './AhSparkline.vue'
import AhStatusBadge from './AhStatusBadge.vue'
import AhAlarmBadge from './AhAlarmBadge.vue'
import AhQualityBadge from './AhQualityBadge.vue'
import AhAreaCard from './AhAreaCard.vue'
import AhDevFaceplate from './AhDevFaceplate.vue'
import AhHistTrend from './AhHistTrend.vue'
import { pushSample, sparkPoints, yOf } from './spark-buffer'

const FAMILY: Array<[string, HmiSymbol, Component]> = [
  ['值块', valueBlock, AhValueBlock],
  ['迷你趋势', sparkline, AhSparkline],
  ['状态徽标', statusBadge, AhStatusBadge],
  ['报警徽标', alarmBadge, AhAlarmBadge],
  ['质量徽标', qualityBadge, AhQualityBadge],
  ['工艺管线', pipe, null as unknown as Component],
  ['区域卡片', areaCard, AhAreaCard],
  ['设备面板', devFaceplate, AhDevFaceplate],
  ['历史趋势', histTrend, AhHistTrend],
]

function mountReactive(comp: Component, initial: Record<string, unknown>) {
  const state = reactive({ ...initial })
  const set = (k: string, v: unknown): void => { state[k] = v }
  const wrapper = defineComponent({ setup: () => () => h(comp, { ...state }) })
  const el = document.createElement('div')
  const app = createApp(wrapper)
  app.mount(el)
  return { el, set, unmount: () => app.unmount() }
}

const text = (el: Element, sel: string): string => el.querySelector(sel)?.textContent?.trim() ?? ''

describe.each(FAMILY)('%s（工业功能件）', (_name, s, comp) => {
  it('结构快照（ILeftAsideConfigItemPublic）', () => {
    expect(s).toMatchSnapshot()
  })

  it('过约定 lint（fill 承载位 / viewBox→宽高 / 描述符三键）', () => {
    expect(lintSymbol(s)).toEqual([])
  })

  it('注册项已在 registry + 组件表（id↔PascalCase 名一一对应）', () => {
    expect(allSymbols()).toContain(s)
    if (comp) expect(VUE_SYMBOL_COMPONENTS[vueTagFor(s.id)]).toBeDefined()
  })

  it('props 描述符与组件 props 名一一对应（多余/缺失名即静默失联）', () => {
    if (!comp) return
    const meta = comp as unknown as { props?: Record<string, unknown> }
    const declared = meta.props ? Object.keys(meta.props).sort() : []
    expect(declared).toEqual(Object.keys(s.props).sort())
  })
})

describe('AhValueBlock 组件', () => {
  it('PV 按精度格式化；报警优先级驱动数值色与 P 徽标；质量态显示文字', async () => {
    const { el, set, unmount } = mountReactive(AhValueBlock, {
      label: '瞬时流量', value: 31.504, unit: 'm³/h', precision: 2, min: 0, max: 40,
      show_limits: true, l: 10, h: 30, hh: 31.5, prio: 0, quality: 0,
    })
    expect(text(el, '[data-testid="vb-value"]')).toBe('31.50')
    expect(text(el, '.ah-vb-label')).toBe('瞬时流量')
    // 正常态：数值用暗蓝（fill 缺省）
    expect((el.querySelector('[data-testid="vb-value"]') as HTMLElement).style.color).toBe('rgb(31, 78, 121)')
    // 无报警不显示 P 徽标
    expect(el.querySelector('[data-testid="vb-prio"]')).toBeNull()
    // 优先级 1 → 红色 + P1 文字
    set('prio', 1)
    await nextTick()
    expect(text(el, '[data-testid="vb-prio"]')).toBe('P1')
    expect((el.querySelector('[data-testid="vb-value"]') as HTMLElement).style.color).toBe('rgb(211, 47, 47)')
    // 质量 STALE（1）→ 文字出现
    set('quality', 1)
    await nextTick()
    expect(text(el, '[data-testid="vb-quality"]')).toBe('STALE')
    // 限值带刻线：l/h/hh 三项显式设置 → 3 条（ll 未设 = 不画，缺省不等于 0）
    expect(el.querySelectorAll('.ah-vb-tick').length).toBe(3)
    expect(el.querySelector('[data-testid="vb-pv-marker"]')).not.toBeNull()
    unmount()
  })

  it('show_limits=false 不画限值带（普通点位不显示无意义刻度）', () => {
    const { el, unmount } = mountReactive(AhValueBlock, { label: '状态', value: 1, show_limits: false })
    expect(el.querySelector('[data-testid="vb-band"]')).toBeNull()
    unmount()
  })

  it('compact 模式渲染为单行（参数表行），限值以摘要文字呈现', () => {
    const { el, unmount } = mountReactive(AhValueBlock, {
      label: '有功功率', value: 47.123, unit: 'kW', precision: 2, show_limits: true, h: 51.5, hh: 52, compact: true,
    })
    expect(el.querySelector('.ah-vb-compact')).not.toBeNull()
    expect(el.querySelector('[data-testid="vb-band"]')).toBeNull()
    expect(text(el, '[data-testid="vb-value"]')).toBe('47.12')
    expect(text(el, '.ah-vb-lim')).toContain('H 51.50')
    unmount()
  })
})

describe('AhSparkline 组件', () => {
  it('初始空态显示"等待数据"；连续采样后出现 polyline 且点数递增', async () => {
    const { el, set, unmount } = mountReactive(AhSparkline, { value: 10, min: 0, max: 40, window: 300 })
    expect(text(el, '.ah-sp-empty')).toBe('等待数据')
    set('value', 12)
    await nextTick()
    const first = el.querySelector('polyline')!.getAttribute('points') ?? ''
    expect(first.length).toBeGreaterThan(0)
    set('value', 18)
    await nextTick()
    const second = el.querySelector('polyline')!.getAttribute('points') ?? ''
    expect(second.split(' ').length).toBeGreaterThan(first.split(' ').length)
    unmount()
  })
})

describe('AhStatusBadge 组件', () => {
  it('state 驱动形状 + 文字；texts 可改写语义（阀门 开/关）', async () => {
    const { el, set, unmount } = mountReactive(AhStatusBadge, {
      state: 1, label: '阀门', texts: '关,开,故障,维护,离线',
    })
    expect(text(el, '[data-testid="sb-text"]')).toBe('开')
    expect(el.querySelector('circle')).not.toBeNull()
    set('state', 2)
    await nextTick()
    expect(text(el, '[data-testid="sb-text"]')).toBe('故障')
    expect(el.querySelector('path')).not.toBeNull() // 三角形
    unmount()
  })
})

describe('AhAlarmBadge 组件', () => {
  it('prio=0 显示正常且无计数；P1 显示 P1 ×N 并带闪烁类', async () => {
    const { el, set, unmount } = mountReactive(AhAlarmBadge, { prio: 0, count: 0, label: '报警', blink: true })
    expect(text(el, '[data-testid="ab-prio"]')).toBe('正常')
    expect(el.querySelector('[data-testid="ab-count"]')).toBeNull()
    set('prio', 1)
    set('count', 2)
    await nextTick()
    expect(text(el, '[data-testid="ab-prio"]')).toBe('P1')
    expect(text(el, '[data-testid="ab-count"]')).toBe('×2')
    expect(el.querySelector('.ah-ab')!.classList.contains('blink')).toBe(true)
    unmount()
  })
})

describe('AhQualityBadge 组件', () => {
  it('quality 0/1/2 → GOOD/STALE/BAD 文字恒显示', async () => {
    const { el, set, unmount } = mountReactive(AhQualityBadge, { quality: 0, label: '通信' })
    expect(text(el, '[data-testid="qb-text"]')).toBe('GOOD')
    set('quality', 1)
    await nextTick()
    expect(text(el, '[data-testid="qb-text"]')).toBe('STALE')
    set('quality', 2)
    await nextTick()
    expect(text(el, '[data-testid="qb-text"]')).toBe('BAD')
    unmount()
  })
})

describe('AhAreaCard 组件', () => {
  it('双 KPI + 活动报警数 + 优先级文字', async () => {
    const { el, set, unmount } = mountReactive(AhAreaCard, {
      title: '水系统', total: 3, alarms: 0, prio: 0,
      kpi1_label: '瞬时流量', kpi1_value: 22.456, kpi1_unit: 'm³/h',
      kpi2_label: '压力', kpi2_value: 0.39, kpi2_unit: 'MPa', quality: 0,
    })
    expect(text(el, '[data-testid="ac-kpi1"]')).toBe('22.46')
    expect(text(el, '[data-testid="ac-kpi2"]')).toBe('0.39')
    expect(text(el, '[data-testid="ac-alarms"]')).toBe('0')
    expect(text(el, '[data-testid="ac-prio"]')).toBe('正常')
    set('alarms', 3)
    set('prio', 1)
    await nextTick()
    expect(text(el, '[data-testid="ac-alarms"]')).toBe('3')
    expect(text(el, '[data-testid="ac-prio"]')).toBe('P1')
    unmount()
  })
})

describe('AhDevFaceplate 组件', () => {
  it('PV/单位/限值文字/报警页脚/状态文字；控制区默认隐藏', async () => {
    const { el, set, unmount } = mountReactive(AhDevFaceplate, {
      title: 'WM-101 远传水表', dev: 'dev_wm1', unit: 'm³/h', pv: 31.5, precision: 2,
      min: 0, max: 40, show_limits: true, l: 10, h: 30, hh: 31.5,
      status: 1, quality: 0, prio: 0, alarms: 0,
    })
    expect(text(el, '[data-testid="fp-pv"]')).toBe('31.50')
    expect(text(el, '.ah-fp-pv-unit')).toBe('m³/h')
    expect(text(el, '.ah-fp-dev')).toBe('dev_wm1')
    expect(text(el, '.ah-fp-status')).toBe('运行')
    expect(text(el, '.ah-fp-bandtext')).toContain('H 30.00')
    expect(text(el, '[data-testid="fp-alarms"]')).toContain('×0')
    expect(el.querySelector('[data-testid="fp-control"]')).toBeNull()
    // PV 颜色只看点级优先级（pv_prio）；设备级 prio 只驱动右上角徽标
    expect((el.querySelector('[data-testid="fp-pv"]') as HTMLElement).style.color).toBe('rgb(31, 78, 121)')
    set('pv_prio', 1)
    await nextTick()
    expect((el.querySelector('[data-testid="fp-pv"]') as HTMLElement).style.color).toBe('rgb(211, 47, 47)')
    set('prio', 3)
    await nextTick()
    expect(text(el, '[data-testid="fp-prio"]')).toContain('P3')
    set('show_control', true)
    set('mode', 0)
    await nextTick()
    expect(text(el, '[data-testid="fp-control"]')).toContain('MAN')
    unmount()
  })
})

describe('AhHistTrend 组件（BI 通道 B 信封 → 浅色历史曲线）', () => {
  const envelope = (points: Array<{ ts: number; value: number }>, label = '1#水表') => JSON.stringify({
    v: 1,
    window: { start: points[0]?.ts ?? 0, end: points[points.length - 1]?.ts ?? 0 },
    generatedAt: 0,
    series: [{
      key: 'dev_wm1.flow_rate', label, unit: 'm³/h', color: '#1f4e79',
      mode: 'instant', metric: 'avg', value: null, points, error: null,
    }],
  })

  it('无信封 → 空态占位（不画假零线）', () => {
    const { el, unmount } = mountReactive(AhHistTrend, { title: '历史趋势', data: '[]' })
    expect(text(el, '[data-testid="ht-empty"]')).toBe('暂无历史数据')
    expect(el.querySelectorAll('polyline').length).toBe(0)
    unmount()
  })

  it('信封有序列 → 画 polyline 与图例；点数与信封一致', async () => {
    const { el, set, unmount } = mountReactive(AhHistTrend, { title: '历史趋势', data: '[]' })
    set('data', envelope([
      { ts: 1000, value: 10 }, { ts: 1060, value: 20 }, { ts: 1120, value: 15 },
    ]))
    await nextTick()
    expect(el.querySelectorAll('polyline').length).toBe(1)
    expect((el.querySelector('polyline')!.getAttribute('points') ?? '').split(' ').length).toBe(3)
    expect(text(el, '.ah-ht-legend')).toContain('1#水表')
    expect(el.querySelector('[data-testid="ht-empty"]')).toBeNull()
    unmount()
  })

  it('单序列失败 → 标题区提示错误，不影响其它序列', async () => {
    const { el, set, unmount } = mountReactive(AhHistTrend, { title: '历史趋势', data: '[]' })
    set('data', JSON.stringify({
      v: 1, window: { start: 0, end: 0 }, generatedAt: 0,
      series: [
        { key: 'a', label: 'A', unit: '', color: '', mode: 'instant', metric: 'avg', value: null, points: [], error: '查询失败' },
        { key: 'b', label: 'B', unit: '', color: '#2e6b52', mode: 'instant', metric: 'avg', value: null, points: [{ ts: 1, value: 2 }], error: null },
      ],
    }))
    await nextTick()
    expect(text(el, '.ah-ht-err')).toContain('查询失败')
    expect(el.querySelectorAll('polyline').length).toBe(1)
    unmount()
  })
})

describe('spark-buffer 纯函数', () => {
  it('pushSample 追加 + 窗口裁剪 + 非数值忽略', () => {
    const t0 = 1_700_000_000_000
    let buf = pushSample([], 10, t0, 60)
    buf = pushSample(buf, 12, t0 + 30_000, 60)
    buf = pushSample(buf, 'bad', t0 + 31_000, 60)
    expect(buf.map((s) => s.v)).toEqual([10, 12])
    buf = pushSample(buf, 14, t0 + 61_000, 60)
    // t0 已出 60s 窗口
    expect(buf.map((s) => s.v)).toEqual([12, 14])
  })

  it('yOf 夹紧量程；sparkPoints 点数 = 样本数', () => {
    expect(yOf(0, 100, 0, 100)).toBe(100)
    expect(yOf(100, 100, 0, 100)).toBe(0)
    expect(yOf(200, 100, 0, 100)).toBe(0)
    expect(sparkPoints([{ t: 0, v: 0 }, { t: 1, v: 100 }], 200, 100, 0, 100)).toBe('0.0,100.0 200.0,0.0')
  })
})
