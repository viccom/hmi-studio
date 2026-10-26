/**
 * 选择开关（批 B vue 型注册项）：三态旋钮（value number 0/1/2，selectorAngle 纯函数背书）。
 * 运行页点击旋钮 0→1→2→0 循环，update:modelValue 回写合并进 props（bundle onModelValue
 * 实证路径，规范 §4.1.3 操作类图元）；bind 绑 value 时以绑定点位为准（直写覆盖回写）。
 * - fill(color)：旋钮色；label(input)：顶部标签
 * - ports：[]（操作件不接工艺线）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const THUMB = `<svg viewBox="0 0 80 96" xmlns="http://www.w3.org/2000/svg">
  <circle cx="40" cy="48" r="30" fill="#1c2128" stroke="#30363d" stroke-width="2"/>
  <g transform="rotate(0 40 48)">
    <circle cx="40" cy="48" r="17" fill="#faad14" stroke="rgba(0,0,0,0.45)"/>
    <line x1="40" y1="48" x2="40" y2="34" stroke="rgba(0,0,0,0.65)" stroke-width="3" stroke-linecap="round"/>
  </g>
  <circle cx="40" cy="48" r="4" fill="rgba(0,0,0,0.55)"/>
  <text x="12" y="82" font-size="10" fill="#c9d1d9">0</text>
  <text x="40" y="10" font-size="10" fill="#c9d1d9">1</text>
  <text x="68" y="82" font-size="10" fill="#c9d1d9">2</text>
</svg>`

export const selectorSwitch: HmiSymbol = {
  id: 'ah-selector-switch', title: '选择开关', type: 'vue', thumbnail: svgThumbnail(THUMB, 'ah-selector-switch'),
  width: 80, height: 96,
  props: {
    fill: { title: '旋钮色', type: 'color', val: '#faad14' },
    value: { title: '档位（0/1/2）', type: 'number', val: 1 },
    label: { title: '标签', type: 'input', val: '模式' },
  },
  ports: [],
}
