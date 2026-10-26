/**
 * 压力表盘（批 B custom-svg 型注册项）：指针角度 = f(value,min,max)（gauge-math 单测背书），
 * 刻度弧 + 数字刻度 + 读数文本（custom-svg 走 maotu SSR 串化 dataURI——<text> 合法且样式须内联）。
 * - value(number)：bind 直写 props.value.val；min/max(number)：量程
 * - alarm(switch)：触发链入口——指针/进度弧变红（#f5222d），绑 props.alarm.val
 * - fill(color)：常态弧/指针色
 * - ports：[]（显示仪表不接工艺线）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const THUMB = `<svg viewBox="0 0 120 96" xmlns="http://www.w3.org/2000/svg">
  <path d="M 17.79 79.09 A 52 52 0 1 1 102.21 79.09" fill="none" stroke="#30363d" stroke-width="8" stroke-linecap="round"/>
  <path d="M 17.79 79.09 A 52 52 0 1 1 60 8" fill="none" stroke="#e6b32a" stroke-width="8" stroke-linecap="round"/>
  <line x1="60" y1="58" x2="88" y2="30" stroke="#e6b32a" stroke-width="3"/>
  <circle cx="60" cy="58" r="5" fill="#e6b32a"/>
</svg>`

export const gaugePressure: HmiSymbol = {
  id: 'ah-gauge-pressure', title: '压力表盘', type: 'custom-svg', thumbnail: svgThumbnail(THUMB, 'ah-gauge-pressure'),
  width: 120, height: 96,
  props: {
    fill: { title: '弧/指针色', type: 'color', val: '#e6b32a' },
    value: { title: '测量值', type: 'number', val: 60 },
    min: { title: '量程下限', type: 'number', val: 0 },
    max: { title: '量程上限', type: 'number', val: 100 },
    unit: { title: '单位', type: 'input', val: 'kPa' },
    label: { title: '标签', type: 'input', val: '压力' },
    alarm: { title: '报警（指针变红）', type: 'switch', val: false },
  },
  ports: [],
}
