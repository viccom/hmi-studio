/**
 * 罐（T12 fill 约定族，带连续液位）：立式罐体 + 液位柱（scaleY 自底生长）+ 侧壁刻度。
 * - fill(color)：**液色**——液位柱不写死填充靠 <use fill> 继承（罐壳仅定色描边、不吞状态色）
 * - h(number 0-100)：液位百分比，绑 props.h.val 直写——驱动链见 types.ts ⑥（属性选择器
 *   枚举 → --ah-lvl → scaleY；浮点向下取整到整数档，越界回落 0）
 * - ports：in=leftTop@顶中（x 50%）、out=rightTop@右下角（y 100% 锚位推到罐底——rightBottom
 *   锚位 maotu 未实现，用 rightTop+y:100% 等效到达，types.ts ④）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail, levelCssRules, LIQUID_CSS } from './kit'

const SVG = `<svg viewBox="0 0 48 64" xmlns="http://www.w3.org/2000/svg">
  <style>${levelCssRules()}${LIQUID_CSS}</style>
  <!-- 液位柱：占满罐内全高，scaleY 按 ah-lvl 变量自底生长，颜色继承 use fill（注释内禁双连字符） -->
  <rect class="ah-liquid" x="9" y="9" width="30" height="46" rx="3"/>
  <!-- 罐壳：定色描边、不吞状态色 -->
  <rect x="7" y="7" width="34" height="50" rx="4" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1.5"/>
  <!-- 侧壁刻度：0/25/50/75/100%（液面 y = 55 - 46*pct/100） -->
  <g stroke="rgba(0,0,0,0.55)" stroke-width="1">
    <line x1="1" y1="55" x2="7" y2="55"/>
    <line x1="2" y1="43.5" x2="7" y2="43.5"/>
    <line x1="1" y1="32" x2="7" y2="32"/>
    <line x1="2" y1="20.5" x2="7" y2="20.5"/>
    <line x1="1" y1="9" x2="7" y2="9"/>
  </g>
</svg>`

export const tank: HmiSymbol = {
  id: 'ah-tank', title: '罐', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-tank'),
  svg: SVG, width: 48, height: 64,
  props: {
    fill: { title: '液色', type: 'color', val: '#1677ff' },
    h: { title: '液位高度 %', type: 'number', val: 50 },
  },
  ports: [
    { type: 'in', position: 'leftTop', offset: { x: { value: 50, unit: '%' }, y: { value: 0, unit: '%' } } },
    { type: 'out', position: 'rightTop', offset: { x: { value: 0, unit: 'px' }, y: { value: 100, unit: '%' } } },
  ],
}
