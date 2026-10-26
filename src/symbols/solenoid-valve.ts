/**
 * 电磁阀（批 A svg 工艺图元 4/6）：领结阀体 + 阀杆 + 顶部线圈方块（内嵌 S 型绕组折线）。
 * - fill(color)：阀体/阀杆不写死填充，靠 <use fill> 继承（types.ts ①）——
 *   得电开绿/失电关红由 triggers 映射；线圈方块为定色件（电气标识不随状态变色）
 * - ports：leftBottom/rightTop 各锚边中点 y 50%=24 与阀体流道中心取平（连线取平）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const SVG = `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
  <!-- 领结阀体两楔面（流道中心 y 24）+ 阀杆：不写 fill 靠 use 属性继承状态色 -->
  <path d="M4 15 L28 24 L4 33 Z"/>
  <path d="M60 15 L36 24 L60 33 Z"/>
  <rect x="30.5" y="15" width="3" height="9" rx="1"/>
  <!-- 线圈方块（电气标识，定色件）：外壳 + S 型绕组折线 -->
  <rect x="24" y="2" width="16" height="12" rx="2" fill="rgba(0,0,0,0.55)"/>
  <path d="M27 8 Q29.5 4.5 32 8 Q34.5 11.5 37 8" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.6"/>
  <!-- 阀体定色轮廓 -->
  <path d="M4 15 L28 24 L4 33 Z M60 15 L36 24 L60 33 Z" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
</svg>`

export const solenoidValve: HmiSymbol = {
  id: 'ah-solenoid-valve', title: '电磁阀', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-solenoid-valve'),
  svg: SVG, width: 64, height: 48,
  props: {
    fill: { title: '阀体色', type: 'color', val: '#52c41a' },
  },
  ports: [
    { type: 'in', position: 'leftBottom', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
    { type: 'out', position: 'rightTop', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
  ],
}
