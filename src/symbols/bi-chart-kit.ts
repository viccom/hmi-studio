/**
 * BI 图表底座（共用层）——7 个 BI 图元共享的解析、格式化与样式。
 *
 * 存在的理由：7 个图元若各写一份「信封解析 + 数值格式化 + 空态占位」，
 * 就会各自漂移。底座把这些**纯逻辑**收在一处（可单测、无 DOM 依赖），
 * 图元组件只剩「取到什么 → 画成什么」。
 *
 * 数据通道（通道 B，见 docs/plans/2026-10-29-bi-monitoring-dashboard-design.md）：
 * 宿主聚合收集器把信封 JSON 串写进图元 props.data.val（maotu props 直写），
 * 图元 watch 该 prop → 解析信封 → 渲染。图元**不发请求、不轮询**。
 *
 * 分层：symbols 层纯模块（与 trend-buffer.ts / gauge-math.ts 同款定位）——
 * 不 import lib（契约形状经 props 传入，组件侧只认信封结构）。
 */

/** 信封（与 lib/bi-contract.ts 的 BiEnvelope 同形；此处独立声明避免 symbols→lib 依赖）。 */
export interface BiEnvelope {
  v: number
  window: { start: number; end: number }
  generatedAt: number
  series: BiSeriesResult[]
}

/** 信封内一条序列。 */
export interface BiSeriesResult {
  key: string
  label: string
  unit: string
  color: string
  /** 计量模式：instant 瞬时量 / daily 周期累计计数器 / cumulative 累计表。 */
  mode: string
  /** 指标口径标签：instant=图元声明的 agg；daily=current；cumulative=usage。 */
  metric: string
  value: number | null
  points: Array<{ ts: number; value: number }>
  error: string | null
}

/** 深色工业主题调色板（与既有图元 TREND_PALETTE 同款风格）。 */
export const BI_PALETTE = ['#f5a623', '#39d353', '#58a6ff', '#f85149', '#bc8cff', '#39c5cf']

/** 序列配色：显式 color 优先，否则按序号轮转调色板。 */
export function seriesColor(s: { color?: string }, index: number): string {
  const c = typeof s.color === 'string' ? s.color : ''
  return c || BI_PALETTE[index % BI_PALETTE.length]
}

/**
 * 信封解析：props.data 的原始值（字符串或已解析对象）→ 信封。
 *
 * 容错（组态中途态不炸，沿用 trend-buffer 范式）：
 * 坏 JSON / 非对象 / 缺 series → 返回 null（调用方显示空态占位）。
 */
export function parseEnvelope(raw: unknown): BiEnvelope | null {
  let v: unknown = raw
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return null
    try {
      v = JSON.parse(s)
    } catch {
      return null
    }
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (!Array.isArray(o.series)) return null
  return {
    v: typeof o.v === 'number' ? o.v : 1,
    window: {
      start: Number((o.window as { start?: unknown } | undefined)?.start ?? 0),
      end: Number((o.window as { end?: unknown } | undefined)?.end ?? 0),
    },
    generatedAt: Number(o.generatedAt ?? 0),
    series: (o.series as unknown[]).map((it) => {
      const s = (it ?? {}) as Record<string, unknown>
      return {
        key: typeof s.key === 'string' ? s.key : '',
        label: typeof s.label === 'string' ? s.label : '',
        unit: typeof s.unit === 'string' ? s.unit : '',
        color: typeof s.color === 'string' ? s.color : '',
        mode: typeof s.mode === 'string' ? s.mode : 'instant',
        metric: typeof s.metric === 'string' ? s.metric : '',
        value: typeof s.value === 'number' && Number.isFinite(s.value) ? s.value : null,
        points: Array.isArray(s.points)
          ? (s.points as unknown[]).map((p) => {
              const q = (p ?? {}) as Record<string, unknown>
              return { ts: Number(q.ts ?? 0), value: Number(q.value ?? NaN) }
            }).filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.value))
          : [],
        error: typeof s.error === 'string' && s.error ? s.error : null,
      }
    }),
  }
}

/**
 * 数值格式化：BI 面板的通用读数格式。
 *
 * - null → '--'（无数据不是 0）
 * - 绝对值 ≥1000 → 千分位
 * - 绝对值 <0.01 且非 0 → 科学计数（避免小量级显示成 0.00）
 * - 其余 → 最多 3 位小数、去尾零
 */
export function formatValue(v: number | null | undefined, digits = 3): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '--'
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 1000) return v.toLocaleString('zh-CN', { maximumFractionDigits: digits })
  if (abs < 0.01) return v.toExponential(2)
  return String(Number(v.toFixed(digits)))
}

/** 时间戳（秒）→ 'HH:mm:ss'。 */
export function formatClock(tsSec: number): string {
  const d = new Date(tsSec * 1000)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 时间戳（秒）→ 'MM-DD HH:mm'（坐标轴轴标签用）。 */
export function formatShort(tsSec: number): string {
  const d = new Date(tsSec * 1000)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 面板状态：图元据此决定渲染「实数据 / 空态占位 / 错误提示」。
 *
 * 判定口径（2026-10-29 固化，契约 §1.4「单图失败不拖全屏」的推论）：
 * - **有可用数据 → ok**：哪怕某条序列失败，其余序列照常渲染（失败的序列画空/占位）
 * - **全无数据且存在错误 → error**：整面板无可用数据，且能说出为什么
 * - **全无数据且无错误 → empty**：窗口无采样（不是 0 值）
 *
 * 注：早期版本用「任一序列 error → error」，那会把一条坏序列升级成整面板失败——
 * 与契约相悖，故改为「局部失败不升级」口径（对应 host 侧单条查询失败字段化）。
 */
export type BiPanelState = 'ok' | 'empty' | 'error'

/** 一条序列是否「有可用数据」（有值或有序列点）。 */
function seriesHasData(s: BiSeriesResult): boolean {
  return s.value !== null || s.points.length > 0
}

/** 面板状态判定（局部失败不升级；全无数据才判 empty/error）。 */
export function panelState(env: BiEnvelope | null): BiPanelState {
  if (!env) return 'empty'
  if (env.series.some(seriesHasData)) return 'ok'
  if (env.series.some((s) => s.error !== null)) return 'error'
  return 'empty'
}

/** 首个错误信息（错误态展示用；无则空串）。 */
export function firstError(env: BiEnvelope | null): string {
  if (!env) return ''
  return env.series.find((s) => s.error !== null)?.error ?? ''
}

/** 空态/错误态的提示文案。 */
export function panelHint(state: BiPanelState, env: BiEnvelope | null): string {
  if (state === 'error') return firstError(env)
  if (state === 'empty') return '暂无历史数据'
  return ''
}

/** 深色主题图表公共底色（面板背景/网格/文字）。 */
export const BI_THEME = {
  bg: 'transparent',
  axisLabel: '#8b949e',
  axisLine: '#30363d',
  splitLine: '#1c2128',
  legend: '#8b949e',
  text: '#c9d1d9',
  fontFamily: 'Consolas, Menlo, monospace',
} as const
