import { describe, it, expect } from 'vitest'
import { resolveEventAction, parseNavTargetSafe } from './events'
import type { SceneEventRule } from '../scene3d'

/**
 * 事件层纯逻辑（P1）：点击 → 动作求值。**不做导航**（导航由页面注入 router），只算出"该做什么"。
 *
 * 与 2D 的对齐：`navigate` 复用 `lib/nav.ts` 的 `parseNavTarget('slug?dev=dev_x')` 语义，
 * 不另写一套解析（否则两处解析会漂移）。
 */

const rule = (over: Partial<SceneEventRule> = {}): SceneEventRule => ({
  id: 'e1',
  on: { type: 'click', targetBid: 'bid_a' },
  do: { type: 'focus', targetBid: 'bid_a' },
  ...over,
})

describe('resolveEventAction', () => {
  it('命中 targetBid 的规则返回动作', () => {
    const rules = [rule(), rule({ id: 'e2', on: { type: 'click', targetBid: 'bid_b' }, do: { type: 'setCamera', view: { position: [0, 5, 5], target: [0, 0, 0] } } })]
    expect(resolveEventAction(rules, 'bid_b')).toEqual({ type: 'setCamera', view: { position: [0, 5, 5], target: [0, 0, 0] } })
  })

  it('未命中返回 null（不误触发）', () => {
    expect(resolveEventAction([rule()], 'bid_zzz')).toBeNull()
  })

  it('无 targetBid 的规则是"任意对象"兜底，但优先级低于精确匹配', () => {
    const wildcard = rule({ id: 'w', on: { type: 'click' }, do: { type: 'focus', targetBid: 'bid_wild' } })
    const exact = rule({ id: 'x', on: { type: 'click', targetBid: 'bid_a' }, do: { type: 'focus', targetBid: 'bid_exact' } })
    // 精确命中优先
    expect(resolveEventAction([wildcard, exact], 'bid_a')).toEqual({ type: 'focus', targetBid: 'bid_exact' })
    // 无精确命中才用兜底
    expect(resolveEventAction([wildcard, exact], 'bid_other')).toEqual({ type: 'focus', targetBid: 'bid_wild' })
  })

  it('空规则/空 bid 安全返回 null', () => {
    expect(resolveEventAction([], 'bid_a')).toBeNull()
    expect(resolveEventAction([rule()], '')).toBeNull()
  })

  it('command 动作原样带出（执行由页面走 bridge）', () => {
    const r = rule({ do: { type: 'command', targetBid: 'bid_a', cmd: 'start', params: { speed: 1 } } })
    expect(resolveEventAction([r], 'bid_a')).toEqual({ type: 'command', targetBid: 'bid_a', cmd: 'start', params: { speed: 1 } })
  })
})

describe('parseNavTargetSafe（navigate 复用 2D 语义）', () => {
  it('slug 与 ?dev= 都能解析', () => {
    expect(parseNavTargetSafe('iot-faceplate-wm1?dev=dev_wm1')).toEqual({ slug: 'iot-faceplate-wm1', dev: 'dev_wm1' })
  })

  it('无 dev 参数时 dev 为空串', () => {
    expect(parseNavTargetSafe('iot-unit-water')).toEqual({ slug: 'iot-unit-water', dev: '' })
  })

  it('非法输入安全降级（空 slug，不抛）', () => {
    expect(parseNavTargetSafe('')).toEqual({ slug: '', dev: '' })
    expect(parseNavTargetSafe(undefined as unknown as string)).toEqual({ slug: '', dev: '' })
  })
})
