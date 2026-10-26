/**
 * 电表面板（P2-B vue 型注册项 2/4）：工业电表卡片——电压/电流/有功/功率因数/频率五行数显
 * + 底部脉冲灯（pulse bool 驱动 CSS 闪烁）+ status 非 0 变黄告警。
 * 数据面 home-meter-e1/e2 字段一一对应：voltage(V)/current(A)/power(kW)/pf/frequency(Hz)/
 * pulse(bool)/status(u16)——五个数值 prop 全部独立 bind 直写（props.v.val 等）。
 * - fill(color)：读数色（全行统一，可触发链变色）
 * - ports：[]（面板不接工艺线）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const THUMB = `<svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="88" rx="6" fill="#0d1117" stroke="#30363d"/>
  <rect x="10" y="8" width="40" height="8" rx="2" fill="#e6f7ff"/>
  <rect x="88" y="9" width="22" height="6" rx="3" fill="#2ea043"/>
  <rect x="10" y="24" width="60" height="4" rx="2" fill="#8b949e"/><rect x="76" y="23" width="34" height="7" rx="2" fill="#39d353"/>
  <rect x="10" y="38" width="60" height="4" rx="2" fill="#8b949e"/><rect x="76" y="37" width="34" height="7" rx="2" fill="#39d353"/>
  <rect x="10" y="52" width="60" height="4" rx="2" fill="#8b949e"/><rect x="76" y="51" width="34" height="7" rx="2" fill="#39d353"/>
  <circle cx="16" cy="78" r="5" fill="#ff4d4f"/>
</svg>`

export const meterPanel: HmiSymbol = {
  id: 'ah-meter-panel', title: '电表面板', type: 'vue', thumbnail: svgThumbnail(THUMB, 'ah-meter-panel'),
  width: 200, height: 150,
  props: {
    fill: { title: '读数色', type: 'color', val: '#39d353' },
    v: { title: '电压（V）', type: 'number', val: 0 },
    i: { title: '电流（A）', type: 'number', val: 0 },
    p: { title: '有功（kW）', type: 'number', val: 0 },
    pf: { title: '功率因数', type: 'number', val: 0 },
    freq: { title: '频率（Hz）', type: 'number', val: 0 },
    pulse: { title: '脉冲灯（bool）', type: 'switch', val: false },
    status: { title: '状态码（u16，非 0 告警）', type: 'number', val: 0 },
  },
  ports: [],
}
