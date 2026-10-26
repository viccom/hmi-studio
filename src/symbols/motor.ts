/**
 * 电机（T13 批 2）：卧式电机壳（散热筋）+ 轴伸 + 底脚 + 顶部接线盒。
 * - fill(color)：壳体/轴/底脚/接线盒不写死填充，靠 <use fill> 继承（types.ts ①）——
 *   绑 props.fill.val + triggers 变色（常态 #52c41a 运行绿，故障红/停机灰由 triggers 映射）
 * - 动画 = **整件旋转** common_animations rotate360（F17② 路径——T11 泵弃用的备选在此启用，
 *   电机无管口、整体转语义成立）。注意 types.ts ⑦：注册项**无法预设** common_animations
 *   （registerConfig 无条件覆写为空默认）——启用路径 = 右面板「动画配置」抽屉，或绑定点
 *   triggers changeAttr target common_animations.val 运行时控制（绑 fill 时一并配置）
 * - ports：leftBottom=接线侧锚边中点 / rightTop=轴伸端（y 50% = 轴心）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const SVG = `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">
  <!-- 顶部接线盒 -->
  <rect x="12" y="2" width="14" height="7" rx="1"/>
  <!-- 电机壳（含散热筋定色缝）+ 轴伸 + 底脚：不写 fill 靠 use 属性继承状态色 -->
  <rect x="6" y="9" width="36" height="26" rx="5"/>
  <g stroke="rgba(0,0,0,0.55)" stroke-width="1">
    <line x1="15" y1="12" x2="15" y2="32"/>
    <line x1="21" y1="12" x2="21" y2="32"/>
    <line x1="27" y1="12" x2="27" y2="32"/>
    <line x1="33" y1="12" x2="33" y2="32"/>
  </g>
  <rect x="42" y="20" width="20" height="8" rx="1"/>
  <rect x="10" y="35" width="10" height="5" rx="1"/>
  <rect x="30" y="35" width="10" height="5" rx="1"/>
  <!-- 壳体/轴伸定色轮廓 -->
  <rect x="6" y="9" width="36" height="26" rx="5" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
  <rect x="42" y="20" width="20" height="8" rx="1" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
</svg>`

export const motor: HmiSymbol = {
  id: 'ah-motor', title: '电机', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-motor'),
  svg: SVG, width: 64, height: 48,
  props: {
    fill: { title: '壳体色', type: 'color', val: '#52c41a' },
  },
  ports: [
    { type: 'in', position: 'leftBottom', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
    { type: 'out', position: 'rightTop', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
  ],
}
