// 批 B vue/custom-svg 图元：结构契约 + 组件最小单测（jsdom 实挂载，vue 直接依赖——
// 不引 @vue/test-utils 新依赖）。组件单测验证意图（规则 7）：
// - 数显：绑定值变化驱动读数文本（运行页直写通道的组件侧背书）
// - 压力表盘：alarm 触发指针变红（触发链的组件侧终点）
// - 温度计：值变化驱动液柱几何（连续量直写通道）
// - 三色灯：三 bool 独立亮灭（三触发链各自收口）
// - 操作按钮：按下视觉反馈（pointerdown/up）
// - 选择开关：点击循环档位并 emit update:modelValue（回写合并进 props 的组件侧起点）
import { describe, it, expect } from 'vitest'
import { createApp, defineComponent, h, nextTick, reactive, type Component } from 'vue'
import { lintSymbol } from '../lib/symbol-lint'
import { allSymbols } from './registry'
import { VUE_SYMBOL_COMPONENTS, vueTagFor } from './index'
import { digitalDisplay } from './digital-display'
import { gaugePressure } from './gauge-pressure'
import { thermometer } from './thermometer'
import { stackLight } from './stack-light'
import { pushButton, PUSH_EVENT_CODE } from './push-button'
import { selectorSwitch } from './selector-switch'
import AhDigitalDisplay from './AhDigitalDisplay.vue'
import AhGaugePressure from './AhGaugePressure.vue'
import AhThermometer from './AhThermometer.vue'
import AhStackLight from './AhStackLight.vue'
import AhPushButton from './AhPushButton.vue'
import AhSelectorSwitch from './AhSelectorSwitch.vue'
import type { HmiSymbol } from './types'

const VUE_FAMILY: [name: string, s: HmiSymbol][] = [
  ['数显面板', digitalDisplay],
  ['压力表盘', gaugePressure],
  ['温度计', thermometer],
  ['三色警示灯', stackLight],
  ['操作按钮', pushButton],
  ['选择开关', selectorSwitch],
]

describe.each(VUE_FAMILY)('%s（vue/custom-svg 批）', (_name, s) => {
  it('结构快照（ILeftAsideConfigItemPublic）', () => {
    expect(s).toMatchSnapshot()
  })

  it('过约定 lint（fill 承载位 / viewBox→宽高 / 描述符三键）', () => {
    expect(lintSymbol(s)).toEqual([])
  })

  it('注册项已在 registry + 组件表（id↔PascalCase 名一一对应，maotu 拖入 tag=Le.id 实证）', () => {
    expect(allSymbols()).toContain(s)
    expect(VUE_SYMBOL_COMPONENTS[vueTagFor(s.id)]).toBeDefined()
  })

  it('props 描述符与组件 props 名一一对应（jT 平面化直传，多余/缺失名即静默失联）', () => {
    const descKeys = Object.keys(s.props).sort()
    const compProps = (s === digitalDisplay ? AhDigitalDisplay
      : s === gaugePressure ? AhGaugePressure
      : s === thermometer ? AhThermometer
      : s === stackLight ? AhStackLight
      : s === pushButton ? AhPushButton
      : AhSelectorSwitch)
    const declared = compProps.props ? Object.keys(compProps.props).sort() : []
    expect(declared).toEqual(descKeys)
  })
})

// ---- jsdom 实挂载（无 @vue/test-utils 依赖的最小 harness） ----
function mountComp(comp: unknown, props: Record<string, unknown> = {}) {
  const el = document.createElement('div')
  const app = createApp(comp as Parameters<typeof createApp>[0], props)
  const vm = app.mount(el)
  return { el, vm, unmount: () => app.unmount() }
}
const text = (el: Element, sel: string): string => el.querySelector(sel)?.textContent ?? ''

/**
 * 响应式 props harness：props 归宿主（maotu/父组件）所有——直接改 $props 不触发更新。
 * 包装组件持 ref 再下发，改 ref 才是「绑定值变化」的真实形态（运行页 setDevicePointByID
 * 直写描述符 → jT 平面化 → props 下发的同构模拟）。
 */
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

describe('AhDigitalDisplay 组件', () => {
  it('label/读数/unit 三段文本渲染，value 绑定变化驱动读数（SSE 直写组件侧背书）', async () => {
    const { el, set, unmount } = mountReactive(AhDigitalDisplay, { label: '温度', value: 21.5, unit: '℃', fill: '#39d353' })
    expect(text(el, '.ah-dsp-label')).toBe('温度')
    expect(text(el, '.ah-dsp-value')).toBe('21.5')
    expect(text(el, '.ah-dsp-unit')).toBe('℃')
    expect((el.querySelector('.ah-dsp-value') as HTMLElement).style.color).toBe('rgb(57, 211, 83)')
    // 直写通道：绑定值变 → 读数随之（响应性=绑定语义的前提；改宿主 state 才是绑定形态）
    set('value', 88)
    await nextTick()
    expect(text(el, '.ah-dsp-value')).toBe('88')
    unmount()
  })
})

describe('AhGaugePressure 组件', () => {
  it('指针几何随 value 变化（角度=f(value,min,max) 落到线段端点）', () => {
    const tip = (v: number) => {
      const { el, unmount } = mountComp(AhGaugePressure, { value: v, min: 0, max: 100 })
      const line = el.querySelector('.ah-gp-needle')!
      const p = { x: Number(line.getAttribute('x2')), y: Number(line.getAttribute('y2')) }
      unmount()
      return p
    }
    expect(tip(0)).not.toEqual(tip(100)) // 两档指针指向不同
    expect(tip(50)).not.toEqual(tip(0))
  })
  it('alarm=true → 指针/弧变红（触发链组件侧终点）', () => {
    const { el, unmount } = mountComp(AhGaugePressure, { value: 60, alarm: true })
    expect(el.querySelector('.ah-gp-needle')!.getAttribute('stroke')).toBe('#f5222d')
    expect(el.querySelector('.ah-gp-arc')!.getAttribute('stroke')).toBe('#f5222d')
    unmount()
  })
  it('值文本显示当前值与单位', () => {
    const { el, unmount } = mountComp(AhGaugePressure, { value: 60, unit: 'kPa' })
    expect(text(el, 'svg')).toContain('60 kPa')
    unmount()
  })
})

describe('AhThermometer 组件', () => {
  it('液柱几何随 value 变化：值越大液面 y 越小（自底生长）', () => {
    const topY = (v: number) => {
      const { el, unmount } = mountComp(AhThermometer, { value: v, min: -40, max: 160 })
      const rect = el.querySelector('rect[fill]')!
      const y = Number(rect.getAttribute('y'))
      unmount()
      return y
    }
    const cold = topY(-40), hot = topY(160)
    expect(hot).toBeLessThan(cold)
  })
})

describe('AhStackLight 组件', () => {
  it('三 bool 独立亮灭：红亮绿灭时红段 #f5222d、绿段暗壳（三触发链各自收口）', () => {
    const { el, unmount } = mountComp(AhStackLight, { red: true, yellow: false, green: false })
    const rects = Array.from(el.querySelectorAll('rect')).map((r) => r.getAttribute('fill'))
    expect(rects).toContain('#f5222d')
    expect(rects).toContain('#262d36')
    unmount()
  })
  it('全亮：三段同框（ANDON 组合态）', () => {
    const { el, unmount } = mountComp(AhStackLight, { red: true, yellow: true, green: true })
    for (const c of ['#f5222d', '#faad14', '#52c41a']) {
      expect(Array.from(el.querySelectorAll('rect')).some((r) => r.getAttribute('fill') === c)).toBe(true)
    }
    unmount()
  })
})

describe('AhPushButton 组件', () => {
  it('按下视觉反馈：pointerdown 帽下沉（cy 38→42），pointerup 复位', async () => {
    const { el, unmount } = mountComp(AhPushButton, { label: '启动', fill: '#1677ff' })
    const svg = el.querySelector('svg')!
    const capY = () => (el.querySelectorAll('circle')[2] as SVGElement).getAttribute('cy')
    expect(capY()).toBe('38')
    svg.dispatchEvent(new window.PointerEvent('pointerdown'))
    await nextTick()
    expect(capY()).toBe('42')
    svg.dispatchEvent(new window.PointerEvent('pointerup'))
    await nextTick()
    expect(capY()).toBe('38')
    unmount()
  })
})

describe('AhSelectorSwitch 组件', () => {
  it('点击循环档位并 emit update:modelValue（回写合并进 props 的组件侧起点）', async () => {
    const got: number[] = []
    // 回写闭环 = 组件 emit + maotu 合并 props——宿主侧用 set() 模拟合并（真实形态：点击→emit→props.value 变）
    const { el, set, unmount } = mountReactive(AhSelectorSwitch, {
      value: 0, fill: '#faad14', 'onUpdate:modelValue': (v: number) => { got.push(v); set('value', v) },
    })
    const svg = el.querySelector('svg')!
    svg.dispatchEvent(new window.Event('click'))
    await nextTick()
    svg.dispatchEvent(new window.Event('click'))
    expect(got).toEqual([1, 2])
    unmount()
  })
  it('旋钮指针随 value 旋转（selectorAngle 落到 transform）', () => {
    const degOf = (v: number) => {
      const { el, unmount } = mountComp(AhSelectorSwitch, { value: v })
      const g = el.querySelector('g[transform]')!
      const d = g.getAttribute('transform')!
      unmount()
      return d
    }
    expect(degOf(0)).toContain('-45')
    expect(degOf(2)).toContain('45')
  })
})

describe('操作按钮默认事件模板（§2.5）', () => {
  it('custom_code 一行式 $rsiot.send(devid, tag, value)，devid/tag/value 经 $getItemAttrByID 运行时读取', () => {
    expect(PUSH_EVENT_CODE).toMatch(/^\$rsiot\.send\(\$getItemAttrByID\(\$item_info\.id, 'props\.devid\.val'\), \$getItemAttrByID\(\$item_info\.id, 'props\.tag\.val'\), \$getItemAttrByID\(\$item_info\.id, 'props\.value\.val'\)\);$/)
    expect(pushButton.events?.[0]?.type).toBe('click')
    expect(pushButton.events?.[0]?.action).toBe('customCode')
  })
})
