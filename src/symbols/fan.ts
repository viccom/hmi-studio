/**
 * 风机（批 A svg 工艺图元 5/6）：蜗壳圆壳 + 侧进风口 + 顶出风短管 + 四叶叶轮（旋转动件）。
 * - fill(color)：壳体/短管不写死填充，靠 <use fill> 继承（types.ts ①）——
 *   运行绿/故障红/停机灰由 triggers 映射
 * - animation(switch)：叶轮旋转启停（types.ts ③ 子件旋转路径：影子树样式链——
 *   use[animation="true"] → --ah-run → .ah-rotor play-state），绑 props.animation.val 直写
 * - ports：in=leftBottom@侧面进风口中点、out=rightTop@顶出风管（x 50% 顶部）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <style>
    @keyframes ah-fan-spin { to { transform: rotate(360deg); } }
    .ah-rotor { animation: ah-fan-spin 1s linear infinite; animation-play-state: var(--ah-run, paused); transform-box: fill-box; transform-origin: center; }
    use[animation="true"] { --ah-run: running; }
  </style>
  <!-- 侧进风口 + 顶出风短管 + 蜗壳圆：不写 fill 靠 use 属性继承状态色 -->
  <rect x="2" y="26" width="12" height="12" rx="1"/>
  <rect x="26" y="2" width="12" height="12" rx="1"/>
  <circle cx="32" cy="34" r="24"/>
  <!-- 四叶叶轮 + 轮毂：唯一定色动件（深色叠于状态色之上，同泵叶轮） -->
  <g class="ah-rotor">
    <path d="M32 34 C28 26 29 20 32 12 C35 20 36 26 32 34 Z" fill="rgba(0,0,0,0.55)"/>
    <path d="M32 34 C40 30 46 31 54 34 C46 37 40 38 32 34 Z" fill="rgba(0,0,0,0.55)"/>
    <path d="M32 34 C36 42 35 48 32 56 C29 48 28 42 32 34 Z" fill="rgba(0,0,0,0.55)"/>
    <path d="M32 34 C24 38 18 37 10 34 C18 31 24 30 32 34 Z" fill="rgba(0,0,0,0.55)"/>
    <circle cx="32" cy="34" r="4" fill="rgba(0,0,0,0.7)"/>
  </g>
  <!-- 壳体定色轮廓 -->
  <circle cx="32" cy="34" r="24" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
</svg>`

export const fan: HmiSymbol = {
  id: 'ah-fan', title: '风机', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-fan'),
  svg: SVG, width: 64, height: 64,
  props: {
    fill: { title: '壳体色', type: 'color', val: '#52c41a' },
    animation: { title: '旋转动画', type: 'switch', val: false },
  },
  ports: [
    { type: 'in', position: 'leftBottom', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
    { type: 'out', position: 'rightTop', offset: { x: { value: 50, unit: '%' }, y: { value: 0, unit: '%' } } },
  ],
}
