/**
 * 电表功率盘（P2-B custom-svg 注册项 1/4）：模拟量表盘，指针角 = f(value, 0, 5kW)
 * （gauge-math 单测背书）；>4.5kW 报警红弧静态常画（越线即入区）；pulse(switch) → 盘角
 * 指示灯亮。数据面 home-meter-e1/e2：power(kW, 0.05~3)、pulse(bool 闪灯)。
 * - value(number)：bind 直写 props.value.val；pulse(switch)：触发链 change_attr（成对收口）
 * - fill(color)：指针/进度弧常态色
 * - ports：[]（显示仪表不接工艺线）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const THUMB = `<svg viewBox="0 0 120 106" xmlns="http://www.w3.org/2000/svg">
  <path d="M 23.11 88.55 A 62 62 0 1 1 96.89 88.55" fill="none" stroke="#30363d" stroke-width="8" stroke-linecap="round"/>
  <path d="M 71.21 25.02 A 62 62 0 0 1 96.89 88.55" fill="none" stroke="#f5222d" stroke-width="8"/>
  <path d="M 23.11 88.55 A 62 62 0 0 1 60 16" fill="none" stroke="#e6b32a" stroke-width="8" stroke-linecap="round"/>
  <line x1="60" y1="82" x2="88" y2="40" stroke="#e6b32a" stroke-width="3"/>
  <circle cx="60" cy="82" r="5" fill="#e6b32a"/>
  <circle cx="105" cy="12" r="6" fill="#ff4d4f"/>
</svg>`

export const powerGauge: HmiSymbol = {
  id: 'ah-power-gauge', title: '电表功率盘', type: 'custom-svg', thumbnail: svgThumbnail(THUMB, 'ah-power-gauge'),
  width: 180, height: 160,
  props: {
    fill: { title: '指针/弧色', type: 'color', val: '#e6b32a' },
    value: { title: '有功功率（kW）', type: 'number', val: 0 },
    pulse: { title: '脉冲灯（bool）', type: 'switch', val: false },
  },
  ports: [],
}
