import { describe, it, expect } from 'vitest'
import { normalizeTriggerValue } from './trigger-value'

// 质量审查 P1-3 回归锁：触发器表单输入恒字符串，目标属性类型各异——
// maotu change_attr 仅布尔裸内联，'false' 串会让 props.red ?? false 恒真（灯常亮）
describe('normalizeTriggerValue', () => {
  const props = {
    red: { title: '红', type: 'switch', val: false },
    h: { title: '液位', type: 'number', val: 0 },
    fill: { title: '色', type: 'color', val: '#52c41a' },
    text: { title: '文案', type: 'input', val: '' },
  }

  it('switch 目标：true/false 字符串 → 真 boolean', () => {
    expect(normalizeTriggerValue('props.red.val', 'true', props)).toBe(true)
    expect(normalizeTriggerValue('props.red.val', 'false', props)).toBe(false)
  })

  it('number 目标：数字串 → number；非数字串原样（如枚举态）', () => {
    expect(normalizeTriggerValue('props.h.val', '50', props)).toBe(50)
    expect(normalizeTriggerValue('props.h.val', 'abc', props)).toBe('abc')
  })

  it('color/input 目标：保持字符串（fill=#ff4d4f 等既有语义不变）', () => {
    expect(normalizeTriggerValue('props.fill.val', '#ff4d4f', props)).toBe('#ff4d4f')
    expect(normalizeTriggerValue('props.text.val', '运行', props)).toBe('运行')
  })

  it('未知属性路径（无描述符）：原样字符串', () => {
    expect(normalizeTriggerValue('props.ghost.val', '1', props)).toBe('1')
  })
})
