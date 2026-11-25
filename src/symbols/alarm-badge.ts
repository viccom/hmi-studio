/**
 * 报警徽标（工业功能件 4/8，vue 型）：P1-P4 优先级 + 活动报警计数。
 *
 * 三重冗余：颜色（P1 红/P2 橙/P3 黄/P4 蓝）+ 形状（三角/六边/方/圆）+ 文字（`P1 ×2`）。
 * `prio=0` 显示"正常"中性态——正常态不出现饱和色。活动报警缓慢闪烁（`blink` 开关），
 * 对应 ISA-18.2 的"未确认需引起注意"；rs-iot 只有 clear 无 ack，清除即消失。
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'
import { HP } from './hp-hmi'

const THUMB = `<svg viewBox="0 0 140 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="138" height="30" rx="4" fill="#ffffff" stroke="#d32f2f"/>
  <path d="M14 6 L21 22 H7 Z" fill="#d32f2f"/>
  <rect x="28" y="12" width="44" height="8" rx="2" fill="#d32f2f"/>
  <rect x="80" y="12" width="26" height="8" rx="2" fill="#5b6570"/>
</svg>`

export const alarmBadge: HmiSymbol = {
  id: 'ah-alarm-badge', title: '报警徽标', type: 'vue', thumbnail: svgThumbnail(THUMB, 'ah-alarm-badge'),
  width: 140, height: 32,
  props: {
    fill: { title: '正常态色', type: 'color', val: HP.off },
    prio: { title: '优先级（0 正常 / 1 P1 … 4 P4）', type: 'number', val: 0 },
    count: { title: '活动报警数', type: 'number', val: 0 },
    label: { title: '标签', type: 'input', val: '报警' },
    blink: { title: '活动时闪烁', type: 'switch', val: true },
  },
  ports: [],
}
