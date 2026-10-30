import { describe, expect, it, vi } from 'vitest'
import { HmiBackend } from '../backend'
import { compactDevices, registerDataTools } from './data'

/** 工具 handler 直调测试：绕开 MCP SDK 传输层，抓 registerTool 注册表模拟调参。 */
function captureRegistration() {
  const registry = new Map<string, { opts: Record<string, unknown>; cb: (args: unknown) => Promise<{ content: Array<Record<string, unknown>> }> }>()
  const server = {
    registerTool: (name: string, opts: Record<string, unknown>, cb: (args: unknown) => Promise<{ content: Array<Record<string, unknown>> }>) => {
      registry.set(name, { opts, cb })
    },
  }
  return { server, registry }
}

function fetchJson(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

async function callTool(registry: Map<string, { cb: (args: unknown) => Promise<{ content: Array<Record<string, unknown>> }> }>, name: string, args: unknown): Promise<unknown> {
  const t = registry.get(name)
  expect(t, name).toBeDefined()
  const res = await t!.cb(args)
  return JSON.parse((res.content[0] as { text: string }).text)
}

describe('registerDataTools', () => {
  it('registers the four read tools with readOnlyHint', () => {
    const { server, registry } = captureRegistration()
    registerDataTools(server, new HmiBackend({ fetchImpl: fetchJson({}) }))
    for (const name of ['hmi_list_devices', 'hmi_list_points', 'hmi_query_history', 'hmi_list_alarms']) {
      expect(registry.has(name), name).toBe(true)
      expect((registry.get(name)!.opts.annotations as Record<string, unknown>).readOnlyHint).toBe(true)
    }
  })

  it('hmi_list_devices compacts children to tag_count', async () => {
    const { server, registry } = captureRegistration()
    registerDataTools(server, new HmiBackend({ fetchImpl: fetchJson({
      devA: { label: 'A 泵', model: 'm1', owner_inst: 'inst1', children: [{}, {}] },
      devB: { label: 'B', owner_inst: null },
    }) }))
    const out = await callTool(registry, 'hmi_list_devices', {}) as Record<string, unknown>
    expect((out.devA as Record<string, unknown>).tag_count).toBe(2)
    expect((out.devA as Record<string, unknown>).label).toBe('A 泵')
    expect(Object.keys(out.devA as object)).not.toContain('children')
    expect((out.devB as Record<string, unknown>).tag_count).toBeUndefined()
  })

  it('hmi_list_points filters single devid and reports unknown', async () => {
    const { server, registry } = captureRegistration()
    const devreg = { devA: { points: 3 } }
    registerDataTools(server, new HmiBackend({ fetchImpl: fetchJson(devreg) }))
    const one = await callTool(registry, 'hmi_list_points', { devid: 'devA' })
    expect(one).toEqual({ devA: { points: 3 } })
    const miss = await callTool(registry, 'hmi_list_points', { devid: 'nope' }) as Record<string, unknown>
    expect(miss.error).toContain('nope')
    expect(miss.known).toEqual(['devA'])
  })

  it('hmi_query_history passes wire queries verbatim when agg+interval paired', async () => {
    const f = fetchJson({ results: [] })
    const { server, registry } = captureRegistration()
    registerDataTools(server, new HmiBackend({ fetchImpl: f }))
    await callTool(registry, 'hmi_query_history', {
      queries: [
        { dev_id: 'd1', tag: 't1', start: 100, end: 200 },
        { dev_id: 'd2', tag: 't2', start: 100, end: 200, agg: 'avg', interval: 60 },
        { dev_id: 'd3', tag: 't3', start: 1, end: 2, agg: 'avg' }, // 半给 → raw 语义
      ],
    })
    const [, init] = (f as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { queries: Array<Record<string, unknown>> }
    expect(body.queries[0]).toEqual({ dev_id: 'd1', tag: 't1', start: 100, end: 200 })
    expect(body.queries[1]).toEqual({ dev_id: 'd2', tag: 't2', start: 100, end: 200, agg: 'avg', interval: 60 })
    expect(body.queries[2]).toEqual({ dev_id: 'd3', tag: 't3', start: 1, end: 2 })
    expect((init.headers as Record<string, string>).authorization).toBeUndefined()
  })

  it('hmi_query_history rejects >32 queries via zod max（行为级断言）', async () => {
    const { server, registry } = captureRegistration()
    registerDataTools(server, new HmiBackend({ fetchImpl: fetchJson({}) }))
    const t = registry.get('hmi_query_history')!
    const shape = t.opts.inputSchema as { queries: { safeParse(v: unknown): { success: boolean } } }
    const q = { dev_id: 'd', tag: 't', start: 0, end: 1 }
    expect(shape.queries.safeParse(Array.from({ length: 33 }, () => ({ ...q }))).success).toBe(false)
    expect(shape.queries.safeParse(Array.from({ length: 32 }, () => ({ ...q }))).success).toBe(true)
    expect(shape.queries.safeParse([]).success).toBe(false)
  })

  it('hmi_list_alarms passes through backend array', async () => {
    const alarms = [{ key: 'k1', level: 'warn', source: 'devA', message: 'm', ts: 't', count: 2 }]
    const { server, registry } = captureRegistration()
    registerDataTools(server, new HmiBackend({ fetchImpl: fetchJson(alarms) }))
    expect(await callTool(registry, 'hmi_list_alarms', {})).toEqual(alarms)
  })
})

describe('compactDevices 宽松形状', () => {
  it('tolerates null / non-object entries', () => {
    const out = compactDevices({ a: null, b: 'str', c: { label: 'C' } }) as Record<string, unknown>
    expect(out.a).toBeNull()
    expect(out.b).toBe('str')
    expect(out.c).toEqual({ label: 'C', tag_count: undefined })
  })
})
