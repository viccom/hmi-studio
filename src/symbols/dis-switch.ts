/**
 * 隔离开关（T13 批 2）：左静触头 + 枢轴 + 闸刀 + 右静触头 + 两支绝缘子。
 * - fill(color) **二值状态**（简单可靠，几何不变色变）：合闸 #52c41a 绿 / 分闸 #8c8c8c 灰——
 *   导电件（触头/枢轴/闸刀）不写死填充靠 <use fill> 继承，绑 props.fill.val + triggers
 *   按布尔/枚举点位映射两色（如 1→绿 0→灰）；绝缘子为定色件
 * - ports：leftBottom/rightTop 各锚边中点（与阀/泵同高度，母线连线取平）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const SVG = `<svg viewBox="0 0 64 32" xmlns="http://www.w3.org/2000/svg">
  <!-- 左右静触头 + 枢轴 + 闸刀：不写 fill 靠 use 属性继承状态色 -->
  <rect x="2" y="13" width="10" height="6" rx="1"/>
  <circle cx="16" cy="16" r="3.5"/>
  <rect x="18" y="14.5" width="28" height="3" rx="1.5"/>
  <rect x="52" y="13" width="10" height="6" rx="1"/>
  <!-- 绝缘子（定色件）+ 触头定色轮廓 -->
  <g fill="rgba(0,0,0,0.55)">
    <rect x="14" y="22" width="4" height="8" rx="1"/>
    <rect x="46" y="22" width="4" height="8" rx="1"/>
  </g>
  <rect x="2" y="13" width="10" height="6" rx="1" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
  <rect x="52" y="13" width="10" height="6" rx="1" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
</svg>`

export const disSwitch: HmiSymbol = {
  id: 'ah-dis-switch', title: '隔离开关', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-dis-switch'),
  svg: SVG, width: 64, height: 32,
  props: {
    fill: { title: '状态色（合闸绿/分闸灰）', type: 'color', val: '#52c41a' },
  },
  ports: [
    { type: 'in', position: 'leftBottom', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
    { type: 'out', position: 'rightTop', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
  ],
}
