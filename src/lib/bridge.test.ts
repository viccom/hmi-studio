/**
 * T7 桥层单测（P2 测试缺口补齐）：命令历史环形 20 封顶、send 三终态收敛
 * （confirmed / error(HTTP n) / timeout）、用户取消静默、nav 别名接线。
 * 依赖全部注入替身：element-plus 模块 mock、fetch stubGlobal、router 假件——
 * 语义与 e2e m2 命令段互补（e2e 断言真实确认框/网络，此处锁定状态收敛逻辑）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Router } from 'vue-router'

const ep = vi.hoisted(() => ({
  confirm: vi.fn<(o: string, t: string) => Promise<void>>(),
  success: vi.fn(), error: vi.fn(), warning: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: (...a: unknown[]) => ep.confirm(...(a as [string, string])) },
  ElMessage: { success: ep.success, error: ep.error, warning: ep.warning },
}))
import { installBridge, type BridgeHandle } from './bridge'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const fakeRouter = (): Router => ({ push: vi.fn(), back: vi.fn() } as unknown as Router)

let handle: BridgeHandle | undefined
afterEach(() => { handle?.uninstall(); handle = undefined; vi.unstubAllGlobals(); vi.useRealTimers() })

/** fetch 替身：devices 注册表恒定；command 行为由用例注入 */
function stubFetch(command: (init?: RequestInit) => Promise<Response>): Map<string, string> {
  const calls = new Map<string, string>()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.set(url, init?.body ? String(init.body) : '')
    if (url.includes('/api/v1/devices')) return json({ pump1: { owner_inst: 'inst-1' } })
    if (url.includes('/api/v1/command/send')) return command(init)
    return json({})
  }))
  return calls
}
const COMMAND_URL = '/api/v1/command/send'

describe('bridge.send 状态收敛', () => {
  beforeEach(() => { ep.confirm.mockReset(); ep.success.mockReset(); ep.error.mockReset(); ep.warning.mockReset() })

  it('确认 → 解析 inst → POST 契约 → confirmed：历史/提示/请求体三面', async () => {
    const calls = stubFetch(async () => json({ status: 'ok' }))
    ep.confirm.mockResolvedValue(undefined)
    handle = installBridge({ mode: 'view', router: fakeRouter() })
    await (window as { $rsiot?: { send: (d: string, t: string, v: unknown) => Promise<void> } }).$rsiot!.send('pump1', 'spd', 800)

    expect(ep.confirm).toHaveBeenCalledTimes(1)
    const [url, body] = [...calls.entries()].find(([u]) => u === COMMAND_URL)!
    expect(url).toBe(COMMAND_URL)
    expect(JSON.parse(body)).toEqual({ instance: 'inst-1', devid: 'pump1', cmd: 'write', data: '{"tag":"spd","value":800}' })
    expect(handle.history.value).toHaveLength(1)
    expect(handle.history.value[0]).toMatchObject({ devid: 'pump1', tag: 'spd', value: 800, state: 'confirmed' })
    expect(ep.success).toHaveBeenCalledOnce()
  })

  it('HTTP 错误 → error 终态（message=HTTP n）+ 错误提示', async () => {
    stubFetch(async () => json({ err: 'x' }, 502))
    ep.confirm.mockResolvedValue(undefined)
    handle = installBridge({ mode: 'view', router: fakeRouter() })
    await (window as { $rsiot?: { send: (d: string, t: string, v: unknown) => Promise<void> } }).$rsiot!.send('pump1', 'spd', 1)
    expect(handle.history.value[0].state).toBe('error')
    expect(handle.history.value[0].message).toBe('HTTP 502')
    expect(ep.error).toHaveBeenCalledOnce()
  })

  it('5s 无响应 → timeout 终态 + 超时提示', async () => {
    vi.useFakeTimers()
    stubFetch(() => new Promise<Response>(() => { /* 永不返回 */ }))
    ep.confirm.mockResolvedValue(undefined)
    handle = installBridge({ mode: 'view', router: fakeRouter() })
    const p = (window as { $rsiot?: { send: (d: string, t: string, v: unknown) => Promise<void> } }).$rsiot!.send('pump1', 'spd', 1)
    await vi.advanceTimersByTimeAsync(5000)
    await p
    expect(handle.history.value[0].state).toBe('timeout')
    expect(ep.warning).toHaveBeenCalledOnce()
  })

  it('未知设备（注册表无该 devid）→ 不发请求，错误提示，不入历史', async () => {
    const calls = stubFetch(async () => json({ status: 'ok' }))
    ep.confirm.mockResolvedValue(undefined)
    handle = installBridge({ mode: 'view', router: fakeRouter() })
    await (window as { $rsiot?: { send: (d: string, t: string, v: unknown) => Promise<void> } }).$rsiot!.send('ghost', 'spd', 1)
    expect([...calls.keys()].some((u) => u === COMMAND_URL)).toBe(false)
    expect(handle.history.value).toHaveLength(0)
    expect(ep.error).toHaveBeenCalledOnce()
  })

  it('注册表缓存未命中（运行期新增设备）→ 强制刷新一次重试成功（长时运行页不因缓存拒发）', async () => {
    // devices 首查仅 pump1；send(pump2) 未命中缓存 → 刷新注册表（此时已含 pump2）→ 下发成功
    let devices: Record<string, unknown> = { pump1: { owner_inst: 'inst-1' } }
    let devicesFetches = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes('/api/v1/devices')) {
        devicesFetches += 1
        return json(devices)
      }
      if (url.includes('/api/v1/command/send')) return json({ status: 'ok' })
      return json({})
    }) as unknown as typeof fetch)
    ep.confirm.mockResolvedValue(undefined)
    handle = installBridge({ mode: 'view', router: fakeRouter() })
    const face = (window as { $rsiot?: { send: (d: string, t: string, v: unknown) => Promise<void> } }).$rsiot!
    await face.send('pump1', 'spd', 1) // 首次 send 建立缓存（fetches=1）
    devices = { pump1: { owner_inst: 'inst-1' }, pump2: { owner_inst: 'inst-2' } }
    await face.send('pump2', 'spd', 2) // 缓存未命中 → 刷新 → 命中下发
    expect(devicesFetches).toBe(2) // 首建 1 + 失效强刷 1
    expect(handle.history.value).toHaveLength(2)
    expect(handle.history.value[0]).toMatchObject({ devid: 'pump2', state: 'confirmed' })
    expect(ep.error).not.toHaveBeenCalled()
  })

  it('用户取消 → 静默：无请求、无历史、无提示', async () => {
    const calls = stubFetch(async () => json({ status: 'ok' }))
    ep.confirm.mockRejectedValue(new Error('cancel'))
    handle = installBridge({ mode: 'view', router: fakeRouter() })
    await (window as { $rsiot?: { send: (d: string, t: string, v: unknown) => Promise<void> } }).$rsiot!.send('pump1', 'spd', 1)
    expect(calls.size).toBe(0)
    expect(handle.history.value).toHaveLength(0)
    expect(ep.success).not.toHaveBeenCalled()
    expect(ep.error).not.toHaveBeenCalled()
  })

  it('命令历史环形 20：第 21 条挤掉最旧，最新恒在首位', async () => {
    stubFetch(async () => json({ status: 'ok' }))
    ep.confirm.mockResolvedValue(undefined)
    handle = installBridge({ mode: 'view', router: fakeRouter() })
    const face = (window as { $rsiot?: { send: (d: string, t: string, v: unknown) => Promise<void> } }).$rsiot!
    for (let i = 1; i <= 25; i++) await face.send('pump1', `tag${i}`, i)
    const h = handle.history.value
    expect(h).toHaveLength(20)
    expect(h[0]).toMatchObject({ tag: 'tag25' })   // 最新在首
    expect(h[19]).toMatchObject({ tag: 'tag6' })   // 最旧留存的是第 6 条（1-5 被挤掉）
    expect(h.every((e) => e.state === 'confirmed')).toBe(true)
  })
})

describe('bridge nav 别名（与 $mtEventCallBack 词表同源同栈）', () => {
  it('view 态注入 navHandler → nav/back/home 全走分发器；edit 态缺省直连 router', async () => {
    const nav = { nav: vi.fn(), back: vi.fn(), home: vi.fn() }
    handle = installBridge({ mode: 'view', router: fakeRouter(), navHandler: nav })
    const face = (window as unknown as { $rsiot: { nav: (t: string) => void; back: () => void; home: () => void } }).$rsiot
    face.nav('screen-b'); face.back(); face.home()
    expect(nav.nav).toHaveBeenCalledWith('screen-b')
    expect(nav.back).toHaveBeenCalledOnce()
    expect(nav.home).toHaveBeenCalledOnce()

    handle.uninstall()
    const router = fakeRouter()
    handle = installBridge({ mode: 'edit', router })
    const face2 = (window as unknown as { $rsiot: { nav: (t: string) => void; home: () => void } }).$rsiot
    face2.nav('screen-b'); face2.home()
    expect(router.push).toHaveBeenCalledWith('/view/screen-b')
    expect(router.push).toHaveBeenCalledWith('/')
  })

  it('uninstall 摘除 window.$rsiot', () => {
    handle = installBridge({ mode: 'edit', router: fakeRouter() })
    expect((window as { $rsiot?: unknown }).$rsiot).toBeDefined()
    handle.uninstall()
    expect((window as { $rsiot?: unknown }).$rsiot).toBeUndefined()
  })
})
