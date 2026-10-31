import { describe, expect, it } from 'vitest'
import { applyFallback, restoreStashed, MISSING_TAG, knownTags } from './plugin-fallback'
import { pluginSymbols } from './plugin-loader'

function tankItem(id = 't1', extraProps: Record<string, unknown> = { fill: '#52c41a' }): Record<string, unknown> {
  return { id, title: '罐', type: 'svg', tag: 'ah-tank', binfo: { left: 10, top: 10, width: 80, height: 90 }, props: extraProps, binds: [], events: [] }
}

function done(items: unknown[]): Record<string, unknown> {
  return { canvasCfg: {}, json: items, eventList: [], eventFlow: [] }
}

describe('knownTags', () => {
  it('contains registry + builtin + group + placeholder', () => {
    const t = knownTags()
    expect(t.has('ah-tank')).toBe(true)
    expect(t.has('text-vue')).toBe(true)
    expect(t.has('group')).toBe(true)
    expect(t.has(MISSING_TAG)).toBe(true)
    expect(t.has('hello-card')).toBe(false)
  })
})

describe('applyFallback（未知 tag → 占位）', () => {
  it('replaces unknown-tag item with placeholder keeping id/binds/size', () => {
    const orig: Record<string, unknown> = { ...tankItem('p1'), tag: 'hello-card', binds: [{ id: 'b1', bind_id: 'd.x', bind_attr: 'props.text.val' }] }
    const r = applyFallback(done([tankItem(), orig]))
    expect(r.degraded).toEqual([{ id: 'p1', tag: 'hello-card', reason: 'unknown_tag' }])
    const replaced = (r.done.json as Array<Record<string, unknown>>)[1]
    expect(replaced.tag).toBe(MISSING_TAG)
    expect(replaced.id).toBe('p1')
    expect(replaced.binfo).toEqual(orig.binfo)
    expect(replaced.binds).toEqual(orig.binds)
    expect((replaced.props as Record<string, any>).missing_tag.val).toBe('hello-card')
    expect(r.stashed.get('p1')).toBe(orig)
  })

  it('recurses into group children（group 项本体不降级）', () => {
    const g = { id: 'g1', title: '组合', type: 'group', tag: 'group', binfo: {}, children: [{ ...tankItem('c1'), tag: 'gone-plugin' }] }
    const r = applyFallback(done([g]))
    expect(r.degraded.map((d) => d.id)).toEqual(['c1'])
    const top = (r.done.json as Array<Record<string, unknown>>)[0]
    expect(top.tag).toBe('group')
    expect(((top.children as Array<Record<string, unknown>>)[0]).tag).toBe(MISSING_TAG)
    expect(r.stashed.get('c1')).toBeDefined()
  })

  it('known tags untouched', () => {
    const r = applyFallback(done([tankItem(), { id: 'x', title: '文字', tag: 'text-vue', type: 'vue', props: { text: 'hi' } }]))
    expect(r.degraded).toEqual([])
    expect(r.stashed.size).toBe(0)
  })
})

describe('applyFallback（未知 props 键剔除）', () => {
  it('strips unknown prop keys on known tag and warns', () => {
    const r = applyFallback(done([tankItem('t9', { fill: '#fff', mystery: 1 })]))
    expect(r.degraded).toEqual([{ id: 't9', tag: 'ah-tank', reason: 'unknown_props' }])
    const item = (r.done.json as Array<Record<string, unknown>>)[0]
    expect(item.props).toEqual({ fill: '#fff' })
    expect(r.stashed.size).toBe(0) // 剔键不存档（非破坏性替换）
  })

  it('清洗未知 props 后仍递归 children（旧实现提前 return，子树未知 tag 漏降级）', () => {
    pluginSymbols().set('plug-box', new Set(['fill']))
    try {
      const g = {
        id: 'pg', title: '插件组合', type: 'vue', tag: 'plug-box', binfo: {},
        props: { fill: { val: '#fff' }, old_key: { val: 1 } },
        children: [{ id: 'c9', title: '子', type: 'svg', tag: 'gone-plugin', binfo: {} }],
      }
      const r = applyFallback(done([g]))
      expect(r.degraded.map((d) => `${d.id}:${d.reason}`)).toEqual(['pg:unknown_props', 'c9:unknown_tag'])
      const top = (r.done.json as Array<Record<string, unknown>>)[0]
      expect(top.props).toEqual({ fill: { val: '#fff' } })
      expect((top.children as Array<Record<string, unknown>>)[0].tag).toBe(MISSING_TAG)
      expect(r.stashed.get('c9')).toBeDefined()
    } finally {
      pluginSymbols().delete('plug-box')
    }
  })
})

describe('restoreStashed（编辑侧保存不丢数据）', () => {
  it('round-trips placeholder back to original on save', () => {
    const orig: Record<string, unknown> = { ...tankItem('p2'), tag: 'hello-card' }
    const fb = applyFallback(done([tankItem(), orig]))
    // 保存 payload：maotu 拍平 props（占位描述符变平面值）
    const payload = { ...fb.done, json: (fb.done.json as unknown[]).map((i) => ({ ...(i as Rec), props: 1 })) }
    const restored = restoreStashed(payload as Rec2, fb.stashed)
    const items = restored.json as Array<Record<string, unknown>>
    expect(items[1].tag).toBe('hello-card')
    expect(items[1].props).toEqual(orig.props)
    // 非占位项不动
    expect(items[0].tag).toBe('ah-tank')
    expect(items[0].props).toBe(1)
  })

  it('no stash = passthrough（零开销路径）', () => {
    const payload = done([tankItem()])
    expect(restoreStashed(payload, new Map())).toBe(payload)
  })

  it('占位框上的移动/缩放（binfo）保留，数据字段以存档为准（审查 #7）', () => {
    const orig: Record<string, unknown> = { ...tankItem('p3'), tag: 'hello-card', binfo: { left: 10, top: 10, width: 80, height: 90 } }
    const fb = applyFallback(done([orig]))
    const moved = { left: 99, top: 88, width: 120, height: 60 }
    const payload = { ...fb.done, json: (fb.done.json as unknown[]).map((i) => ({ ...(i as Rec), binfo: moved })) }
    const restored = restoreStashed(payload as Rec2, fb.stashed)
    const item = (restored.json as Array<Record<string, unknown>>)[0]
    expect(item.tag).toBe('hello-card')
    expect(item.binfo).toEqual(moved) // 用户编辑保留
    expect(item.props).toEqual(orig.props) // 原数据不丢
  })
})

type Rec = Record<string, unknown>
type Rec2 = Record<string, unknown>
