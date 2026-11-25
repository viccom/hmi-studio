/**
 * 值块（工业功能件 1/8，vue 型）：L2 就地显示的主力件。
 * 标签 + PV 大数字 + 单位 + 限值带（LL/L/H/HH 刻线）+ SP 标记 + 报警/质量态。
 *
 * 语义（docs/hmi-style-guide.md §2/§3/§5）：
 * - 正常态数值用暗蓝 `HP.live`；`prio>0` 转优先级色并出 P1-P4 小徽标；
 *   `quality>0` 数值转灰、右上角显示 STALE/BAD（不把"没数据"画成"正常"）。
 * - `show_limits=false` 时只显示数值（普通点位），不画无意义的限值带。
 * - 所有 props 平铺直写（bind_attr=props.<name>.val），与现有绑定纪律一致。
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'
import { HP } from './hp-hmi'

const THUMB = `<svg viewBox="0 0 220 110" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="218" height="108" rx="6" fill="#ffffff" stroke="#8a939d"/>
  <rect x="12" y="12" width="52" height="6" rx="2" fill="#5b6570"/>
  <rect x="12" y="28" width="96" height="22" rx="3" fill="#1f4e79"/>
  <rect x="116" y="38" width="30" height="8" rx="2" fill="#8a939d"/>
  <rect x="12" y="76" width="196" height="10" rx="2" fill="#e3e6e8"/>
  <rect x="12" y="76" width="58" height="10" rx="2" fill="#fbc02d"/>
  <rect x="150" y="76" width="58" height="10" rx="2" fill="#fbc02d"/>
  <rect x="70" y="76" width="80" height="10" fill="#c9d2d8"/>
</svg>`

export const valueBlock: HmiSymbol = {
  id: 'ah-value-block', title: '值块', type: 'vue', thumbnail: svgThumbnail(THUMB, 'ah-value-block'),
  width: 220, height: 110,
  props: {
    fill: { title: '数值色', type: 'color', val: HP.live },
    label: { title: '标签', type: 'input', val: '瞬时流量' },
    value: { title: '数值', type: 'number', val: 0 },
    unit: { title: '单位', type: 'input', val: 'm³/h' },
    precision: { title: '小数位', type: 'number', val: 2 },
    min: { title: '量程下限', type: 'number', val: 0 },
    max: { title: '量程上限', type: 'number', val: 100 },
    show_limits: { title: '显示限值带', type: 'switch', val: false },
    ll: { title: 'LL 低低限', type: 'number', val: -99999 },
    l: { title: 'L 低限', type: 'number', val: -99999 },
    h: { title: 'H 高限', type: 'number', val: -99999 },
    hh: { title: 'HH 高高限', type: 'number', val: -99999 },
    show_sp: { title: '显示 SP 标记', type: 'switch', val: false },
    sp: { title: '设定值 SP', type: 'number', val: 0 },
    prio: { title: '报警优先级（0 正常 / 1 P1 … 4 P4）', type: 'number', val: 0 },
    quality: { title: '质量（0 GOOD / 1 STALE / 2 BAD）', type: 'number', val: 0 },
    compact: { title: '紧凑行模式（参数表行用）', type: 'switch', val: false },
  },
  ports: [],
}
