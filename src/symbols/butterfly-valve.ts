/**
 * 蝶阀（T12 fill 约定族）：左右接管 + 中心蝶盘 + 阀杆 + 顶部横杆（蝶阀手柄造型）。
 * - fill(color)：接管/蝶盘/阀杆/手柄不写死填充，靠 <use fill> 继承（types.ts ①）
 * - 蝶盘外环为定色轮廓（rgba 叠加）
 * - ports：leftBottom/rightTop 各锚边中点
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const SVG = `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
  <!-- 手柄横杆 / 阀杆：不写 fill 靠 use 属性继承状态色 -->
  <rect x="22" y="2" width="20" height="3.5" rx="1.75"/>
  <rect x="31" y="6" width="2" height="10"/>
  <!-- 左右接管 -->
  <rect x="2" y="21" width="14" height="6" rx="1"/>
  <rect x="48" y="21" width="14" height="6" rx="1"/>
  <!-- 中心蝶盘 -->
  <circle cx="32" cy="24" r="9"/>
  <!-- 定色轮廓：蝶盘外环 + 接管边线 -->
  <circle cx="32" cy="24" r="9" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
  <rect x="2" y="21" width="14" height="6" rx="1" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
  <rect x="48" y="21" width="14" height="6" rx="1" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
</svg>`

export const butterflyValve: HmiSymbol = {
  id: 'ah-butterfly-valve', title: '蝶阀', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-butterfly-valve'),
  svg: SVG, width: 64, height: 48,
  props: {
    fill: { title: '阀体色', type: 'color', val: '#52c41a' },
  },
  ports: [
    { type: 'in', position: 'leftBottom', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
    { type: 'out', position: 'rightTop', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
  ],
}
