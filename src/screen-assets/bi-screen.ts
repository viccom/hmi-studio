/**
 * 监控站级 BI 数据大屏（长期 LAN 演示资产，slug 恒定 bi-station，不入 e2e 清扫）。
 *
 * 与既有 home-meter-* 三屏的分工（design docs/plans/2026-10-29-bi-monitoring-dashboard-design.md §2）：
 * - 传统 HMI 屏 = **实时工艺画面**（仪表盘/阀门状态/趋势曲线，SSE 通道 A 驱动）
 * - 本 BI 屏 = **历史分析画面**（KPI/排名/占比/构成，宿主聚合通道 B 驱动）
 * 两者共用同一份活数据（rs-iot 时序库 + SSE），不新增采集链路。
 *
 * 数据面（通道 B）：
 * - 图元**不绑** SSE 点位、不轮询。宿主（ViewView）扫描画面里的 ah-bi- 图元 →
 *   合并查询 → POST /api/v1/history/batch → 结果按面板组装信封 → 写回 props.data.val。
 * - 图元 props.series 声明「查什么」（dev_id/tag/mode），props.data 是「查到了什么」。
 * - mode=cumulative 的序列（累计电能/累计水气）由宿主按**分段累加**求窗口增量
 *   （现场表计周期性复位，双窗末值差会差出负数），图元拿到的 value 已是增量。
 *
 * 现场点位（2026-10-29 实测）：home-meter-e1/e2 电表、g1/g2 燃气表、w1/w2 水表；
 * 归档白名单已开通瞬时量（power/voltage/current/pf/frequency/gas_instant/flow_instant/battery）。
 * 用量构成区的三表累计量单位不同（kWh / m³），故**不做跨介质单位求和**——
 * 占比图按「各表自身窗口增量」分列展示，避免不同单位相加的谎报。
 *
 * 布局：1920×1080 设计分辨率（比 800×600 宽屏更贴大屏形态），三行分区。
 * 纯函数、零随机——id 稳定兼作 E2E 锚点（[id^="ah-bi-"]），快照防漂移见伴生测试。
 */
import type { IExportDoneJson, IExportJson } from 'maotu'
import type { ScreenDoc } from '../lib/screens'
import { allSymbols } from '../symbols/registry'

export const BI_STATION = 'bi-station'
export const BI_GROUP = 'BI 大屏演示'

const sym = (id: string) => {
  const s = allSymbols().find((x) => x.id === id)
  if (!s) throw new Error(`bi-screen: 未注册图元 ${id}`)
  return s
}

/** BI 图元实例（props 平面值，缺键回落注册默认——Jr 导入契约同款）。
 *  刻意平铺在画布顶层：setItemAttrByID 按顶层 id 定位（组合内元素定位不到）。 */
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

/** 标题文本（内置文本图元 text-vue） */
function textItem(id: string, o: {
  text: string; left: number; top: number; width: number; height?: number
  fill?: string; fontSize?: number
}): IExportDoneJson {
  return {
    active: false, hide: false, lock: false, resize: true, rotate: true,
    id, title: '文字', type: 'vue', tag: 'text-vue',
    binfo: { angle: 0, height: o.height ?? 32, left: o.left, top: o.top, width: o.width },
    common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
    events: [], ports: [],
    props: { fill: o.fill ?? '#FFF700', fontFamily: '黑体', fontSize: o.fontSize ?? 20, text: o.text, vertical: false },
    binds: [],
  } as IExportDoneJson
}

/** 序列规格 JSON（组态员在图元属性面板里填的同款形状） */
const spec = (rows: Array<Record<string, unknown>>): string => JSON.stringify(rows)

/** 画布骨架：1920×1080 深色、20px 吸附网格 */
const canvas = (): Pick<IExportJson, 'canvasCfg' | 'gridCfg'> => ({
  canvasCfg: {
    width: 1920, height: 1080, scale: 1, color: '#0b0e14', img: '',
    guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
  },
  gridCfg: { enabled: true, align: true, size: 20 },
})

/**
 * 监控站大屏（纯函数）：A 总览 KPI / B 用量构成 + 排名 / C 明细 + 平台态势。
 *
 * 分区与设计文档 §2 的映射：
 * - A 总览 KPI：今日电量 / 今日用水 / 今日用气 / 当前总功率（4 张 KPI 卡）
 * - B 分析区：各表今日用量排名（rank）、三表用量构成（pie）、累计构成（stack）
 * - C 明细区：各表用量明细表（table）、功率趋势（trend）
 */
export function buildBiStationScreen(): ScreenDoc {
  const c: ScreenDoc = {
    name: '监控站数据大屏', group: BI_GROUP,
    ...canvas(),
    json: [
      // ---- 标题带（Grafana 式：紧凑，数字与标题同层）----
      // 字号按 4K/200% 运行环境校准（2026-10-29 用户反馈：小字看不清）——标题 34 / 副标 16
      textItem('text-vue-bist-title', {
        text: '监控站数据大屏 · 能源计量分析', left: 30, top: 14, width: 800, height: 48,
        fill: '#e6f7ff', fontSize: 34,
      }),
      textItem('text-vue-bist-sub', {
        text: 'rs-iot 时序库 · 30s 聚合刷新', left: 30, top: 62, width: 480, height: 24,
        fill: '#6e7681', fontSize: 16,
      }),
      // 窗口切换器（上行控制）：点击整屏 BI 面板切统计窗（默认/1时/24时/7天），
      // 宿主收集器 windowOverride 生效——不用改画面/重播种
      biItem('ah-bi-window', 'ah-bi-window-bist-1', {
        left: 1456, top: 20, width: 434, height: 48,
        props: { title: '统计窗口', fill: '#f5a623' },
      }),

      // ---- A 区：总览 KPI 带（6 张紧凑卡，shape=both → 大数字 + 卡内迷你趋势）----
      biItem('ah-bi-kpi', 'ah-bi-kpi-bist-1', {
        left: 30, top: 86, width: 300, height: 124,
        props: {
          title: '今日用电量',
          series: JSON.stringify([{dev_id:'home-meter-e1',tag:'energy_today',label:'1#电表',unit:'kWh',mode:'daily'},{dev_id:'home-meter-e2',tag:'energy_today',label:'2#电表',unit:'kWh',mode:'daily'}]),
          agg: 'last', windowSecs: 86400, shape: 'both', interval: 300,
          fill: '#f5a623',
        },
      }),
      biItem('ah-bi-kpi', 'ah-bi-kpi-bist-2', {
        left: 342, top: 86, width: 300, height: 124,
        props: {
          title: '今日用水量',
          series: JSON.stringify([{dev_id:'home-meter-w1',tag:'flow_total',label:'1#水表',unit:'m³',mode:'cumulative'},{dev_id:'home-meter-w2',tag:'flow_total',label:'2#水表',unit:'m³',mode:'cumulative'}]),
          agg: 'last', windowSecs: 86400, shape: 'both', interval: 300,
          fill: '#39c5cf',
        },
      }),
      biItem('ah-bi-kpi', 'ah-bi-kpi-bist-3', {
        left: 654, top: 86, width: 300, height: 124,
        props: {
          title: '今日用气量',
          series: JSON.stringify([{dev_id:'home-meter-g1',tag:'gas_total',label:'1#燃气表',unit:'m³',mode:'cumulative'},{dev_id:'home-meter-g2',tag:'gas_total',label:'2#燃气表',unit:'m³',mode:'cumulative'}]),
          agg: 'last', windowSecs: 86400, shape: 'both', interval: 300,
          fill: '#bc8cff',
        },
      }),
      biItem('ah-bi-kpi', 'ah-bi-kpi-bist-4', {
        left: 966, top: 86, width: 300, height: 124,
        props: {
          title: '1#电表 有功功率',
          series: JSON.stringify([{dev_id:'home-meter-e1',tag:'power',label:'1#电表',unit:'kW'}]),
          agg: 'avg', windowSecs: 3600, shape: 'both', interval: 300,
          fill: '#f5a623',
        },
      }),
      biItem('ah-bi-kpi', 'ah-bi-kpi-bist-5', {
        left: 1278, top: 86, width: 300, height: 124,
        props: {
          title: '1#水表 瞬时流量',
          series: JSON.stringify([{dev_id:'home-meter-w1',tag:'flow_instant',label:'1#水表',unit:'m³/h'}]),
          agg: 'avg', windowSecs: 3600, shape: 'both', interval: 300,
          fill: '#39c5cf',
        },
      }),
      biItem('ah-bi-kpi', 'ah-bi-kpi-bist-6', {
        left: 1590, top: 86, width: 300, height: 124,
        props: {
          title: '1#燃气表 瞬时流量',
          series: JSON.stringify([{dev_id:'home-meter-g1',tag:'gas_instant',label:'1#燃气表',unit:'m³/h'}]),
          agg: 'avg', windowSecs: 3600, shape: 'both', interval: 300,
          fill: '#bc8cff',
        },
      }),

      // ---- B 区：分析区（堆叠趋势 / 占比环 / 排名）----
      biItem('ah-bi-stack-area', 'ah-bi-stack-area-bist-1', {
        left: 30, top: 226, width: 1000, height: 372,
        props: {
          title: '各表瞬时负荷（1h 窗口）',
          // 堆叠是**相加**——必须同单位：只放两台电表功率（kW）
          series: spec([
            { dev_id: 'home-meter-e1', tag: 'power', label: '1#电表 功率', unit: 'kW' },
            { dev_id: 'home-meter-e2', tag: 'power', label: '2#电表 功率', unit: 'kW' },
          ]),
          agg: 'avg', interval: 60, windowSecs: 3600, shape: 'series',
        },
      }),
      biItem('ah-bi-pie', 'ah-bi-pie-bist-1', {
        left: 1042, top: 226, width: 380, height: 372,
        props: {
          title: '用电量占比',
          series: spec([
            { dev_id: 'home-meter-e1', tag: 'energy_today', label: '1#电表', unit: 'kWh', mode: 'daily' },
            { dev_id: 'home-meter-e2', tag: 'energy_today', label: '2#电表', unit: 'kWh', mode: 'daily' },
          ]),
          agg: 'last', windowSecs: 86400, shape: 'aggregate',
        },
      }),
      biItem('ah-bi-rank', 'ah-bi-rank-bist-1', {
        left: 1434, top: 226, width: 456, height: 372,
        props: {
          // 同单位同介质才可比：只放两台电表（kWh）
          title: '电表用电量排名（24h）',
          series: spec([
            { dev_id: 'home-meter-e1', tag: 'energy_today', label: '1#电表', unit: 'kWh', mode: 'daily' },
            { dev_id: 'home-meter-e2', tag: 'energy_today', label: '2#电表', unit: 'kWh', mode: 'daily' },
          ]),
          agg: 'last', windowSecs: 86400, shape: 'aggregate',
        },
      }),

      // ---- C 区：明细区（矩阵热力 / 尖峰 / 明细表 / 告警统计，4 等列）----
      biItem('ah-bi-matrix', 'ah-bi-matrix-bist-1', {
        left: 30, top: 610, width: 456, height: 440,
        props: {
          title: '各表瞬时流量 × 时间（1min 桶）',
          // 热力是**颜色深浅比较**——同样要同单位可比：四台表均为瞬时流量（m³/h）
          series: spec([
            { dev_id: 'home-meter-w1', tag: 'flow_instant', label: '1#水表', unit: 'm³/h' },
            { dev_id: 'home-meter-w2', tag: 'flow_instant', label: '2#水表', unit: 'm³/h' },
            { dev_id: 'home-meter-g1', tag: 'gas_instant', label: '1#燃气表', unit: 'm³/h' },
            { dev_id: 'home-meter-g2', tag: 'gas_instant', label: '2#燃气表', unit: 'm³/h' },
          ]),
          agg: 'avg', interval: 60, windowSecs: 3600, shape: 'series',
        },
      }),
      // 尖峰柱图（②）：p90 动态阈值——超阈值桶染红 + 阈值虚线（对标 Grafana Power Spikes）
      biItem('ah-bi-spike', 'ah-bi-spike-bist-1', {
        left: 498, top: 610, width: 456, height: 440,
        props: {
          title: '1#电表功率尖峰（1h · P90 阈值）',
          series: spec([
            { dev_id: 'home-meter-e1', tag: 'power', label: '1#电表', unit: 'kW' },
          ]),
          agg: 'avg', interval: 60, windowSecs: 3600, shape: 'series',
          spikeMode: 'p90',
        },
      }),
      biItem('ah-bi-table', 'ah-bi-table-bist-1', {
        left: 966, top: 610, width: 456, height: 440,
        props: {
          title: '设备指标明细（24h 窗口）',
          series: spec([
            { dev_id: 'home-meter-e1', tag: 'power', label: '1#电表 功率', unit: 'kW' },
            { dev_id: 'home-meter-e2', tag: 'power', label: '2#电表 功率', unit: 'kW' },
            { dev_id: 'home-meter-e1', tag: 'voltage', label: '1#电表 电压', unit: 'V' },
            { dev_id: 'home-meter-e1', tag: 'current', label: '1#电表 电流', unit: 'A' },
            { dev_id: 'home-meter-w1', tag: 'flow_instant', label: '1#水表 瞬时流量', unit: 'm³/h' },
            { dev_id: 'home-meter-w2', tag: 'flow_instant', label: '2#水表 瞬时流量', unit: 'm³/h' },
            { dev_id: 'home-meter-g1', tag: 'gas_instant', label: '1#燃气表 瞬时流量', unit: 'm³/h' },
            { dev_id: 'home-meter-g2', tag: 'gas_instant', label: '2#燃气表 瞬时流量', unit: 'm³/h' },
          ]),
          agg: 'avg', windowSecs: 86400, shape: 'aggregate',
        },
      }),
      // 告警统计（③）：活动告警快照（后端无告警历史）——宿主 fetchAlarms 写告警信封
      biItem('ah-bi-alarms', 'ah-bi-alarms-bist-1', {
        left: 1434, top: 610, width: 456, height: 440,
        props: { title: '活动告警', fill: '#f85149', maxRows: 6 },
      }),
    ],
    eventList: [], eventFlow: [],
  }
  return c
}
