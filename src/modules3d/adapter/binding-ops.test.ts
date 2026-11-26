import { describe, it, expect } from 'vitest'
import {
  addBinding, removeBinding, updateBinding, danglingBindings, nextBindingId,
  DEFAULT_CONFIG_BY_KIND, bindingKindsFor,
} from './binding-ops'
import type { SceneBinding, SceneDoc } from '../scene3d'

/**
 * 绑定编辑操作（P2）：纯函数 CRUD + 悬空校验。
 *
 * 关键约束（方案 §7 R3）：
 *   - bid 是绑定与事件的唯一引用键；用户在编辑器里删除对象再拖入同款会得到**新 bid**
 *     → 绑定悬空。必须**显式标红**，不能静默丢弃（静默丢 = 用户以为绑还在）。
 *   - id 要稳定且可读（bind_<bid 短哈希>_<序号>），便于 AI/日志定位。
 */

const doc = (bindings: SceneBinding[] = [], objectBids: string[] = ['bid_a', 'bid_b']): SceneDoc => ({
  $schema: 'agent-hmi.scene3d/1',
  meta: { name: 'x', group: '', unit_m: 1, home: { pos: [0, 0, 0], target: [0, 0, 0] } },
  nodes: [], links: [],
  objects: objectBids.map((b) => ({ bid: b })) as never,
  bindings,
  events: [],
})

const bind = (over: Partial<SceneBinding> = {}): SceneBinding => ({
  id: 'b1', targetBid: 'bid_a', field: 'dev_wm1.flow_rate', devId: 'dev_wm1',
  kind: 'color', config: {}, ...over,
})

describe('addBinding', () => {
  it('追加一条并自动补 devId（由 field 前段解析）', () => {
    const d = doc()
    const out = addBinding(d, { targetBid: 'bid_a', field: 'dev_em1.active_power', kind: 'emissive', config: {} })
    expect(out.bindings).toHaveLength(1)
    expect(out.bindings![0].devId).toBe('dev_em1')
    expect(out.bindings![0].targetBid).toBe('bid_a')
    expect(out.bindings![0].id).toMatch(/^bind_/)
  })

  it('同一 targetBid + field + kind 视为重复，不重复添加（幂等）', () => {
    const d = doc([bind()])
    const out = addBinding(d, { targetBid: 'bid_a', field: 'dev_wm1.flow_rate', kind: 'color', config: {} })
    expect(out.bindings).toHaveLength(1)
  })

  it('同对象不同 kind 允许共存（颜色 + 标签）', () => {
    const d = doc([bind()])
    const out = addBinding(d, { targetBid: 'bid_a', field: 'dev_wm1.flow_rate', kind: 'label', config: {} })
    expect(out.bindings).toHaveLength(2)
  })

  it('不改原文档（返回新对象，便于乐观锁比对）', () => {
    const d = doc()
    const out = addBinding(d, { targetBid: 'bid_a', field: 'dev_wm1.flow_rate', kind: 'color', config: {} })
    expect(d.bindings).toHaveLength(0)
    expect(out).not.toBe(d)
  })
})

describe('removeBinding / updateBinding', () => {
  it('按 id 删除', () => {
    const d = doc([bind(), bind({ id: 'b2', targetBid: 'bid_b' })])
    const out = removeBinding(d, 'b1')
    expect(out.bindings).toHaveLength(1)
    expect(out.bindings![0].id).toBe('b2')
  })

  it('按 id 更新（改 kind/config，devId 跟随 field 重算）', () => {
    const d = doc([bind()])
    const out = updateBinding(d, 'b1', { field: 'dev_gm1.pressure', kind: 'visible', config: { truthyAbove: 1 } })
    const b = out.bindings![0]
    expect(b.field).toBe('dev_gm1.pressure')
    expect(b.devId).toBe('dev_gm1')   // 跟随更新，不是旧值
    expect(b.kind).toBe('visible')
    expect(b.config).toEqual({ truthyAbove: 1 })
  })

  it('更新不存在的 id → 原样返回（不抛）', () => {
    const d = doc([bind()])
    expect(updateBinding(d, 'nope', { kind: 'label' }).bindings).toHaveLength(1)
  })
})

describe('danglingBindings（悬空检测）', () => {
  it('targetBid 不在 objects 里 → 悬空', () => {
    const d = doc([bind({ targetBid: 'bid_gone' })])
    expect(danglingBindings(d)).toEqual(['b1'])
  })

  it('全部命中 → 空数组', () => {
    expect(danglingBindings(doc([bind()]))).toEqual([])
  })

  it('对象被删（objects 少一个）后立刻能查出', () => {
    const withObj = doc([bind()], ['bid_a'])
    expect(danglingBindings(withObj)).toEqual([])
    const afterDelete = { ...withObj, objects: [] as never }
    expect(danglingBindings(afterDelete)).toEqual(['b1'])
  })
})

describe('默认配置与可用 kind', () => {
  it('每种 kind 有合理默认（用户点了就能用）', () => {
    expect(DEFAULT_CONFIG_BY_KIND.color).toBeDefined()
    expect(DEFAULT_CONFIG_BY_KIND.emissive).toMatchObject({ color: expect.any(Number) })
    expect(DEFAULT_CONFIG_BY_KIND.visible).toMatchObject({ truthyAbove: expect.any(Number) })
    expect(DEFAULT_CONFIG_BY_KIND.label).toMatchObject({ precision: expect.any(Number) })
    expect(DEFAULT_CONFIG_BY_KIND.animationSpeed).toBeDefined()
  })

  it('对象有动画才给 animationSpeed（避免无效选项）', () => {
    expect(bindingKindsFor({ hasAnimation: true })).toContain('animationSpeed')
    expect(bindingKindsFor({ hasAnimation: false })).not.toContain('animationSpeed')
  })

  it('nextBindingId 稳定且含 bid 片段（便于定位）', () => {
    const id1 = nextBindingId('bid_abc123', 'color')
    expect(id1).toMatch(/^bind_/)
    expect(id1).toContain('color')
    expect(id1).not.toBe(nextBindingId('bid_xyz', 'color'))
  })
})
