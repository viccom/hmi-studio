/**
 * 状态徽标（工业功能件 3/8，vue 型）：运行/停止/故障/维护/离线。
 *
 * ISA-101 冗余编码：形状（圆/方/三角/菱形/圆+斜线）+ 颜色 + 文字三者同时表达状态，
 * 不依赖单一颜色（红绿色盲友好）。正常态文字用墨色，故障/维护才用饱和色。
 * `texts` 允许按设备语义改写（如阀门"关,开,故障"，默认"停止,运行,故障,维护,离线"）。
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'
import { HP } from './hp-hmi'

const THUMB = `<svg viewBox="0 0 140 30" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="138" height="28" rx="4" fill="#ffffff" stroke="#8a939d"/>
  <circle cx="14" cy="15" r="5" fill="#2e7d32"/>
  <rect x="26" y="12" width="52" height="6" rx="2" fill="#1f2328"/>
  <rect x="86" y="12" width="40" height="6" rx="2" fill="#5b6570"/>
</svg>`

export const statusBadge: HmiSymbol = {
  id: 'ah-status-badge', title: '状态徽标', type: 'vue', thumbnail: svgThumbnail(THUMB, 'ah-status-badge'),
  width: 140, height: 30,
  props: {
    fill: { title: '强调色', type: 'color', val: HP.inkDim },
    state: { title: '状态（0 停 / 1 运行 / 2 故障 / 3 维护 / 4 离线）', type: 'number', val: 1 },
    label: { title: '设备名', type: 'input', val: '设备' },
    texts: { title: '状态文字（逗号分隔，按 0-4 顺序）', type: 'input', val: '停止,运行,故障,维护,离线' },
  },
  ports: [],
}
