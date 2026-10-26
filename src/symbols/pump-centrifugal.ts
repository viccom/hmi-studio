/**
 * 离心泵（首图元，手工重建）：入口短管 + 泵壳圆 + 出口短管 + 叶轮三角（叶轮=唯一动件）。
 * 视觉参考 agent-hmi 归档（MIT，只看不抄），工业深色主题按 D2 重绘、自包含配色
 * （渲染为 dataURI <img>，外部 CSS 变量不可达——旧试验图元的 var(--ah-*) 在 maotu 下无效）。
 *
 * - fill(color)：泵壳/管路**不写死填充**，靠 <use fill> 继承（types.ts ①，像素实证）——
 *   主体色=状态色，绑 props.fill.val + triggers 变色（常态 #52c41a 运行绿）
 * - animation(switch)：叶轮旋转启停，V2 机制（types.ts ③），绑 props.animation.val
 * - ports：入口 leftBottom / 出口 rightTop（各锚边中点，offset y 50%）；rightBottom
 *   为 maotu 未实现锚位（types.ts ④）
 */
import type { HmiSymbol } from './types'

const SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <style>
    @keyframes ah-pump-spin { to { transform: rotate(360deg); } }
    .ah-rotor { animation: ah-pump-spin 1.2s linear infinite; animation-play-state: var(--ah-run, paused); transform-box: fill-box; transform-origin: center; }
    use[animation="true"] { --ah-run: running; }
  </style>
  <!-- 入口短管 / 出口短管 / 泵壳：不写 fill，靠 use 属性继承状态色 -->
  <rect x="2" y="26" width="16" height="12" rx="1" stroke="#262626" stroke-width="1"/>
  <rect x="46" y="26" width="16" height="12" rx="1" stroke="#262626" stroke-width="1"/>
  <circle cx="32" cy="32" r="18" stroke="#262626" stroke-width="1"/>
  <!-- 叶轮三角 + 轮毂：唯一定色动件（深色叠于状态色之上） -->
  <g class="ah-rotor">
    <path d="M32 21 L41 43 L23 43 Z" fill="rgba(0,0,0,0.55)"/>
    <circle cx="32" cy="36" r="3.5" fill="rgba(0,0,0,0.55)"/>
  </g>
</svg>`

export const pumpCentrifugal: HmiSymbol = {
  id: 'ah-pump', title: '离心泵', type: 'svg', thumbnail: '',
  svg: SVG, width: 64, height: 64,
  props: {
    fill: { title: '主体色', type: 'color', val: '#52c41a' },
    animation: { title: '旋转动画', type: 'switch', val: false },
  },
  ports: [
    { type: 'in', position: 'leftBottom', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
    { type: 'out', position: 'rightTop', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
  ],
}
