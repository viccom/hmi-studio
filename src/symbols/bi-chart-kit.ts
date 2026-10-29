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
 * 指标口径的中文标签——信封的 `metric` 是机器口径（avg/max/…），直接展示给用户
 * 是英文内部术语（明细表「口径」列曾显示 'avg'）。图元渲染前统一过这道映射。
 */
const METRIC_LABELS: Record<string, string> = {
  avg: '平均',
  max: '最大',
  min: '最小',
  sum: '合计',
  count: '计数',
  last: '末值',
  delta: '增量',
  usage: '用量',
  current: '当前值',
}

/** 指标口径 → 中文标签（未知口径回落原值，不猜语义）。 */
export function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? metric
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

/**
 * 面板视觉令牌（2026-10-29 对标 Grafana 大屏重做）。
 *
 * 之前的 BI 图元是「通用组件」样式：每个图元自带一圈橙色描边 + 小字号 + 大片留白。
 * Grafana 那种仪表盘观感的要点恰恰相反：
 * - **靠底色分区，不靠描边**（面板背景与页面背景有微弱色差即可）
 * - **数字是主角**（40px+ 粗体，色彩语义），标签与单位退居次级
 * - **紧凑**：内边距 8~12px，卡片间距 8~12px，几乎不留空
 *
 * 故建立这组令牌供全部 BI 图元共用——视觉一致性不能靠各图元各写一套 CSS。
 */
export const BI_PANEL = {
  /** 页面底色（宿主画布用；图元内用 card） */
  page: '#0b0e14',
  /** 卡片底色 */
  card: '#161b22',
  /** 卡片次级底色（卡内嵌套块，如 KPI 卡的指标条区） */
  cardAlt: '#1c2128',
  /** 极淡分隔线（Grafana 几乎不可见，但有助分区） */
  hairline: '#21262d',
  /** 主文字 */
  text: '#c9d1d9',
  /** 次级文字（标签/单位/图例） */
  textDim: '#8b949e',
  /** 强调色（默认橙） */
  accent: '#f5a623',
  /** 语义色：绿（正常/达成） */
  ok: '#3fb950',
  /** 语义色：红（告警/超限） */
  bad: '#f85149',
  /** 语义色：蓝（次要数据） */
  info: '#58a6ff',
  /** 语义色：紫 */
  purple: '#bc8cff',
  /** 语义色：青 */
  cyan: '#39c5cf',
  /** 卡片圆角 */
  radius: '4px',
  /** 卡片内边距 */
  pad: '10px',
  /** 卡片阴影（Grafana 的分层感） */
  shadow: '0 1px 2px rgba(0,0,0,0.35)',
} as const

// ---------- ③ 告警统计区（ah-bi-alarms）的信封形状 ----------

/** 告警信封（与 lib/bi-contract.ts 的 BiAlarmEnvelope 同形；独立声明避免 symbols→lib 依赖）。 */
export interface BiAlarmEnvelope {
  v: number
  generatedAt: number
  total: number
  levels: Array<{ level: string; count: number }>
  sources: Array<{ source: string; count: number }>
  latest: Array<{ key: string; level: string; source: string; message: string; ts: number; count: number }>
}

/**
 * 告警信封解析：props.data 的原始值 → 信封。
 *
 * 容错同 parseEnvelope：坏 JSON / 非对象 / 缺 levels → null（面板显示空态）。
 * 注意与历史信封互斥：告警信封没有 series 字段，parseEnvelope 会拒收——两族面板各用各的解析。
 */
export function parseAlarmEnvelope(raw: unknown): BiAlarmEnvelope | null {
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
  if (!Array.isArray(o.levels)) return null
  const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
  const str = (x: unknown): string => (typeof x === 'string' ? x : '')
  return {
    v: num(o.v) || 1,
    generatedAt: num(o.generatedAt),
    total: num(o.total),
    levels: (o.levels as unknown[]).map((it) => {
      const l = (it ?? {}) as Record<string, unknown>
      return { level: str(l.level), count: num(l.count) }
    }),
    sources: Array.isArray(o.sources)
      ? (o.sources as unknown[]).map((it) => {
          const s = (it ?? {}) as Record<string, unknown>
          return { source: str(s.source), count: num(s.count) }
        })
      : [],
    latest: Array.isArray(o.latest)
      ? (o.latest as unknown[]).map((it) => {
          const a = (it ?? {}) as Record<string, unknown>
          return {
            key: str(a.key), level: str(a.level), source: str(a.source),
            message: str(a.message), ts: num(a.ts), count: num(a.count),
          }
        })
      : [],
  }
}

/** 告警级别 → 语义色（error 红 / warn 橙 / info 蓝；未知灰）。 */
export function alarmLevelColor(level: string): string {
  if (level === 'error') return BI_PANEL.bad
  if (level === 'warn') return BI_PANEL.accent
  if (level === 'info') return BI_PANEL.info
  return BI_PANEL.textDim
}

/** 告警级别 → 中文标签。 */
export function alarmLevelLabel(level: string): string {
  if (level === 'error') return '严重'
  if (level === 'warn') return '警告'
  if (level === 'info') return '提示'
  return level || '未知'
}

/** 量程 nice 化：向上取到 1/2/5×10^n（表盘/雷达轴上限不出现难看的碎数）。 */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const f = v / base
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nice * base
}
