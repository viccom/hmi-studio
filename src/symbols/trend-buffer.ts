/**
 * 趋势缓冲纯函数（P2 AhTrendChart 数据面）：环形缓冲 / 时间窗裁剪 / 曲线配置解析
 * 全部抽纯函数（规范 §4.2「计算逻辑可脱离 maotu 单测」先例 = gauge-math）。
 * 时间语义：点时间戳 = 宿主 bind 直写到达时刻（Date.now()，ms）——组件不自采时间，
 * 数据节奏完全由宿主 SSE 桥的写入节奏决定（机制详见 AhTrendChart.vue 头注释）。
 */

/** 单个采样点：t=到达时刻(ms)，v=数值（已归一，非数不入缓冲） */
export interface TrendPoint {
  t: number
  v: number
}

/** 曲线元数据（points 配置的解析产物）；field 仅供组态员对照 bind，组件不直接订阅 */
export interface TrendSeries {
  field: string
  label: string
  unit: string
  color: string
}

/** 曲线上限 = 数据通道数（tick0/tick1/tick2 三通道一一对应） */
export const TREND_MAX_SERIES = 3

/** 未显式配色时的缺省曲线色（深色底工业配色） */
export const TREND_PALETTE = ['#f5a623', '#39d353', '#58a6ff']

/**
 * 环形缓冲容量估算：窗口秒数 / 采样周期（缺省 2s——rs-iot SSE 典型推送节奏）
 * 加 10 点余量吸收抖动，下限 10。600s × 2s = 300 点/曲线。
 */
export function estimateMaxN(windowSecs: number, sampleSecs = 2): number {
  const w = Number(windowSecs)
  const s = Number(sampleSecs)
  const win = Number.isFinite(w) && w > 0 ? w : 600
  const per = Number.isFinite(s) && s > 0 ? s : 2
  return Math.max(10, Math.ceil(win / per) + 10)
}

/** 入队 + 容量淘汰：超 maxN 丢最旧（纯函数，返回新数组；maxN 非数按 1 容量保底） */
export function pushPoint(buf: TrendPoint[], t: number, v: number, maxN: number): TrendPoint[] {
  const cap = Number.isFinite(maxN) ? Math.max(1, Math.floor(maxN)) : 1
  const next = buf.length >= cap ? buf.slice(buf.length - cap + 1) : buf.slice()
  next.push({ t, v })
  return next
}

/** 时间窗裁剪：仅保留 t >= now - windowMs（滚动窗口，缓冲按时间序单调） */
export function trimWindow(buf: TrendPoint[], nowMs: number, windowMs: number): TrendPoint[] {
  const lo = nowMs - windowMs
  let i = 0
  while (i < buf.length && buf[i].t < lo) i++
  return i === 0 ? buf : buf.slice(i)
}

/**
 * points 配置解析：JSON 串（textArea 描述符承载）或已解析数组 → 规范序列。
 * - ≤3 条（超出截断）；field 必备非空，否则丢弃该条
 * - label 缺省回落 field；unit 缺省空串；color 缺省按 TREND_PALETTE 轮转
 * - 脏配置（坏 JSON/非数组）静默降级为空（曲线不画，面板仍可改）——组态中途态不炸
 * 实证裁定（P2）：maotu jsonEdit 型 val 是结构对象且面板走专用编辑器（point_position 等
 * 内部用法全 disabled）——不适合通用 JSON 序列配置，故用 textArea + JSON 串 + 此处容错解析。
 */
export function parsePoints(raw: unknown): TrendSeries[] {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  const out: TrendSeries[] = []
  for (const it of arr.slice(0, TREND_MAX_SERIES)) {
    const o = it as Record<string, unknown>
    if (!o || typeof o.field !== 'string' || !o.field) continue
    out.push({
      field: o.field,
      label: typeof o.label === 'string' && o.label ? o.label : o.field,
      unit: typeof o.unit === 'string' ? o.unit : '',
      color:
        typeof o.color === 'string' && o.color
          ? o.color
          : TREND_PALETTE[out.length % TREND_PALETTE.length],
    })
  }
  return out
}

/** 数值归一（bind 直写可能给 number 或数字串——触发器链会写成串）：非数拒收返回 null */
export function toPointValue(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isFinite(n) ? n : null
}
