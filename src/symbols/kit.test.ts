// kit 公共构件契约：液位驱动规则生成器（types.ts ⑥ 的机械化保障）。
import { describe, it, expect } from 'vitest'
import { levelCssRules, LIQUID_CSS, LIQUID_CLASS } from './kit'

describe('levelCssRules（use[h] 属性选择器枚举 → --ah-lvl）', () => {
  const rules = levelCssRules()

  it('整数档 0..100 全枚举，值 n/100 两位小数', () => {
    expect(rules).toContain('use[h="0"]{--ah-lvl:0.00}')
    expect(rules).toContain('use[h="50"]{--ah-lvl:0.50}')
    expect(rules).toContain('use[h="100"]{--ah-lvl:1.00}')
    // 101 档整数规则（bind 直写整数命中）
    expect(rules.match(/use\[h="\d+"\]/g)).toHaveLength(101)
  })

  it('浮点前缀规则兜小数（TP 序列化绑定为 "37.5" 类字符串时向下取整）', () => {
    expect(rules).toContain('use[h^="37."]{--ah-lvl:0.37}')
    expect(rules).toContain('use[h^="0."]{--ah-lvl:0.00}')
    expect(rules.match(/use\[h\^="\d+\."\]/g)).toHaveLength(101)
  })

  it('规则只产自定义属性声明，无几何副作用（消费端在 LIQUID_CSS）', () => {
    for (const rule of rules.match(/use\[[^\]]+\]\{[^}]+\}/g) ?? []) {
      expect(rule).toMatch(/^use\[h[^\]]*\]\{--ah-lvl:[01]\.\d{2}\}$/)
    }
  })
})

describe('LIQUID_CSS（消费端）', () => {
  it('类选择器命中 + scaleY(var(--ah-lvl,0)) 自底生长：无规则命中回落 0（空罐）', () => {
    // 必须是类选择器 ".ah-liquid"——裸 "ah-liquid{" 是元素名选择器，永远不命中（T12 实测教训）
    expect(LIQUID_CSS).toContain(`.${LIQUID_CLASS}{transform:scaleY(var(--ah-lvl,0))`)
    expect(LIQUID_CSS).toContain('transform-box:fill-box')
    expect(LIQUID_CSS).toContain('transform-origin:bottom')
  })
})
