import { describe, it, expect } from 'vitest'
import { blankScene3D, sceneStore } from './store'

/**
 * 3D 场景存储面（Q1a 决策：独立 `scenes` 资源族，2026-11-26）。
 *
 * 关键防线：**不得**再走 `/api/v1/screens`——那会让 3D 与 2D 混在同一资源族，
 * 重新引入 128 KiB 上限、2D 列表过滤、hmi-mcp 误判三项补偿设计。
 */
function fakeClient() {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  const client = {
    get: async (url: string) => { calls.push({ method: 'get', url }); return { id: 'x', doc: blankScene3D('x'), version: 3 } },
    put: async (url: string, body: unknown) => { calls.push({ method: 'put', url, body }); return { status: 'ok', version: 4 } },
    del: async (url: string) => { calls.push({ method: 'del', url }); return {} },
  }
  return { client, calls }
}

describe('sceneStore 资源族', () => {
  it('list 走 /api/v1/scenes 且读 scenes 字段（不是 screens）', async () => {
    const calls: string[] = []
    const client = { get: async (url: string) => { calls.push(url); return { scenes: ['a', 'b'] } } }
    const store = sceneStore(client as never)
    expect(await store.list()).toEqual(['a', 'b'])
    expect(calls[0]).toBe('/api/v1/scenes')
  })

  it('get/put/del 全部指向 /api/v1/scenes/{id}，绝不出现 /screens', async () => {
    const { client, calls } = fakeClient()
    const store = sceneStore(client as never)
    await store.get('sc-1')
    await store.put('sc-1', blankScene3D('sc-1'))
    await store.del('sc-1')
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'get /api/v1/scenes/sc-1',
      'put /api/v1/scenes/sc-1',
      'del /api/v1/scenes/sc-1',
    ])
    expect(calls.some((c) => c.url.includes('/screens'))).toBe(false)
  })

  it('put 带 if_version 时拼查询参数（乐观锁）', async () => {
    const { client, calls } = fakeClient()
    const store = sceneStore(client as never)
    await store.put('sc-1', blankScene3D('sc-1'), 7)
    expect(calls[0].url).toBe('/api/v1/scenes/sc-1?if_version=7')
  })

  it('get 对非 3D 文档抛错（收窄取回，防止误用）', async () => {
    const client = { get: async () => ({ id: 'x', doc: { canvasCfg: {}, json: [] }, version: 1 }) }
    const store = sceneStore(client as never)
    await expect(store.get('x')).rejects.toThrow(/不是 3D 场景文档/)
  })
})
