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

export type StreamState = 'online' | 'offline'

export interface RtdataStreamOptions {
  devs: string[]
  base?: string
  interval?: number
  /** 每次（重）连前取 token 同步 Cookie（SSE 鉴权通道，见文件头） */
  getToken?: () => string | null
  onPoint: (p: RtPoint) => void
  onState?: (s: StreamState) => void
  /** 连续第 3 次失败起，重连前先重登录换 token */
  relogin?: () => Promise<void>
}

export function createRtdataStream(opts: RtdataStreamOptions): { close(): void; resubscribe(devs: string[]): void } {
  let devs = opts.devs
  let es: EventSource | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  let failures = 0
  const bo = backoff()

  const syncCookie = (): void => {
    const t = opts.getToken?.()
    if (t) document.cookie = `token=${encodeURIComponent(t)}; path=/`
  }

  const open = (): void => {
    if (closed) return
    syncCookie()
    es = new EventSource(buildSubscribeUrl({ devs, base: opts.base, interval: opts.interval }))
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

  const reconnect = async (): Promise<void> => {
    if (closed) return
    const delay = bo.next()
    if (failures >= 3 && opts.relogin) { try { await opts.relogin() } catch { /* 换 token 失败不阻断重连 */ } }
    timer = setTimeout(open, delay)
  }

  const stop = (): void => {
    clearTimeout(timer)
    es?.close()
    es = undefined
  }

  open()
  return {
    close() { closed = true; stop() },
    resubscribe(next: string[]) { devs = next; failures = 0; bo.reset(); stop(); open() },
  }
}
