/**
 * 设备面板总成 faceplate（工业功能件 8/8，vue 型）：L3/L4 的核心件。
 *
 * 内容（ISA-101 faceplate 必备项的本仓实现）：
 *   标题位号 + 设备 id + 状态/质量 → PV 大数字 + 单位 + 优先级 → 限值带（LL/L/H/HH）→
 *   量程位置条（PV/SP 标记）→ 可选控制区（模式/SP/OP）→ 相邻趋势 → 报警/质量页脚。
 *
 * 演示设备是表计/传感器（无控制回路）：`show_control` 默认 false，SP/OP/模式区隐藏，
 * 不伪造控制语义；接入调节阀/回路设备时打开即可。
 * 参数化：`@dev.*` 绑定由宿主重写（dev-context.ts），本组件只认最终数值。
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'
import { HP } from './hp-hmi'

const THUMB = `<svg viewBox="0 0 520 620" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="518" height="618" rx="6" fill="#ffffff" stroke="#8a939d"/>
  <rect x="20" y="18" width="150" height="12" rx="2" fill="#1f2328"/>
  <rect x="20" y="44" width="80" height="7" rx="2" fill="#5b6570"/>
  <rect x="20" y="76" width="190" height="46" rx="3" fill="#1f4e79"/>
  <rect x="20" y="150" width="480" height="14" rx="2" fill="#e3e6e8"/>
  <rect x="20" y="150" width="110" height="14" fill="#fbc02d"/>
  <rect x="360" y="150" width="140" height="14" fill="#fbc02d"/>
  <rect x="20" y="210" width="480" height="160" rx="4" fill="#f5f5f5" stroke="#8a939d"/>
  <polyline points="30,340 90,310 150,320 210,280 270,300 330,260 390,280 450,240 490,250" fill="none" stroke="#1f4e79" stroke-width="2"/>
</svg>`

export const devFaceplate: HmiSymbol = {
  id: 'ah-dev-faceplate', title: '设备面板', type: 'vue', thumbnail: svgThumbnail(THUMB, 'ah-dev-faceplate'),
  width: 520, height: 620,
  props: {
    fill: { title: 'PV 数值色', type: 'color', val: HP.live },
    title: { title: '位号/设备名', type: 'input', val: 'WM-101 远传水表' },
    dev: { title: '设备 id', type: 'input', val: 'dev_wm1' },
    unit: { title: '单位', type: 'input', val: 'm³/h' },
    pv: { title: '主测点 PV', type: 'number', val: 0 },
    precision: { title: '小数位', type: 'number', val: 2 },
    min: { title: '量程下限', type: 'number', val: 0 },
    max: { title: '量程上限', type: 'number', val: 100 },
    show_limits: { title: '显示限值', type: 'switch', val: true },
    ll: { title: 'LL 低低限', type: 'number', val: -99999 },
    l: { title: 'L 低限', type: 'number', val: -99999 },
    h: { title: 'H 高限', type: 'number', val: -99999 },
    hh: { title: 'HH 高高限', type: 'number', val: -99999 },
    show_sp: { title: '显示 SP 标记', type: 'switch', val: false },
    sp: { title: '设定值 SP', type: 'number', val: 0 },
    show_control: { title: '显示控制区（SP/OP/模式）', type: 'switch', val: false },
    op: { title: '输出 OP（0-100）', type: 'number', val: 0 },
    mode: { title: '模式（0 MAN / 1 AUTO / 2 CAS）', type: 'number', val: 1 },
    status: { title: '状态（0 停 / 1 运行 / 2 故障 / 3 维护 / 4 离线）', type: 'number', val: 1 },
    quality: { title: '质量（0 GOOD / 1 STALE / 2 BAD）', type: 'number', val: 0 },
    prio: { title: '设备最高优先级（0 正常 / 1 P1 … 4 P4）', type: 'number', val: 0 },
    pv_prio: { title: 'PV 点位优先级（只染 PV 数值色）', type: 'number', val: 0 },
    alarms: { title: '活动报警数', type: 'number', val: 0 },
    window: { title: '趋势窗口（秒）', type: 'number', val: 300 },
  },
  ports: [],
}
