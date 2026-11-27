import { describe, it, expect } from 'vitest'
import { resolvePanelDevice, deviceKeyOf } from './device-panel'
import { faceplateSlug } from '../../screen-assets/iot-catalog'
import type { SceneBinding, SceneEventRule } from '../scene3d'

/**
 * 设备详情面板的设备反查（纯逻辑）。
 *
 * v2 场景里一台设备是若干独立对象（子件各一个 bid），点中哪个子件取决于射线命中——
 * 面板必须能把「点中的子件」还原成「哪台设备」，否则面板显示不出设备身份/实时值。
 * 这里钉住三条最容易出错的路径：命中带绑定的子件、命中无绑定的子件（按设备名分组回查）、
 * 2D 目标的优先级（场景规则 > 2D 目录回退）。
 */
const objects = [
  { bid: 'plant_wm1_01', name: 'WM-101 1#水表/底座' },
  { bid: 'plant_wm1_02', name: 'WM-101 1#水表/表体' },
  { bid: 'plant_wm1_06', name: 'WM-101 1#水表/状态灯' },
  { bid: 'plant_wm2_02', name: 'WM-102 2#水表/表体' },
]

const bindings: SceneBinding[] = [
  {
    id: 'bind_wm1_lamp', targetBid: 'plant_wm1_06', field: 'dev_wm1.flow_rate',
    devId: 'dev_wm1', kind: 'emissive', config: { color: 0x1de0ff, scale: 0.03 },
  },
  {
    id: 'bind_wm1_label', targetBid: 'plant_wm1_02', field: 'dev_wm1.flow_rate',
    devId: 'dev_wm1', kind: 'label', config: { unit: 'm³/h', precision: 2 },
  },
  {
    id: 'bind_wm2_label', targetBid: 'plant_wm2_02', field: 'dev_wm2.flow_rate',
    devId: 'dev_wm2', kind: 'label', config: { unit: 'm³/h', precision: 2 },
  },
]

const events: SceneEventRule[] = [
  {
    id: 'evt_wm1_panel', on: { type: 'click', targetBid: 'plant_wm1_02' },
    do: { type: 'navigate', slug: 'iot-faceplate-wm1', dev: 'dev_wm1' },
  },
]

describe('设备详情面板：命中子件 → 设备', () => {
  it('设备分组键取对象名「/」之前的部分', () => {
    expect(deviceKeyOf('WM-101 1#水表/表体')).toBe('WM-101 1#水表')
    expect(deviceKeyOf('无斜杠')).toBe('无斜杠')
  })

  it('命中带绑定的子件 → 直接得到设备身份/测点/单位', () => {
    const d = resolvePanelDevice('plant_wm1_02', objects, bindings, events)
    expect(d).toBeTruthy()
    expect(d!.devId).toBe('dev_wm1')
    expect(d!.field).toBe('dev_wm1.flow_rate')
    expect(d!.unit).toBe('m³/h')
    expect(d!.precision).toBe(2)
  })

  it('命中无绑定的子件（底座）→ 按设备名分组回查到同设备的绑定', () => {
    const d = resolvePanelDevice('plant_wm1_01', objects, bindings, events)
    expect(d).toBeTruthy()
    expect(d!.devId).toBe('dev_wm1')
    expect(d!.field).toBe('dev_wm1.flow_rate')
    expect(d!.unit).toBe('m³/h')
  })

  it('2D 目标优先用场景的 navigate 规则', () => {
    const d = resolvePanelDevice('plant_wm1_02', objects, bindings, events)
    expect(d!.target).toEqual({ slug: 'iot-faceplate-wm1', dev: 'dev_wm1' })
  })

  it('场景没有 navigate 规则 → 回退 2D 目录的 faceplate', () => {
    const d = resolvePanelDevice('plant_wm2_02', objects, bindings, events)
    expect(d!.devId).toBe('dev_wm2')
    expect(d!.target.slug).toBe(faceplateSlug('dev_wm2'))
  })

  it('既无绑定也找不到同设备对象 → null（面板不出现）', () => {
    expect(resolvePanelDevice('plant_unknown_01', objects, bindings, events)).toBeNull()
  })
})
