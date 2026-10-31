import { afterEach, describe, expect, it, vi } from 'vitest'
import { withToolLogging } from './logging'
import type { ToolRegistrar } from './registrar'

type Cb = (args: unknown) => Promise<{ content: Array<Record<string, unknown>> }>

/** 假注册器：抓 handler 供直调，捕获 stderr 日志行。 */
function harness() {
  const handlers = new Map<string, Cb>()
  const base: ToolRegistrar = { registerTool: (name, _cfg, cb) => { handlers.set(name, cb) } }
  const logged: Array<Record<string, unknown>> = []
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string) => {
    try { logged.push(JSON.parse(String(chunk))) } catch { /* 非 JSON 行忽略 */ }
    return true
  }) as typeof process.stderr.write)
  return { registrar: withToolLogging(base), handlers, logged, spy }
}

afterEach(() => vi.restoreAllMocks())

describe('withToolLogging（全工具审计日志）', () => {
  it('成功调用记 tool/tier/ok/ms', async () => {
    const { registrar, handlers, logged } = harness()
    registrar.registerTool('hmi_list_screens', { annotations: { readOnlyHint: true } }, async () => ({ content: [{ type: 'text', text: '{"screens":[]}' }] }))
    await handlers.get('hmi_list_screens')!({})
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatchObject({ tool: 'hmi_list_screens', tier: 'ReadOnly', ok: true })
    expect(typeof logged[0].ms).toBe('number')
  })

  it('风险档映射：destructiveHint → CriticalWrite，其余写 → Write', async () => {
    const { registrar, handlers, logged } = harness()
    registrar.registerTool('cw', { annotations: { readOnlyHint: false, destructiveHint: true } }, async () => ({ content: [] }))
    registrar.registerTool('w', { annotations: { readOnlyHint: false, destructiveHint: false } }, async () => ({ content: [] }))
    await handlers.get('cw')!({})
    await handlers.get('w')!({})
    expect(logged.map((l) => l.tier)).toEqual(['CriticalWrite', 'Write'])
  })

  it('结构化拒绝（ok:false）记 ok:false + code——写工具失败必须能从日志面看见', async () => {
    const { registrar, handlers, logged } = harness()
    registrar.registerTool('hmi_put_screen', { annotations: { readOnlyHint: false } }, async () => ({
      content: [{ type: 'text', text: JSON.stringify({ ok: false, code: 'version_conflict', current_version: 5 }) }],
    }))
    const res = await handlers.get('hmi_put_screen')!({})
    expect((res.content[0] as { text: string }).text).toContain('version_conflict')
    expect(logged[0]).toMatchObject({ tool: 'hmi_put_screen', ok: false, err: 'version_conflict' })
  })

  it('抛错记 ok:false + message 并原样抛出', async () => {
    const { registrar, handlers, logged } = harness()
    registrar.registerTool('boom', { annotations: { readOnlyHint: false } }, async () => { throw new Error('rs-iot 500') })
    await expect(handlers.get('boom')!({})).rejects.toThrow('rs-iot 500')
    expect(logged[0]).toMatchObject({ tool: 'boom', ok: false, err: 'rs-iot 500' })
  })
})
