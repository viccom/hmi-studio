/**
 * 球阀（批 A svg 工艺图元 2/6）：领结管口 + 中央球体 + 阀杆 + 水平翼柄。
 * - fill(color)：阀体/球体/阀杆不写死填充，靠 <use fill> 继承（types.ts ①）——
 *   开阀绿/关阀红由 triggers 映射
 * - 柄位表达选型：**open(switch) prop + 属性选择器二规则旋转翼柄 90°**（非 animation、
 *   非纯 fill 二态）。理由：球阀开关是离散位置态，翼柄平行流向=开、垂直=关是真实操作
 *   语义；液位同款影子链（use[open] 规则 → CSS 变量 → rotate）实现，两条规则即可（比
 *   液位 202 条枚举轻）；fill 同时保留状态色，双通道冗余（色觉不敏感场景可辨形变）。
 *   viewBox 高 56（流道中心 y 28=50% 锚位取平）：为翼柄竖位（绕枢轴旋转占 y 3..23）
 *   预留顶部行程，防 90° 翻转越界裁切（64x40 版实测裁顶）。
 * - ports：leftBottom/rightTop 各锚边中点 y 50%=28=流道中心（与闸阀/止回阀连线取平）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const SVG = `<svg viewBox="0 0 64 56" xmlns="http://www.w3.org/2000/svg">
  <style>
    .ah-handle { transform: rotate(var(--ah-hdl, 0deg)); transform-box: fill-box; transform-origin: center; }
    use[open="true"] { --ah-hdl: 0deg; }
    use[open="false"] { --ah-hdl: 90deg; }
  </style>
  <!-- 领结管口两楔面（流道中心 y 28）+ 中央球体 + 阀杆：不写 fill 靠 use 属性继承状态色 -->
  <path d="M4 22 L22 28 L4 34 Z"/>
  <path d="M60 22 L42 28 L60 34 Z"/>
  <circle cx="32" cy="28" r="7"/>
  <rect x="30.5" y="17" width="3" height="6" rx="1"/>
  <!-- 翼柄（open prop 驱动 90° 翻转，枢轴 bbox 中心 (32,13)=柄轴） -->
  <g class="ah-handle">
    <rect x="22" y="11" width="20" height="4" rx="2"/>
    <circle cx="32" cy="13" r="2.5" fill="rgba(0,0,0,0.55)"/>
  </g>
  <!-- 阀体定色轮廓 -->
  <path d="M4 22 L22 28 L4 34 Z M60 22 L42 28 L60 34 Z" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
  <circle cx="32" cy="28" r="7" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
</svg>`

export const ballValve: HmiSymbol = {
  id: 'ah-ball-valve', title: '球阀', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-ball-valve'),
  svg: SVG, width: 64, height: 56,
  props: {
    fill: { title: '阀体色', type: 'color', val: '#52c41a' },
    open: { title: '开位（柄平行管向）', type: 'switch', val: true },
  },
  ports: [
    { type: 'in', position: 'leftBottom', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
    { type: 'out', position: 'rightTop', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
  ],
}
