import { describe, expect, it, vi } from 'vitest'
import { leftAsideStore } from 'maotu'
import { buildSymbolDoc, toRegistrationItem, registerMySymbols, MY_SYMBOLS_GROUP } from './my-symbols'

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

  it('sym- 存储 id 不再双前缀；其它前缀仍隔离到 sym-（审查 N7）', () => {
    const doc = buildSymbolDoc(groupItem() as never, 'X')
    expect(toRegistrationItem('sym-abc', doc).id).toBe('sym-abc')
    expect(toRegistrationItem('ah-legacy', doc).id).toBe('sym-ah-legacy')
  })
})

describe('registerMySymbols（同名更新刷新 + 畸形条目隔离）', () => {
  /** 临时替换 maotu 全局 registerConfig（不触真实左面板）。 */
  async function withReg(fn: (reg: ReturnType<typeof vi.fn>) => void | Promise<void>) {
    const reg = vi.fn()
    const orig = leftAsideStore.registerConfig
    leftAsideStore.registerConfig = reg as unknown as typeof leftAsideStore.registerConfig
    try {
      await fn(reg)
    } finally {
      leftAsideStore.registerConfig = orig
    }
  }

  it('version 变化触发重新注册（同名覆盖复用 id+name——只认 id:name 会拖出旧 combin_json）', async () => {
    await withReg((reg) => {
      const doc = buildSymbolDoc(groupItem() as never, '同名符号-版本去重')
      expect(registerMySymbols([{ id: 'sym-v', doc, version: 1 }])).toBe(1)
      registerMySymbols([{ id: 'sym-v', doc, version: 1 }]) // 内容未变 → 跳过
      expect(reg).toHaveBeenCalledOnce()
      registerMySymbols([{ id: 'sym-v', doc, version: 2 }]) // 内容变了 → 重注册
      expect(reg).toHaveBeenCalledTimes(2)
    })
  })

  it('畸形符号文档逐条跳过，不连坐整组（缺 combin_json 曾致整组静默消失）', async () => {
    await withReg((reg) => {
      const good = buildSymbolDoc(groupItem() as never, '好符号-隔离')
      const n = registerMySymbols([
        { id: 'sym-bad', doc: { name: '坏' } as never, version: 1 },
        { id: 'sym-good', doc: good, version: 1 },
      ])
      expect(n).toBe(1)
      expect(reg).toHaveBeenCalledOnce()
      const items = reg.mock.calls[0][1] as Array<{ id: string }>
      expect(items.map((i) => i.id)).toEqual(['sym-good'])
    })
  })
})
