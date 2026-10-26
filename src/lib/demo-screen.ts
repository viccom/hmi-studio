/**
 * T14 水处理演示画面（长期 LAN 演示资产，slug 恒定、不入 e2e 清扫）：
 * A=取水泵房 water-demo-m3（10 自绘 svg：9 类图元全覆盖 + 8 文本），B=water-demo-m3-b 极简互跳页。
 * 纯函数、零随机——id 稳定兼作 E2E 锚点（[id^="ah-"] / [id^="text-vue-"]）；快照防漂移见伴生测试。
 *
 * 组态依据（types.d.ts + F 系实证）：
 * - 保存态 props 为**平面值**（⑤/Jr：导入时按注册表默认描述符归一化回 *.val——故平面键必须
 *   ⊆ 注册表键，多键导入即 i[r].val 抛错；缺键回落注册默认）。
 * - 阈值变色链（vP→Lc→Nl）：bind 直写 bind_attr 后逐条评估 triggers——rule{operator,value}
 *   命中即执行 changeAttr targetAttr/targetValue 点路径写入。泵 fill 直写 cpu 原值是无效色
 *   （同 tick 被触发覆盖，最终态收口两档绿/红）；两触发 >80 红 + <=80 绿 互斥收口。
 * - 二值链：alarm_active（"0"/"1" 串→parseCell 归一 0/1）用 '=' 串比较两档映射。
 * - 液位链（⑥/F18）：h 直写 props.h.val——use[h] 属性选择器枚举 → --ah-lvl → scaleY。
 * - 电机整件旋转：common_animations.val='rotate360' 只能组态直写（⑦ 注册不可预设）。
 * - nav-button：默认 click 事件模板随注册项实例化（⑦/F19①），target prop 驱动跳转；
 *   按钮文案旁置内置文本图元（F16：svg 内文本注入不可行）。
 */
import type {
  CompareOperator, IExportDoneJson, IExportJson, IDoneJsonBindList, IDoneJsonEventList,
} from 'maotu'
import type { ScreenDoc } from './screens'
import type { HmiSymbol } from '../symbols/types'
import { allSymbols } from '../symbols/registry'

export const DEMO_A = 'water-demo-m3'
export const DEMO_B = 'water-demo-m3-b'
export const DEMO_CATALOG = 'catalog-demo'

const sym = (id: string): HmiSymbol => {
  const s = allSymbols().find((x) => x.id === id)
  if (!s) throw new Error(`demo-screen: 未注册图元 ${id}`)
  return s
}

/** 画布骨架：800x600 深色（fixtures 种子同形） */
const canvas = (): Pick<IExportJson, 'canvasCfg' | 'gridCfg'> => ({
  canvasCfg: {
    width: 800, height: 600, scale: 1, color: '#141414', img: '',
    guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
  },
  gridCfg: { enabled: true, align: true, size: 10 },
})

/** 触发器：rule 命中 → changeAttr 点路径写入（vP 评估序：直写 bind_attr 在前，触发在后收口） */
function trig(id: string, operator: CompareOperator, value: unknown, targetId: string, targetValue: string | boolean, targetAttr = 'props.fill.val'): IDoneJsonBindList['triggers'][number] {
  return {
    id, rule: { operator, value }, action: 'changeAttr',
    change_attr: [{ id: `ca-${id}`, target_id: targetId, target_attr: targetAttr, target_value: targetValue }],
    custom_code: '',
  }
}

function bind(pelId: string, bindId: string, attr: string, triggers: IDoneJsonBindList['triggers'] = []): IDoneJsonBindList {
  return {
    id: `bd-${pelId}`, pel_id: pelId, bind_id: bindId, bind_name: bindId.split('.')[1] ?? bindId,
    bind_attr: attr, bind_mapping: [], triggers,
  }
}

/** 自绘图元实例（全类型：svg / custom-svg / vue——拖入建元实证 tag=注册项 id，类型随注册表）：
 * 几何 = 注册宽高 × scale；props 平面值（缺键回落注册默认，见文件头） */
function svgItem(symbolId: string, id: string, o: {
  left: number; top: number; scale?: number
  props?: Record<string, unknown>
  binds?: IDoneJsonBindList[]
  rotate360?: boolean
}): IExportDoneJson {
  const s = sym(symbolId)
  const k = o.scale ?? 1
  const flat = Object.fromEntries(Object.entries(s.props).map(([key, d]) => [key, d.val]))
  return {
    active: false, hide: false, lock: false, resize: true, rotate: true,
    id, title: s.title, type: s.type, tag: s.id,
    binfo: { angle: 0, width: Math.round((s.width ?? 64) * k), height: Math.round((s.height ?? 64) * k), left: o.left, top: o.top },
    common_animations: { val: o.rotate360 ? 'rotate360' : '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
    events: (s.events ?? []) as IDoneJsonEventList[],
    ports: s.ports ?? [],
    props: { ...flat, ...o.props },
    binds: o.binds ?? [],
  } as IExportDoneJson
}

/** 内置文本图元（F12）：标签（无 bind）与值牌（props.text.val 直写）共用 */
function textItem(id: string, o: {
  text: string; left: number; top: number; width: number; height?: number
  fill?: string; fontSize?: number; bindId?: string
}): IExportDoneJson {
  return {
    active: false, hide: false, lock: false, resize: true, rotate: true,
    id, title: '文字', type: 'vue', tag: 'text-vue',
    binfo: { angle: 0, height: o.height ?? 32, left: o.left, top: o.top, width: o.width },
    common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
    events: [], ports: [],
    props: { fill: o.fill ?? '#FFF700', fontFamily: '黑体', fontSize: o.fontSize ?? 20, text: o.text, vertical: false },
    binds: o.bindId ? [bind(id, o.bindId, 'props.text.val')] : [],
  } as IExportDoneJson
}

// ---- 稳定 id（E2E 锚点 + 快照基线） ----
const P1 = 'ah-pump-wdm3a-1'
const P2 = 'ah-pump-wdm3a-2'
const TANK = 'ah-tank-wdm3a-1'
const GAUGE = 'ah-level-gauge-wdm3a-1'
const GATE = 'ah-gate-valve-wdm3a-1'
const BFV = 'ah-butterfly-valve-wdm3a-1'
const FLOW = 'ah-flow-meter-wdm3a-1'
const MOTOR = 'ah-motor-wdm3a-1'
const DISSW = 'ah-dis-switch-wdm3a-1'
const NAV_A_ID = 'ah-nav-button-wdm3a-1'
const NAV_B_ID = 'ah-nav-button-wdm3b-1'

/** 泵阈值触发链：>80 红 / <=80 绿（互斥收口，G-M3 阈值变色判据的组态源） */
const pumpBinds = (pelId: string): IDoneJsonBindList[] => [bind(pelId, 'rsiot.cpu_percent', 'props.fill.val', [
  trig(`${pelId}-hot`, '>', 80, pelId, '#f5222d'),
  trig(`${pelId}-ok`, '<=', 80, pelId, '#52c41a'),
])]

/** 二值状态链：alarm_active 0/1 两档（'=' 串比较，parseCell 归一后 String(0)/String(1) 命中） */
const binaryBinds = (pelId: string, hotColor: string, coldColor: string): IDoneJsonBindList[] =>
  [bind(pelId, 'rsiot.alarm_active', 'props.fill.val', [
    trig(`${pelId}-on`, '=', 1, pelId, hotColor),
    trig(`${pelId}-off`, '=', 0, pelId, coldColor),
  ])]

/** 纯函数组态：A（取水泵房 18 图元）+ B（互跳页 3 图元）。无随机、无副作用——快照可冻结。 */
export function buildDemoScreen(): { a: ScreenDoc; b: ScreenDoc } {
  const a: ScreenDoc = {
    name: '取水泵房（M3 演示）', group: '水处理演示', ...canvas(),
    json: [
      // 顶栏：标题 + 双值牌（标签旁置——bind 直写会覆盖整段文本，F12）
      textItem('text-vue-wdm3a-title', { text: '取水泵房 · 水处理演示（M3）', left: 16, top: 8, width: 430, height: 34, fill: '#e6f7ff', fontSize: 24 }),
      textItem('text-vue-wdm3a-lbl-up', { text: '运行时长(s)', left: 452, top: 16, width: 108, height: 26, fill: '#8fa3b8', fontSize: 14 }),
      textItem('text-vue-wdm3a-val-up', { text: '—', left: 564, top: 12, width: 88, height: 32, fill: '#FFF700', fontSize: 18, bindId: 'rsiot.uptime_s' }),
      textItem('text-vue-wdm3a-lbl-cpu', { text: 'CPU(%)', left: 660, top: 16, width: 66, height: 26, fill: '#8fa3b8', fontSize: 14 }),
      textItem('text-vue-wdm3a-val-cpu', { text: '—', left: 730, top: 12, width: 56, height: 32, fill: '#FFF700', fontSize: 18, bindId: 'rsiot.cpu_percent' }),
      // 工艺主线：吸水罐 + 液位计 | 双泵纵列 | 双阀 | 流量计
      svgItem('ah-tank', TANK, { left: 60, top: 170, scale: 2, binds: [bind(TANK, 'rsiot.cpu_percent', 'props.h.val')] }),
      svgItem('ah-level-gauge', GAUGE, { left: 176, top: 178, scale: 1.75, binds: [bind(GAUGE, 'rsiot.cpu_percent', 'props.h.val')] }),
      svgItem('ah-pump', P1, { left: 300, top: 150, scale: 2, props: { animation: true }, binds: pumpBinds(P1) }),
      svgItem('ah-pump', P2, { left: 300, top: 330, scale: 2, props: { animation: false }, binds: pumpBinds(P2) }),
      svgItem('ah-gate-valve', GATE, { left: 460, top: 186, scale: 2 }), // 出口闸阀：常开绿（静态）
      svgItem('ah-butterfly-valve', BFV, { left: 460, top: 350, scale: 2, binds: binaryBinds(BFV, '#faad14', '#52c41a') }),
      svgItem('ah-flow-meter', FLOW, { left: 620, top: 220, scale: 1.75 }),
      // 底部：电机（整件旋转展示）+ 隔离开关（alarm 二值）+ 跳转按钮（闭环 → B）
      svgItem('ah-motor', MOTOR, { left: 80, top: 430, scale: 2.5, rotate360: true }),
      svgItem('ah-dis-switch', DISSW, { left: 470, top: 460, scale: 2, binds: binaryBinds(DISSW, '#8c8c8c', '#52c41a') }),
      svgItem('ah-nav-button', NAV_A_ID, { left: 630, top: 470, scale: 2.5, props: { target: DEMO_B } }),
      // 泵位标签 + 跳转标签（F16：文案一律旁置文本图元）
      textItem('text-vue-wdm3a-lbl-p1', { text: '1#泵 运行', left: 310, top: 282, width: 108, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      textItem('text-vue-wdm3a-lbl-p2', { text: '2#泵 备用', left: 310, top: 462, width: 108, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      textItem('text-vue-wdm3a-lbl-nav', { text: '工艺画面 B →', left: 622, top: 442, width: 136, height: 24, fill: '#8fa3b8', fontSize: 13 }),
    ],
    eventList: [], eventFlow: [],
  }
  const b: ScreenDoc = {
    name: '清水池 B（M3 互跳）', group: '水处理演示', ...canvas(),
    json: [
      textItem('text-vue-wdm3b-title', { text: '清水池画面 B（M3 互跳演示）', left: 16, top: 8, width: 420, height: 34, fill: '#e6f7ff', fontSize: 24 }),
      textItem('text-vue-wdm3b-val-up', { text: '—', left: 320, top: 260, width: 160, height: 40, fontSize: 22, bindId: 'rsiot.uptime_s' }),
      textItem('text-vue-wdm3b-lbl-back', { text: '← 返回取水泵房', left: 320, top: 330, width: 170, height: 24, fill: '#8fa3b8', fontSize: 14 }),
      svgItem('ah-nav-button', NAV_B_ID, { left: 340, top: 360, scale: 2.5, props: { target: DEMO_A } }),
    ],
    eventList: [], eventFlow: [],
  }
  return { a, b }
}

// ---- 图元陈列室（批 C）：21 类注册图元一页陈列（工艺/仪表/操作三分区），长期资产 ----
// 绑定表（≥4 活点 + ≥2 触发链）：
//   cpu_percent → 泵 fill（>80 红/<=80 绿触发链①）、罐 h 直写、压力表盘 value 直写
//   uptime_s    → 数显面板 value 直写
//   alarm_active→ 三色灯 red（=1 亮/=0 灭触发链②）、隔离开关 fill（二值链③）
const C = 'cat'
const cid = (key: string): string => `ah-${key}-${C}-1`

/** 陈列室触发链：布尔点位 → switch prop 两档互斥收口（三色灯 red 用） */
const boolBinds = (pelId: string, attr: string): IDoneJsonBindList[] => [bind(pelId, 'rsiot.alarm_active', `props.${attr}.val`, [
  trig(`${pelId}-on`, '=', 1, pelId, true, `props.${attr}.val`),
  trig(`${pelId}-off`, '=', 0, pelId, false, `props.${attr}.val`),
])]

/** 纯函数组态：图元陈列室（registry 全量覆盖判据的承载画面）。无随机、无副作用。
 * 画布 800×950（P2 三表与趋势节自 y596 起追加，出界/重叠判据由布局测试按 canvasCfg 推导）。 */
export function buildCatalogScreen(): ScreenDoc {
  const c: ScreenDoc = {
    name: '图元陈列室', group: '水处理演示',
    canvasCfg: {
      width: 800, height: 950, scale: 1, color: '#141414', img: '',
      guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
    },
    gridCfg: { enabled: true, align: true, size: 10 },
    json: [
      // 标题行 + 顶部活点值牌
      textItem(`text-vue-${C}-title`, { text: '图元陈列室 · HMI 图元全目录', left: 16, top: 8, width: 430, height: 34, fill: '#e6f7ff', fontSize: 24 }),
      textItem(`text-vue-${C}-lbl-up`, { text: '运行时长(s)', left: 452, top: 16, width: 108, height: 26, fill: '#8fa3b8', fontSize: 14 }),
      textItem(`text-vue-${C}-val-up`, { text: '—', left: 564, top: 12, width: 88, height: 32, fill: '#FFF700', fontSize: 18, bindId: 'rsiot.uptime_s' }),
      textItem(`text-vue-${C}-lbl-cpu`, { text: 'CPU(%)', left: 660, top: 16, width: 66, height: 26, fill: '#8fa3b8', fontSize: 14 }),
      textItem(`text-vue-${C}-val-cpu`, { text: '—', left: 730, top: 12, width: 56, height: 32, fill: '#FFF700', fontSize: 18, bindId: 'rsiot.cpu_percent' }),
      // 分区一：工艺设备（13 svg）
      textItem(`text-vue-${C}-sec1`, { text: '── 工艺设备 ──', left: 16, top: 44, width: 180, height: 22, fill: '#8fa3b8', fontSize: 14 }),
      // 第一行（y 66..150）：泵/闸阀/蝶阀/止回阀/球阀/安全阀/电磁阀
      svgItem('ah-pump', cid('pump'), { left: 24, top: 66, scale: 1.3, binds: pumpBinds(cid('pump')) }),
      svgItem('ah-gate-valve', cid('gate-valve'), { left: 134, top: 82, scale: 1.3 }),
      svgItem('ah-butterfly-valve', cid('butterfly-valve'), { left: 244, top: 74, scale: 1.3 }),
      svgItem('ah-check-valve', cid('check-valve'), { left: 354, top: 82, scale: 1.3 }),
      svgItem('ah-ball-valve', cid('ball-valve'), { left: 464, top: 70, scale: 1.3, props: { open: false } }),
      svgItem('ah-safety-valve', cid('safety-valve'), { left: 574, top: 74, scale: 1.3 }),
      svgItem('ah-solenoid-valve', cid('solenoid-valve'), { left: 684, top: 74, scale: 1.3 }),
      // 第二行（y 152..232）：罐/液位计/流量计/风机/搅拌器/电机
      svgItem('ah-tank', cid('tank'), { left: 24, top: 152, scale: 1.25, binds: [bind(cid('tank'), 'rsiot.cpu_percent', 'props.h.val')] }),
      svgItem('ah-level-gauge', cid('level-gauge'), { left: 100, top: 152, scale: 1.25 }),
      svgItem('ah-flow-meter', cid('flow-meter'), { left: 150, top: 158, scale: 1.2 }),
      svgItem('ah-fan', cid('fan'), { left: 240, top: 158, scale: 1.15, props: { animation: true } }),
      svgItem('ah-agitator', cid('agitator'), { left: 326, top: 158, scale: 1.15 }),
      svgItem('ah-motor', cid('motor'), { left: 398, top: 168, scale: 1.2, rotate360: true }),
      // 分区二：仪表（4：数显/压力表盘/温度计/三色灯）
      textItem(`text-vue-${C}-sec2`, { text: '── 仪表 ──', left: 16, top: 246, width: 140, height: 22, fill: '#8fa3b8', fontSize: 14 }),
      svgItem('ah-digital-display', cid('digital-display'), { left: 24, top: 300, scale: 1.3, binds: [bind(cid('digital-display'), 'rsiot.cpu_percent', 'props.value.val')] }),
      svgItem('ah-gauge-pressure', cid('gauge-pressure'), { left: 216, top: 272, scale: 1.4, binds: [bind(cid('gauge-pressure'), 'rsiot.cpu_percent', 'props.value.val')] }),
      svgItem('ah-thermometer', cid('thermometer'), { left: 432, top: 262, scale: 1.1 }),
      svgItem('ah-stack-light', cid('stack-light'), { left: 524, top: 262, scale: 1.3, binds: boolBinds(cid('stack-light'), 'red') }),
      // 分区三：操作（4：隔离开关/跳转按钮/操作按钮/选择开关）
      textItem(`text-vue-${C}-sec3`, { text: '── 操作 ──', left: 16, top: 438, width: 140, height: 22, fill: '#8fa3b8', fontSize: 14 }),
      svgItem('ah-dis-switch', cid('dis-switch'), { left: 24, top: 490, scale: 1.5, binds: binaryBinds(cid('dis-switch'), '#8c8c8c', '#52c41a') }),
      svgItem('ah-nav-button', cid('nav-button'), { left: 150, top: 498, scale: 1.4, props: { target: DEMO_A } }),
      svgItem('ah-push-button', cid('push-button'), { left: 240, top: 464, scale: 1.2 }),
      svgItem('ah-selector-switch', cid('selector-switch'), { left: 360, top: 456, scale: 1.3 }),
      // 分区四：三表与趋势（P2，自 y596 起——避让操作区隔离开关 y490-586）
      textItem(`text-vue-${C}-sec4`, { text: '── 三表与趋势（P2）──', left: 24, top: 600, width: 200, height: 22, fill: '#8fa3b8', fontSize: 14 }),
      // 趋势数据通道（机制展示位）：cpu_percent 绑 tick0 直写 → 环形缓冲 → 曲线（AhTrendChart 头注释）
      svgItem('ah-trend-chart', cid('trend-chart'), {
        left: 24, top: 624,
        props: { points: JSON.stringify([{ field: 'rsiot.cpu_percent', label: 'CPU', unit: '%', color: '#f5a623' }]) },
        binds: [bind(cid('trend-chart'), 'rsiot.cpu_percent', 'props.tick0.val')],
      }),
    ],
    eventList: [], eventFlow: [],
  }
  return c
}
