/**
 * 止回阀（批 A svg 工艺图元 1/6）：领结阀体 + 阀腔圆 + 内部单向箭头（导通方向标识，定色）。
 * 静态语义图元（单向阀无开闭控制）：无 animation/二值 prop，仅 fill 状态色。
 * - fill(color)：阀体/阀腔不写死填充，靠 <use fill> 继承（types.ts ①）——上游故障红/导通绿
 *   由 triggers 映射；单向箭头为定色件（rgba 叠加，方向语义不随状态变色）
 * - ports：leftBottom/rightTop 各锚边中点（与闸阀/球阀同高度，工艺连线取平）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const SVG = `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
  <!-- 领结阀体两楔面 + 阀腔圆：不写 fill 靠 use 属性继承状态色 -->
  <path d="M4 8 L26 20 L4 32 Z"/>
  <path d="M60 8 L38 20 L60 32 Z"/>
  <circle cx="32" cy="20" r="12"/>
  <!-- 单向箭头（导通方向，定色件）+ 阀体定色轮廓 -->
  <path d="M20 20 H42 M36 14 L44 20 L36 26" fill="none" stroke="rgba(0,0,0,0.65)" stroke-width="2.5"/>
  <path d="M4 8 L26 20 L4 32 Z M60 8 L38 20 L60 32 Z" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
  <circle cx="32" cy="20" r="12" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
</svg>`

export const checkValve: HmiSymbol = {
  id: 'ah-check-valve', title: '止回阀', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-check-valve'),
  svg: SVG, width: 64, height: 40,
  props: {
    fill: { title: '阀体色', type: 'color', val: '#52c41a' },
  },
  ports: [
    { type: 'in', position: 'leftBottom', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
    { type: 'out', position: 'rightTop', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
  ],
}
