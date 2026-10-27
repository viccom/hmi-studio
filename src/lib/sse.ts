/**
 * SSE 客户端（T5）。帧形状 = 2026-10-25 curl 实测（rs-iot routes_rtdata_subscribe.rs）：
 *   event: snapshot   data = {dev, points:{"dev.tag":[ts,localTime,"valueStr"]}}（连接即全量）
 *   event: datachange data = {changes:{"dev.tag":cell}, removed:[], ts}（值变才推，命名事件）
 * 值一律是字符串化 JSON——parseCell 归一化是客户端职责（rsiot-frame.ts 同款语义）。
 * 鉴权实测：rs-iot 只认 Authorization/Cookie/X-Access-Key，不认 ?token=（那是 agent-hmi
 * gateway 的约定）；EventSource 设不了 header → token 走同源 Cookie（连接前同步）。
 * 流层（EventSource）不进 jsdom 单测——纯函数在此覆盖，流由 E2E 真实验证。
 */

export interface RtPoint { field: string; value: unknown }

/** 字符串值归一化：尝试 JSON 解析，失败保留原串（"0"→0、'"RUN"'→'RUN'、'abc'→'abc'） */
export function parseCell(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return raw }
}

/** cell = [ts, localTime, value] → {field, value}；畸形（非数组/长度<3）返回 undefined */
export function toPoint(field: string, cell: unknown): RtPoint | undefined {
  if (!Array.isArray(cell) || cell.length < 3) return undefined
  const v = cell[2]
  return { field, value: typeof v === 'string' ? parseCell(v) : v }
}

/** 指数退避：1s 起步翻倍封顶 30s；连接成功 reset 复位 */
export function backoff() {
  let delay = 1000
  return {
    next(): number { const d = delay; delay = Math.min(delay * 2, 30_000); return d },
    reset(): void { delay = 1000 },
  }
}

/** devs → 订阅 URL（去重排序，dev_id 逗号拼接；interval 缺省 1000ms；base 缺省同源） */
export function buildSubscribeUrl(o: { devs: string[]; base?: string; interval?: number }): string {
  const devs = [...new Set(o.devs)].sort().map(encodeURIComponent).join(',')
  return `${o.base ?? ''}/api/v1/rtdatas/subscribe?dev_id=${devs}&interval=${o.interval ?? 1000}`
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : undefined
}

/** SSE 帧 → 点位数组：snapshot 读 points、datachange 读 changes；坏帧/畸形 cell 静默丢弃 */
export function parseFrame(type: string, raw: string): RtPoint[] {
  let obj: unknown
  try { obj = JSON.parse(raw) } catch { return [] }
  const rec = asRecord(obj)
  const entries = rec && (type === 'snapshot' ? asRecord(rec.points) : type === 'datachange' ? asRecord(rec.changes) : undefined)
  if (!entries) return []
  const out: RtPoint[] = []
  for (const [field, cell] of Object.entries(entries)) {
    const p = toPoint(field, cell)
    if (p) out.push(p)
  }
  return out
}

// ---------- 流层（浏览器 EventSource，E2E 验证） ----------

import { API_BASE, SSE_TOKEN_IN_QUERY } from './endpoints'

export type StreamState = 'online' | 'offline' | 'auth-failed'

export interface RtdataStreamOptions {
  devs: string[]
  /** 缺省 endpoints.API_BASE（gateway 部署 '/api/rsiot'——T18） */
  base?: string
  interval?: number
  /** 每次（重）连前取 token（鉴权形态随部署：dev=同步 Cookie；gateway=进 query，endpoints.ts） */
  getToken?: () => string | null
  onPoint: (p: RtPoint) => void
  onState?: (s: StreamState) => void
}

/** 探测凭证是否失效：EventSource error 不带 HTTP 状态码，fetch 可读——
 *  对订阅 URL 发一次性 GET（带 Bearer），仅 401 判失效；网络错误视为非鉴权问题（false）。
 *  5s 超时：对宕机服务器 fetch 可无限挂起，收窄重连状态机的 await 窗口。
 *  流层 fetch 不进 jsdom 单测——E2E 验证（m4 恒 401 段）。 */
async function probeUnauthorized(url: string, token: string | null): Promise<boolean> {
  try {
    const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(5000)
      : undefined
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal })
    void res.body?.cancel().catch(() => { /* 中断流式响应体，状态码已读到 */ })
    return res.status === 401
  } catch { return false }
}

export function createRtdataStream(opts: RtdataStreamOptions): { close(): void; resubscribe(devs: string[]): void } {
  let devs = opts.devs
  let es: EventSource | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  let failures = 0
  // 代际计数：resubscribe/close 自增——在飞 reconnect 的 probe 返回后比对，不一致即作废
  // （P1 竞态回归锁见 sse.test.ts：否则旧探测结论会二次排定 open，产生孤儿连接双订阅）
  let gen = 0
  const bo = backoff()

  const syncCookie = (): void => {
    const t = opts.getToken?.()
    if (t) document.cookie = `token=${encodeURIComponent(t)}; path=/`
  }

  /** 订阅 URL：query-token 形态（gateway）把 JWT 拼进 URL——网关层1 只认 Bearer/?token=
   *  不认 Cookie，转发时注入 Authorization（endpoints.ts 文件头）；dev 形态走 Cookie。 */
  const streamUrl = (): string => {
    const url = buildSubscribeUrl({ devs, base: opts.base ?? API_BASE, interval: opts.interval })
    if (!SSE_TOKEN_IN_QUERY) return url
    const t = opts.getToken?.()
    return t ? `${url}&token=${encodeURIComponent(t)}` : url
  }

  const open = (): void => {
    if (closed) return
    es?.close() // 重建前先关旧连接——任何路径二次进入 open 都不产生孤儿
    syncCookie()
    es = new EventSource(streamUrl())
    es.addEventListener('open', () => { failures = 0; bo.reset(); opts.onState?.('online') })
    for (const type of ['snapshot', 'datachange'] as const) {
      es.addEventListener(type, (ev) => {
        for (const p of parseFrame(type, (ev as MessageEvent).data)) opts.onPoint(p)
      })
    }
    es.addEventListener('error', () => {
      es?.close() // 浏览器自动重连不可控（同一 URL/无退避）——自管重连
      es = undefined
      opts.onState?.('offline')
      failures += 1
      void reconnect()
    })
  }

  // 凭证失效链（T16 relogin 选型）：不存凭据自动重登录（安全负资产）——连续 3 次失败
  // 先 fetch 探测 401；命中则上抛 'auth-failed' 并停止重连，ViewView 走全局登出链回 /login。
  const reconnect = async (): Promise<void> => {
    if (closed) return
    if (failures >= 3) {
      const g = gen
      const unauthorized = await probeUnauthorized(streamUrl(), opts.getToken?.() ?? null)
      if (unauthorized) { closed = true; opts.onState?.('auth-failed'); return }
      // 等待期间世界已变（resubscribe/close）——旧探测结论作废，不得再排定 open
      if (closed || g !== gen) return
    }
    timer = setTimeout(open, bo.next())
  }

  const stop = (): void => {
    clearTimeout(timer)
    es?.close()
    es = undefined
  }

  open()
  return {
    close() { closed = true; gen += 1; stop() },
    resubscribe(next: string[]) { devs = next; failures = 0; bo.reset(); gen += 1; stop(); open() },
  }
}
