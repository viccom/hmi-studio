// T11 图元约定 lint（设计 §6「约定优于配置」的机械化）：
// 每条规则对应一个已实证的 maotu 通路前提——破约定 = 绑定/渲染静默失效，故测试先行固化。
import { describe, it, expect } from 'vitest'
import { lintSymbol } from './symbol-lint'
import { allSymbols } from './registry'
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

describe('lintSymbol 五规则', () => {
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

  it('svg 注释体内含 "--"（如 var(--ah-lvl) 释例）→ SVG_COMMENT（XML 注释法，整图元 parsererror 空白）', () => {
    const badComment = broken({
      svg: '<svg viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg"><!-- scaleY(var(--ah-lvl,0)) --><rect/></svg>',
    })
    expect(lintSymbol(badComment)).toContain('SVG_COMMENT')
    // style 文本内的 "--x" 合法（泵/罐的 CSS 自定义属性写法），不误报
    const cssVar = broken({
      svg: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><style>.x{transform:scaleY(var(--ah-lvl,0))}</style><rect/></svg>',
    })
    expect(lintSymbol(cssVar)).toEqual([])
  })

  it('vue/custom-svg 型无 svg 串不误报 SVG_VIEWBOX（批 B 路线扩展：kf symbol 化仅 svg 型）', () => {
    const vueType = broken({ type: 'vue', svg: undefined })
    expect(lintSymbol(vueType)).not.toContain('SVG_VIEWBOX')
  })

  it('ANIM_CLASS：svg 型声明 animation prop 却缺影子链配对 → 静默不转（types.ts ③ 缺一环）', () => {
    const noSelector = broken({
      props: { fill: OK.props.fill, animation: { title: '旋转动画', type: 'switch', val: false } },
      svg: '<svg viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg"><style>.r{animation:spin 1s infinite}</style><rect/></svg>',
    })
    expect(lintSymbol(noSelector)).toContain('ANIM_CLASS')
    const okAnim = broken({
      props: { fill: OK.props.fill, animation: { title: '旋转动画', type: 'switch', val: false } },
      svg: '<svg viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg"><style>use[animation="true"]{--ah-run:running}.r{animation-play-state: var(--ah-run, paused)}</style><rect/></svg>',
    })
    expect(lintSymbol(okAnim)).not.toContain('ANIM_CLASS')
    // 无 animation prop 的 svg 型不受此规则（静态阀族）
    expect(lintSymbol(OK)).not.toContain('ANIM_CLASS')
  })

  it('VIEWBOX_DIMS：svg 型 viewBox 数值与注册 width/height 不一致 → 拖入几何错位（kf 取 viewBox 建 symbol）', () => {
    const mis = broken({ svg: '<svg viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg"><rect/></svg>' })
    expect(lintSymbol(mis)).toContain('VIEWBOX_DIMS')
    expect(lintSymbol(OK)).not.toContain('VIEWBOX_DIMS') // 0 0 64 64 ↔ 64×64 一致
  })

  it('SVG_XMLNS：svg 缺 xmlns → dataURI 按 XML 解析不保证（部分浏览器整图空白）', () => {
    const noNs = broken({ svg: '<svg viewBox="0 0 64 64"><rect/></svg>' })
    expect(lintSymbol(noNs)).toContain('SVG_XMLNS')
  })

  it('THUMB_ANCHOR：缩略图 dataURI 内 data-ah-id 与注册 id 不一致 → E2E 定位锚 img[src*="ah-xxx"] 失效', () => {
    const mis = broken({
      thumbnail: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg data-ah-id="ah-other" xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
    })
    expect(lintSymbol(mis)).toContain('THUMB_ANCHOR')
    const okThumb = broken({
      thumbnail: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg data-ah-id="ah-x" xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
    })
    expect(lintSymbol(okThumb)).not.toContain('THUMB_ANCHOR')
    // 空 thumbnail（非 dataURI）不在此规则覆盖（旧占位路径）
    expect(lintSymbol(OK)).not.toContain('THUMB_ANCHOR')
  })

  it('VUE_EMPTY_STR：vue/custom-svg 型 input prop 默认值空串 → jT 替换为 #mt_slot 占位（bundle 960697）', () => {
    const empty = broken({ type: 'vue', svg: undefined, props: { fill: OK.props.fill, label: { title: '标签', type: 'input', val: '' } } })
    expect(lintSymbol(empty)).toContain('VUE_EMPTY_STR')
    // svg 型空串 val 无 jT 管线，不误报
    const svgEmpty = broken({ props: { fill: OK.props.fill, label: { title: '标签', type: 'input', val: '' } } })
    expect(lintSymbol(svgEmpty)).not.toContain('VUE_EMPTY_STR')
  })
})
