/**
 * 质量徽标（工业功能件 5/8，vue 型）：GOOD / STALE / BAD。
 *
 * 语义：`0` 通信正常；`1` 数据陈旧（重连中/超时）；`2` 不可用（断链/认证失败）。
 * 不把"没数据"画成"正常"：STALE 黄、BAD 红，且文字必须出现（颜色 + 形状 + 文字）。
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'
import { HP } from './hp-hmi'

const THUMB = `<svg viewBox="0 0 130 28" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="128" height="26" rx="4" fill="#ffffff" stroke="#8a939d"/>
  <circle cx="13" cy="14" r="5" fill="#5b6570"/>
  <rect x="24" y="11" width="34" height="6" rx="2" fill="#5b6570"/>
  <rect x="66" y="11" width="50" height="6" rx="2" fill="#1f2328"/>
</svg>`

export const qualityBadge: HmiSymbol = {
  id: 'ah-quality-badge', title: '质量徽标', type: 'vue', thumbnail: svgThumbnail(THUMB, 'ah-quality-badge'),
  width: 130, height: 28,
  props: {
    fill: { title: '标签色', type: 'color', val: HP.inkDim },
    quality: { title: '质量（0 GOOD / 1 STALE / 2 BAD）', type: 'number', val: 0 },
    label: { title: '标签', type: 'input', val: '通信' },
  },
  ports: [],
}
