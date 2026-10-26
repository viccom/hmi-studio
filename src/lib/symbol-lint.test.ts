// T11 图元约定 lint（设计 §6「约定优于配置」的机械化）：
// 每条规则对应一个已实证的 maotu 通路前提——破约定 = 绑定/渲染静默失效，故测试先行固化。
import { describe, it, expect } from 'vitest'
import { lintSymbol } from './symbol-lint'
import { allSymbols } from '../symbols/registry'
import type { ILeftAsideConfigItemPublic } from 'maotu'

// 基准合法图元（registry 泵的同构形状）
const OK: ILeftAsideConfigItemPublic = {
  id: 'ah-x', title: 'X', type: 'svg', thumbnail: '',
  svg: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="20"/></svg>',
  width: 64, height: 64,
  props: { fill: { title: '主体色', type: 'color', val: '#52c41a' } },
  ports: [
    { type: 'in', position: 'leftBottom', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
  ],
}

// 反例构造器：故意违反 ILeftAsideConfigItemPublic 类型（缺字段/坏枚举），经 unknown 回落为被测形状
const broken = (overrides: Record<string, unknown>): ILeftAsideConfigItemPublic =>
  ({ ...OK, ...overrides }) as unknown as ILeftAsideConfigItemPublic

describe('lintSymbol 四规则', () => {
  it('基准合法图元与注册表全量图元通过（约定不破即绿灯）', () => {
    expect(lintSymbol(OK)).toEqual([])
    for (const s of allSymbols()) expect(lintSymbol(s), s.id).toEqual([])
  })

  it('缺 fill 色属性 → FILL_MISSING（状态色绑定 props.fill.val 的前提）', () => {
    const noFill = broken({ props: { label: { title: '标签', type: 'input', val: 'x' } } })
    expect(lintSymbol(noFill)).toContain('FILL_MISSING')
  })

  it('fill 存在但 type 非 color → FILL_MISSING（右面板按 color 才渲染取色器）', () => {
    const badType = broken({ props: { fill: { title: '主体色', type: 'input', val: 'x' } } })
    expect(lintSymbol(badType)).toContain('FILL_MISSING')
  })

  it('ports 位置非 maotu 锚位（rightBottom 未实现，静默落画布原点）→ PORT_POSITION', () => {
    const badPort = broken({
      ports: [{ type: 'out', position: 'rightBottom', offset: { x: { value: 0, unit: 'px' }, y: { value: 0, unit: 'px' } } }],
    })
    expect(lintSymbol(badPort)).toContain('PORT_POSITION')
  })

  it('svg 无 viewBox 或图元缺 width/height → SVG_VIEWBOX（kf 据 viewBox 定 symbol 尺寸）', () => {
    const noViewBox = broken({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>' })
    expect(lintSymbol(noViewBox)).toContain('SVG_VIEWBOX')
    const noSize = broken({ width: undefined, height: undefined })
    expect(lintSymbol(noSize)).toContain('SVG_VIEWBOX')
  })

  it('props 描述符缺 title/type/val 或 type 不在 maotu 九种内 → PROP_SHAPE', () => {
    const noTitle = broken({ props: { fill: { title: '', type: 'color', val: '#fff' } } })
    expect(lintSymbol(noTitle)).toContain('PROP_SHAPE')
    const noType = broken({ props: { fill: { title: '主体色', type: undefined, val: '#fff' } } })
    expect(lintSymbol(noType)).toContain('PROP_SHAPE')
    const noVal = broken({ props: { fill: { title: '主体色', type: 'color' } } })
    expect(lintSymbol(noVal)).toContain('PROP_SHAPE')
    const badType = broken({ props: { fill: { title: '主体色', type: 'colour', val: '#fff' } } })
    expect(lintSymbol(badType)).toContain('PROP_SHAPE')
  })
})
