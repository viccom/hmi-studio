/**
 * 宿主聚合收集器（通道 B 执行端）——把画面里所有 BI 图元的历史分析需求合并成
 * 少量 /history/batch 往返，取回后按面板组装信封并写回各图元。
 *
 * 为何在宿主而不在图元（架构裁定，AhTrendChart 头注释同款）：
 * - 图元不自开 EventSource、不轮询（采集器是唯一数据出口）
 * - **跨面板合并**是本层的核心价值：一屏 12 张图元若各自取数 = 12 次往返，
 *   合并后 1~2 次（后端单批 ≤32 条，本设计 6 设备规模远未触顶）
 * - 累计量 delta、前窗补齐等口径计算收在一处，图元只负责画
 *
 * 依赖注入（fetchBatch / write / now）→ 流层不进 jsdom 也不碰 maotu：
 * - fetchBatch：POST /history/batch 的实现由宿主注入（api.ts 客户端）
 * - write：写回实现由宿主注入（maotu preview.setItemAttrByID）
 * - now：时间源（测试可控）
 */
import {
  BI_SERIES_MAX_BUCKETS,
  buildAlarmEnvelope,
  buildEnvelopes,
  chunkQueries,
  collectBiAlarmPanels,
  collectBiPanels,
  parseAlarmList,
  planQueries,
  type BiPanelSpec,
  type BiQueryPlan,
  type BiRawResult,
  type BiWireQuery,
} from './bi-contract'

/** 收集器依赖（全部注入，便于单测与宿主装配）。 */
export interface BiCollectorDeps {
  /** POST /history/batch：入参 {queries:[...]}，返回 {results:[...]}。 */
  fetchBatch: (body: { queries: BiWireQuery[] }) => Promise<{ results?: BiRawResult[] }>
  /** 写回：写回目标 id、JSON 串、props 路径。 */
  write: (itemId: string, payload: string, attr: string) => void
  /** 时间源（秒级 Unix 时间戳）。 */
  now: () => number
  /** 拉活动告警快照（GET /api/v1/alarms 原始数组）——画面含 ah-bi-alarms 面板时调用；
   *  未注入时告警面板静默跳过（旧部署形态不炸）。 */
  fetchAlarms?: () => Promise<unknown>
}

/** 收集器可选覆盖。 */
export interface BiCollectorOptions {
  now?: () => number
  /** 全局窗口覆盖（秒）——窗口切换器（ah-bi-window）的生效档。正秒 = 覆盖全部
   *  面板的 windowSecs；0/null/undefined = 按面板各自配置。每拍实时读取
   *  （操作员切换后下一拍即生效，无需重建收集器）。 */
  windowOverride?: () => number | null
}

/** 一次采集的结果。 */
export interface BiCollectResult {
  /** 是否成功（false = batch 整体失败，画面未写回）。 */
  ok: boolean
  /** 本次覆盖的面板数。 */
  panels: number
  /** 整体失败原因（ok=true 时为 undefined）。 */
  error?: string
}

/** 写回用的 props 路径（maotu 直写约定：props.<name>.val）。 */
export const BI_DATA_ATTR = 'props.data.val'

/**
 * 创建收集器。
 *
 * @param deps  依赖注入（fetchBatch / write / now）
 * @param opts  可选覆盖（now）
 */
export function createBiCollector(deps: BiCollectorDeps, opts: BiCollectorOptions = {}) {
  const now = opts.now ?? deps.now

  /**
   * 采集一轮：扫描画面 → 合并查询 → 分批取数 → 结果按序配对 → 组装信封 → 写回。
   * 画面含告警面板（ah-bi-alarms）时同拍拉取活动告警快照并写告警信封。
   *
   * 失败语义：
   * - 无 BI 图元且无告警面板 → ok=true、零请求零写回（普通 HMI 画面走这条，不产生任何开销）
   * - batch 整体失败（网络/503）→ ok=false、**零写回**（保留图元上一次的旧信封，
   *   总比写空白强）；告警拉取失败 → 仅告警面板不写（保留旧信封），数据面板照常
   * - 单条查询失败 → 字段化进该 series 的 error，其余面板照常写回（单图失败不拖全屏）
   */
  async function collect(done: unknown): Promise<BiCollectResult> {
    const alarmIds = collectBiAlarmPanels(done)
    const found: BiPanelSpec[] = collectBiPanels(done)
    if (!found.length && !alarmIds.length) return { ok: true, panels: 0 }

    const t = now()
    const ov = opts.windowOverride?.() ?? null
    // 覆盖窗应用到面板规格本身（planQueries/buildEnvelopes 读同一份 → 查询与信封窗口天然一致）。
    // 桶宽同步抬到防爆下限：声明桶宽是按面板自己的窗配的（60s×1h=60 桶），覆盖到 7d 时若
    // 任其直通会切出 10080 桶/序列（深度审查问题1——图表只需 ~120 点，爆量 100 倍）。
    // 只作用于覆盖路径：未覆盖时已组态画面零回归。
    const panels = ov && ov > 0
      ? found.map((p) => ({
          ...p,
          windowSecs: Math.floor(ov),
          interval: Math.max(p.interval, Math.ceil(ov / BI_SERIES_MAX_BUCKETS)),
        }))
      : found

    if (alarmIds.length && deps.fetchAlarms) {
      try {
        const raw = await deps.fetchAlarms()
        const payload = JSON.stringify(buildAlarmEnvelope(parseAlarmList(raw), t))
        for (const id of alarmIds) deps.write(id, payload, BI_DATA_ATTR)
      } catch {
        /* 告警源失败不拖数据面板——告警面板保留旧信封 */
      }
    }

    if (!panels.length) return { ok: true, panels: 0 }

    const queries = planQueries(panels, t)
    if (!queries.length) return { ok: true, panels: panels.length }

    // 分批取数，结果按「批内顺序」拼接——后端保证 results 与 queries 同序，
    // 故跨批拼接后仍与全局 queries 顺序一致（配对靠下标，不靠 dev_id 猜）。
    const raw: BiRawResult[] = []
    try {
      for (const chunk of chunkQueries(queries)) {
        const body = { queries: chunk.map(toWireQuery) }
        const res = await deps.fetchBatch(body)
        const list = res.results ?? []
        for (let i = 0; i < chunk.length; i++) {
          raw.push(list[i] ?? { error: '未返回结果' })
        }
      }
    } catch (e) {
      return { ok: false, panels: panels.length, error: e instanceof Error ? e.message : String(e) }
    }

    const envelopes = buildEnvelopes(panels, queries, raw, t)
    for (const panel of panels) {
      const env = envelopes.get(panel.id)
      if (!env) continue
      deps.write(panel.id, JSON.stringify(env), BI_DATA_ATTR)
    }
    return { ok: true, panels: panels.length }
  }

  return { collect }
}

/** 查询计划 → 后端 wire 形状（后端只要这几个字段，秒级时间窗）。
 *  raw 查询（agg=null）省略 agg/interval——后端两者必须同时给或都不给。 */
function toWireQuery(q: BiQueryPlan): BiWireQuery {
  const base = { dev_id: q.dev_id, tag: q.tag, start: q.start, end: q.end }
  if (q.agg === null) return base
  return { ...base, agg: q.agg, interval: q.interval }
}
