/**
 * 工业 SCADA 历史分析大屏（iot-bi-station，1920×1080，深色分析层）。
 *
 * 与既有 `bi-station`（家庭三表演示）的分工：本屏绑定 **iot-demo 真实工位点位**
 * （10 设备 / 154 点：Modbus 水气表 + OPC UA 电表/环境/变送器），画面主题沿用 BI
 * 深色分析层（Grafana 式），与操作层的灰阶 HP-HMI 画面（`iot-*` 15 张）分工：
 *   - 操作层（灰阶）：实时工艺画面 + 设备面板 → 看"现在怎么样"
 *   - 分析层（深色）：历史分析大屏 → 看"过去发生了什么、构成如何"
 * 两层共用同一份时序库（rs-iot history，30 天）与同一 BI 通道 B。
 *
 * 数据面（通道 B）：图元不绑 SSE 点位、不轮询——宿主（ViewView）扫描画面里的
 * ah-bi- 图元 → 合并查询 → POST /api/v1/history/batch → 结果按面板组装信封 →
 * 写回 props.data.val。mode=cumulative 的序列（累计水/气/电）由宿主按**分段累加**
 * 求窗口用量（表计复位时双窗末值差会算出负数）。
 *
 * 用量口径纪律：**不跨介质求和**——水(m³)/气(m³)/电(kWh) 各自成图，占比只做同介质
 * 内部（电三表 kWh），避免不同单位相加的谎报。
 *
 * 纯函数、零随机——id 稳定兼作 E2E 锚点（[id^="ah-bi-"]），快照防漂移见伴生测试。
 */
import type { IExportDoneJson, IExportJson } from 'maotu'
import type { ScreenDoc } from '../lib/screens'
import { allSymbols } from '../symbols/registry'
import { IOT_DEVICES } from './iot-catalog'

export { IOT_BI_STATION } from './protected'

const BI_GROUP = '工业 SCADA 演示'

const sym = (id: string) => {
  const s = allSymbols().find((x) => x.id === id)
  if (!s) throw new Error(`iot-bi-screen: 未注册图元 ${id}`)
  return s
}

/** BI 图元实例（平铺顶层——setItemAttrByID 按顶层 id 定位，组合内定位不到）。 */
export function biItem(symbolId: string, id: string, o: {
  left: number; top: number; width: number; height: number
  props?: Record<string, unknown>
}): IExportDoneJson {
  const s = sym(symbolId)
  const flat = Object.fromEntries(Object.entries(s.props).map(([key, d]) => [key, d.val]))
  return {
    active: false, hide: false, lock: false, resize: true, rotate: true,
    id, title: s.title, type: s.type, tag: s.id,
    binfo: { angle: 0, width: o.width, height: o.height, left: o.left, top: o.top },
    common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
    events: [], ports: [],
    props: { ...flat, ...o.props },
    binds: [],
  } as IExportDoneJson
}

/** 文本（内置 text-vue，深色大屏底色） */
function textItem(id: string, o: {
  text: string; left: number; top: number; width: number; height?: number
  fill?: string; fontSize?: number
}): IExportDoneJson {
  return {
    active: false, hide: false, lock: false, resize: true, rotate: true,
    id, title: '文字', type: 'vue', tag: 'text-vue',
    binfo: { angle: 0, height: o.height ?? 30, left: o.left, top: o.top, width: o.width },
    common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
    events: [], ports: [],
    props: { fill: o.fill ?? '#e6f7ff', fontFamily: 'Consolas, Menlo, monospace', fontSize: o.fontSize ?? 18, text: o.text, vertical: false },
    binds: [],
  } as IExportDoneJson
}

const canvas = (): Pick<IExportJson, 'canvasCfg' | 'gridCfg'> => ({
  canvasCfg: {
    width: 1920, height: 1080, scale: 1, color: '#0b0e14', img: '',
    guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
  },
  gridCfg: { enabled: true, align: true, size: 20 },
})

/** 序列规格（JSON 串）：mode=instant/daily/cumulative */
interface Row { dev_id: string; tag: string; label: string; unit: string; mode?: 'instant' | 'daily' | 'cumulative'; color?: string }
const spec = (rows: Row[]): string => JSON.stringify(rows)

const WATER = ['dev_wm1', 'dev_wm2', 'dev_wm3']
const GAS = ['dev_gm1', 'dev_gm2']
const POWER = ['dev_em1', 'dev_em2', 'dev_em3']
const ENV = 'dev_env1'
const PT = 'dev_pt1'

/** 图例标签用位号（窄面板里 "WM-101 1# 远传水表" 会被截断）。 */
const label = (devid: string): string => {
  const d = IOT_DEVICES.find((x) => x.devid === devid)
  return d ? d.pos : devid
}

/**
 * 工业历史分析大屏（纯函数）：
 * - A 带：6 张 KPI 卡（今日水/气/电用量 = 累计表分段累加；当前总功率/环境温度/变送器压力 = 瞬时量）
 * - B 带：24h 电功率趋势（大图）+ 用电量排名 + 用电构成（同介质 kWh 内部占比）
 * - C 带：水/气/环境三条趋势 + 活动告警统计
 */
export function buildIotBiStationScreen(): ScreenDoc {
  const json: IExportDoneJson[] = [
    // ---- 标题带 ----
    textItem('text-vue-iotbi-title', {
      text: '工业物联网演示站 · 历史分析大屏', left: 30, top: 14, width: 820, height: 48, fill: '#e6f7ff', fontSize: 34,
    }),
    textItem('text-vue-iotbi-sub', {
      text: 'iot-demo 10 设备 / 154 点 · rs-iot 时序库 30 天 · 通道 B 聚合 30s 刷新',
      left: 30, top: 62, width: 760, height: 24, fill: '#8b949e', fontSize: 16,
    }),
    // 窗口切换器（整屏统计窗：默认/1时/24时/7天）
    biItem('ah-bi-window', 'ah-bi-window-iotbi-1', {
      left: 1420, top: 20, width: 470, height: 48,
      props: { title: '统计窗口', fill: '#f5a623' },
    }),

    // ---- A 带：总览 KPI（6 张）----
    biItem('ah-bi-kpi', 'ah-bi-kpi-iotbi-water', {
      left: 30, top: 96, width: 300, height: 128,
      props: {
        title: '今日用水量', agg: 'sum', interval: 3600, windowSecs: 86400, shape: 'both', sum_series: true,
        series: spec(WATER.map((d) => ({ dev_id: d, tag: 'total_volume', label: label(d), unit: 'm³', mode: 'cumulative' as const }))),
      },
    }),
    biItem('ah-bi-kpi', 'ah-bi-kpi-iotbi-gas', {
      left: 342, top: 96, width: 300, height: 128,
      props: {
        title: '今日用气量', agg: 'sum', interval: 3600, windowSecs: 86400, shape: 'both', sum_series: true,
        series: spec(GAS.map((d) => ({ dev_id: d, tag: 'volume_total', label: label(d), unit: 'm³', mode: 'cumulative' as const }))),
      },
    }),
    biItem('ah-bi-kpi', 'ah-bi-kpi-iotbi-power', {
      left: 654, top: 96, width: 300, height: 128,
      props: {
        title: '今日用电量', agg: 'sum', interval: 3600, windowSecs: 86400, shape: 'both', sum_series: true,
        series: spec(POWER.map((d) => ({ dev_id: d, tag: 'energy_total', label: label(d), unit: 'kWh', mode: 'cumulative' as const }))),
      },
    }),
    biItem('ah-bi-kpi', 'ah-bi-kpi-iotbi-load', {
      left: 966, top: 96, width: 300, height: 128,
      props: {
        title: '全厂总功率（1h 均值）', agg: 'avg', interval: 60, windowSecs: 3600, shape: 'both', sum_series: true,
        series: spec(POWER.map((d) => ({ dev_id: d, tag: 'active_power', label: label(d), unit: 'kW' }))),
      },
    }),
    biItem('ah-bi-kpi', 'ah-bi-kpi-iotbi-temp', {
      left: 1278, top: 96, width: 300, height: 128,
      props: {
        title: '环境温度（1h 均值）', agg: 'avg', interval: 60, windowSecs: 3600, shape: 'both', sum_series: true,
        series: spec([{ dev_id: ENV, tag: 'temperature', label: label(ENV), unit: '°C' }]),
      },
    }),
    biItem('ah-bi-kpi', 'ah-bi-kpi-iotbi-pt', {
      left: 1590, top: 96, width: 300, height: 128,
      props: {
        title: '变送器压力（1h 均值）', agg: 'avg', interval: 60, windowSecs: 3600, shape: 'both', sum_series: true,
        series: spec([{ dev_id: PT, tag: 'pressure_1', label: label(PT), unit: 'MPa' }]),
      },
    }),

    // ---- B 带：24h 功率趋势 + 排名 + 构成 ----
    biItem('ah-bi-trend', 'ah-bi-trend-iotbi-power', {
      left: 30, top: 240, width: 1180, height: 392,
      props: {
        title: '三相电表有功功率趋势（24h）', agg: 'avg', interval: 300, windowSecs: 86400, shape: 'series',
        series: spec(POWER.map((d) => ({ dev_id: d, tag: 'active_power', label: label(d), unit: 'kW' }))),
      },
    }),
    biItem('ah-bi-rank', 'ah-bi-rank-iotbi-energy', {
      left: 1226, top: 240, width: 320, height: 392,
      props: {
        title: '24h 用电量排名（kWh）', agg: 'sum', interval: 3600, windowSecs: 86400, shape: 'aggregate',
        series: spec(POWER.map((d) => ({ dev_id: d, tag: 'energy_total', label: label(d), unit: 'kWh', mode: 'cumulative' as const }))),
      },
    }),
    biItem('ah-bi-pie', 'ah-bi-pie-iotbi-energy', {
      left: 1562, top: 240, width: 328, height: 392,
      props: {
        title: '用电量构成（kWh）', agg: 'sum', interval: 3600, windowSecs: 86400, shape: 'aggregate',
        series: spec(POWER.map((d) => ({ dev_id: d, tag: 'energy_total', label: label(d), unit: 'kWh', mode: 'cumulative' as const }))),
      },
    }),

    // ---- C 带：三条系统趋势 + 活动告警 ----
    biItem('ah-bi-trend', 'ah-bi-trend-iotbi-water', {
      left: 30, top: 648, width: 430, height: 392,
      props: {
        title: '水表瞬时流量（1h）', agg: 'avg', interval: 60, windowSecs: 3600, shape: 'series',
        series: spec(WATER.map((d) => ({ dev_id: d, tag: 'flow_rate', label: label(d), unit: 'm³/h' }))),
      },
    }),
    biItem('ah-bi-trend', 'ah-bi-trend-iotbi-gas', {
      left: 476, top: 648, width: 430, height: 392,
      props: {
        title: '燃气表管道压力（1h）', agg: 'avg', interval: 60, windowSecs: 3600, shape: 'series',
        series: spec(GAS.map((d) => ({ dev_id: d, tag: 'pressure', label: label(d), unit: 'kPa' }))),
      },
    }),
    biItem('ah-bi-trend', 'ah-bi-trend-iotbi-env', {
      left: 922, top: 648, width: 430, height: 392,
      props: {
        title: '环境温湿度（1h）', agg: 'avg', interval: 60, windowSecs: 3600, shape: 'series',
        series: spec([
          { dev_id: ENV, tag: 'temperature', label: '温度', unit: '°C' },
          { dev_id: ENV, tag: 'humidity', label: '湿度', unit: '%RH' },
        ]),
      },
    }),
    biItem('ah-bi-alarms', 'ah-bi-alarms-iotbi-1', {
      left: 1368, top: 648, width: 522, height: 392,
      props: { title: '活动告警统计', maxRows: 10, fill: '#f85149' },
    }),

    textItem('text-vue-iotbi-foot', {
      text: '用量口径：累计表按分段累加求窗口用量（表计复位不断算）；水/气/电不跨介质求和，占比仅同介质内部。',
      left: 30, top: 1046, width: 1200, height: 24, fill: '#6e7681', fontSize: 14,
    }),
  ]

  return { name: '工业历史分析大屏（BI）', group: BI_GROUP, ...canvas(), json, eventList: [], eventFlow: [] }
}
