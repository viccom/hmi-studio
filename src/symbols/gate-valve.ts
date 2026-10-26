/**
 * 闸阀（T12 fill 约定族）：领结阀体（两楔面）+ 阀杆 + 顶部手轮。
 * - fill(color)：阀体楔面/阀杆不写死填充，靠 <use fill> 继承（types.ts ①）——绑
 *   props.fill.val + triggers 变色（常态 #52c41a 开阀绿，关阀红/灰由 triggers 映射）
 * - 手轮为深色定色件（rgba 叠加，同泵叶轮）
 * - ports：leftBottom/rightTop 各锚边中点（与泵/流量计同高度，工艺连线取平）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const SVG = `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
  <!-- 领结阀体：两楔面 + 阀杆，不写 fill 靠 use 属性继承状态色 -->
  <path d="M4 8 L28 20 L4 32 Z"/>
  <path d="M60 8 L36 20 L60 32 Z"/>
  <rect x="30.5" y="9" width="3" height="12" rx="1"/>
  <!-- 手轮：唯一定色件 -->
  <ellipse cx="32" cy="5" rx="9" ry="3.5" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="2"/>
  <!-- 阀体描边（定色轮廓，叠于状态色之上） -->
  <path d="M4 8 L28 20 L4 32 Z M60 8 L36 20 L60 32 Z" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
</svg>`

export const gateValve: HmiSymbol = {
  id: 'ah-gate-valve', title: '闸阀', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-gate-valve'),
  svg: SVG, width: 64, height: 40,
  props: {
    fill: { title: '阀体色', type: 'color', val: '#52c41a' },
  },
  ports: [
    { type: 'in', position: 'leftBottom', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
    { type: 'out', position: 'rightTop', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
  ],
}
