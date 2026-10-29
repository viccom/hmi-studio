/**
 * BI 契约层（通道 B 的唯一事实源）——宿主聚合收集器与图表图元共享的载荷形状。
 *
 * 背景（设计见 docs/plans/2026-10-29-bi-monitoring-dashboard-design.md）：
 * 监控站级大屏需要历史分析（KPI/排名/占比/热力/趋势），而后端 history 端点只提供
 * 单 series 精确查询——跨设备聚合必须落在宿主侧。宿主（ViewView）扫描画面里的 BI 图元，
 * 合并全部 series 成少量 /history/batch 请求，取回后按面板重组为「信封」写回图元
 * props.data.val；图表图元只负责把信封画出来，不发请求、不轮询。
 *
 * 分层：纯类型 + 纯函数，零网络/零 maotu 依赖。check-layers 以
 * SYMBOLS_LIB_ALLOWLIST 白名单放行 symbols → 本文件的单一引用（其余 lib 模块
 * 对 symbols 一律禁向）。这样契约单点可改、两侧不会各写一份形状。
 *
 * 三个关键语义（错了整屏皆错，故在此固化）：
 * 1. **累计量走双窗 last 差**：后端 REST 只暴露 min/max/avg/sum/count/last 六值聚合，
 *    没有 first——累计量（累计电能/累计水气）的「窗口增量」只能用
 *    「主窗末值 − 前窗末值」求得（design §1.4）。sum 对累计量无意义。
 * 2. **空窗不是 0**：窗口无采样 → value=null 且 error=null（图元显示占位而非 0）。
 * 3. **单图失败不拖全屏**：单条查询 error 字段化，只落在该 series 上。
 */

/** BI 图元 tag 前缀——宿主据此识别「需要聚合喂数」的图元。
 *  刻意用字符串前缀而非从 symbols/registry 反查：lib 不得依赖 symbols
 *  （architecture §2 依赖方向规则），故契约层不 import 注册表。 */
export const BI_TAG_PREFIX = 'ah-bi-'

/** /history/batch 单次请求的查询条数上限（后端 400 拦截：不得超过 32 条）。 */
export const BI_MAX_BATCH = 32

/** 默认统计窗（秒）——面板未声明 windowSecs 时用。 */
export const BI_DEFAULT_WINDOW_SECS = 3600

/** 序列形态的兜底桶数上限（interval 未声明/非正时按此切桶，防 raw 爆量）。 */
export const BI_SERIES_MAX_BUCKETS = 120

/** 聚合口径（与后端 /history 的 agg 参数同名同义）。 */
export type BiAgg = 'avg' | 'max' | 'min' | 'sum' | 'count' | 'last'

/** 计量模式：
 * - `instant`：瞬时量（功率/电压/流量…）——窗口聚合口径（avg/max/min/sum/count/last）
 * - `daily`：周期累计计数器（当日电量等）——取**当前值**（它本身就是本周期累计量，不做差）
 * - `cumulative`：累计表（累计电能/累计水气）——窗口用量 = **分段累加**（见下）
 *
 * 累计量为何必须分段累加而非「双窗末值差」：现场表计存在**周期性复位**
 * （2026-10-29 实测 24h 内 16 次回退到基准值）——复位点两侧末值不可直接相减，
 * 否则差出负用量（「今日用电 -0.89 kWh」即此缺陷的现场表现）。
 * 正确算法 = 按回退点切段，段内增量（段末 − 段初）求和。
 */
export type BiMode = 'instant' | 'daily' | 'cumulative'

/**
 * 取数形态：
 * - `aggregate`：整窗单值（排名/占比/构成）
 * - `series`：时间序列（趋势/热力/堆叠）
 * - `both`：**单值 + 时序同取**（KPI 卡——大数字来自整窗聚合，卡内迷你趋势来自同窗降采样）
 *
 * `both` 的代价：每条 series 发两条查询（聚合一条 + 降采样一条）。6 设备规模下
 * 单批 32 条仍够用；换来的是「一张卡既有精确聚合值、又有 sparkline」。
 */
export type BiShape = 'aggregate' | 'series' | 'both'

/** 一条序列的查询规格（组态员在图元 props.series 里配的 JSON 串条目）。 */
export interface BiSeriesSpec {
  dev_id: string
  tag: string
  label: string
  unit: string
  mode: BiMode
  color: string
}

/** 一个 BI 图元（面板）的完整规格。 */
export interface BiPanelSpec {
  /** 画布元素 id——写回时作为 setItemAttrByID 的定位键。 */
  id: string
  title: string
  shape: BiShape
  agg: BiAgg
  /** 桶宽（秒）：shape=series 时为降采样桶宽；shape=aggregate 时固定 = 窗口长。 */
  interval: number
  windowSecs: number
  series: BiSeriesSpec[]
}

/** 一条待执行的查询（对应 /history/batch 的一个 query 条目）。 */
export interface BiQueryPlan {
  /** 回指面板（写回时按面板聚合结果）。 */
  panelId: string
  /** 面板内第几条序列（信封内 series 数组下标）。 */
  seriesIndex: number
  /**
   * 查询槽位：
   * - `main`：主查询（聚合值 / 时序点，视 shape 与 mode 而定）
   * - `spark`：shape=both 时的**降采样时序**副查询（供 KPI 卡迷你趋势）
   * - `prev`：双窗差法遗留位（保留以兼容旧调用方，当前不产出）
   */
  slot: 'main' | 'spark' | 'prev'
  dev_id: string
  tag: string
  /** 秒级 Unix 时间戳，后端窗口为半开 [start,end)。 */
  start: number
  end: number
  /** 聚合口径；null = raw 取点（不传 agg/interval）。 */
  agg: BiAgg | null
  /** 桶宽（秒）；0 = 不降采样（raw）。 */
  interval: number
}

/** 送往后端的 wire 查询体（后端只认这七个字段；面板定位信息不外传）。 */
export interface BiWireQuery {
  dev_id: string
  tag: string
  start: number
  end: number
  /** raw 查询时省略该字段（后端 agg/interval 必须同时给或都不给）。 */
  agg?: BiAgg
  interval?: number
}

/** 时间序列上一点（ts 秒级）。 */
export interface BiPoint {
  ts: number
  value: number
}

/** 信封内一条序列的呈现结果。 */
export interface BiSeriesResult {
  /** `<dev_id>.<tag>`。 */
  key: string
  label: string
  unit: string
  color: string
  mode: BiMode
  /** 指标口径标签：instant=图元声明的 agg；cumulative=delta。 */
  metric: string
  /** 整窗单值（shape=aggregate）；时间序列形态下为 null。 */
  value: number | null
  /** 时间序列点（shape=series）；单值形态下为空数组。 */
  points: BiPoint[]
  /** 该序列的失败原因（单条查询失败字段化，不影响其它序列）。 */
  error: string | null
}

/** 写回图元 props.data.val 的信封（JSON 串）。 */
export interface BiEnvelope {
  /** 信封版本（前端契约演进用）。 */
  v: 1
  window: { start: number; end: number }
  /** 生成时刻（秒）。 */
  generatedAt: number
  series: BiSeriesResult[]
}

const AGGS: BiAgg[] = ['avg', 'max', 'min', 'sum', 'count', 'last']

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

/** 序列规格解析：JSON 串或已解析数组 → 规范数组。
 *  坏 JSON / 非数组 / 空串 → 空数组（组态中途态不炸，沿用 trend-buffer 范式）。
 *  缺 dev_id 或 tag 的条目丢弃；label 缺省回落 `<dev_id>.<tag>`。 */
export function parseSeriesSpec(raw: unknown): BiSeriesSpec[] {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return []
    try {
      arr = JSON.parse(s)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  const out: BiSeriesSpec[] = []
  for (const it of arr) {
    const o = asRecord(it)
    if (!o) continue
    const dev_id = typeof o.dev_id === 'string' ? o.dev_id : ''
    const tag = typeof o.tag === 'string' ? o.tag : ''
    if (!dev_id || !tag) continue
    const mode: BiMode =
      o.mode === 'cumulative' ? 'cumulative' : o.mode === 'daily' ? 'daily' : 'instant'
    out.push({
      dev_id,
      tag,
      label: typeof o.label === 'string' && o.label ? o.label : `${dev_id}.${tag}`,
      unit: typeof o.unit === 'string' ? o.unit : '',
      mode,
      color: typeof o.color === 'string' ? o.color : '',
    })
  }
  return out
}

/**
 * 扫描画面里的 BI 面板规格。
 *
 * **只扫顶层 pel**：组合（group）内的元素 setItemAttrByID 定位不到
 * （maotu 写回按顶层 id 查找，见 bundle Nl）——BI 图元必须平铺在画布顶层。
 */
export function collectBiPanels(done: unknown): BiPanelSpec[] {
  const json = Array.isArray(done)
    ? done
    : ((asRecord(done)?.json as unknown[]) ?? [])
  const out: BiPanelSpec[] = []
  for (const p of json) {
    const pel = asRecord(p)
    if (!pel) continue
    const tag = typeof pel.tag === 'string' ? pel.tag : ''
    if (!tag.startsWith(BI_TAG_PREFIX)) continue
    const id = typeof pel.id === 'string' ? pel.id : ''
    if (!id) continue
    const props = asRecord(pel.props) ?? {}
    const series = parseSeriesSpec(props.series)
    if (!series.length) continue
    const aggRaw = typeof props.agg === 'string' ? props.agg : ''
    const agg: BiAgg = (AGGS as string[]).includes(aggRaw) ? (aggRaw as BiAgg) : 'avg'
    const shapeRaw = typeof props.shape === 'string' ? props.shape : ''
    const shape: BiShape =
      shapeRaw === 'series' ? 'series' : shapeRaw === 'both' ? 'both' : 'aggregate'
    const intervalRaw = Number(props.interval)
    const interval = Number.isFinite(intervalRaw) && intervalRaw > 0 ? Math.floor(intervalRaw) : 0
    const windowRaw = Number(props.windowSecs)
    const windowSecs = Number.isFinite(windowRaw) && windowRaw > 0 ? Math.floor(windowRaw) : BI_DEFAULT_WINDOW_SECS
    out.push({
      id,
      title: typeof props.title === 'string' ? props.title : '',
      shape,
      agg,
      interval,
      windowSecs,
      series,
    })
  }
  return out
}

/**
 * 查询计划：面板规格 → 扁平查询序列（跨面板合并，宿主据此合并往返）。
 *
 * - instant + aggregate：单条（agg=声明口径，interval=窗口长 → 落一桶 = 整窗聚合值）
 * - daily：单条（agg=last，interval=窗口长 → 当前周期累计量）
 * - cumulative：单条 **raw**（不传 agg/interval）——分段累加需要逐点，
 *   桶聚合会把复位点抹平（回退发生在桶内时，桶末值已复位，段增量算不准）
 * - shape=series：单条降采样（instant 用声明 agg；daily/cumulative 用 last）
 */
export function planQueries(panels: BiPanelSpec[], nowSec: number): BiQueryPlan[] {
  const out: BiQueryPlan[] = []
  for (const panel of panels) {
    for (let i = 0; i < panel.series.length; i++) {
      const s = panel.series[i]
      const base = { panelId: panel.id, seriesIndex: i, dev_id: s.dev_id, tag: s.tag }
      if (panel.shape === 'both') {
        const bucket = panel.interval > 0 ? panel.interval : seriesBucket(panel.windowSecs)
        // main：**保持 aggregate 形态的口径**（instant=窗口聚合值 / cumulative=raw 分段累加）
        // ——both 若把累计量也走 last 降采样，KPI 卡会显示「累计总量」而非「窗口用量」
        // （实测：今日用水量显示 2846 m³ = 累计水量，而非窗口用量）。
        if (s.mode === 'cumulative') {
          out.push({
            ...base,
            slot: 'main',
            start: nowSec - panel.windowSecs,
            end: nowSec,
            agg: null,
            interval: 0,
          })
        } else {
          out.push({
            ...base,
            slot: 'main',
            start: nowSec - panel.windowSecs,
            end: nowSec,
            agg: panel.agg,
            interval: panel.windowSecs,
          })
        }
        // spark：同窗降采样时序（迷你趋势用）
        out.push({
          ...base,
          slot: 'spark',
          start: nowSec - panel.windowSecs,
          end: nowSec,
          agg: s.mode === 'instant' ? panel.agg : 'last',
          interval: bucket,
        })
        continue
      }
      if (panel.shape === 'series') {
        const bucket = panel.interval > 0 ? panel.interval : seriesBucket(panel.windowSecs)
        out.push({
          ...base,
          slot: 'main',
          start: nowSec - panel.windowSecs,
          end: nowSec,
          agg: s.mode === 'instant' ? panel.agg : 'last',
          interval: bucket,
        })
        continue
      }
      if (s.mode === 'cumulative') {
        out.push({
          ...base,
          slot: 'main',
          start: nowSec - panel.windowSecs,
          end: nowSec,
          agg: null,
          interval: 0,
        })
        continue
      }
      out.push({
        ...base,
        slot: 'main',
        start: nowSec - panel.windowSecs,
        end: nowSec,
        agg: s.mode === 'daily' ? 'last' : panel.agg,
        interval: panel.windowSecs,
      })
    }
  }
  return out
}

/** shape=series 的兜底桶宽：窗口按目标桶数均分，最小 1s。 */
function seriesBucket(windowSecs: number): number {
  return Math.max(1, Math.ceil(windowSecs / BI_SERIES_MAX_BUCKETS))
}

/** 查询计划分批（每批 ≤ BI_MAX_BATCH 条；全局顺序保持）。 */
export function chunkQueries(queries: BiQueryPlan[]): BiQueryPlan[][] {
  const out: BiQueryPlan[][] = []
  for (let i = 0; i < queries.length; i += BI_MAX_BATCH) {
    out.push(queries.slice(i, i + BI_MAX_BATCH))
  }
  return out
}

/** 后端 batch 结果中的一条（与 /history/batch 响应同构）。 */
export interface BiRawResult {
  dev_id?: string
  tag?: string
  points?: Array<{ ts?: number; value?: unknown }>
  count?: number
  error?: string
}

/**
 * 分段累加：累计量在窗口内的总用量。
 *
 * 按**回退点**（值变小 = 计数器复位）切段，每段取「段末 − 段初」的增量求和。
 * 无回退时等价于「末值 − 首值」；有回退时各段独立计量再相加——
 * 这才是复位型表计的真实用量（复位不是「倒扣」，而是「换了新的一段计量」）。
 */
export function cumulativeTotal(points: BiPoint[]): number {
  if (!points.length) return NaN
  let total = 0
  let segStart = points[0].value
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].value
    const cur = points[i].value
    if (cur < prev) {
      total += prev - segStart // 段一结算
      segStart = cur // 新段起点 = 复位后的值
    }
  }
  total += points[points.length - 1].value - segStart // 末段结算
  return total
}

/** 数值归一：非数（bool/str/缺失）→ null（调用方决定丢弃或报错）。 */
function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * 信封组装：查询计划 + 原始结果 → 按面板分组的信封。
 *
 * - 结果与查询**按序对应**（后端 /history/batch 保证顺序一致）——故用下标配对。
 * - 累计量 delta = 主窗末值 − 前窗末值；任一窗失败 → value=null 且 error 透出。
 * - 空窗（count=0 / 无点）→ value=null、error=null（图元显示占位，不是 0）。
 */
export function buildEnvelopes(
  panels: BiPanelSpec[],
  queries: BiQueryPlan[],
  results: BiRawResult[],
  nowSec: number,
): Map<string, BiEnvelope> {
  const byPanel = new Map<string, BiEnvelope>()
  const panelById = new Map(panels.map((p) => [p.id, p]))
  const acc = new Map<
    string,
    { main?: BiQueryPlan; mainRes?: BiRawResult; spark?: BiQueryPlan; sparkRes?: BiRawResult }
  >()

  queries.forEach((q, i) => {
    const key = `${q.panelId}#${q.seriesIndex}`
    const cur = acc.get(key) ?? {}
    if (q.slot === 'main') {
      cur.main = q
      cur.mainRes = results[i]
    } else if (q.slot === 'spark') {
      cur.spark = q
      cur.sparkRes = results[i]
    }
    acc.set(key, cur)
  })

  for (const panel of panels) {
    const series: BiSeriesResult[] = []
    panel.series.forEach((s, idx) => {
      const key = `${panel.id}#${idx}`
      const got = acc.get(key)
      const mainRes = got?.mainRes
      const base: BiSeriesResult = {
        key: `${s.dev_id}.${s.tag}`,
        label: s.label,
        unit: s.unit,
        color: s.color,
        mode: s.mode,
        metric: s.mode === 'cumulative' ? 'usage' : s.mode === 'daily' ? 'current' : panel.agg,
        value: null,
        points: [],
        error: null,
      }
      if (!mainRes) {
        base.error = '未取数'
        series.push(base)
        return
      }
      if (mainRes.error !== undefined) {
        base.error = mainRes.error
        series.push(base)
        return
      }
      const pts = (mainRes.points ?? [])
        .map((p) => ({ ts: Number(p.ts), value: toNum(p.value) }))
        .filter((p) => Number.isFinite(p.ts) && p.value !== null) as BiPoint[]
      if (panel.shape === 'series') {
        base.points = pts
        series.push(base)
        return
      }
      if (panel.shape === 'both') {
        // main 给**口径正确的单值**（instant=聚合桶值 / cumulative=raw 分段累加），
        // spark 给同窗时序点（KPI 卡：大数字 + 迷你趋势）
        const sparkPts = (got?.sparkRes?.points ?? [])
          .map((p) => ({ ts: Number(p.ts), value: toNum(p.value) }))
          .filter((p) => Number.isFinite(p.ts) && p.value !== null) as BiPoint[]
        base.points = sparkPts
        base.value = s.mode === 'cumulative'
          ? (pts.length ? cumulativeTotal(pts) : null)
          : (pts.length ? pts[pts.length - 1].value : null)
        series.push(base)
        return
      }
      if (s.mode === 'cumulative') {
        // 分段累加：raw 逐点 → 按回退点切段 → 段内增量求和
        const pts = (mainRes.points ?? [])
          .map((p) => ({ ts: Number(p.ts), value: toNum(p.value) }))
          .filter((p) => Number.isFinite(p.ts) && p.value !== null) as BiPoint[]
        base.value = pts.length ? cumulativeTotal(pts) : null
        series.push(base)
        return
      }
      // instant aggregate / daily current：整窗落一桶 → 取该桶值（末点即桶聚合值）
      base.value = pts.length ? pts[pts.length - 1].value : null
      series.push(base)
    })
    const win = panel.windowSecs
    byPanel.set(panel.id, {
      v: 1,
      window: { start: nowSec - win, end: nowSec },
      generatedAt: nowSec,
      series,
    })
  }
  void panelById
  return byPanel
}
