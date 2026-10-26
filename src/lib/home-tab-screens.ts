/**
 * W10 页签画面（家庭三表·同型双表一屏）：click → changeAttr(hide) 纯组态切换，零框架改动。
 *
 * maotu 机制实证（dist/maotu.es.js，2026-10-26）：
 * - changeAttr 是通用深路径 setter（Nl：target_attr 按 '.' 分割任意字段），预览经
 *   $setItemAttrByID<sign> → z → Nl(顶层列表) 生效；事件编辑器目标属性下拉原生含
 *   「隐藏(hide)/switch」——手工组态同款路线。
 * - 渲染层 hide=true 整元素 v-if，编辑/预览同路径。隐藏面板 binds 照常直写（vP 不判 hide），
 *   趋势缓冲后台持续攒点。
 * - **group 不可用于带数据面板**：Jr/G 只收顶层 binds、Nl 缺省不深查 children——组合内图元
 *   绑定收不到 SSE 数据。故本文件平铺逐元素 hide（组合仅适用于纯静态装饰）。
 * - changeAttr 也可写 props.type.val（内置按钮 text/info/primary 背景色）——激活态高亮随
 *   页签移动，纯组态。
 *
 * 布局：800x600 深色、20px 网格。顶栏（标题 + 双页签按钮 + 双导航按钮）+ 面板区
 * （20,100..780,580）。双面板**同位叠放**（页签语义即互斥显示，跨面板重叠是有意为之，
 * 与 home-screens.ts 概览屏的「两两不重叠」约定不同）；面板内部两两不重叠（伴生测试冻结）。
 */
import type { IExportDoneJson, IExportJson, IDoneJsonEventList } from 'maotu'
import type { ScreenDoc } from './screens'
import {
  canvas, textItem, svgItem, trendItem, bind, trig, switchChain, fillTriggers, balanceTriggers,
  panelBinds, HOME_GROUP,
} from './home-screens'

export const HOME_E_TABS = 'home-meter-power-tabs'
export const HOME_W_TABS = 'home-meter-water-tabs'
export const HOME_G_TABS = 'home-meter-gas-tabs'

/** 内置按钮图元（sys-button-vue）：原生 button，type 映射背景色（primary 蓝/info 灯灰）。
 *  events 挂 click——与 text-vue 同一 Md 编译路径（T9 seedNavScreens 实证 vue 型事件可用） */
function buttonItem(id: string, o: {
  text: string; left: number; top: number; width: number; height?: number
  type?: string; events?: IDoneJsonEventList[]
}): IExportDoneJson {
  return {
    active: false, hide: false, lock: false, resize: true, rotate: true,
    id, title: '按钮', type: 'vue', tag: 'sys-button-vue',
    binfo: { angle: 0, height: o.height ?? 36, left: o.left, top: o.top, width: o.width },
    common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
    events: o.events ?? [], ports: [],
    props: { text: o.text, type: o.type ?? 'info', round: true },
    binds: [],
  } as IExportDoneJson
}

/** 页签 click 事件：整组 show/hide（change_attr 数组一次收口）+ 双按钮激活态互换 */
function tabClickEvent(evId: string, o: {
  showIds: string[]; hideIds: string[]; selfBtn: string; otherBtn: string
}): IDoneJsonEventList {
  return {
    id: evId, type: 'click', action: 'changeAttr',
    change_attr: [
      ...o.showIds.map((tid) => ({ id: `ca-${evId}-s-${tid}`, target_id: tid, target_attr: 'hide', target_value: false })),
      ...o.hideIds.map((tid) => ({ id: `ca-${evId}-h-${tid}`, target_id: tid, target_attr: 'hide', target_value: true })),
      { id: `ca-${evId}-self`, target_id: o.selfBtn, target_attr: 'props.type.val', target_value: 'primary' },
      { id: `ca-${evId}-other`, target_id: o.otherBtn, target_attr: 'props.type.val', target_value: 'info' },
    ],
    custom_code: '', event_flow_ids: [], trigger_rule: {},
  }
}

/** 导航按钮（T9 实证 customCode 路线）：$mtEventCallBack('nav', ...) → 宿主 dispatcher */
function navButton(id: string, o: { text: string; target: string; left: number }): IExportDoneJson {
  return buttonItem(id, {
    text: o.text, left: o.left, top: 20, width: 90, height: 40,
    events: [{
      id: `ev-${id}`, type: 'click', action: 'customCode', change_attr: [],
      custom_code: `$mtEventCallBack('nav', $item_info.id, '${o.target}');`,
      event_flow_ids: [], trigger_rule: {},
    }],
  })
}

/** 面板 2 元素出厂即隐（页签语义：初始只显 1#） */
const hidden = (items: IExportDoneJson[]): IExportDoneJson[] =>
  items.map((it) => ({ ...it, hide: true }))

/** 面板区左上原点（绝对坐标），内部元素坐标全部落在 20..780 x 100..580 */
const PANEL = { x: 20, y: 100 }

/** 值牌行（标签 + 绑定值），y 为面板区内绝对纵坐标。
 *  polarity 仅 triggers 时有效：alarm = true→红（逆流/泄漏，报警即红色）；
 *  normal = true→绿（阀门开是正常态）——概览屏同款语义（home-screens.ts 值牌色） */
function valueRow(p: string, key: string, label: string, y: number, o: {
  dev?: string; tag?: string; triggers?: 'alarm' | 'normal'
}): IExportDoneJson[] {
  const valId = `text-vue-${p}-v-${key}`
  const trig = o.triggers === 'alarm' ? fillTriggers(valId, '#f5222d', '#52c41a')
    : o.triggers === 'normal' ? fillTriggers(valId, '#52c41a', '#f5222d')
    : undefined
  return [
    textItem(`text-vue-${p}-l-${key}`, { text: label, left: 380, top: y, width: 150, height: 28, fill: '#8fa3b8', fontSize: 14 }),
    textItem(valId, {
      text: '—', left: 540, top: y, width: 140, height: 32, fontSize: 18,
      ...(o.dev && o.tag
        ? { bindId: `${o.dev}.${o.tag}`, bindTriggers: trig }
        : {}),
    }),
  ]
}

/** 电表面板（dev = home-meter-e1/e2）：面板 + 脉冲灯 + 双曲线趋势 + 六行值牌。
 *  电压/电流不入值列——Lua 直发原始浮点会溢出换行，且面板图元已有两位小数显示 */
function powerPanel(dev: string, n: 1 | 2): IExportDoneJson[] {
  const p = `hpt${n}`
  const y = [140, 180, 220, 260, 300, 340] as const
  const rows = [
    ...valueRow(p, 'power', '有功(kW)', y[0], { dev, tag: 'power' }),
    ...valueRow(p, 'pf', '功率因数', y[1], { dev, tag: 'pf' }),
    ...valueRow(p, 'frequency', '频率(Hz)', y[2], { dev, tag: 'frequency' }),
    ...valueRow(p, 'energy', '总电能(kWh)', y[3], { dev, tag: 'energy' }),
    ...valueRow(p, 'today', '今日(kWh)', y[4], { dev, tag: 'energy_today' }),
    ...valueRow(p, 'status', '状态码', y[5], { dev, tag: 'status' }),
  ]
  return [
    textItem(`text-vue-${p}-devlbl`, { text: `${n}# 电表 ${dev}`, left: 20, top: PANEL.y, width: 360, height: 24, fill: '#8fa3b8', fontSize: 13 }),
    svgItem('ah-meter-panel', `ah-meter-panel-${p}`, { left: 20, top: 140, scale: 1.6, binds: panelBinds(`ah-meter-panel-${p}`, dev) }),
    svgItem('ah-stack-light', `ah-stack-light-${p}`, { left: 700, top: 140, scale: 1.0, binds: switchChain(`ah-stack-light-${p}`, 'red', `${dev}.pulse`) }),
    textItem(`text-vue-${p}-pulse-lbl`, { text: '脉冲指示', left: 680, top: 280, width: 100, height: 24, fill: '#8fa3b8', fontSize: 13 }),
    trendItem(`ah-trend-chart-${p}`, {
      left: 20, top: 400, scale: 1.2, yUnit: 'kW/A',
      curves: [
        { field: `${dev}.power`, label: `${n}#有功`, unit: 'kW', color: '#f5a623' },
        { field: `${dev}.current`, label: `${n}#电流`, unit: 'A', color: '#58a6ff' },
      ],
    }),
    ...rows,
  ]
}

/** 水表面板：水表盘 + 瞬时流量趋势 + 五行值牌（逆流/阀门布尔 → 文本色两档） */
function waterPanel(dev: string, n: 1 | 2): IExportDoneJson[] {
  const p = `hwt${n}`
  const y = [140, 180, 220, 260, 300] as const
  const rows = [
    ...valueRow(p, 'flow', '瞬时流量(m³/h)', y[0], { dev, tag: 'flow_instant' }),
    ...valueRow(p, 'total', '累计(m³)', y[1], { dev, tag: 'flow_total' }),
    ...valueRow(p, 'battery', '电池(V)', y[2], { dev, tag: 'battery' }),
    ...valueRow(p, 'valve', '阀门', y[3], { dev, tag: 'valve', triggers: 'normal' }),
    ...valueRow(p, 'reverse', '逆流标志', y[4], { dev, tag: 'reverse_flag', triggers: 'alarm' }),
  ]
  return [
    textItem(`text-vue-${p}-devlbl`, { text: `${n}# 水表 ${dev}`, left: 20, top: PANEL.y, width: 360, height: 24, fill: '#8fa3b8', fontSize: 13 }),
    svgItem('ah-water-meter', `ah-water-meter-${p}`, {
      left: 20, top: 140, scale: 1.6,
      binds: [
        bind(`ah-water-meter-${p}`, `${dev}.flow_total`, 'props.total.val'),
        bind(`ah-water-meter-${p}`, `${dev}.flow_instant`, 'props.flow.val'),
        ...switchChain(`ah-water-meter-${p}`, 'reverse', `${dev}.reverse_flag`),
      ],
    }),
    trendItem(`ah-trend-chart-${p}`, {
      left: 20, top: 400, scale: 1.2, yUnit: 'm³/h',
      curves: [{ field: `${dev}.flow_instant`, label: `${n}#瞬时流量`, unit: 'm³/h', color: '#58a6ff' }],
    }),
    ...rows,
  ]
}

/** 燃气面板：燃气表盘 + 瞬时气量趋势 + 六行值牌（余额预警/阀门/泄漏）+ 泄漏三色灯 */
function gasPanel(dev: string, n: 1 | 2): IExportDoneJson[] {
  const p = `hgt${n}`
  const y = [140, 180, 220, 260, 300, 340] as const
  const balId = `text-vue-${p}-v-balance`
  const rows = [
    ...valueRow(p, 'flow', '瞬时气量(m³/h)', y[0], { dev, tag: 'gas_instant' }),
    ...valueRow(p, 'total', '累计(m³)', y[1], { dev, tag: 'gas_total' }),
    [textItem(`text-vue-${p}-l-balance`, { text: '余额(元)', left: 380, top: y[2], width: 150, height: 28, fill: '#8fa3b8', fontSize: 14 }),
     textItem(balId, { text: '—', left: 540, top: y[2], width: 140, height: 32, fontSize: 18, bindId: `${dev}.balance`, bindTriggers: balanceTriggers(balId) })],
    ...valueRow(p, 'battery', '电池(V)', y[3], { dev, tag: 'battery' }),
    ...valueRow(p, 'valve', '阀门', y[4], { dev, tag: 'valve', triggers: 'normal' }),
    ...valueRow(p, 'leak', '泄漏', y[5], { dev, tag: 'leak_alarm', triggers: 'alarm' }),
  ].flat()
  return [
    textItem(`text-vue-${p}-devlbl`, { text: `${n}# 燃气表 ${dev}`, left: 20, top: PANEL.y, width: 360, height: 24, fill: '#8fa3b8', fontSize: 13 }),
    svgItem('ah-gas-meter', `ah-gas-meter-${p}`, {
      left: 20, top: 140, scale: 1.6,
      binds: [
        bind(`ah-gas-meter-${p}`, `${dev}.gas_total`, 'props.total.val'),
        bind(`ah-gas-meter-${p}`, `${dev}.balance`, 'props.balance.val'),
        ...switchChain(`ah-gas-meter-${p}`, 'valve', `${dev}.valve`),
        ...switchChain(`ah-gas-meter-${p}`, 'leak', `${dev}.leak_alarm`),
      ],
    }),
    svgItem('ah-stack-light', `ah-stack-light-${p}`, { left: 700, top: 140, scale: 1.0, binds: switchChain(`ah-stack-light-${p}`, 'red', `${dev}.leak_alarm`) }),
    textItem(`text-vue-${p}-leak-lbl`, { text: '泄漏报警', left: 680, top: 280, width: 100, height: 24, fill: '#8fa3b8', fontSize: 13 }),
    trendItem(`ah-trend-chart-${p}`, {
      left: 20, top: 400, scale: 1.2, yUnit: 'm³/h',
      curves: [{ field: `${dev}.gas_instant`, label: `${n}#瞬时气量`, unit: 'm³/h', color: '#e6b32a' }],
    }),
    ...rows,
  ]
}

/** 页签画面组装：顶栏（标题/双页签/双导航）+ 双面板（2# 出厂即隐）+ 页签 click 事件互斥收口 */
function tabScreen(o: {
  slug: string; name: string; title: string
  panel: (dev: string, n: 1 | 2) => IExportDoneJson[]
  dev1: string; dev2: string
  navs: Array<{ text: string; target: string }>
}): ScreenDoc {
  const p1 = o.panel(o.dev1, 1)
  const p2 = hidden(o.panel(o.dev2, 2))
  const showIds = p1.map((it) => it.id)
  const hideIds = p2.map((it) => it.id)
  const btn1 = 'tab-btn-1'
  const btn2 = 'tab-btn-2'
  const ev1 = tabClickEvent(`ev-tab-btn-1`, { showIds, hideIds, selfBtn: btn1, otherBtn: btn2 })
  const ev2 = tabClickEvent(`ev-tab-btn-2`, { showIds: hideIds, hideIds: showIds, selfBtn: btn2, otherBtn: btn1 })
  const json = [
    textItem('text-vue-tabs-title', { text: o.title, left: 20, top: 20, width: 260, height: 36, fill: '#e6f7ff', fontSize: 24 }),
    buttonItem(btn1, { text: '1# 表', left: 300, top: 20, width: 110, height: 40, type: 'primary', events: [ev1] }),
    buttonItem(btn2, { text: '2# 表', left: 420, top: 20, width: 110, height: 40, type: 'info', events: [ev2] }),
    navButton('tab-nav-1', { text: o.navs[0].text, target: o.navs[0].target, left: 600 }),
    navButton('tab-nav-2', { text: o.navs[1].text, target: o.navs[1].target, left: 700 }),
    ...p1,
    ...p2,
  ]
  return { name: o.name, group: HOME_GROUP, ...canvas(), json, eventList: [], eventFlow: [] }
}

/**
 * 纯函数组态：家庭三表页签三屏（slug 恒定 home-meter-*-tabs，长期资产）。
 * 无随机、无副作用——快照可冻结；面板元素 id 带 hpt/hwt/hgt 前缀兼作 E2E 锚点。
 */
export function buildHomeTabScreens(): { power: ScreenDoc; water: ScreenDoc; gas: ScreenDoc } {
  const power = tabScreen({
    slug: HOME_E_TABS, name: '家庭用电·页签', title: '家庭用电·页签',
    panel: powerPanel, dev1: 'home-meter-e1', dev2: 'home-meter-e2',
    navs: [{ text: '用水页签', target: HOME_W_TABS }, { text: '燃气页签', target: HOME_G_TABS }],
  })
  const water = tabScreen({
    slug: HOME_W_TABS, name: '家庭用水·页签', title: '家庭用水·页签',
    panel: waterPanel, dev1: 'home-meter-w1', dev2: 'home-meter-w2',
    navs: [{ text: '用电页签', target: HOME_E_TABS }, { text: '燃气页签', target: HOME_G_TABS }],
  })
  const gas = tabScreen({
    slug: HOME_G_TABS, name: '家庭燃气·页签', title: '家庭燃气·页签',
    panel: gasPanel, dev1: 'home-meter-g1', dev2: 'home-meter-g2',
    navs: [{ text: '用电页签', target: HOME_E_TABS }, { text: '用水页签', target: HOME_W_TABS }],
  })
  return { power, water, gas }
}
