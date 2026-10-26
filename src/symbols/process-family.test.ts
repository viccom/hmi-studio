// T12 fill 约定族五图元（闸阀/蝶阀/罐/液位计/流量计）结构契约：
// 每图元快照（改动即 diff 审阅面）+ lint 全绿 + fill 继承（svg 主体不写死填充）；
// 罐/液位计额外验液位驱动链要素（types.ts ⑥）。
import { describe, it, expect } from 'vitest'
import { gateValve } from './gate-valve'
import { butterflyValve } from './butterfly-valve'
import { tank } from './tank'
import { levelGauge } from './level-gauge'
import { flowMeter } from './flow-meter'
import { lintSymbol } from '../lib/symbol-lint'
import type { HmiSymbol } from './types'

const FAMILY: [name: string, s: HmiSymbol][] = [
  ['闸阀', gateValve],
  ['蝶阀', butterflyValve],
  ['罐', tank],
  ['液位计', levelGauge],
  ['流量计', flowMeter],
]

describe.each(FAMILY)('%s（fill 约定族）', (_name, s) => {
  it('结构快照（ILeftAsideConfigItemPublic）', () => {
    expect(s).toMatchSnapshot()
  })

  it('过约定 lint（fill 继承 / ports 锚位 / viewBox / 描述符）', () => {
    expect(lintSymbol(s)).toEqual([])
  })

  it('fill 继承：svg 主体不写死填充（dataURI 渲染外部 CSS 不可达，定色仅 rgba 叠加轮廓/动件）', () => {
    // 允许 fill="none"（描边件）与 rgba(...)（定色件）；禁止写死 hex/var 颜色吞掉 use 状态色
    const solidFills = (s.svg ?? '').match(/fill="(?!none)[^"]*"/g) ?? []
    for (const f of solidFills) expect(f).toMatch(/^fill="rgba\(/)
  })
})

describe('罐/液位计连续液位驱动链（types.ts ⑥）', () => {
  it.each([
    ['罐', tank],
    ['液位计', levelGauge],
  ] as const)('%s：h(0-100 number) + use[h] 枚举 + scaleY 消费', (_n, s) => {
    expect(s.props.h?.type).toBe('number')
    expect(s.svg).toContain('use[h="0"]{--ah-lvl:0.00}')
    expect(s.svg).toContain('use[h="100"]{--ah-lvl:1.00}')
    expect(s.svg).toContain('use[h^="50."]{--ah-lvl:0.50}')
    expect(s.svg).toContain('transform:scaleY(var(--ah-lvl,0))')
    expect(s.svg).toContain('transform-origin:bottom')
  })
})
