/**
 * 工艺管线（工业功能件 6/8，svg 型）：粗实线 + 流向箭头（ISA-5.1 工艺管线惯例）。
 * 正常态中性深灰（`HP.static`），竖直段由生成器用 `binfo.angle=90` 旋转，不另设变体；
 * 不做流动动画（HP-HMI 禁止常亮动画，流向由箭头表达）。
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'
import { HP } from './hp-hmi'

const SVG = `<svg viewBox="0 0 160 20" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="8" width="160" height="4"/>
  <path d="M48 3 L64 10 L48 17 Z"/>
  <path d="M144 3 L160 10 L144 17 Z"/>
</svg>`

export const pipe: HmiSymbol = {
  id: 'ah-pipe', title: '工艺管线', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-pipe'),
  svg: SVG, width: 160, height: 20,
  props: {
    fill: { title: '管线色', type: 'color', val: HP.static },
  },
  ports: [
    { type: 'in', position: 'leftTop', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
    { type: 'out', position: 'rightTop', offset: { x: { value: 0, unit: 'px' }, y: { value: 50, unit: '%' } } },
  ],
}
