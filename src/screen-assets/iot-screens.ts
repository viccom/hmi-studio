/**
 * 工业 SCADA 画面集（iot-demo，2026-11-24）：L1 总览 ×1、L2 单元 ×4、L3 设备面板 ×10。
 *
 * 组态纪律（docs/hmi-style-guide.md）：
 * - 灰阶底（L1 #F0F0F0 / L2 #DCDCDC / L3 #F5F5F5），正常态不出现饱和色；
 *   饱和色只由报警优先级/限值区/质量异常提供。
 * - L2 单屏 ≤50~60 控制点；工艺链用 ah-pipe（竖直段 angle=90）+ 设备形体 + 就地值块。
 * - L3 每台设备一张面板：**每台表计的限值不同**（iot-catalog LIMITS），参数化面板
 *   无法同时正确显示 3 台设备的限值，故按设备生成；`@dev` 前缀仍保留（宿主重写管线）。
 * - 所有数值绑定真实点位 `<devid>.<tag>`；报警/质量来自宿主合成点（lib/synthetic.ts）。
 *
 * 纯函数、零随机、稳定 id——快照与 E2E 锚点。
 */
import type { IExportDoneJson, IExportJson, IDoneJsonBindList, IDoneJsonEventList } from 'maotu'
import type { ScreenDoc } from '../lib/screens'
import type { HmiSymbol } from '../symbols/types'
import { allSymbols } from '../symbols/registry'
import { HP, NUM_FONT, UI_FONT } from '../symbols/hp-hmi'
import {
  DEVICE_BY_ID, IOT_DEVICES, faceplateSlug, tagOf,
  type Area, type DeviceMeta, type TagMeta,
} from './iot-catalog'
import {
  IOT_L1, IOT_WATER, IOT_POWER, IOT_GAS, IOT_ENV, IOT_BI_STATION,
} from './protected'

const GROUP = '工业 SCADA 演示'
const CANVAS = { width: 1280, height: 800 }
/** L3 设备面板画布更高：参数表最长的一台是 20 点电表（17 数值 + 3 布尔），要给底部
 *  历史趋势留一条固定带。行距按**实测**取值（紧凑值块高 24 但行距 26——元素底边框
 *  1px + 画布间距 1px；布尔徽标行距 28），否则累计漂移会压住最后一行。 */
const CANVAS_L3 = { width: 1280, height: 900 }
const ROW_PITCH_NUMERIC = 26
const ROW_PITCH_BOOL = 28

const sym = (id: string): HmiSymbol => {
  const s = allSymbols().find((x) => x.id === id)
  if (!s) throw new Error(`iot-screens: 未注册图元 ${id}`)
  return s
}

const canvasIot = (bg: string, height = CANVAS.height): Pick<IExportJson, 'canvasCfg' | 'gridCfg'> => ({
  canvasCfg: {
    width: CANVAS.width, height, scale: 1, color: bg, img: '',
    guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
  },
  gridCfg: { enabled: true, align: true, size: 10 },
})

/** 图元实例：注册默认 props 打底，调用方覆盖；支持旋转与显式事件 */
function item(symbolId: string, id: string, o: {
  left: number; top: number; scale?: number; angle?: number
  width?: number; height?: number
  props?: Record<string, unknown>
  binds?: IDoneJsonBindList[]
  events?: IDoneJsonEventList[]
}): IExportDoneJson {
  const s = sym(symbolId)
  const k = o.scale ?? 1
  const flat = Object.fromEntries(Object.entries(s.props).map(([key, d]) => [key, d.val]))
  return {
    active: false, hide: false, lock: false, resize: true, rotate: true,
    id, title: s.title, type: s.type, tag: s.id,
    binfo: {
      angle: o.angle ?? 0,
      width: o.width ?? Math.round((s.width ?? 64) * k),
      height: o.height ?? Math.round((s.height ?? 64) * k),
      left: o.left, top: o.top,
    },
    common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
    events: o.events ?? (s.events ?? []) as IDoneJsonEventList[],
    ports: s.ports ?? [],
    props: { ...flat, ...o.props },
    binds: o.binds ?? [],
  } as IExportDoneJson
}

/** 文本（内置 text-vue）；数值文本用等宽字体 */
function txt(id: string, o: {
  text: string; left: number; top: number; width: number; height?: number
  fill?: string; fontSize?: number; mono?: boolean
  bindId?: string; trigger?: IDoneJsonBindList['triggers']
}): IExportDoneJson {
  return {
    active: false, hide: false, lock: false, resize: true, rotate: true,
    id, title: '文字', type: 'vue', tag: 'text-vue',
    binfo: { angle: 0, height: o.height ?? 24, left: o.left, top: o.top, width: o.width },
    common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
    events: [], ports: [],
    props: {
      fill: o.fill ?? HP.ink,
      fontFamily: o.mono ? NUM_FONT : UI_FONT,
      fontSize: o.fontSize ?? 13,
      text: o.text, vertical: false,
    },
    binds: o.bindId ? [bind(id, o.bindId, 'props.text.val', o.trigger ?? [])] : [],
  } as IExportDoneJson
}

/** 绑定对象（id 全局唯一：pel + bind + attr 派生） */
function bind(pelId: string, bindId: string, attr: string, triggers: IDoneJsonBindList['triggers'] = []): IDoneJsonBindList {
  const safe = bindId.replace(/[^A-Za-z0-9_]/g, '_')
  return {
    id: `bd-${pelId}-${safe}-${attr.split('.').filter(Boolean).slice(-2)[0] ?? 'v'}`,
    pel_id: pelId, bind_id: bindId, bind_name: bindId.split('.').slice(-1)[0] ?? bindId,
    bind_attr: attr, bind_mapping: [], triggers,
  }
}

/** 设备参数绑定（faceplate：`@dev.<tag>`，运行时由宿主重写） */
function pbind(pelId: string, tag: string, attr: string, triggers: IDoneJsonBindList['triggers'] = []): IDoneJsonBindList {
  return bind(pelId, `@dev.${tag}`, attr, triggers)
}

function trig(id: string, operator: '=' | '>' | '>=' | '<' | '<=', value: unknown, targetId: string, targetValue: string | number | boolean, targetAttr = 'props.fill.val'): IDoneJsonBindList['triggers'][number] {
  return {
    id, rule: { operator, value }, action: 'changeAttr',
    change_attr: [{ id: `ca-${id}`, target_id: targetId, target_attr: targetAttr, target_value: targetValue }],
    custom_code: '',
  }
}

/** 导航事件（词表 nav，target 可带 ?dev=） */
function navEvent(id: string, target: string): IDoneJsonEventList {
  return {
    id: `ev-${id}`, type: 'click', action: 'customCode', change_attr: [],
    custom_code: `$mtEventCallBack('nav', $item_info.id, '${target}');`,
    event_flow_ids: [], trigger_rule: {},
  }
}

/** 报警抽屉事件（词表 alarm） */
function alarmEvent(id: string): IDoneJsonEventList {
  return {
    id: `ev-${id}`, type: 'click', action: 'customCode', change_attr: [],
    custom_code: `$mtEventCallBack('alarm', $item_info.id);`,
    event_flow_ids: [], trigger_rule: {},
  }
}

/** 系统按钮（sys-button-vue）：文字 + 点击事件 */
function btn(id: string, o: { text: string; left: number; top: number; width: number; height?: number; type?: string; events: IDoneJsonEventList[] }): IExportDoneJson {
  return {
    active: false, hide: false, lock: false, resize: true, rotate: true,
    id, title: '按钮', type: 'vue', tag: 'sys-button-vue',
    binfo: { angle: 0, height: o.height ?? 32, left: o.left, top: o.top, width: o.width },
    common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
    events: o.events, ports: [],
    props: { text: o.text, type: o.type ?? 'info', round: true },
    binds: [],
  } as IExportDoneJson
}

function navBtn(id: string, o: { text: string; left: number; top: number; width: number; target: string; type?: string }): IExportDoneJson {
  return btn(id, { text: o.text, left: o.left, top: o.top, width: o.width, type: o.type, events: [navEvent(id, o.target)] })
}

function backBtn(target: string, left = 32, top = 22): IExportDoneJson {
  return navBtn('btn-back', { text: '← 返回', left, top, width: 92, target })
}

/** 右上角统一告警区：质量徽标 + 全厂 P1/报警数徽标 + 报警抽屉按钮 */
function alarmHeader(): IExportDoneJson[] {
  const qId = 'qc-global'
  const aId = 'ab-global'
  const bId = 'btn-alarm'
  return [
    item('ah-quality-badge', qId, {
      left: 876, top: 24, width: 136, height: 28,
      props: { label: '通信' },
      binds: [bind(qId, '__sys.quality', 'props.quality.val')],
    }),
    item('ah-alarm-badge', aId, {
      left: 1024, top: 22, width: 140, height: 32,
      props: { label: '全厂', blink: true },
      binds: [bind(aId, '__sys.prio', 'props.prio.val'), bind(aId, '__sys.alarms', 'props.count.val')],
    }),
    btn(bId, { text: '报警', left: 1176, top: 22, width: 76, type: 'info', events: [alarmEvent(bId)] }),
  ]
}

/** 页头：返回 + 标题/副标题 + 右侧告警区 */
function header(o: { title: string; subtitle: string; back?: string }): IExportDoneJson[] {
  const out: IExportDoneJson[] = []
  let x = 32
  if (o.back) {
    out.push(backBtn(o.back))
    x = 144
  }
  out.push(txt('txt-title', { text: o.title, left: x, top: 18, width: 700, height: 34, fontSize: 26, fill: HP.ink }))
  out.push(txt('txt-subtitle', { text: o.subtitle, left: x, top: 58, width: 700, height: 22, fontSize: 13, fill: HP.inkDim }))
  out.push(...alarmHeader())
  return out
}

/** 值块（L2 就地值）：标签/单位/精度/量程/限值来自目录，绑定真实点位 + 设备优先级 + 全局质量 */
function valueBlock(id: string, devid: string, tag: string, o: {
  left: number; top: number; width?: number; height?: number; compact?: boolean; label?: string; reserveLimits?: boolean
}): IExportDoneJson {
  const t = tagOf(devid, tag)
  const props: Record<string, unknown> = {
    label: o.label ?? t.label, unit: t.unit === '' ? '\u00a0' : t.unit, precision: t.dec, min: t.min, max: t.max,
    show_limits: Boolean(t.limits) || Boolean(o.reserveLimits), prio: 0, quality: 0,
  }
  if (t.limits) Object.assign(props, t.limits)
  const binds: IDoneJsonBindList[] = [bind(id, `${devid}.${t.tag}`, 'props.value.val')]
  if (!o.compact) {
    binds.push(bind(id, `${devid}.${t.tag}.__prio`, 'props.prio.val'))
    binds.push(bind(id, '__sys.quality', 'props.quality.val'))
  }
  return item('ah-value-block', id, {
    left: o.left, top: o.top, width: o.width ?? 200, height: o.height ?? (o.compact ? 26 : 105),
    props: { ...props, ...(o.compact ? { compact: true } : {}) },
    binds,
  })
}

/** 紧凑行（参数表行）：只绑定值，不叠设备优先级 */
function tableRow(id: string, devid: string, tag: string, left: number, top: number, width = 660): IExportDoneJson {
  // reserveLimits：无关键限值的行也保留限值列，参数表列对齐稳定
  return valueBlock(id, devid, tag, { left, top, width, height: 24, compact: true, reserveLimits: true })
}

const BOOL_TEXTS: Record<string, string> = {
  valve_status: '关,开,故障,维护,离线',
  valve_open: '关,开,故障,维护,离线',
  breaker_status: '分,合,故障,维护,离线',
  load_status: '退出,投入,故障,维护,离线',
  fan_status: '停止,运行,故障,维护,离线',
  leak_alarm: '正常,报警,故障,维护,离线',
  reverse_flow: '正常,逆流,故障,维护,离线',
  cover_tamper: '正常,开盖,故障,维护,离线',
  low_battery: '正常,低电,故障,维护,离线',
  overpressure: '正常,超压,故障,维护,离线',
  overload_alarm: '正常,过载,故障,维护,离线',
  alarm: '正常,报警,故障,维护,离线',
  fault: '正常,故障,故障,维护,离线',
}

/** 布尔行（参数表）：状态徽标显示开/关、报警/正常 */
function boolRow(id: string, devid: string, tag: string, left: number, top: number, width = 300): IExportDoneJson {
  const t = tagOf(devid, tag)
  return item('ah-status-badge', id, {
    left, top, width, height: 28,
    props: { label: t.label, texts: BOOL_TEXTS[tag] ?? '停止,运行,故障,维护,离线', state: 0 },
    binds: [bind(id, `${devid}.${tag}`, 'props.state.val')],
  })
}

/** 设备报警徽标（优先级 + 条数来自合成点位） */
function alarmBadge(id: string, devid: string, left: number, top: number, label: string): IExportDoneJson {
  return item('ah-alarm-badge', id, {
    left, top, width: 140, height: 32,
    props: { label, blink: true, prio: 0, count: 0 },
    binds: [bind(id, `${devid}.__prio`, 'props.prio.val'), bind(id, `${devid}.__alarms`, 'props.count.val')],
  })
}

/** 设备状态徽标（bool → state；texts 按语义） */
function statusBadge(id: string, devid: string, tag: string, left: number, top: number, width = 140): IExportDoneJson {
  const t = tagOf(devid, tag)
  return item('ah-status-badge', id, {
    left, top, width, height: 30,
    props: { label: t.label, texts: BOOL_TEXTS[tag] ?? '停止,运行,故障,维护,离线', state: 0 },
    binds: [bind(id, `${devid}.${tag}`, 'props.state.val')],
  })
}

/** 迷你趋势（采样 props.value，窗口 300s） */
function spark(id: string, devid: string, tag: string, left: number, top: number, o: { width?: number; height?: number; label?: string } = {}): IExportDoneJson {
  const t = tagOf(devid, tag)
  return item('ah-sparkline', id, {
    left, top, width: o.width ?? 380, height: o.height ?? 100,
    props: {
      label: o.label ?? `${t.label}趋势`, min: t.min, max: t.max,
      show_limits: Boolean(t.limits), ...(t.limits ?? {}), window: 300,
    },
    binds: [bind(id, `${devid}.${t.tag}`, 'props.value.val')],
  })
}

/** 区域卡片（L1）：区域聚合报警 + 双 KPI + 全局质量 */
function areaCard(o: { area: Area; left: number; top: number; target: string; title: string; kpi1: [string, string]; kpi2: [string, string]; total: number }): IExportDoneJson[] {
  const id = `ac-${o.area}`
  const t1 = tagOf(o.kpi1[0], o.kpi1[1])
  const t2 = tagOf(o.kpi2[0], o.kpi2[1])
  const card = item('ah-area-card', id, {
    left: o.left, top: o.top, width: 600, height: 280,
    props: {
      title: o.title, total: o.total, alarms: 0, prio: 0, quality: 0,
      kpi1_label: t1.label, kpi1_unit: t1.unit === '' ? '\u00a0' : t1.unit, kpi1_dec: t1.dec,
      kpi2_label: t2.label, kpi2_unit: t2.unit === '' ? '\u00a0' : t2.unit, kpi2_dec: t2.dec,
    },
    binds: [
      bind(id, `__area.${o.area}.alarm_count`, 'props.alarms.val'),
      bind(id, `__area.${o.area}.prio`, 'props.prio.val'),
      bind(id, '__sys.quality', 'props.quality.val'),
      bind(id, `${o.kpi1[0]}.${o.kpi1[1]}`, 'props.kpi1_value.val'),
      bind(id, `${o.kpi2[0]}.${o.kpi2[1]}`, 'props.kpi2_value.val'),
    ],
    events: [navEvent(id, o.target)],
  })
  const go = navBtn(`btn-${o.area}-go`, { text: '进入 →', left: o.left + 470, top: o.top + 194, width: 110, target: o.target, type: 'info' })
  return [card, go]
}

// ---- L1 全厂总览 ----
function buildL1(): ScreenDoc {
  const water = IOT_DEVICES.find((d) => d.devid === 'dev_wm1')!
  const power = IOT_DEVICES.find((d) => d.devid === 'dev_em1')!
  const gas = IOT_DEVICES.find((d) => d.devid === 'dev_gm1')!
  const env = IOT_DEVICES.find((d) => d.devid === 'dev_env1')!
  const json: IExportDoneJson[] = [
    ...header({
      title: '工业物联网演示站 · 全厂总览',
      subtitle: 'L1 总览 · 4 区域 / 10 设备 / 154 点 · Modbus + OPC UA 采集 · 历史 30 天',
    }),
    ...areaCard({ area: 'water', left: 32, top: 108, title: '水系统', total: 3, target: IOT_WATER, kpi1: [water.devid, 'flow_rate'], kpi2: [water.devid, 'pressure'] }),
    ...areaCard({ area: 'power', left: 648, top: 108, title: '配电系统', total: 3, target: IOT_POWER, kpi1: [power.devid, 'active_power'], kpi2: [power.devid, 'power_factor'] }),
    ...areaCard({ area: 'gas', left: 32, top: 364, title: '燃气系统', total: 2, target: IOT_GAS, kpi1: [gas.devid, 'flow_rate'], kpi2: [gas.devid, 'pressure'] }),
    ...areaCard({ area: 'env', left: 648, top: 364, title: '环境与辅助', total: 2, target: IOT_ENV, kpi1: [env.devid, 'temperature'], kpi2: [env.devid, 'co2'] }),
    // 历史趋势带（BI 通道 B 信封 → 浅色历史趋势件）：L1 也能看"过去 24h 负荷"
    item('ah-hist-trend', 'hist-plant-power', {
      left: 32, top: 620, width: 1216, height: 132,
      props: {
        title: '三相电表有功功率趋势（24h）', windowSecs: 86400, interval: 300, agg: 'avg', shape: 'series',
        series: JSON.stringify(['dev_em1', 'dev_em2', 'dev_em3'].map((d) => ({
          dev_id: d, tag: 'active_power', label: DEVICE_BY_ID[d].pos, unit: 'kW',
        }))),
      },
    }),
    txt('txt-legend', {
      text: '正常态为灰阶；饱和色仅表示异常与操作 · 区域卡报警数来自服务端限值判定（scripts/limit-alarm）',
      left: 32, top: 762, width: 900, height: 22, fontSize: 12, fill: HP.inkDim,
    }),
    navBtn('btn-bi', { text: '历史分析大屏 →', left: 1020, top: 756, width: 228, target: IOT_BI_STATION, type: 'info' }),
  ]
  return { name: '全厂总览（L1）', group: GROUP, ...canvasIot(HP.bgL1), json, eventList: [], eventFlow: [] }
}

// ---- L2 供水单元 ----
function buildWater(): ScreenDoc {
  const devs = IOT_DEVICES.filter((d) => d.type === 'water')
  const centers = [470, 800, 1130]
  const json: IExportDoneJson[] = [
    ...header({ title: '供水单元 · 3 台远传水表', subtitle: 'L2 单元 · 工艺链路：水池 → 泵 → 母管 → 三路支管（阀 + 水表）· Modbus 网关 unit 1', back: IOT_L1 }),
    item('ah-tank', 'tank-water', { left: 48, top: 150, scale: 2, props: { fill: HP.static } }),
    txt('txt-tank', { text: '水池', left: 48, top: 286, width: 100, height: 22, fill: HP.inkDim }),
    item('ah-pipe', 'pipe-tank-pump', { left: 160, top: 190, props: { fill: HP.static } }),
    item('ah-pump', 'pump-water', { left: 330, top: 150, scale: 1.6, props: { fill: HP.static } }),
    txt('txt-pump', { text: 'P-101 供水泵', left: 320, top: 262, width: 140, height: 22, fill: HP.inkDim }),
    item('ah-pipe', 'pipe-pump-main', { left: 450, top: 190, props: { fill: HP.static } }),
    // 母管
    item('ah-pipe', 'pipe-main-1', { left: 610, top: 190, props: { fill: HP.static } }),
    item('ah-pipe', 'pipe-main-2', { left: 770, top: 190, props: { fill: HP.static } }),
    item('ah-pipe', 'pipe-main-3', { left: 930, top: 190, props: { fill: HP.static } }),
    item('ah-pipe', 'pipe-main-4', { left: 1090, top: 190, props: { fill: HP.static } }),
  ]
  devs.forEach((d, i) => {
    const c = centers[i]
    const tag = i + 1
    json.push(
      item('ah-pipe', `pipe-branch-${tag}`, { left: c - 80, top: 260, angle: 90, props: { fill: HP.static } }),
      item('ah-gate-valve', `valve-${tag}`, { left: c - 38, top: 330, scale: 1.2, props: { fill: HP.static } }),
      item('ah-flow-meter', `meter-${tag}`, { left: c - 52, top: 390, scale: 1.6, props: { fill: HP.static } }),
      txt(`txt-pos-${tag}`, { text: `${d.pos} ${d.title}`, left: c - 210, top: 300, width: 190, height: 20, fill: HP.inkDim, fontSize: 12 }),
      valueBlock(`vb-flow-${tag}`, d.devid, 'flow_rate', { left: c - 100, top: 500 }),
      statusBadge(`sb-valve-${tag}`, d.devid, 'valve_status', c - 100, 616),
      alarmBadge(`ab-dev-${tag}`, d.devid, c - 100, 654, d.pos),
      navBtn(`btn-detail-${tag}`, { text: '详情 →', left: c + 50, top: 618, width: 86, target: `${faceplateSlug(d.devid)}?dev=${d.devid}`, type: 'info' }),
    )
  })
  // 左下：趋势 + 累计读数
  json.push(
    spark('sp-wm1', 'dev_wm1', 'flow_rate', 32, 330, { width: 288, height: 120, label: '1# 瞬时流量趋势' }),
    txt('txt-total-lbl', { text: '累计流量（表底）', left: 32, top: 462, width: 200, height: 20, fontSize: 12, fill: HP.inkDim }),
  )
  devs.forEach((d, i) => {
    json.push(valueBlock(`row-total-${i}`, d.devid, 'total_volume', { left: 32, top: 486 + i * 30, width: 288, height: 26, compact: true, label: `${i + 1}# 累计流量` }))
  })
  json.push(txt('txt-note', {
    text: '母管压力 / 瞬时流量为就地值块；限值带标 L/H/HH · 报警徽标＝服务端限值判定结果',
    left: 32, top: 760, width: 900, height: 20, fontSize: 12, fill: HP.inkDim,
  }))
  return { name: '供水单元（L2）', group: GROUP, ...canvasIot(HP.bgL2), json, eventList: [], eventFlow: [] }
}

// ---- L2 配电单元 ----
function buildPower(): ScreenDoc {
  const devs = IOT_DEVICES.filter((d) => d.type === 'power')
  const centers = [380, 720, 1060]
  const json: IExportDoneJson[] = [
    ...header({ title: '配电单元 · 3 台三相电表', subtitle: 'L2 单线图 · 进线 → 母排 → 三路馈线（断路器 + 电表）· OPC UA 采集', back: IOT_L1 }),
    // 进线 + 母排
    item('ah-pipe', 'bus-0', { left: 100, top: 180, props: { fill: HP.static } }),
    item('ah-pipe', 'bus-1', { left: 260, top: 180, props: { fill: HP.static } }),
    item('ah-pipe', 'bus-2', { left: 420, top: 180, props: { fill: HP.static } }),
    item('ah-pipe', 'bus-3', { left: 580, top: 180, props: { fill: HP.static } }),
    item('ah-pipe', 'bus-4', { left: 740, top: 180, props: { fill: HP.static } }),
    item('ah-pipe', 'bus-5', { left: 900, top: 180, props: { fill: HP.static } }),
    item('ah-pipe', 'bus-6', { left: 1060, top: 180, props: { fill: HP.static } }),
    txt('txt-bus', { text: '400V 母排', left: 100, top: 148, width: 160, height: 20, fontSize: 12, fill: HP.inkDim }),
    txt('txt-incoming', { text: '进线', left: 40, top: 182, width: 48, height: 20, fontSize: 12, fill: HP.inkDim }),
  ]
  devs.forEach((d, i) => {
    const c = centers[i]
    const tag = i + 1
    json.push(
      item('ah-pipe', `feed-${tag}`, { left: c - 80, top: 245, angle: 90, props: { fill: HP.static } }),
      item('ah-dis-switch', `brk-${tag}`, { left: c - 40, top: 318, scale: 1.3, props: { fill: HP.static } }),
      txt(`txt-pos-${tag}`, { text: `${d.pos} ${d.title}`, left: c - 175, top: 372, width: 260, height: 20, fontSize: 12, fill: HP.inkDim }),
      valueBlock(`vb-p-${tag}`, d.devid, 'active_power', { left: c - 175, top: 400, width: 170, height: 100 }),
      valueBlock(`vb-pf-${tag}`, d.devid, 'power_factor', { left: c + 5, top: 400, width: 160, height: 100 }),
      valueBlock(`vb-u-${tag}`, d.devid, 'ua', { left: c - 175, top: 510, width: 170, height: 100 }),
      valueBlock(`vb-thd-${tag}`, d.devid, 'thd_voltage', { left: c + 5, top: 510, width: 160, height: 100 }),
      statusBadge(`sb-brk-${tag}`, d.devid, 'breaker_status', c - 178, 620, 118),
      alarmBadge(`ab-dev-${tag}`, d.devid, c - 50, 620, d.pos),
      navBtn(`btn-detail-${tag}`, { text: '详情 →', left: c + 100, top: 618, width: 60, target: `${faceplateSlug(d.devid)}?dev=${d.devid}`, type: 'info' }),
    )
  })
  json.push(
    spark('sp-em1', 'dev_em1', 'active_power', 32, 660, { width: 400, height: 100, label: '1# 有功功率趋势' }),
    txt('txt-energy-lbl', { text: '正向有功电能（kWh）', left: 460, top: 668, width: 220, height: 20, fontSize: 12, fill: HP.inkDim }),
  )
  devs.forEach((d, i) => {
    json.push(valueBlock(`row-energy-${i}`, d.devid, 'energy_total', { left: 460, top: 684 + i * 26, width: 320, height: 26, compact: true, label: `${i + 1}# 有功电能` }))
  })
  json.push(txt('txt-note', {
    text: '单线图：母排粗实线、馈线断路器（分/合）、电表值块（P/PF/U/THD）· 过载与谐波越限由服务端判定',
    left: 460, top: 770, width: 790, height: 20, fontSize: 12, fill: HP.inkDim,
  }))
  return { name: '配电单元（L2）', group: GROUP, ...canvasIot(HP.bgL2), json, eventList: [], eventFlow: [] }
}

// ---- L2 燃气单元 ----
function buildGas(): ScreenDoc {
  const devs = IOT_DEVICES.filter((d) => d.type === 'gas')
  const centers = [520, 980]
  const json: IExportDoneJson[] = [
    ...header({ title: '燃气单元 · 2 台燃气表', subtitle: 'L2 单元 · 调压站：主管 → 安全放散 → 两路支管（阀 + 表 + 压力）', back: IOT_L1 }),
    item('ah-pipe', 'pipe-main-0', { left: 100, top: 190, props: { fill: HP.static } }),
    item('ah-pipe', 'pipe-main-1', { left: 260, top: 190, props: { fill: HP.static } }),
    item('ah-pipe', 'pipe-main-2', { left: 420, top: 190, props: { fill: HP.static } }),
    item('ah-pipe', 'pipe-main-3', { left: 580, top: 190, props: { fill: HP.static } }),
    item('ah-pipe', 'pipe-main-4', { left: 740, top: 190, props: { fill: HP.static } }),
    item('ah-pipe', 'pipe-main-5', { left: 900, top: 190, props: { fill: HP.static } }),
    item('ah-pipe', 'pipe-main-6', { left: 1060, top: 190, props: { fill: HP.static } }),
    item('ah-safety-valve', 'sv-reg', { left: 238, top: 140, scale: 1.2, props: { fill: HP.static } }),
    txt('txt-reg', { text: '调压 / 安全放散', left: 210, top: 108, width: 160, height: 20, fontSize: 12, fill: HP.inkDim }),
  ]
  devs.forEach((d, i) => {
    const c = centers[i]
    const tag = i + 1
    json.push(
      item('ah-pipe', `pipe-branch-${tag}`, { left: c - 80, top: 255, angle: 90, props: { fill: HP.static } }),
      item('ah-gate-valve', `valve-${tag}`, { left: c - 38, top: 320, scale: 1.2, props: { fill: HP.static } }),
      item('ah-flow-meter', `meter-${tag}`, { left: c - 45, top: 385, scale: 1.4, props: { fill: HP.static } }),
      txt(`txt-pos-${tag}`, { text: `${d.pos} ${d.title}`, left: c - 210, top: 300, width: 190, height: 20, fontSize: 12, fill: HP.inkDim }),
      valueBlock(`vb-flow-${tag}`, d.devid, 'flow_rate', { left: c - 210, top: 470, width: 200, height: 100 }),
      valueBlock(`vb-press-${tag}`, d.devid, 'pressure', { left: c + 10, top: 470, width: 200, height: 100 }),
      statusBadge(`sb-valve-${tag}`, d.devid, 'valve_status', c - 210, 586),
      statusBadge(`sb-leak-${tag}`, d.devid, 'leak_alarm', c - 60, 586),
      alarmBadge(`ab-dev-${tag}`, d.devid, c + 90, 586, d.pos),
      navBtn(`btn-detail-${tag}`, { text: '详情 →', left: c + 90, top: 626, width: 86, target: `${faceplateSlug(d.devid)}?dev=${d.devid}`, type: 'info' }),
      spark(`sp-${tag}`, d.devid, 'pressure', c - 210, 664, { width: 420, height: 96, label: '管道压力趋势' }),
    )
  })
  json.push(txt('txt-note', {
    text: '安全提示：泄漏/超压触发 P1 报警；实际站场应联锁关阀——演示仅检测报警，不做阀门联动',
    left: 32, top: 772, width: 1000, height: 20, fontSize: 12, fill: HP.inkDim,
  }))
  return { name: '燃气单元（L2）', group: GROUP, ...canvasIot(HP.bgL2), json, eventList: [], eventFlow: [] }
}

// ---- L2 环境与辅助 ----
function buildEnv(): ScreenDoc {
  const env = DEVICE_BY_ID['dev_env1']
  const pt = DEVICE_BY_ID['dev_pt1']
  const block = (devid: string, tags: string[], x0: number): IExportDoneJson[] => {
    const out: IExportDoneJson[] = []
    tags.forEach((t, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      out.push(valueBlock(`vb-${devid}-${t}`, devid, t, { left: x0 + col * 292, top: 146 + row * 108, width: 270, height: 100 }))
    })
    return out
  }
  const json: IExportDoneJson[] = [
    ...header({ title: '环境与辅助单元', subtitle: 'L2 单元 · 环境监测一体机 + 压力变送器 · OPC UA 采集', back: IOT_L1 }),
    txt('txt-env-title', { text: `${env.pos} ${env.title}`, left: 32, top: 108, width: 360, height: 26, fontSize: 16 }),
    txt('txt-pt-title', { text: `${pt.pos} ${pt.title}`, left: 648, top: 108, width: 360, height: 26, fontSize: 16 }),
    ...block('dev_env1', ['temperature', 'humidity', 'co2', 'pm25', 'noise', 'air_pressure'], 32),
    ...block('dev_pt1', ['pressure_1', 'pressure_2', 'pressure_3', 'level', 'flow', 'vibration'], 648),
    spark('sp-env', 'dev_env1', 'temperature', 32, 486, { width: 558, height: 110, label: '环境温度趋势' }),
    spark('sp-pt', 'dev_pt1', 'pressure_1', 648, 486, { width: 558, height: 110, label: '压力1 趋势' }),
    statusBadge('sb-env-fan', 'dev_env1', 'fan_status', 32, 612),
    statusBadge('sb-env-alarm', 'dev_env1', 'alarm', 186, 612),
    alarmBadge('ab-env', 'dev_env1', 340, 612, env.pos),
    navBtn('btn-env-detail', { text: '详情 →', left: 500, top: 610, width: 90, target: `${faceplateSlug('dev_env1')}?dev=dev_env1`, type: 'info' }),
    statusBadge('sb-pt-fault', 'dev_pt1', 'fault', 648, 612),
    statusBadge('sb-pt-valve', 'dev_pt1', 'valve_open', 802, 612),
    alarmBadge('ab-pt', 'dev_pt1', 956, 612, pt.pos),
    navBtn('btn-pt-detail', { text: '详情 →', left: 1116, top: 610, width: 90, target: `${faceplateSlug('dev_pt1')}?dev=dev_pt1`, type: 'info' }),
    txt('txt-note', {
      text: '环境量程与限值来自设备模型；PM/CO₂/噪声越限由服务端限值判定，通信质量徽标见右上角',
      left: 32, top: 760, width: 1000, height: 20, fontSize: 12, fill: HP.inkDim,
    }),
  ]
  return { name: '环境与辅助单元（L2）', group: GROUP, ...canvasIot(HP.bgL2), json, eventList: [], eventFlow: [] }
}

// ---- L3 设备面板（每台一张）----
function buildFaceplate(dev: DeviceMeta): ScreenDoc {
  const primary = tagOf(dev.devid, dev.primary)
  const backTarget = dev.area === 'water' ? IOT_WATER : dev.area === 'power' ? IOT_POWER : dev.area === 'gas' ? IOT_GAS : IOT_ENV
  const fpId = 'fp-main'
  // 设备状态源：水/气=阀位、电=断路器；变送器=fault 取反；环境机是纯传感器——没有"运行/停止"
  // 语义（风机是子设备），用静态"运行"避免把"风机停"误读成"设备停"。
  const statusTag = dev.type === 'env' ? '' : dev.type === 'pt' ? 'fault' : dev.type === 'power' ? 'breaker_status' : 'valve_status'

  const fpProps: Record<string, unknown> = {
    title: `${dev.pos} ${dev.title}`, dev: dev.devid, unit: primary.unit, precision: primary.dec,
    min: primary.min, max: primary.max, show_limits: Boolean(primary.limits),
    ...(primary.limits ?? {}), status: 1, quality: 0, prio: 0, pv_prio: 0, alarms: 0, window: 300,
  }
  const fpBinds: IDoneJsonBindList[] = [
    pbind(fpId, primary.tag, 'props.pv.val'),
    pbind(fpId, primary.tag, 'props.pv_prio.val'),
    pbind(fpId, '__prio', 'props.prio.val'),
    pbind(fpId, '__alarms', 'props.alarms.val'),
    bind(fpId, '__sys.quality', 'props.quality.val'),
  ]
  if (dev.type === 'pt') {
    // fault=true 显故障（2），false 显运行（1）——触发器把布尔映射成状态码
    fpBinds.push(pbind(fpId, 'fault', 'props.status.val', [
      trig(`${fpId}-fault-on`, '=', true, fpId, 2, 'props.status.val'),
      trig(`${fpId}-fault-off`, '=', false, fpId, 1, 'props.status.val'),
    ]))
  } else if (statusTag) {
    fpBinds.push(pbind(fpId, statusTag, 'props.status.val'))
  }

  const json: IExportDoneJson[] = [
    ...header({
      title: `${dev.pos} ${dev.title}`,
      subtitle: `L3 设备面板 · ${dev.devid} · ${dev.tags.length} 点 · 数据周期 2–3 s`,
      back: backTarget,
    }),
    // 设备选择器兜底：编辑保存会丢 meta.devs，选择器 JSON 是 ViewView 的退路（既有缺陷）
    txt('txt-sel', { text: '设备', left: 580, top: 90, width: 40, height: 24, fontSize: 12, fill: HP.inkDim }),
    {
      active: false, hide: false, lock: false, resize: true, rotate: true,
      id: 'sel-dev', title: '设备选择器', type: 'vue', tag: 'ah-dev-selector',
      binfo: { angle: 0, height: 34, left: 624, top: 86, width: 240 },
      common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
      events: [], ports: [],
      props: { devices: JSON.stringify([{ id: dev.devid, label: `${dev.pos} ${dev.title}` }]), value: dev.devid },
      binds: [bind('sel-dev', '@meta.dev', 'props.value.val')],
    } as IExportDoneJson,
    item('ah-dev-faceplate', fpId, {
      left: 32, top: 132, width: 520, height: 660,
      props: fpProps, binds: fpBinds,
    }),
    txt('txt-tbl-head', { text: '参数', left: 588, top: 116, width: 200, height: 20, fontSize: 11, fill: HP.inkDim }),
    txt('txt-tbl-val', { text: '值', left: 950, top: 116, width: 60, height: 20, fontSize: 11, fill: HP.inkDim }),
    txt('txt-tbl-unit', { text: '单位', left: 1035, top: 116, width: 60, height: 20, fontSize: 11, fill: HP.inkDim }),
    txt('txt-tbl-lim', { text: '限值', left: 1150, top: 116, width: 90, height: 20, fontSize: 11, fill: HP.inkDim }),
  ]

  // 参数表：数值行用紧凑值块（精度/限值摘要），布尔行用状态徽标
  let y = 144
  dev.tags.forEach((t: TagMeta) => {
    if (t.bool) {
      json.push(boolRow(`row-${t.tag}`, dev.devid, t.tag, 580, y, 640))
      y += ROW_PITCH_BOOL
    } else {
      json.push(tableRow(`row-${t.tag}`, dev.devid, t.tag, 580, y, 660))
      y += ROW_PITCH_NUMERIC
    }
  })
  // 右侧历史趋势（BI 通道 B 信封）：1h 历史；实时趋势在 faceplate 组件内（300s 环形缓冲）
  // 固定在底部带（参数表最长的一台是 20 点电表：17×24 + 3×28 = 492 → 144+492 = 636 < 644）
  const sparkTop = 690
  {
    json.push(item('ah-hist-trend', 'hist-main', {
      left: 580, top: sparkTop, width: 660, height: 150,
      props: {
        title: `${primary.label} · 1h 历史趋势`, windowSecs: 3600, interval: 60, agg: 'avg', shape: 'series',
        series: JSON.stringify([{ dev_id: dev.devid, tag: primary.tag, label: dev.pos, unit: primary.unit }]),
      },
    }))
  }

  return {
    name: `${dev.pos} ${dev.title}（L3）`,
    group: GROUP,
    devs: [{ id: dev.devid, label: `${dev.pos} ${dev.title}` }],
    ...canvasIot(HP.bgL3, CANVAS_L3.height),
    json, eventList: [], eventFlow: [],
  }
}

/** 10 张 L3 面板（每台设备限值不同，见文件头说明） */
export function buildIotFaceplates(): Record<string, ScreenDoc> {
  return Object.fromEntries(IOT_DEVICES.map((d) => [faceplateSlug(d.devid), buildFaceplate(d)]))
}

/** L1 + L2 四张单元画面 */
export function buildIotScreens(): {
  l1: ScreenDoc; water: ScreenDoc; power: ScreenDoc; gas: ScreenDoc; env: ScreenDoc
  faceplates: Record<string, ScreenDoc>
} {
  return {
    l1: buildL1(),
    water: buildWater(),
    power: buildPower(),
    gas: buildGas(),
    env: buildEnv(),
    faceplates: buildIotFaceplates(),
  }
}
