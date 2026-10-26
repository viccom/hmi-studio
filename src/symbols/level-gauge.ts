/**
 * 液位计（T12 fill 约定族，带连续液位）：测量管 + 液位读数条（scaleY 自底生长）+ 刻度。
 * 与罐同款驱动链（types.ts ⑥：use[h] 枚举 → --ah-lvl → scaleY），区别在窄管造型 +
 * 右侧 10% 细刻度——独立就地显示液位用（罐上不必叠刻度时用它）。
 * - fill(color)：读数条色，绑 props.fill.val；h(number 0-100) 绑 props.h.val
 * - 无 ports（显示仪表不接工艺线）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail, levelCssRules, LIQUID_CSS } from './kit'

// 10% 细刻度：液面 y = 58 - 52*pct/100（管内液条几何 6..58）
const TICKS = Array.from({ length: 11 }, (_, i) => {
  const y = (58 - (52 * i) / 10).toFixed(1)
  return `<line x1="20" y1="${y}" x2="${i % 5 === 0 ? 26 : 23}" y2="${y}"/>`
}).join('')

const SVG = `<svg viewBox="0 0 28 64" xmlns="http://www.w3.org/2000/svg">
  <style>${levelCssRules()}${LIQUID_CSS}</style>
  <!-- 液位读数条：占满管内全高，scaleY 自底生长，颜色继承 use fill -->
  <rect class="ah-liquid" x="6" y="6" width="12" height="52" rx="6"/>
  <!-- 测量管壳：定色描边 -->
  <rect x="4" y="4" width="16" height="56" rx="8" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1.5"/>
  <!-- 刻度（右侧，主刻度 0/50/100%） -->
  <g stroke="rgba(0,0,0,0.55)" stroke-width="1">${TICKS}</g>
</svg>`

export const levelGauge: HmiSymbol = {
  id: 'ah-level-gauge', title: '液位计', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-level-gauge'),
  svg: SVG, width: 28, height: 64,
  props: {
    fill: { title: '读数条色', type: 'color', val: '#1677ff' },
    h: { title: '液位高度 %', type: 'number', val: 50 },
  },
  ports: [],
}
