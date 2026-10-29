/**
 * P3 家庭三表演示画面（长期 LAN 演示资产，slug 恒定、不入 e2e 清扫）：
 * 电=home-meter-power / 水=home-meter-water / 燃气=home-meter-gas，group=家庭三表演示。
 * 纯函数、零随机——id 稳定兼作 E2E 锚点（[id^="ah-"] / [id^="text-vue-"]）；快照防漂移见伴生测试。
 *
 * 组态依据（demo-screen.ts 同款契约 + P2 实证）：
 * - 数据面（真实活数据，周期 2s）：home-meter-e1/e2（voltage/current/power/pf/frequency/
 *   energy/energy_today/pulse/status）、home-meter-w1/w2（flow_total/flow_instant/reverse_flag/
 *   battery/valve/status）、home-meter-g1/g2（gas_total/gas_instant/balance/battery/valve/
 *   leak_alarm/status）。2026-10-25 SSE 实测：布尔点位 JSON "true"/"false"（parseCell → true/false）。
 * - **触发器布尔语义（bundle Lc 实证）**：'=' 走 String(t)==String(s)——home-meter 布尔经
 *   parseCell 为 true/false，规则值必须用布尔原样（1/0 不命中；catalog 的 alarm_active 是
 *   "0"/"1" 串才用 1/0）。'<'/>=' 走 Number 比较——balance 余额预警链 <20 橙 />=20 白。
 * - 趋势（AhTrendChart）：bind 直写 tick0/tick1（bind_attr=props.tickN.val）→ 环形缓冲；
 *   points 是 **textArea JSON 串**（曲线元数据，field 与对应 bind_id 填同值）。曲线上无换算
 *   功能——电屏第 2 曲线直接绑 current（A），与 power（kW）同轴混排，图例标注单位。
 * - 布局：800x600 深色，信息分层（顶部标题带/主区读数+趋势/底部导航+状态），坐标 20px 网格
 *   （gridCfg.size=20，布局测试冻结 %20===0），图元两两不重叠（伴生测试冻结）。
 */
import type {
  CompareOperator, IExportDoneJson, IExportJson, IDoneJsonBindList, IDoneJsonEventList,
} from 'maotu'
import type { ScreenDoc } from '../lib/screens'
import type { HmiSymbol } from '../symbols/types'
import { allSymbols } from '../symbols/registry'

export const HOME_E = 'home-meter-power'
export const HOME_W = 'home-meter-water'
export const HOME_G = 'home-meter-gas'
export const HOME_GROUP = '家庭三表演示'

const sym = (id: string): HmiSymbol => {
  const s = allSymbols().find((x) => x.id === id)
  if (!s) throw new Error(`home-screens: 未注册图元 ${id}`)
  return s
}

/** 画布骨架：800x600 深色、20px 吸附网格（fixtures 种子同形，size=20 对齐组态网格约定）
 *  ——W10 起导出供 home-tab-screens.ts（页签画面）复用同一骨架 */
export const canvas = (): Pick<IExportJson, 'canvasCfg' | 'gridCfg'> => ({
  canvasCfg: {
    width: 800, height: 600, scale: 1, color: '#141414', img: '',
    guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
  },
  gridCfg: { enabled: true, align: true, size: 20 },
})

/** 触发器：rule 命中 → changeAttr 点路径写入（vP 评估序：直写 bind_attr 在前，触发在后收口） */
export function trig(id: string, operator: CompareOperator, value: unknown, targetId: string, targetValue: string | boolean, targetAttr = 'props.fill.val'): IDoneJsonBindList['triggers'][number] {
  return {
    id, rule: { operator, value }, action: 'changeAttr',
    change_attr: [{ id: `ca-${id}`, target_id: targetId, target_attr: targetAttr, target_value: targetValue }],
    custom_code: '',
  }
}

export function bind(pelId: string, bindId: string, attr: string, triggers: IDoneJsonBindList['triggers'] = []): IDoneJsonBindList {
  return {
    id: `bd-${pelId}-${attr.split('.')[1]}`, pel_id: pelId, bind_id: bindId,
    bind_name: bindId.split('.')[1] ?? bindId,
    bind_attr: attr, bind_mapping: [], triggers,
  }
}

/** 布尔开关链（switch prop 两档互斥收口）：SSE 布尔 parseCell 后为 true/false，
 * Lc '=' 串比较——规则值用布尔原样（实证见文件头，勿改 1/0） */
export const switchChain = (pelId: string, attr: string, bindId: string): IDoneJsonBindList[] =>
  [bind(pelId, bindId, `props.${attr}.val`, [
    trig(`${pelId}-${attr}-on`, '=', true, pelId, true, `props.${attr}.val`),
    trig(`${pelId}-${attr}-off`, '=', false, pelId, false, `props.${attr}.val`),
  ])]

/** 文本色两档触发（布尔点位 → 值牌 fill 变色）：返回 triggers，由 textItem 挂 props.text.val 直写 bind */
export const fillTriggers = (pelId: string, hot: string, cold: string): IDoneJsonBindList['triggers'] => [
  trig(`${pelId}-fill-on`, '=', true, pelId, hot),
  trig(`${pelId}-fill-off`, '=', false, pelId, cold),
]

/** 余额预警触发（数值点位 → fill 变色）：<20 橙预警 / >=20 常态白（Number 比较通道） */
export const balanceTriggers = (pelId: string): IDoneJsonBindList['triggers'] => [
  trig(`${pelId}-bal-low`, '<', 20, pelId, '#faad14'),
  trig(`${pelId}-bal-ok`, '>=', 20, pelId, '#FFF700'),
]

/** 自绘图元实例（几何 = 注册宽高 × scale；props 平面值，缺键回落注册默认——demo 同款） */
export function svgItem(symbolId: string, id: string, o: {
  left: number; top: number; scale?: number
  props?: Record<string, unknown>
  binds?: IDoneJsonBindList[]
}): IExportDoneJson {
  const s = sym(symbolId)
  const k = o.scale ?? 1
  const flat = Object.fromEntries(Object.entries(s.props).map(([key, d]) => [key, d.val]))
  return {
    active: false, hide: false, lock: false, resize: true, rotate: true,
    id, title: s.title, type: s.type, tag: s.id,
    binfo: { angle: 0, width: Math.round((s.width ?? 64) * k), height: Math.round((s.height ?? 64) * k), left: o.left, top: o.top },
    common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
    events: (s.events ?? []) as IDoneJsonEventList[],
    ports: s.ports ?? [],
    props: { ...flat, ...o.props },
    binds: o.binds ?? [],
  } as IExportDoneJson
}

/** 内置文本图元（F12）：标签（无 bind）与值牌（props.text.val 直写）共用 */
export function textItem(id: string, o: {
  text: string; left: number; top: number; width: number; height?: number
  fill?: string; fontSize?: number; bindId?: string; bindTriggers?: IDoneJsonBindList['triggers']
}): IExportDoneJson {
  return {
    active: false, hide: false, lock: false, resize: true, rotate: true,
    id, title: '文字', type: 'vue', tag: 'text-vue',
    binfo: { angle: 0, height: o.height ?? 32, left: o.left, top: o.top, width: o.width },
    common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
    events: [], ports: [],
    props: { fill: o.fill ?? '#FFF700', fontFamily: '黑体', fontSize: o.fontSize ?? 20, text: o.text, vertical: false },
    binds: o.bindId ? [bind(id, o.bindId, 'props.text.val', o.bindTriggers ?? [])] : [],
  } as IExportDoneJson
}

// ---- 稳定 id（E2E 锚点 + 快照基线）：前缀 hm-p/w/g ----
const P_E1 = 'ah-meter-panel-hmp-1'
const P_E2 = 'ah-meter-panel-hmp-2'
const P_GAUGE = 'ah-power-gauge-hmp-1'
const P_TREND = 'ah-trend-chart-hmp-1'
const P_LIGHT = 'ah-stack-light-hmp-1'
const W_M1 = 'ah-water-meter-hmw-1'
const W_M2 = 'ah-water-meter-hmw-2'
const W_TREND = 'ah-trend-chart-hmw-1'
const G_M1 = 'ah-gas-meter-hmg-1'
const G_M2 = 'ah-gas-meter-hmg-2'
const G_TREND = 'ah-trend-chart-hmg-1'
const G_LIGHT = 'ah-stack-light-hmg-1'

/** 电表面板全套绑定：v/i/p/pf/freq/status 六直写 + pulse 布尔开关链 */
export const panelBinds = (pelId: string, dev: string): IDoneJsonBindList[] => [
  bind(pelId, `${dev}.voltage`, 'props.v.val'),
  bind(pelId, `${dev}.current`, 'props.i.val'),
  bind(pelId, `${dev}.power`, 'props.p.val'),
  bind(pelId, `${dev}.pf`, 'props.pf.val'),
  bind(pelId, `${dev}.frequency`, 'props.freq.val'),
  bind(pelId, `${dev}.status`, 'props.status.val'),
  ...switchChain(pelId, 'pulse', `${dev}.pulse`),
]

/** 趋势图实例：points JSON 串（field 与 bind_id 同值）+ tick0..2 直写通道 */
export function trendItem(id: string, o: {
  left: number; top: number; scale?: number
  curves: Array<{ field: string; label: string; unit: string; color: string }>
  yUnit: string
}): IExportDoneJson {
  return svgItem('ah-trend-chart', id, {
    left: o.left, top: o.top, scale: o.scale,
    props: { points: JSON.stringify(o.curves), windowSecs: 600, yUnit: o.yUnit },
    binds: o.curves.map((c, k) => bind(id, c.field, `props.tick${k}.val`)),
  })
}

/**
 * 纯函数组态：家庭三表三屏。无随机、无副作用——快照可冻结。
 * 布局（20px 网格，防重叠判据见伴生测试）：
 * - 电：顶部标题+总/今日电能值牌｜左列双电表面板｜中区功率盘+趋势（power/current 双线）｜
 *   右栏脉冲三色灯+状态码+导航
 * - 水：顶部标题+双表累计值牌｜双水表盘并排｜左下趋势（双表瞬时流量线）｜右下逆流/阀门值牌+导航
 * - 气：顶部标题+累计/余额值牌｜双燃气表盘并排｜右栏泄漏三色灯｜左下趋势（双表瞬时气量线）+
 *   余额/累计值牌+导航｜安全提示条
 */
export function buildHomeScreens(): { power: ScreenDoc; water: ScreenDoc; gas: ScreenDoc } {
  const power: ScreenDoc = {
    name: '家庭用电监控', group: HOME_GROUP, ...canvas(),
    json: [
      // 顶部标题带：标题 + 总电能/今日电能值牌
      textItem('text-vue-hmp-title', { text: '家庭用电监控', left: 20, top: 20, width: 260, height: 36, fill: '#e6f7ff', fontSize: 24 }),
      textItem('text-vue-hmp-lbl-energy', { text: '总电能(kWh)', left: 320, top: 20, width: 110, height: 28, fill: '#8fa3b8', fontSize: 14 }),
      textItem('text-vue-hmp-val-energy', { text: '—', left: 440, top: 20, width: 150, height: 36, fontSize: 20, bindId: 'home-meter-e1.energy' }),
      textItem('text-vue-hmp-lbl-today', { text: '今日(kWh)', left: 600, top: 20, width: 90, height: 28, fill: '#8fa3b8', fontSize: 14 }),
      textItem('text-vue-hmp-val-today', { text: '—', left: 700, top: 20, width: 90, height: 36, fontSize: 20, bindId: 'home-meter-e1.energy_today' }),
      // 左列：1#/2# 电表面板（五行数显 + 脉冲灯 + status 告警）
      textItem('text-vue-hmp-lbl-m1', { text: '1# 电表 home-meter-e1', left: 20, top: 80, width: 220, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      svgItem('ah-meter-panel', P_E1, { left: 20, top: 120, scale: 1.4, binds: panelBinds(P_E1, 'home-meter-e1') }),
      textItem('text-vue-hmp-lbl-m2', { text: '2# 电表 home-meter-e2', left: 20, top: 340, width: 220, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      svgItem('ah-meter-panel', P_E2, { left: 20, top: 380, scale: 1.4, binds: panelBinds(P_E2, 'home-meter-e2') }),
      // 中区：功率盘（e1）+ 趋势（power kW 金 / current A 蓝，tick 直写）
      textItem('text-vue-hmp-lbl-gauge', { text: '1# 功率盘', left: 320, top: 80, width: 150, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      svgItem('ah-power-gauge', P_GAUGE, {
        left: 320, top: 120, scale: 1.3,
        binds: [bind(P_GAUGE, 'home-meter-e1.power', 'props.value.val'), ...switchChain(P_GAUGE, 'pulse', 'home-meter-e1.pulse')],
      }),
      trendItem(P_TREND, {
        left: 320, top: 340, scale: 1.6, yUnit: 'kW/A',
        curves: [
          { field: 'home-meter-e1.power', label: '1#有功', unit: 'kW', color: '#f5a623' },
          { field: 'home-meter-e1.current', label: '1#电流', unit: 'A', color: '#58a6ff' },
        ],
      }),
      // 右栏：脉冲三色灯（pulse=用电指示）+ 状态码值牌 + 导航
      svgItem('ah-stack-light', P_LIGHT, { left: 700, top: 120, scale: 1.3, binds: switchChain(P_LIGHT, 'red', 'home-meter-e1.pulse') }),
      textItem('text-vue-hmp-lbl-pulse', { text: '脉冲指示', left: 680, top: 280, width: 110, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      textItem('text-vue-hmp-lbl-status', { text: '状态码', left: 680, top: 340, width: 100, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      textItem('text-vue-hmp-val-status', { text: '—', left: 680, top: 380, width: 100, height: 36, fontSize: 20, bindId: 'home-meter-e1.status' }),
      svgItem('ah-nav-button', 'ah-nav-button-hmp-w', { left: 680, top: 440, scale: 1.2, props: { target: HOME_W } }),
      textItem('text-vue-hmp-lbl-nav-w', { text: '← 用水画面', left: 680, top: 480, width: 110, height: 22, fill: '#8fa3b8', fontSize: 13 }),
      svgItem('ah-nav-button', 'ah-nav-button-hmp-g', { left: 680, top: 520, scale: 1.2, props: { target: HOME_G } }),
      textItem('text-vue-hmp-lbl-nav-g', { text: '→ 燃气画面', left: 680, top: 560, width: 110, height: 22, fill: '#8fa3b8', fontSize: 13 }),
    ],
    eventList: [], eventFlow: [],
  }

  const water: ScreenDoc = {
    name: '家庭用水监控', group: HOME_GROUP, ...canvas(),
    json: [
      // 顶部标题带：标题 + 双表累计流量值牌
      textItem('text-vue-hmw-title', { text: '家庭用水监控', left: 20, top: 20, width: 260, height: 36, fill: '#e6f7ff', fontSize: 24 }),
      textItem('text-vue-hmw-lbl-t1', { text: '1#累计(m³)', left: 320, top: 20, width: 120, height: 28, fill: '#8fa3b8', fontSize: 14 }),
      textItem('text-vue-hmw-val-t1', { text: '—', left: 440, top: 20, width: 140, height: 36, fontSize: 18, bindId: 'home-meter-w1.flow_total' }),
      textItem('text-vue-hmw-lbl-t2', { text: '2#累计(m³)', left: 580, top: 20, width: 110, height: 28, fill: '#8fa3b8', fontSize: 14 }),
      textItem('text-vue-hmw-val-t2', { text: '—', left: 700, top: 20, width: 90, height: 36, fontSize: 18, bindId: 'home-meter-w2.flow_total' }),
      // 中区：双水表盘并排（字轮累计 + 瞬时小盘 + 逆流标记）
      textItem('text-vue-hmw-lbl-m1', { text: '1# 水表 home-meter-w1', left: 20, top: 80, width: 220, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      svgItem('ah-water-meter', W_M1, {
        left: 20, top: 120, scale: 1.6,
        binds: [
          bind(W_M1, 'home-meter-w1.flow_total', 'props.total.val'),
          bind(W_M1, 'home-meter-w1.flow_instant', 'props.flow.val'),
          ...switchChain(W_M1, 'reverse', 'home-meter-w1.reverse_flag'),
        ],
      }),
      textItem('text-vue-hmw-lbl-m2', { text: '2# 水表 home-meter-w2', left: 360, top: 80, width: 220, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      svgItem('ah-water-meter', W_M2, {
        left: 360, top: 120, scale: 1.6,
        binds: [
          bind(W_M2, 'home-meter-w2.flow_total', 'props.total.val'),
          bind(W_M2, 'home-meter-w2.flow_instant', 'props.flow.val'),
          ...switchChain(W_M2, 'reverse', 'home-meter-w2.reverse_flag'),
        ],
      }),
      // 右侧栏：双表电池电压值牌（维护点，补衡右上网格空档）
      textItem('text-vue-hmw-lbl-bat1', { text: '1# 电池(V)', left: 660, top: 120, width: 130, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      textItem('text-vue-hmw-val-bat1', { text: '—', left: 660, top: 160, width: 130, height: 32, fontSize: 18, bindId: 'home-meter-w1.battery' }),
      textItem('text-vue-hmw-lbl-bat2', { text: '2# 电池(V)', left: 660, top: 220, width: 130, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      textItem('text-vue-hmw-val-bat2', { text: '—', left: 660, top: 260, width: 130, height: 32, fontSize: 18, bindId: 'home-meter-w2.battery' }),
      // 左下：趋势（双表瞬时流量 m³/h，蓝/青双线）
      trendItem(W_TREND, {
        left: 20, top: 380, scale: 1.4, yUnit: 'm³/h',
        curves: [
          { field: 'home-meter-w1.flow_instant', label: '1#瞬时流量', unit: 'm³/h', color: '#58a6ff' },
          { field: 'home-meter-w2.flow_instant', label: '2#瞬时流量', unit: 'm³/h', color: '#22d3ee' },
        ],
      }),
      // 右下：逆流/阀门状态值牌（布尔 → 文本色两档收口）+ 导航
      textItem('text-vue-hmw-lbl-rev1', { text: '1# 逆流标志', left: 360, top: 380, width: 120, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      textItem('text-vue-hmw-val-rev1', { text: '—', left: 480, top: 380, width: 110, height: 32, fontSize: 18, bindId: 'home-meter-w1.reverse_flag', bindTriggers: fillTriggers('text-vue-hmw-val-rev1', '#f5222d', '#52c41a') }),
      textItem('text-vue-hmw-lbl-rev2', { text: '2# 逆流标志', left: 360, top: 420, width: 120, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      textItem('text-vue-hmw-val-rev2', { text: '—', left: 480, top: 420, width: 110, height: 32, fontSize: 18, bindId: 'home-meter-w2.reverse_flag', bindTriggers: fillTriggers('text-vue-hmw-val-rev2', '#f5222d', '#52c41a') }),
      textItem('text-vue-hmw-lbl-vlv1', { text: '1# 阀门', left: 360, top: 460, width: 120, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      textItem('text-vue-hmw-val-vlv1', { text: '—', left: 480, top: 460, width: 110, height: 32, fontSize: 18, bindId: 'home-meter-w1.valve', bindTriggers: fillTriggers('text-vue-hmw-val-vlv1', '#52c41a', '#f5222d') }),
      textItem('text-vue-hmw-lbl-vlv2', { text: '2# 阀门', left: 360, top: 500, width: 120, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      textItem('text-vue-hmw-val-vlv2', { text: '—', left: 480, top: 500, width: 110, height: 32, fontSize: 18, bindId: 'home-meter-w2.valve', bindTriggers: fillTriggers('text-vue-hmw-val-vlv2', '#52c41a', '#f5222d') }),
      svgItem('ah-nav-button', 'ah-nav-button-hmw-e', { left: 660, top: 380, scale: 1.2, props: { target: HOME_E } }),
      textItem('text-vue-hmw-lbl-nav-e', { text: '← 用电画面', left: 640, top: 420, width: 140, height: 22, fill: '#8fa3b8', fontSize: 13 }),
      svgItem('ah-nav-button', 'ah-nav-button-hmw-g', { left: 660, top: 460, scale: 1.2, props: { target: HOME_G } }),
      textItem('text-vue-hmw-lbl-nav-g', { text: '→ 燃气画面', left: 640, top: 500, width: 140, height: 22, fill: '#8fa3b8', fontSize: 13 }),
    ],
    eventList: [], eventFlow: [],
  }

  const gas: ScreenDoc = {
    name: '家庭燃气监控', group: HOME_GROUP, ...canvas(),
    json: [
      // 顶部标题带：标题 + 1#累计/余额值牌
      textItem('text-vue-hmg-title', { text: '家庭燃气监控', left: 20, top: 20, width: 260, height: 36, fill: '#e6f7ff', fontSize: 24 }),
      textItem('text-vue-hmg-lbl-t1', { text: '1#累计(m³)', left: 320, top: 20, width: 120, height: 28, fill: '#8fa3b8', fontSize: 14 }),
      textItem('text-vue-hmg-val-t1', { text: '—', left: 440, top: 20, width: 140, height: 36, fontSize: 18, bindId: 'home-meter-g1.gas_total' }),
      textItem('text-vue-hmg-lbl-bal1', { text: '余额(元)', left: 580, top: 20, width: 110, height: 28, fill: '#8fa3b8', fontSize: 14 }),
      textItem('text-vue-hmg-val-bal1', { text: '—', left: 700, top: 20, width: 90, height: 36, fontSize: 18, bindId: 'home-meter-g1.balance', bindTriggers: balanceTriggers('text-vue-hmg-val-bal1') }),
      // 中区：双燃气表盘并排（字轮累计 + 余额预警 + 阀标 + 泄漏红闪）
      textItem('text-vue-hmg-lbl-m1', { text: '1# 燃气表 home-meter-g1', left: 20, top: 80, width: 220, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      svgItem('ah-gas-meter', G_M1, {
        left: 20, top: 120, scale: 1.6,
        binds: [
          bind(G_M1, 'home-meter-g1.gas_total', 'props.total.val'),
          bind(G_M1, 'home-meter-g1.balance', 'props.balance.val'),
          ...switchChain(G_M1, 'valve', 'home-meter-g1.valve'),
          ...switchChain(G_M1, 'leak', 'home-meter-g1.leak_alarm'),
        ],
      }),
      textItem('text-vue-hmg-lbl-m2', { text: '2# 燃气表 home-meter-g2', left: 360, top: 80, width: 220, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      svgItem('ah-gas-meter', G_M2, {
        left: 360, top: 120, scale: 1.6,
        binds: [
          bind(G_M2, 'home-meter-g2.gas_total', 'props.total.val'),
          bind(G_M2, 'home-meter-g2.balance', 'props.balance.val'),
          ...switchChain(G_M2, 'valve', 'home-meter-g2.valve'),
          ...switchChain(G_M2, 'leak', 'home-meter-g2.leak_alarm'),
        ],
      }),
      // 右栏：泄漏报警三色灯（red=g1.leak_alarm）
      svgItem('ah-stack-light', G_LIGHT, { left: 700, top: 120, scale: 1.3, binds: switchChain(G_LIGHT, 'red', 'home-meter-g1.leak_alarm') }),
      textItem('text-vue-hmg-lbl-leak', { text: '泄漏报警', left: 680, top: 280, width: 110, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      // 左下：趋势（双表瞬时气量 m³/h，金/青双线）+ 2# 余额/累计值牌
      trendItem(G_TREND, {
        left: 20, top: 380, scale: 1.4, yUnit: 'm³/h',
        curves: [
          { field: 'home-meter-g1.gas_instant', label: '1#瞬时气量', unit: 'm³/h', color: '#e6b32a' },
          { field: 'home-meter-g2.gas_instant', label: '2#瞬时气量', unit: 'm³/h', color: '#22d3ee' },
        ],
      }),
      textItem('text-vue-hmg-lbl-bal2', { text: '2# 余额(元)', left: 360, top: 420, width: 120, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      textItem('text-vue-hmg-val-bal2', { text: '—', left: 480, top: 420, width: 110, height: 32, fontSize: 18, bindId: 'home-meter-g2.balance', bindTriggers: balanceTriggers('text-vue-hmg-val-bal2') }),
      textItem('text-vue-hmg-lbl-t2', { text: '2# 累计(m³)', left: 360, top: 460, width: 120, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      textItem('text-vue-hmg-val-t2', { text: '—', left: 480, top: 460, width: 110, height: 32, fontSize: 18, bindId: 'home-meter-g2.gas_total' }),
      // 右下：导航；中区下：安全提示条（静态）；电池电压值牌
      textItem('text-vue-hmg-lbl-safe', { text: '安全提示：泄漏报警联动关阀——leak_alarm=1 即自动关阀', left: 360, top: 380, width: 430, height: 28, fill: '#faad14', fontSize: 14 }),
      textItem('text-vue-hmg-lbl-bat1', { text: '1# 电池(V)', left: 360, top: 500, width: 120, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      textItem('text-vue-hmg-val-bat1', { text: '—', left: 480, top: 500, width: 110, height: 32, fontSize: 18, bindId: 'home-meter-g1.battery' }),
      textItem('text-vue-hmg-lbl-bat2', { text: '2# 电池(V)', left: 360, top: 540, width: 120, height: 24, fill: '#8fa3b8', fontSize: 13 }),
      textItem('text-vue-hmg-val-bat2', { text: '—', left: 480, top: 540, width: 110, height: 32, fontSize: 18, bindId: 'home-meter-g2.battery' }),
      svgItem('ah-nav-button', 'ah-nav-button-hmg-e', { left: 660, top: 420, scale: 1.2, props: { target: HOME_E } }),
      textItem('text-vue-hmg-lbl-nav-e', { text: '← 用电画面', left: 640, top: 460, width: 140, height: 22, fill: '#8fa3b8', fontSize: 13 }),
      svgItem('ah-nav-button', 'ah-nav-button-hmg-w', { left: 660, top: 500, scale: 1.2, props: { target: HOME_W } }),
      textItem('text-vue-hmg-lbl-nav-w', { text: '→ 用水画面', left: 640, top: 540, width: 140, height: 22, fill: '#8fa3b8', fontSize: 13 }),
    ],
    eventList: [], eventFlow: [],
  }

  return { power, water, gas }
}
