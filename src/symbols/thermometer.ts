/**
 * 温度计（批 B custom-svg 型注册项）：液柱计算几何（thermoY 纯函数单测背书）+ 刻度文本
 * （custom-svg 走 maotu SSR 串化 dataURI——<text> 合法且样式须内联）。视觉思路参考用户
 * 学习样例（刻度+液柱），按本仓规范重写（深色自包含配色/props 契约/几何收敛 gauge-math）。
 * - value(number)：bind 直写 props.value.val；min/max(number)：量程；fill(color)：液色
 * - ports：[]（显示仪表不接工艺线）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const THUMB = `<svg viewBox="0 0 64 150" xmlns="http://www.w3.org/2000/svg">
  <rect x="24" y="40" width="12" height="80" fill="#f5222d"/>
  <circle cx="30" cy="130" r="13" fill="#f5222d"/>
  <rect x="22" y="14" width="16" height="106" rx="8" fill="none" stroke="#6e7681" stroke-width="1.5"/>
  <circle cx="30" cy="130" r="13" fill="none" stroke="#6e7681" stroke-width="1.5"/>
  <line x1="42" y1="14" x2="49" y2="14" stroke="#c9d1d9" stroke-width="1.5"/>
  <line x1="42" y1="66" x2="49" y2="66" stroke="#c9d1d9" stroke-width="1.5"/>
  <line x1="42" y1="118" x2="49" y2="118" stroke="#c9d1d9" stroke-width="1.5"/>
</svg>`

export const thermometer: HmiSymbol = {
  id: 'ah-thermometer', title: '温度计', type: 'custom-svg', thumbnail: svgThumbnail(THUMB, 'ah-thermometer'),
  width: 64, height: 150,
  props: {
    fill: { title: '液色', type: 'color', val: '#f5222d' },
    value: { title: '测量值', type: 'number', val: 25 },
    min: { title: '量程下限', type: 'number', val: -40 },
    max: { title: '量程上限', type: 'number', val: 160 },
    unit: { title: '单位', type: 'input', val: '°C' },
    label: { title: '标签', type: 'input', val: '温度' },
  },
  ports: [],
}
