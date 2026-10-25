/**
 * T8 告警骨架纯逻辑 + 事件流。实测形状（2026-10-25 curl + rs-iot 源码）：
 *   REST GET /api/v1/alarms → [{key, level:'info'|'warn'|'error', source, message, ts, count}]（ts 倒序，空 → []）
 *   SSE  GET /api/v1/events?types=alarm → 命名事件 `alarm`（addEventListener('alarm')），
 *        data {kind:'alarm', action:'fire'|'clear', key, level, source, message, ts}
 * 事件流与数据流（/api/v1/rtdatas/subscribe）是两个端点，后者仅 dev_id/tag/interval 参数
 * ——无法复用同一条连接，告警走第二条 EventSource（routes_rtdata_subscribe.rs SubQuery 实证）。
 * rs-iot 无 confirm 语义：人工清除 = DELETE /api/v1/alarms?key=（后端发 Clear 事件收敛）。
 */
import { backoff } from './sse'

export interface AlarmItem {
  key: string
  level: string
  source: string
  message: string
  /** ISO8601（REST/SSE 同格式） */
  ts: string
  count?: number
}

export interface AlarmEvent {
  action: 'fire' | 'clear'
  key: string
  level?: string
  source?: string
  message?: string
  ts?: string
}

/** SSE data 帧 → AlarmEvent；坏 JSON / 缺 key / 未知 action → undefined（静默丢帧） */
export function parseAlarmEvent(raw: string): AlarmEvent | undefined {
  let obj: unknown
  try { obj = JSON.parse(raw) } catch { return undefined }
  if (typeof obj !== 'object' || obj === null) return undefined
  const e = obj as Record<string, unknown>
  if (typeof e.key !== 'string' || !e.key) return undefined
  if (e.action !== 'fire' && e.action !== 'clear') return undefined
  return {
    action: e.action,
    key: e.key,
    level: typeof e.level === 'string' ? e.level : undefined,
    source: typeof e.source === 'string' ? e.source : undefined,
    message: typeof e.message === 'string' ? e.message : undefined,
    ts: typeof e.ts === 'string' ? e.ts : undefined,
  }
}

const tsOf = (a: { ts: string }): number => { const t = Date.parse(a.ts); return Number.isNaN(t) ? 0 : t }

/** 双源合并 store：REST 快照（权威重同步）+ SSE fire/clear 增量；「确认」= clear(key) */
export class AlarmStore {
  /** 活动告警（key → item） */
  private actives = new Map<string, AlarmItem>()
  /** 已清除（确认）——最新在前，同 key 去重 */
  private hist: AlarmItem[] = []
  /** 横幅轮播索引（active() 内下标） */
  index = 0

  /** REST 全量重同步：快照即权威（不在快照的旧 active 剔除；不污染历史） */
  applySnapshot(items: AlarmItem[]): void {
    this.actives = new Map(items.map((a) => [a.key, a]))
    this.clampIndex()
  }

  applyEvent(evt: AlarmEvent): void {
    if (evt.action === 'fire') {
      const prev = this.actives.get(evt.key)
      this.actives.set(evt.key, {
        key: evt.key,
        level: evt.level ?? prev?.level ?? 'warn',
        source: evt.source ?? prev?.source ?? '',
        message: evt.message ?? prev?.message ?? '',
        ts: evt.ts ?? prev?.ts ?? '',
        count: (prev?.count ?? 0) + 1,
      })
    } else {
      this.clear(evt.key) // 未知 key 幂等忽略（clear 内守护）
    }
  }

  /** 人工清除（确认）：active 剔除 + 入历史；不在 active（已被 SSE clear 先清）则 no-op */
  clear(key: string): void {
    const a = this.actives.get(key)
    if (!a) return
    this.actives.delete(key)
    this.hist = [a, ...this.hist.filter((h) => h.key !== key)]
    this.clampIndex()
  }

  /** 活动列表：ts 倒序（新告警先见） */
  active(): AlarmItem[] {
    return [...this.actives.values()].sort((x, y) => tsOf(y) - tsOf(x))
  }

  history(): AlarmItem[] { return this.hist }

  /** 轮播推进：空表 no-op，模长回绕 */
  next(): void {
    const n = this.actives.size
    if (n === 0) { this.index = 0; return }
    this.index = (this.index + 1) % n
  }

  current(): AlarmItem | undefined { return this.active()[this.index] }

  private clampIndex(): void {
    const n = this.actives.size
    this.index = n === 0 ? 0 : Math.min(this.index, n - 1)
  }
}

// ---------- 事件流层（浏览器 EventSource，E2E 验证；鉴权同 sse.ts Cookie 通道） ----------

export interface AlarmStreamOptions {
  base?: string
  /** 每次（重）连前同步 Cookie token（Bearer 对 EventSource 不可设） */
  getToken?: () => string | null
  onEvent: (e: AlarmEvent) => void
  onState?: (s: 'online' | 'offline') => void
}

/** /api/v1/events?types=alarm —— 命名事件 `alarm`；错误自管重连（同 sse.ts 退避策略） */
export function createAlarmStream(opts: AlarmStreamOptions): { close(): void } {
  let es: EventSource | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  const bo = backoff()

  const open = (): void => {
    if (closed) return
    const token = opts.getToken?.()
    if (token) document.cookie = `token=${encodeURIComponent(token)}; path=/`
    es = new EventSource(`${opts.base ?? ''}/api/v1/events?types=alarm`)
    es.addEventListener('open', () => { bo.reset(); opts.onState?.('online') })
    es.addEventListener('alarm', (ev) => {
      const e = parseAlarmEvent((ev as MessageEvent).data)
      if (e) opts.onEvent(e)
    })
    es.addEventListener('error', () => {
      es?.close()
      es = undefined
      opts.onState?.('offline')
      if (!closed) timer = setTimeout(open, bo.next())
    })
  }

  open()
  return {
    close() {
      closed = true
      clearTimeout(timer)
      es?.close()
      es = undefined
    },
  }
}
