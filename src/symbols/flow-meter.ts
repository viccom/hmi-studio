/**
 * 流量计（T12 fill 约定族）：左右接管 + 在线表体 + 顶部圆形表盘（指针定色）+ 流向箭头。
 * 数值读数按 F16 不进复合图元（管线纯字符串拼接，prop 对 <text> 像素零影响）——
 * 需要显示瞬时流量时旁置内置文本图元绑 props.text.val（值牌约定，设计 §6）。
 * - fill(color)：表盘面/表体/接管不写死填充，靠 <use fill> 继承（types.ts ①）——
 *   绑 props.fill.val + triggers 变色（常态 #1677ff 通量蓝，断流/异常由 triggers 映射）
 * - ports：leftBottom/rightTop 各锚边中点（与泵/阀同高度，工艺连线取平）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <!-- 表盘：面盘继承 use fill；刻度弧/指针为定色件 -->
  <circle cx="32" cy="13" r="9"/>
  <path d="M25.8 9.8 A9 9 0 0 1 38.2 9.8" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1.2"/>
  <line x1="32" y1="13" x2="36.8" y2="9.2" stroke="rgba(0,0,0,0.55)" stroke-width="1.2"/>
  <!-- 表颈 + 在线表体：不写 fill 靠 use 属性继承状态色 -->
  <rect x="29.5" y="21" width="5" height="6"/>
  <rect x="14" y="26" width="36" height="12" rx="2"/>
  <!-- 左右接管 -->
  <rect x="2" y="29" width="12" height="6" rx="1"/>
  <rect x="50" y="29" width="12" height="6" rx="1"/>
  <!-- 流向箭头（定色）+ 定色轮廓 -->
  <path d="M29 32 H39 M34.5 27.5 L40 32 L34.5 36.5" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1.5"/>
  <rect x="14" y="26" width="36" height="12" rx="2" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
  <rect x="2" y="29" width="12" height="6" rx="1" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
  <rect x="50" y="29" width="12" height="6" rx="1" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
</svg>`

export const flowMeter: HmiSymbol = {
  id: 'ah-flow-meter', title: '流量计', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-flow-meter'),
  svg: SVG, width: 64, height: 64,
  props: {
    fill: { title: '表体色', type: 'color', val: '#1677ff' },
  },
  ports: [
    { type: 'in', position: 'leftBottom', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
    { type: 'out', position: 'rightTop', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
  ],
}
