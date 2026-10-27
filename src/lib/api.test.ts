import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, ApiError, setOnUnauthorized } from './api'

describe('api client', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('带 token 请求；401 抛 ApiError 并触发 onUnauthorized', async () => {
    localStorage.setItem('webhmi_token', 'tok123')
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.includes('/ok')
        ? new Response('{"a":1}', { headers: { 'content-type': 'application/json' } })
        : new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const onUnauthorized = vi.fn()
    const client = api({ base: 'http://x', onUnauthorized })
    expect(await client.get('/ok')).toEqual({ a: 1 })
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer tok123' })
    await expect(client.get('/bad')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('非 2xx 抛 ApiError 携带状态与响应体；JSON 解析失败回退文本', async () => {
    const fetchMock = vi.fn(async () => new Response('{"code":9}', { status: 500, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const client = api({ base: 'http://x' })
    const err = await client.get('/boom').catch((e: unknown) => e) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(500)
    expect(err.body).toEqual({ code: 9 })
    const fetchText = vi.fn(async () => new Response('plain oops', { status: 502 }))
    vi.stubGlobal('fetch', fetchText)
    const err2 = await client.get('/oops').catch((e: unknown) => e) as ApiError
    expect(err2.body).toBe('plain oops')
  })

  it('默认 401 兜底：未显式传 onUnauthorized 的客户端走 setOnUnauthorized 全局钩子', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })))
    const handler = vi.fn()
    setOnUnauthorized(handler)
    try {
      const client = api({ base: 'http://x' })
      await expect(client.get('/bad')).rejects.toBeInstanceOf(ApiError)
      expect(handler).toHaveBeenCalledOnce()
    } finally {
      setOnUnauthorized(undefined)
    }
  })
})
