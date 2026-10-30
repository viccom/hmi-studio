import { describe, expect, it } from 'vitest'
import { describeWidgets } from './widgets'
import { allSymbols } from '../../../src/symbols/registry'
import { SYMBOL_GROUP_DEFS } from '../../../src/symbols/groups'

/** 词典投影防漂移：与 registry/groups 双源恒等（单向快照的是"投影正确"，不是数量迷信）。 */
describe('describeWidgets', () => {
  const d = describeWidgets()

  it('count matches registry exactly (single-source projection)', () => {
    expect(d.count).toBe(allSymbols().length)
    expect(d.widgets.map((w) => w.id)).toEqual(allSymbols().map((s) => s.id))
  })

  it('groups mirror SYMBOL_GROUP_DEFS', () => {
    expect(d.groups).toEqual(SYMBOL_GROUP_DEFS.map((g) => ({ title: g.title, ids: [...g.ids] })))
  })

  it('BI group covers its ids with props contract rows', () => {
    const bi = SYMBOL_GROUP_DEFS.find((g) => g.title === 'BI 数据图表')
    expect(bi).toBeDefined()
    const rows = new Map(d.widgets.map((w) => [w.id, w]))
    for (const id of bi!.ids) {
      const row = rows.get(id)
      expect(row, id).toBeDefined()
      expect(row!.group).toBe('BI 数据图表')
    }
  })

  it('every row exposes props contract as name → {title,type}', () => {
    const tank = d.widgets.find((w) => w.id === 'ah-tank')!
    expect(tank.props.h).toEqual({ title: '液位高度 %', type: 'number' })
    expect(tank.width).toBe(48)
    expect(tank.height).toBe(64)
  })

  it('documents builtin text-vue and bind convention', () => {
    expect(d.builtin_tags.some((t) => t.tag === 'text-vue')).toBe(true)
    expect(d.bind_convention.some((c) => c.includes('props.<name>.val'))).toBe(true)
  })
})
