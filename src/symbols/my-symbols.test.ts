import { describe, expect, it } from 'vitest'
import { buildSymbolDoc, toRegistrationItem, MY_SYMBOLS_GROUP } from './my-symbols'

/** 探针报告 §1 的 group 项最小形状（children 内存形态省略内部字段） */
function groupItem(): Record<string, unknown> {
  return {
    id: 'group-abc', title: '组合', type: 'group', tag: 'group',
    binfo: { left: 300, top: 180, width: 268, height: 164, angle: 0 },
    props: {},
    children: [
      { id: 'pc-pump', title: '泵', type: 'svg', tag: 'ah-pump', binfo: { left: 0, top: 0, width: 60, height: 60 }, props: { fill: { val: '#52c41a' } }, symbol: { symbol_id: 'ah-pump' }, binds: [{ bind_id: 'd.power' }] },
      { id: 'pc-tank', title: '罐', type: 'svg', tag: 'ah-tank', binfo: { left: 70, top: 55, width: 30, height: 45 }, props: {}, symbol: { symbol_id: 'ah-tank' } },
    ],
  }
}

describe('buildSymbolDoc（存为符号载荷）', () => {
  it('clones group item as combin_json with bbox-derived size', () => {
    const doc = buildSymbolDoc(groupItem() as never, '泵阀站')
    expect(doc.name).toBe('泵阀站')
    expect(doc.width).toBe(268)
    expect(doc.height).toBe(164)
    const cj = doc.combin_json as Record<string, any>
    expect(cj.type).toBe('group')
    expect(cj.children.length).toBe(2)
    // 子项的 symbol 私有部分与 binds 原样保留（渲染/绑定恢复的充要条件）
    expect(cj.children[0].symbol.symbol_id).toBe('ah-pump')
    expect(cj.children[0].binds[0].bind_id).toBe('d.power')
    // 克隆不共享引用（画布后续改动不得渗入已存符号）
    expect(cj).not.toBe(groupItem())
  })

  it('rejects non-group items（v1：先 Ctrl+G 组合）', () => {
    expect(() => buildSymbolDoc({ type: 'svg', id: 'x' } as never, 'x')).toThrow(/组合/)
  })

  it('rejects group without children', () => {
    const g = { ...groupItem(), children: [] }
    expect(() => buildSymbolDoc(g as never, 'x')).toThrow(/子图元/)
  })
})

describe('toRegistrationItem（启动注册）', () => {
  it('builds reg-combin item with sym- id prefix and stored name', () => {
    const doc = buildSymbolDoc(groupItem() as never, '泵阀站')
    const item = toRegistrationItem('pump-station', doc)
    expect(item.id).toBe('sym-pump-station')
    expect(item.title).toBe('泵阀站')
    expect(item.type).toBe('reg-combin')
    expect(item.combin_json).toBe(doc.combin_json)
    expect(item.width).toBe(268)
    // 存储缺 width/binfo 时回落 100（拖入默认尺寸）
    const fb = toRegistrationItem('x', { name: 'X', combin_json: {} })
    expect(fb.width).toBe(100)
    expect(fb.height).toBe(100)
  })

  it('group name is stable（左面板组名单源）', () => {
    expect(MY_SYMBOLS_GROUP).toBe('我的符号')
  })
})
