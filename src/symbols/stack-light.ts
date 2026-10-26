/**
 * 三色警示灯（批 B custom-svg 型注册项）：红/黄/绿三段独立 bool prop（ANDON 红上/黄中/绿下），
 * 各自可接触发链（triggers → props.red.val 等直写 true/false）；灯亮段高亮 + 半透明光晕。
 * fill(color) = 灯杆/底座色（lint FILL_MISSING 统一约定的承载位）。
 * - ports：[]（信号灯不接工艺线）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const THUMB = `<svg viewBox="0 0 64 120" xmlns="http://www.w3.org/2000/svg">
  <rect x="16" y="12" width="32" height="26" rx="6" fill="#f5222d" opacity="0.3"/>
  <rect x="20" y="14" width="24" height="22" rx="5" fill="#f5222d"/>
  <rect x="20" y="44" width="24" height="22" rx="5" fill="#262d36" stroke="#3a424c"/>
  <rect x="16" y="72" width="32" height="26" rx="6" fill="#52c41a" opacity="0.3"/>
  <rect x="20" y="74" width="24" height="22" rx="5" fill="#52c41a"/>
  <rect x="29" y="96" width="6" height="16" fill="#57606a"/>
  <rect x="16" y="110" width="32" height="8" rx="2" fill="#57606a"/>
</svg>`

export const stackLight: HmiSymbol = {
  id: 'ah-stack-light', title: '三色警示灯', type: 'custom-svg', thumbnail: svgThumbnail(THUMB, 'ah-stack-light'),
  width: 64, height: 120,
  props: {
    fill: { title: '灯杆/底座色', type: 'color', val: '#57606a' },
    red: { title: '红灯亮', type: 'switch', val: false },
    yellow: { title: '黄灯亮', type: 'switch', val: false },
    green: { title: '绿灯亮', type: 'switch', val: true },
  },
  ports: [],
}
