import { describe, it, expect } from 'vitest'
import { ApiError } from './api'
import { blankScreen, wrapDoc, screensApi } from './screens'
import { batched, loadScreenCards } from './screen-list'

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
  it('2 个 id → 2 张卡 {id,name,group}；某 id 404 跳过该卡不整体失败', async () => {
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
    expect(cards).toEqual([
      { id: 'a', name: 'N-a', group: 'g1' },
      { id: 'b', name: 'N-b', group: 'g1' },
    ])
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
