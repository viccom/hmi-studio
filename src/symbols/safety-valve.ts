/**
 * 安全阀（批 A svg 工艺图元 3/6）：角式阀体 + 斜置弹簧（锯齿折线，定色）+ 顶杆 + 阀瓣。
 * - fill(color)：阀体/阀瓣/顶杆不写死填充，靠 <use fill> 继承（types.ts ①）——
 *   整定正常绿/起跳泄放红由 triggers 映射；弹簧为定色件（机构语义不随状态变色）
 * - ports：in=rightTop@底口中心（x 50% + y 100% 推到阀底，等效到达；rightBottom 锚位
 *   maotu 未实现，types.ts ④）、out=rightTop@右侧泄放口中点
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const SVG = `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
  <!-- 角式阀体（下口立管延伸至底边 y 48=in 锚位 + 右侧泄放腔）：不写 fill 靠 use 属性继承状态色 -->
  <rect x="24" y="28" width="16" height="20" rx="2"/>
  <rect x="14" y="16" width="36" height="16" rx="3"/>
  <!-- 泄放短管 + 阀瓣（腔内横向件）+ 顶杆：状态色继承 -->
  <rect x="48" y="19" width="14" height="10" rx="1"/>
  <rect x="20" y="22" width="10" height="4" rx="1"/>
  <rect x="30" y="10" width="4" height="8" rx="1"/>
  <!-- 斜置弹簧（三段斜列折线，加粗定色件）+ 弹簧座 -->
  <g fill="none" stroke="rgba(0,0,0,0.65)" stroke-width="2.5">
    <path d="M23 14 L39 3 L23 9 L39 2"/>
  </g>
  <rect x="21" y="6" width="14" height="3" rx="1" fill="rgba(0,0,0,0.55)"/>
  <!-- 阀体定色轮廓 -->
  <rect x="14" y="16" width="36" height="16" rx="3" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
</svg>`

export const safetyValve: HmiSymbol = {
  id: 'ah-safety-valve', title: '安全阀', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-safety-valve'),
  svg: SVG, width: 64, height: 48,
  props: {
    fill: { title: '阀体色', type: 'color', val: '#52c41a' },
  },
  ports: [
    { type: 'in', position: 'rightTop', offset: { x: { value: 50, unit: '%' }, y: { value: 100, unit: '%' } } },
    { type: 'out', position: 'rightTop', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
  ],
}
