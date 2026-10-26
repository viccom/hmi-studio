import { describe, it, expect } from 'vitest'
import { ApiError } from './api'
import { blankScreen, wrapDoc, screensApi } from './screens'
import { batched, loadScreenCards, groupSections } from './screen-list'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('batched 并发分批器', () => {
  it('同批并发 ≤ cap；返回顺序 = 输入顺序', async () => {
    let running = 0
    let peak = 0
    const out = await batched([1, 2, 3, 4, 5], 2, async (x) => {
      running++
      peak = Math.max(peak, running)
      await sleep(5)
      running--
      return x * 10
    })
    expect(out).toEqual([10, 20, 30, 40, 50])
    expect(peak).toBe(2)
  })

  it('批次顺序稳定：下一批开跑前上一批已全部结束；cap ≥ 长度时单批直达', async () => {
    const log: string[] = []
    await batched([1, 2, 3], 2, async (x) => {
      log.push(`s${x}`)
      await sleep(5)
      log.push(`e${x}`)
    })
    // 批1（1,2）全部结束之后批2（3）才开始
    expect(log.indexOf('s3')).toBeGreaterThan(log.indexOf('e1'))
    expect(log.indexOf('s3')).toBeGreaterThan(log.indexOf('e2'))
    const order: number[] = []
    const out = await batched([1, 2], 10, async (x, i) => { order.push(i); return i })
    expect(out).toEqual([0, 1])
    expect(order).toEqual([0, 1])
  })

  it('空输入直接返回空数组', async () => {
    expect(await batched([], 3, async (x) => x)).toEqual([])
  })
})

describe('loadScreenCards', () => {
  it('2 个 id → 2 张卡 {id,name,group,done}；某 id 404 跳过该卡不整体失败', async () => {
    const fake = {
      list: async () => ['a', 'gone', 'b'],
      get: async (id: string) => {
        if (id === 'gone') throw new ApiError(404, 'not found')
        const doc = wrapDoc(blankScreen(id), { name: `N-${id}`, group: 'g1' })
        return { id, doc }
      },
      put: async () => undefined,
      del: async () => undefined,
    }
    const cards = await loadScreenCards(fake as ReturnType<typeof screensApi>, 6)
    expect(cards).toHaveLength(2)
    // done（IExportJson）随卡返回——T17 缩略图渲染源
    expect(cards.map(({ id, name, group, done }) => ({ id, name, group, hasDone: done !== undefined })))
      .toEqual([
        { id: 'a', name: 'N-a', group: 'g1', hasDone: true },
        { id: 'b', name: 'N-b', group: 'g1', hasDone: true },
      ])
  })

  it('默认并发 cap=4（T17 既定：6→4 保护 rs-iot）', async () => {
    let running = 0
    let peak = 0
    const fake = {
      list: async () => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      get: async (id: string) => {
        running++
        peak = Math.max(peak, running)
        await sleep(5)
        running--
        return { id, doc: wrapDoc(blankScreen(id), {}) }
      },
      put: async () => undefined,
      del: async () => undefined,
    }
    const cards = await loadScreenCards(fake as ReturnType<typeof screensApi>)
    expect(cards).toHaveLength(8)
    expect(peak).toBe(4)
  })

  it('非 404 错误照常上抛（网络/服务端问题不静默吞掉）', async () => {
    const fake = {
      list: async () => ['a'],
      get: async () => { throw new ApiError(500, 'boom') },
      put: async () => undefined,
      del: async () => undefined,
    }
    await expect(loadScreenCards(fake as ReturnType<typeof screensApi>, 6))
      .rejects.toBeInstanceOf(ApiError)
  })
})

// W8 画面分组：列表分区/切换器两层共用同一分区器——单一权威排序语义
describe('groupSections', () => {
  const card = (id: string, name?: string, group?: string) => ({ id, name, group })

  it('分组分区；组内按名称排序；未组归「未分组」区排最后', () => {
    const sections = groupSections([
      card('c', '丙', '生产'),
      card('b', '乙', '生产'),
      card('u2', '乙二', undefined),
      card('a', '甲', '测试'),
      card('u1', '甲一', undefined),
    ])
    expect(sections).toEqual([
      { name: '测试', cards: [card('a', '甲', '测试')] },
      { name: '生产', cards: [card('c', '丙', '生产'), card('b', '乙', '生产')] },
      { name: '', cards: [card('u1', '甲一'), card('u2', '乙二')] },
    ])
  })

  it('缺名卡以 id 参与组内排序（name ?? id；zh 拼音序，汉字与拉丁同表混排）', () => {
    const sections = groupSections([card('z', undefined, 'g'), card('a', '甲', 'g')])
    expect(sections[0].cards.map((c) => c.id)).toEqual(['a', 'z']) // 甲(jia) < z
  })

  it('组名按 localeCompare 排序（中文按拼音序稳定）；空输入 → 空数组', () => {
    const sections = groupSections([
      card('1', 'n', '运维'),
      card('2', 'n', '安全'),
      card('3', 'n', '生产'),
    ])
    expect(sections.map((s) => s.name)).toEqual(['安全', '生产', '运维'])
    expect(groupSections([])).toEqual([])
  })
})
