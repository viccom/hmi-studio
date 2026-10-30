import { afterEach, describe, expect, it, vi } from 'vitest'
import { HmiApiError, HmiBackend } from './backend'

function fetchJson(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })) as unknown as typeof fetch
}

const ENV_KEYS = ['HMI_BASE_URL', 'HMI_JWT'] as const

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
  vi.restoreAllMocks()
})

describe('HmiBackend', () => {
  it('defaults to 127.0.0.1:8790 and sends bearer when jwt set', async () => {
    process.env.HMI_JWT = 'tok-1'
    const f = fetchJson({ ok: 1 })
    const b = new HmiBackend({ fetchImpl: f })
    expect(b.baseUrl).toBe('http://127.0.0.1:8790')
    await b.get('/api/v1/screens')
    const [url, init] = (f as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8790/api/v1/screens')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-1')
  })

  it('honors HMI_BASE_URL and trailing slash normalization', () => {
    process.env.HMI_BASE_URL = 'http://10.0.0.5:18790/'
    const b = new HmiBackend({ fetchImpl: fetchJson({}) })
    expect(b.baseUrl).toBe('http://10.0.0.5:18790')
  })

  it('throws HmiApiError with status + body on non-2xx', async () => {
    const f = vi.fn(async () => new Response('{"error":"no"}', { status: 404 })) as unknown as typeof fetch
    const b = new HmiBackend({ fetchImpl: f })
    await expect(b.get('/api/v1/screens/x')).rejects.toMatchObject({ status: 404 })
  })

  it('post serializes json body with content-type', async () => {
    const f = fetchJson({ results: [] })
    const b = new HmiBackend({ fetchImpl: f })
    await b.post('/api/v1/history/batch', { queries: [{ dev_id: 'd' }] })
    const [, init] = (f as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ queries: [{ dev_id: 'd' }] }))
  })

  it('no auth header when jwt empty (call site refuses before anyway)', async () => {
    const f = fetchJson({})
    const b = new HmiBackend({ fetchImpl: f })
    await b.get('/x')
    const [, init] = (f as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBeUndefined()
  })

  it('HmiApiError message truncates body', () => {
    const e = new HmiApiError(500, 'x'.repeat(500))
    expect(e.message.length).toBeLessThan(300)
  })

  it('attaches an AbortSignal timeout to every request（rs-iot 僵死不无限挂起）', async () => {
    const f = fetchJson({})
    const b = new HmiBackend({ fetchImpl: f })
    await b.get('/api/v1/screens')
    const [, init] = (f as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect((init.signal as AbortSignal).aborted).toBe(false)
  })

  it('timeoutMs is injectable（单测可控 + 工具场景默认 30s）', async () => {
    const f = fetchJson({})
    const b = new HmiBackend({ fetchImpl: f, timeoutMs: 60_000 })
    expect(b.timeoutMs).toBe(60_000)
    const b2 = new HmiBackend({ fetchImpl: f })
    expect(b2.timeoutMs).toBe(30_000)
  })
})
