// 批 A svg 工艺图元六件（止回阀/球阀/安全阀/电磁阀/风机/搅拌器）结构契约：
// 每图元快照（改动即 diff 审阅面）+ lint 全绿 + fill 继承（svg 主体不写死填充）；
// 球阀额外验翼柄 90° 旋转驱动链（use[open] 规则 → --ah-hdl → rotate）；
// 风机/搅拌器额外验旋转动画影子链要素（types.ts ③，同 pump-centrifugal.test）。
import { describe, it, expect } from 'vitest'
import { checkValve } from './check-valve'
import { ballValve } from './ball-valve'
import { safetyValve } from './safety-valve'
import { solenoidValve } from './solenoid-valve'
import { fan } from './fan'
import { agitator } from './agitator'
import { lintSymbol } from '../lib/symbol-lint'
import type { HmiSymbol } from './types'

const FAMILY: [name: string, s: HmiSymbol][] = [
  ['止回阀', checkValve],
  ['球阀', ballValve],
  ['安全阀', safetyValve],
  ['电磁阀', solenoidValve],
  ['风机', fan],
  ['搅拌器', agitator],
]

describe.each(FAMILY)('%s（svg 工艺批）', (_name, s) => {
  it('结构快照（ILeftAsideConfigItemPublic）', () => {
    expect(s).toMatchSnapshot()
  })

  it('过约定 lint（fill 继承 / ports 锚位 / viewBox / 描述符）', () => {
    expect(lintSymbol(s)).toEqual([])
  })

  it('fill 继承：svg 主体不写死填充（定色仅 rgba 叠加轮廓/动件）', () => {
    const solidFills = (s.svg ?? '').match(/fill="(?!none)[^"]*"/g) ?? []
    for (const f of solidFills) expect(f).toMatch(/^fill="rgba\(/)
  })

  it('工艺形体必须给 ports（入口/出口）', () => {
    expect(s.ports?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('球阀翼柄 90° 旋转驱动链（use[open] 属性选择器）', () => {
  it('open(switch) + 二规则映射角度 + rotate 消费', () => {
    expect(ballValve.props.open?.type).toBe('switch')
    expect(ballValve.svg).toContain('--ah-hdl: 0deg')
    expect(ballValve.svg).toContain('--ah-hdl: 90deg')
    expect(ballValve.svg).toContain('rotate(var(--ah-hdl')
    expect(ballValve.svg).toContain('transform-origin: center')
  })
})

describe.each([
  ['风机', fan, 'ah-rotor', 'ah-fan-spin'],
  ['搅拌器', agitator, 'ah-paddle', 'ah-agit-spin'],
] as const)('%s旋转动画影子链（types.ts ③）', (_n, s, cls, keyframes) => {
  it('animation(switch) + play-state 继承链四要素', () => {
    expect(s.props.animation?.type).toBe('switch')
    expect(s.svg).toContain(`@keyframes ${keyframes}`)
    expect(s.svg).toContain(`.${cls}`)
    expect(s.svg).toContain('animation-play-state: var(--ah-run, paused)')
    expect(s.svg).toContain('use[animation="true"]')
  })
})
