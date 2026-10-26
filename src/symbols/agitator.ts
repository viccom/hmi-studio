/**
 * 搅拌器（批 A svg 工艺图元 6/6）：顶部电机座 + 垂直轴 + 底部十字桨叶（旋转动件）。
 * - fill(color)：电机座/轴/桨叶不写死填充，靠 <use fill> 继承（types.ts ①）——
 *   运行绿/停机灰由 triggers 映射；安装法兰为定色件
 * - animation(switch)：桨叶绕轴心旋转（types.ts ③ 子件旋转路径，同泵叶轮/风机影子链），
 *   绑 props.animation.val 直写启停
 * - ports：in=leftTop@电机座左缘中点（y 10px，电源/联锁线锚）、out=rightTop@轴顶（x 50%）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const SVG = `<svg viewBox="0 0 48 64" xmlns="http://www.w3.org/2000/svg">
  <style>
    @keyframes ah-agit-spin { to { transform: rotate(360deg); } }
    .ah-paddle { animation: ah-agit-spin 1.6s linear infinite; animation-play-state: var(--ah-run, paused); transform-box: fill-box; transform-origin: center; }
    use[animation="true"] { --ah-run: running; }
  </style>
  <!-- 电机座（含散热纹定色缝）+ 垂直轴：不写 fill 靠 use 属性继承状态色 -->
  <rect x="8" y="2" width="32" height="16" rx="3"/>
  <rect x="22" y="18" width="4" height="28" rx="1"/>
  <!-- 安装法兰（定色件） -->
  <rect x="4" y="4" width="4" height="12" rx="1" fill="rgba(0,0,0,0.55)"/>
  <!-- 十字桨叶（绕轴心旋转动件，深色叠于状态色之上）：bbox (12..36, 45.5..54.5) 中心=轴心
       (24,50)，回转半径 12.8 内接 viewBox（64 高内不裁切） -->
  <g class="ah-paddle">
    <path d="M24 46 L12 45.5 L12 54.5 L24 54 Z" fill="rgba(0,0,0,0.55)"/>
    <path d="M24 46 L36 45.5 L36 54.5 L24 54 Z" fill="rgba(0,0,0,0.55)"/>
    <circle cx="24" cy="50" r="3" fill="rgba(0,0,0,0.7)"/>
  </g>
  <!-- 电机座定色轮廓 -->
  <rect x="8" y="2" width="32" height="16" rx="3" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
</svg>`

export const agitator: HmiSymbol = {
  id: 'ah-agitator', title: '搅拌器', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-agitator'),
  svg: SVG, width: 48, height: 64,
  props: {
    fill: { title: '主体色', type: 'color', val: '#52c41a' },
    animation: { title: '旋转动画', type: 'switch', val: false },
  },
  ports: [
    { type: 'in', position: 'leftTop', offset: { x: { value: 0, unit: 'px' }, y: { value: 10, unit: 'px' } } },
    { type: 'out', position: 'rightTop', offset: { x: { value: 50, unit: '%' }, y: { value: 0, unit: '%' } } },
  ],
}
