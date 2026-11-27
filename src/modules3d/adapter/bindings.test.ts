import { describe, it, expect } from 'vitest'
import {
  boundFieldsOf, boundDevsOf, devIdOfField, prioToColor, bindingFor,
} from './bindings'
import type { SceneBinding, SceneDoc } from '../scene3d'

/**
 * 绑定层纯逻辑（P1）。**不碰 three**——场景驱动在 `applyBindings` 里，这里只测可纯函数化的部分。
 *
 * 设计要点（对齐 2D 的 binds.ts）：
 *   - 订阅面 = 被绑定的字段 ∪ 事件引用点，**不是"场景内所有设备"**
 *     （实测踩过：172 对象场景若订阅全量设备，真实厂区 200 台会线性拖慢主线程）
 *   - `__` 开头的合成点（`__prio`/`__area`/`__sys`）不进 SSE 订阅面
 *   - 告警不走 bindings，走 synthetic → prioMap（与 2D 的 `__prio` 注入等价）
 */

const binding = (over: Partial<SceneBinding> = {}): SceneBinding => ({
  id: 'b1',
  targetBid: 'bid_a',
  field: 'dev_wm1.flow_rate',
  devId: 'dev_wm1',
  kind: 'color',
  config: {},
  ...over,
})

describe('boundFieldsOf / boundDevsOf（订阅面）', () => {
  it('只收被绑定的字段，不含场景内其它设备', () => {
    const doc = {
      bindings: [binding(), binding({ id: 'b2', targetBid: 'bid_b', field: 'dev_em1.active_power', devId: 'dev_em1' })],
    } as unknown as SceneDoc
    expect(boundFieldsOf(doc)).toEqual(['dev_em1.active_power', 'dev_wm1.flow_rate'])
    expect(boundDevsOf(doc)).toEqual(['dev_em1', 'dev_wm1'])
  })

  it('合成点（__ 前缀）不进订阅面', () => {
    const doc = {
      bindings: [
        binding(),
        binding({ id: 'b2', field: 'dev_wm1.__prio', devId: 'dev_wm1', kind: 'visible' }),
        binding({ id: 'b3', field: '__sys.quality', devId: '__sys', kind: 'label' }),
      ],
    } as unknown as SceneDoc
    expect(boundFieldsOf(doc)).toEqual(['dev_wm1.flow_rate'])
  })

  it('无 bindings 的文档 → 空订阅面（不订阅任何设备）', () => {
    expect(boundFieldsOf({} as SceneDoc)).toEqual([])
    expect(boundDevsOf({} as SceneDoc)).toEqual([])
  })

  it('同一字段被多次绑定 → 去重', () => {
    const doc = { bindings: [binding(), binding({ id: 'b2', targetBid: 'bid_c' })] } as unknown as SceneDoc
    expect(boundFieldsOf(doc)).toEqual(['dev_wm1.flow_rate'])
  })
})

describe('devIdOfField / bindingFor', () => {
  it('从字段解析 devid（点号前段）', () => {
    expect(devIdOfField('dev_wm1.flow_rate')).toBe('dev_wm1')
    expect(devIdOfField('nodot')).toBe('')
  })

  it('按字段查绑定（多条同字段时返回全部，供多对象共用一个点位）', () => {
    const doc = { bindings: [binding(), binding({ id: 'b2', targetBid: 'bid_c' })] } as unknown as SceneDoc
    expect(bindingFor(doc, 'dev_wm1.flow_rate')).toHaveLength(2)
    expect(bindingFor(doc, 'dev_x.y')).toHaveLength(0)
  })
})

describe('prioToColor（告警优先级 → 颜色，对齐 2D 的 PRIO 色板）', () => {
  it('0=常态、1..4 对应 P1..P4', () => {
    expect(prioToColor(0)).toBe(0x6b8299) // 常态灰
    expect(prioToColor(1)).toBe(0xff3b4e) // P1 红
    expect(prioToColor(2)).toBe(0xff8c2a) // P2 橙
    expect(prioToColor(3)).toBe(0xffd23f) // P3 黄
    expect(prioToColor(4)).toBe(0x3d9dff) // P4 蓝
  })

  it('越界值钳到 [0,4]（脏数据不炸）', () => {
    expect(prioToColor(-1)).toBe(prioToColor(0))
    expect(prioToColor(99)).toBe(prioToColor(4))
  })
})
