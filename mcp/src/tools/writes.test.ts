import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { HmiBackend } from '../backend'
import { PROTECTED_SLUGS } from '../../../src/screen-assets/protected'
import { registerWriteTools, PUT_PROTECTED_MESSAGE_PREFIX } from './writes'

/** 工具 handler 直调测试（data.test.ts 同款）：抓 registerTool 注册表模拟调参。 */
function captureRegistration() {
  const registry = new Map<string, { opts: Record<string, unknown>; cb: (args: unknown) => Promise<{ content: Array<Record<string, unknown>> }> }>()
  const server = {
    registerTool: (name: string, opts: Record<string, unknown>, cb: (args: unknown) => Promise<{ content: Array<Record<string, unknown>> }>) => {
      registry.set(name, { opts, cb })
    },
  }
  return { server, registry }
}

interface Route { m: string; p: string; status?: number; body?: unknown }

/** 按 method+path 分派的 mock fetch（写工具流程 = 多请求串行，需精确路由）。 */
function routeFetch(routes: Route[]): typeof fetch {
  const calls: Array<[string, RequestInit | undefined]> = []
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init])
    const m = (init?.method ?? 'GET').toUpperCase()
    const path = url.replace('http://127.0.0.1:8790', '')
    const r = routes.find((x) => x.m === m && x.p === path)
    if (!r) return new Response(JSON.stringify({ error: `no route ${m} ${path}` }), { status: 404 })
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status ?? 200 })
  }) as unknown as typeof fetch
  return f
}

function callsOf(f: typeof fetch): Array<[string, RequestInit | undefined]> {
  return (f as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit | undefined]>
}

async function callTool(registry: Map<string, { cb: (args: unknown) => Promise<{ content: Array<Record<string, unknown>> }> }>, name: string, args: unknown): Promise<Record<string, unknown>> {
  const t = registry.get(name)
  expect(t, name).toBeDefined()
  const res = await t!.cb(args)
  return JSON.parse((res.content[0] as { text: string }).text)
}

function goodDoc(): Record<string, unknown> {
  return {
    name: '测试画面',
    canvasCfg: { width: 800, height: 600 },
    json: [{ id: 'p1', tag: 'ah-tank', props: { fill: '#52c41a' } }],
    eventList: [], eventFlow: [],
  }
}

const PROT = PROTECTED_SLUGS[0] // 'water-demo-m3'（真实保护清单成员）

describe('hmi_create_screen（W：探测 404 才建 + validate 前置 + if_version=0 竞态闸）', () => {
  it('validation errors refuse before any write', async () => {
    const f = routeFetch([])
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    const out = await callTool(registry, 'hmi_create_screen', { id: 'BAD_ID', doc: goodDoc() })
    expect(out.ok).toBe(false)
    expect(out.code).toBe('validation_failed')
    expect(callsOf(f).length).toBe(0)
  })

  it('existing screen refuses (probe 200)', async () => {
    const f = routeFetch([{ m: 'GET', p: `/api/v1/screens/${PROT}`, body: { id: PROT, doc: {}, version: 2 } }])
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    const out = await callTool(registry, 'hmi_create_screen', { id: PROT, doc: goodDoc() })
    expect(out.ok).toBe(false)
    expect(out.code).toBe('exists')
    expect(callsOf(f).some(([_u, i]) => (i?.method ?? 'GET') === 'PUT')).toBe(false)
  })

  it('404 → PUT with ?if_version=0 and sanitized body', async () => {
    const doc = goodDoc()
    ;(doc.json as Array<Record<string, unknown>>)[0] = { id: 'k1', tag: 'ah-bi-kpi', props: { data: '{"rows":[1,2,3]}' } }
    const f = routeFetch([
      { m: 'GET', p: '/api/v1/screens/new-one', status: 404, body: { error: 'not found' } },
      { m: 'PUT', p: '/api/v1/screens/new-one?if_version=0', body: { status: 'ok', version: 1 } },
    ])
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    const out = await callTool(registry, 'hmi_create_screen', { id: 'new-one', doc })
    expect(out.ok).toBe(true)
    expect(out.version).toBe(1)
    const put = callsOf(f).find(([_u, i]) => i?.method === 'PUT')!
    const body = JSON.parse(put[1]!.body as string)
    expect(body.json[0].props.data).toBe('[]')
  })

  it('probe network error (non-404) refuses without PUT', async () => {
    const f = routeFetch([{ m: 'GET', p: '/api/v1/screens/new-one', status: 500, body: { error: 'boom' } }])
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    const out = await callTool(registry, 'hmi_create_screen', { id: 'new-one', doc: goodDoc() })
    expect(out.ok).toBe(false)
    expect(out.code).toBe('probe_failed')
  })
})

describe('hmi_put_screen（W：if_version 必填 + validate 前置 + 409 结构化）', () => {
  function reg(f: typeof fetch) {
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    return { registry }
  }

  it('schema rejects missing if_version（LLM 必须先 hmi_get_screen）', () => {
    const { registry } = reg(routeFetch([]))
    const shape = registry.get('hmi_put_screen')!.opts.inputSchema as Record<string, z.ZodType>
    const r = z.object(shape).safeParse({ id: 'a', doc: goodDoc() })
    expect(r.success).toBe(false)
    const ok = z.object(shape).safeParse({ id: 'a', doc: goodDoc(), if_version: 3 })
    expect(ok.success).toBe(true)
  })

  it('happy path PUTs with if_version query and sanitized body', async () => {
    const f = routeFetch([{ m: 'PUT', p: '/api/v1/screens/scr1?if_version=7', body: { status: 'ok', version: 8 } }])
    const { registry } = reg(f)
    const out = await callTool(registry, 'hmi_put_screen', { id: 'scr1', doc: goodDoc(), if_version: 7 })
    expect(out.ok).toBe(true)
    expect(out.version).toBe(8)
  })

  it('409 returns structured conflict with current_version（可自纠，不 isError）', async () => {
    const f = routeFetch([{ m: 'PUT', p: '/api/v1/screens/scr1?if_version=7', status: 409, body: { error: 'version conflict', current_version: 12 } }])
    const { registry } = reg(f)
    const out = await callTool(registry, 'hmi_put_screen', { id: 'scr1', doc: goodDoc(), if_version: 7 })
    expect(out.ok).toBe(false)
    expect(out.code).toBe('version_conflict')
    expect(out.current_version).toBe(12)
  })

  it('protected slug refuses and points to hmi_put_protected_screen', async () => {
    const f = routeFetch([])
    const { registry } = reg(f)
    const out = await callTool(registry, 'hmi_put_screen', { id: PROT, doc: goodDoc(), if_version: 2 })
    expect(out.ok).toBe(false)
    expect(String(out.message)).toContain(PUT_PROTECTED_MESSAGE_PREFIX)
    expect(callsOf(f).length).toBe(0)
  })

  it('annotations are Write tier（readOnlyHint:false / destructiveHint:false）', () => {
    const { registry } = reg(routeFetch([]))
    const a = registry.get('hmi_put_screen')!.opts.annotations as Record<string, unknown>
    expect(a.readOnlyHint).toBe(false)
    expect(a.destructiveHint).toBe(false)
  })
})

describe('hmi_put_protected_screen（CW：仅保护清单 + destructiveHint）', () => {
  it('non-protected id refuses and points back', async () => {
    const f = routeFetch([])
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    const out = await callTool(registry, 'hmi_put_protected_screen', { id: 'scr1', doc: goodDoc(), if_version: 1 })
    expect(out.ok).toBe(false)
    expect(String(out.message)).toContain('hmi_put_screen')
  })

  it('protected id PUTs and annotation is CriticalWrite', async () => {
    const f = routeFetch([{ m: 'PUT', p: `/api/v1/screens/${PROT}?if_version=4`, body: { status: 'ok', version: 5 } }])
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    const out = await callTool(registry, 'hmi_put_protected_screen', { id: PROT, doc: goodDoc(), if_version: 4 })
    expect(out.ok).toBe(true)
    const a = registry.get('hmi_put_protected_screen')!.opts.annotations as Record<string, unknown>
    expect(a.destructiveHint).toBe(true)
  })
})

describe('hmi_rename_group（W：批量 group 改写，cap4 语义）', () => {
  it('rewrites group field only for members, preserving doc', async () => {
    const mk = (g: string) => ({ id: 'x', version: 2, doc: { name: 'N', group: g, json: [{ id: 'p', tag: 'ah-tank' }], eventList: [], eventFlow: [] } })
    const f = routeFetch([
      { m: 'GET', p: '/api/v1/screens', body: { screens: ['a', 'b', 'c'] } },
      { m: 'GET', p: '/api/v1/screens/a', body: mk('X') },
      { m: 'GET', p: '/api/v1/screens/b', body: mk('Y') },
      { m: 'GET', p: '/api/v1/screens/c', body: mk('X') },
      { m: 'PUT', p: '/api/v1/screens/a?if_version=2', body: { status: 'ok', version: 3 } },
      { m: 'PUT', p: '/api/v1/screens/c?if_version=2', body: { status: 'ok', version: 3 } },
    ])
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    const out = await callTool(registry, 'hmi_rename_group', { from: 'X', to: 'Z' })
    expect(out.ok).toBe(true)
    expect(out.renamed).toBe(2)
    expect(out.screens).toEqual(['a', 'c'])
    const puts = callsOf(f).filter(([_u, i]) => i?.method === 'PUT')
    expect(puts.length).toBe(2)
    // 乐观锁：GET 带出的 version 必须进 query（写族统一强制 if_version）
    expect(puts.every(([u]) => String(u).includes('?if_version=2'))).toBe(true)
    const body = JSON.parse(puts[0][1]!.body as string)
    expect(body.group).toBe('Z')
    expect(body.name).toBe('N')
    expect(body.json).toEqual([{ id: 'p', tag: 'ah-tank' }])
  })

  it('single PUT failure is isolated（fail 计数，另一幅照常）', async () => {
    const mk = (g: string) => ({ id: 'x', version: 2, doc: { name: 'N', group: g, json: [], eventList: [], eventFlow: [] } })
    const f = routeFetch([
      { m: 'GET', p: '/api/v1/screens', body: { screens: ['a', 'b'] } },
      { m: 'GET', p: '/api/v1/screens/a', body: mk('X') },
      { m: 'GET', p: '/api/v1/screens/b', body: mk('X') },
      { m: 'PUT', p: '/api/v1/screens/a?if_version=2', status: 500, body: { error: 'boom' } },
      { m: 'PUT', p: '/api/v1/screens/b?if_version=2', body: { status: 'ok', version: 3 } },
    ])
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    const out = await callTool(registry, 'hmi_rename_group', { from: 'X', to: 'Z' })
    expect(out.ok).toBe(true)
    expect(out.renamed).toBe(1)
    expect(out.fail).toBe(1)
    expect(out.screens).toEqual(['b'])
  })

  it('unread screen is skipped silently（镜像 ScreenListView cards 语义：载入失败者缺席成员表）', async () => {
    const mk = (g: string) => ({ id: 'x', version: 2, doc: { name: 'N', group: g, json: [], eventList: [], eventFlow: [] } })
    const f = routeFetch([
      { m: 'GET', p: '/api/v1/screens', body: { screens: ['a', 'b'] } },
      { m: 'GET', p: '/api/v1/screens/a', status: 500, body: { error: 'boom' } },
      { m: 'GET', p: '/api/v1/screens/b', body: mk('X') },
      { m: 'PUT', p: '/api/v1/screens/b?if_version=2', body: { status: 'ok', version: 3 } },
    ])
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    const out = await callTool(registry, 'hmi_rename_group', { from: 'X', to: 'Z' })
    expect(out.ok).toBe(true)
    expect(out.renamed).toBe(1)
    expect(out.fail).toBe(0)
  })

  it('保护清单画面不参与重命名（W 档工具不得改长期资产）', async () => {
    const prot = PROTECTED_SLUGS[0]
    const mk = () => ({ id: 'x', version: 2, doc: { name: 'N', group: 'X', json: [], eventList: [], eventFlow: [] } })
    const f = routeFetch([
      { m: 'GET', p: '/api/v1/screens', body: { screens: [prot, 'plain-a'] } },
      { m: 'GET', p: `/api/v1/screens/${prot}`, body: mk() },
      { m: 'GET', p: '/api/v1/screens/plain-a', body: mk() },
      { m: 'PUT', p: '/api/v1/screens/plain-a?if_version=2', body: { status: 'ok', version: 3 } },
    ])
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    const out = await callTool(registry, 'hmi_rename_group', { from: 'X', to: 'Z' })
    expect(out.renamed).toBe(1)
    expect(out.protected_skipped).toEqual([prot])
    expect(out.message).toMatch(/长期资产/)
    // 保护画面绝不能被 PUT（mock 无该路由：若被写会 404 → 计入 fail，下面两条同时兜底）
    const protPuts = callsOf(f).filter(([u, i]) => i?.method === 'PUT' && String(u).includes(`/screens/${prot}`))
    expect(protPuts.length).toBe(0)
    expect(out.fail).toBe(0)
  })

  it('409 计入 conflicts（不吞成 fail，LLM 可据此重取重试）', async () => {
    const mk = () => ({ id: 'x', version: 5, doc: { name: 'N', group: 'X', json: [], eventList: [], eventFlow: [] } })
    const f = routeFetch([
      { m: 'GET', p: '/api/v1/screens', body: { screens: ['a'] } },
      { m: 'GET', p: '/api/v1/screens/a', body: mk() },
      { m: 'PUT', p: '/api/v1/screens/a?if_version=5', status: 409, body: { error: 'version conflict', current_version: 7 } },
    ])
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    const out = await callTool(registry, 'hmi_rename_group', { from: 'X', to: 'Z' })
    expect(out.renamed).toBe(0)
    expect(out.conflicts).toEqual(['a'])
    expect(out.fail).toBe(0)
  })
})

describe('hmi_rollback_screen / hmi_delete_screen（CW）', () => {
  it('rollback posts to_version and optional if_version', async () => {
    const f = routeFetch([{ m: 'POST', p: '/api/v1/screens/scr1/rollback?if_version=9', body: { status: 'ok', version: 10 } }])
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    const out = await callTool(registry, 'hmi_rollback_screen', { id: 'scr1', to_version: 2, if_version: 9 })
    expect(out.ok).toBe(true)
    const post = callsOf(f).find(([_u, i]) => i?.method === 'POST')!
    expect(JSON.parse(post[1]!.body as string)).toEqual({ to_version: 2 })
  })

  it('delete hard-rejects every protected slug（无 force 通道）', async () => {
    const f = routeFetch([])
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    for (const slug of PROTECTED_SLUGS) {
      const out = await callTool(registry, 'hmi_delete_screen', { id: slug })
      expect(out.ok, slug).toBe(false)
      expect(out.code, slug).toBe('protected')
      expect(String(out.message)).toContain('人工')
    }
    expect(callsOf(f).length).toBe(0)
  })

  it('delete normal slug calls DELETE（幂等）', async () => {
    const f = routeFetch([{ m: 'DELETE', p: '/api/v1/screens/tmp-1', body: { status: 'ok' } }])
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: f }))
    const out = await callTool(registry, 'hmi_delete_screen', { id: 'tmp-1' })
    expect(out.ok).toBe(true)
  })

  it('CW annotations on rollback/delete', () => {
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: routeFetch([]) }))
    for (const name of ['hmi_rollback_screen', 'hmi_delete_screen']) {
      const a = registry.get(name)!.opts.annotations as Record<string, unknown>
      expect(a.readOnlyHint, name).toBe(false)
      expect(a.destructiveHint, name).toBe(true)
    }
  })
})

describe('hmi_install_plugin（CW：spawn install-plugin.mjs）', () => {
  it('spawns node <repo>/scripts/install-plugin.mjs <source_dir>', async () => {
    const spawns: Array<{ cmd: string; args: string[] }> = []
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: routeFetch([]) }), {
      spawnImpl: async (cmd, args) => {
        spawns.push({ cmd, args })
        return { code: 0, stdout: 'installed hello-card@0.1.0', stderr: '' }
      },
    })
    const out = await callTool(registry, 'hmi_install_plugin', { source_dir: '/tmp/wp/hello-card' })
    expect(out.ok).toBe(true)
    expect(spawns.length).toBe(1)
    expect(spawns[0].cmd).toBe('node')
    expect(spawns[0].args[0]).toMatch(/scripts\/install-plugin\.mjs$/)
    expect(spawns[0].args[1]).toBe('/tmp/wp/hello-card')
    expect(String(out.stdout)).toContain('hello-card')
  })

  it('non-zero exit returns install_failed with stderr', async () => {
    const { server, registry } = captureRegistration()
    registerWriteTools(server, new HmiBackend({ fetchImpl: routeFetch([]) }), {
      spawnImpl: async () => ({ code: 1, stdout: '', stderr: 'manifest: id 不能以 ah- 开头' }),
    })
    const out = await callTool(registry, 'hmi_install_plugin', { source_dir: '/tmp/wp/bad' })
    expect(out.ok).toBe(false)
    expect(out.code).toBe('install_failed')
    expect(String(out.stderr)).toContain('ah-')
  })
})
