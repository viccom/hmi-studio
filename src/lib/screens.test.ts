import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from './api'
import { wrapDoc, unwrapDoc, blankScreen, screensApi } from './screens'

describe('screens 契约：wrap/unwrap/blankScreen', () => {
  it('wrap/unwrap round-trip：meta 与 done_json 同体，多余字段保留、meta 键剔除', () => {
    const done = {
      canvasCfg: { width: 800, height: 600 }, gridCfg: { enabled: true, align: true, size: 10 },
      json: [], eventList: [], eventFlow: [], remark: 'keep-me',
    } as any
    const doc = wrapDoc(done, { name: '取水1', group: '水处理' })
    expect(doc.name).toBe('取水1')
    expect(doc.group).toBe('水处理')
    expect(doc.json).toEqual([])
    const back = unwrapDoc(doc)
    expect(back.meta).toEqual({ name: '取水1', group: '水处理' })
    expect(back.done.canvasCfg.width).toBe(800)
    expect(back.done).toHaveProperty('remark', 'keep-me')
    expect('name' in back.done).toBe(false)
    expect('group' in back.done).toBe(false)
  })

  it('unwrap 容错：无 meta 的裸 done_json（历史/probe 数据）不炸', () => {
    const back = unwrapDoc({ canvasCfg: { width: 1 } } as any)
    expect(back.meta.name).toBeUndefined()
    expect(back.meta.group).toBeUndefined()
    expect(back.done.canvasCfg).toEqual({ width: 1 })
  })

  it('blankScreen：800x600 画布 + 空 json/eventList/eventFlow，name=slug', () => {
    const d = blankScreen('test-1')
    expect(d.name).toBe('test-1')
    expect(d.canvasCfg.width).toBe(800)
    expect(d.canvasCfg.height).toBe(600)
    expect(d.json).toEqual([])
    expect(d.eventList).toEqual([])
    expect(d.eventFlow).toEqual([])
  })
})

describe('screensApi CRUD 薄封装（mock fetch）', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

  it('list：GET /api/v1/screens 并解包 {screens:[id...}>', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{"screens":["a","b"]}'))
    vi.stubGlobal('fetch', fetchMock)
    expect(await screensApi(api()).list()).toEqual(['a', 'b'])
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/screens')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET')
  })

  it('get：GET /api/v1/screens/:id → {id,doc}', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{"id":"a","doc":{"name":"A","json":[]}}'))
    vi.stubGlobal('fetch', fetchMock)
    const res = await screensApi(api()).get('a')
    expect(res).toEqual({ id: 'a', doc: { name: 'A', json: [] } })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/screens/a')
  })

  it('put：PUT /api/v1/screens/:id，body 是 doc 整体', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{"status":"ok"}'))
    vi.stubGlobal('fetch', fetchMock)
    const doc = wrapDoc(blankScreen('a'), { name: 'A', group: 'g1' })
    await screensApi(api()).put('a', doc)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/screens/a')
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(String(init?.body))).toEqual(doc)
  })

  it('del：DELETE /api/v1/screens/:id', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{"status":"ok"}'))
    vi.stubGlobal('fetch', fetchMock)
    await screensApi(api()).del('a')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/screens/a')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE')
  })
})
