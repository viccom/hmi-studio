import { describe, it, expect } from 'vitest'
import { updateScreenMeta, renameGroup, disbandGroup } from './screen-group'
import { blankScreen, screensApi } from './screens'

/** 内存版 screens client：doc 存 Map，记录 PUT 调用（断言改写形状） */
function memClient(): ReturnType<typeof screensApi> & {
  docs: Map<string, Record<string, unknown>>
  puts: { id: string; doc: Record<string, unknown> }[]
} {
  const docs = new Map<string, Record<string, unknown>>()
  const puts: { id: string; doc: Record<string, unknown> }[] = []
  return {
    docs,
    puts,
    list: async () => [...docs.keys()],
    get: async (id: string) => {
      if (!docs.has(id)) throw Object.assign(new Error('api 404'), { status: 404 })
      return { id, doc: docs.get(id) } as unknown as { id: string; doc: ReturnType<typeof blankScreen> }
    },
    put: async (id: string, doc: never) => {
      docs.set(id, doc as Record<string, unknown>)
      puts.push({ id, doc: doc as Record<string, unknown> })
    },
    del: async () => {},
  } as unknown as ReturnType<typeof screensApi> & {
    docs: Map<string, Record<string, unknown>>
    puts: { id: string; doc: Record<string, unknown> }[]
  }
}

describe('updateScreenMeta：GET → 合并 → PUT（全量 upsert 下唯一的元数据改法）', () => {
  it('改 group 保留 done 与其他 meta 字段', async () => {
    const c = memClient()
    const base = blankScreen('a')
    c.docs.set('a', { ...base, name: '甲', group: '旧组', devs: [{ id: 'd1' }] })
    await updateScreenMeta(c, 'a', { group: '新组' })
    expect(c.puts).toHaveLength(1)
    const doc = c.puts[0]!.doc
    expect(doc.group).toBe('新组')
    expect(doc.name).toBe('甲')           // 未提及的字段不动
    expect(doc.devs).toEqual([{ id: 'd1' }])
    expect(doc.json).toEqual([])          // done 完整保留
  })

  it("group: '' = 移出组（字段删除而非空串）", async () => {
    const c = memClient()
    c.docs.set('a', { ...blankScreen('a'), group: '旧组' })
    await updateScreenMeta(c, 'a', { group: '' })
    expect('group' in c.puts[0]!.doc).toBe(false)
  })

  it("name: '' 同款删除；group undefined = 不动", async () => {
    const c = memClient()
    c.docs.set('a', { ...blankScreen('a'), name: '甲', group: 'g' })
    await updateScreenMeta(c, 'a', { name: '' })
    const doc = c.puts[0]!.doc
    expect('name' in doc).toBe(false)
    expect(doc.group).toBe('g')
  })
})

describe('renameGroup：组内全部画面改写 group（分批并发）；同名目标 = 合并语义', () => {
  it('只改 from 组画面；返回成功/失败计数', async () => {
    const c = memClient()
    for (const [id, g] of [['a', '旧'], ['b', '旧'], ['c', '其他']] as const) {
      c.docs.set(id, { ...blankScreen(id), group: g })
    }
    const cards = [
      { id: 'a', group: '旧' }, { id: 'b', group: '旧' }, { id: 'c', group: '其他' },
    ]
    const r = await renameGroup(c, cards, '旧', '新组')
    expect(r).toEqual({ ok: 2, fail: 0 })
    expect(c.docs.get('a')!.group).toBe('新组')
    expect(c.docs.get('b')!.group).toBe('新组')
    expect(c.docs.get('c')!.group).toBe('其他') // 别组不碰
  })

  it('部分失败计数不上抛（画面级隔离）；空组直接零操作', async () => {
    const c = memClient()
    c.docs.set('a', { ...blankScreen('a'), group: 'g' })
    const cards = [{ id: 'a', group: 'g' }, { id: 'gone', group: 'g' }] // gone 不在存储 → 404
    const r = await renameGroup(c, cards, 'g', 'h')
    expect(r).toEqual({ ok: 1, fail: 1 })
    // 空组
    const r2 = await renameGroup(c, cards, '不存在', 'x')
    expect(r2).toEqual({ ok: 0, fail: 0 })
    expect(c.puts.filter(p => p.id === 'gone')).toHaveLength(0)
  })
})

describe('disbandGroup：解散 = 组内画面 group 清除（画面保留归未分组）', () => {
  it('组内画面字段删除；别组不碰', async () => {
    const c = memClient()
    c.docs.set('a', { ...blankScreen('a'), group: 'g' })
    c.docs.set('b', { ...blankScreen('b'), group: 'g' })
    c.docs.set('c', { ...blankScreen('c'), group: 'x' })
    const cards = [
      { id: 'a', group: 'g' }, { id: 'b', group: 'g' }, { id: 'c', group: 'x' },
    ]
    const r = await disbandGroup(c, cards, 'g')
    expect(r).toEqual({ ok: 2, fail: 0 })
    expect('group' in c.docs.get('a')!).toBe(false)
    expect('group' in c.docs.get('b')!).toBe(false)
    expect(c.docs.get('c')!.group).toBe('x')
  })
})
