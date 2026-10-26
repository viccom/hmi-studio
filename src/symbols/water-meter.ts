/**
 * 水表盘（P2-B custom-svg 注册项 3/4）：机械字轮累计流量窗（0000.000，整数白底黑字/
 * 小数红底白字）+ 瞬时流量小指针盘（0~1 m³/h，gauge-math 纯函数）+ 逆向流红标记。
 * 数据面 home-meter-w1/w2：flow_total(m³ 累计)/flow_instant(m³/h)/reverse_flag(bool)。
 * - total/flow(number)：bind 直写；reverse(switch)：触发链 change_attr（成对收口）
 * - fill(color)：瞬时盘指针/弧色
 * - ports：[]（显示仪表不接工艺线）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const THUMB = `<svg viewBox="0 0 120 94" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="12" width="80" height="20" rx="3" fill="#111418" stroke="#30363d"/>
  <rect x="9" y="14" width="12" height="16" fill="#f5f5f5"/><rect x="24" y="14" width="12" height="16" fill="#f5f5f5"/>
  <rect x="39" y="14" width="12" height="16" fill="#f5f5f5"/><rect x="54" y="14" width="12" height="16" fill="#f5f5f5"/>
  <rect x="69" y="14" width="12" height="16" fill="#a40e0e"/>
  <path d="M 20 76 A 30 30 0 1 1 74 82" fill="none" stroke="#30363d" stroke-width="6" stroke-linecap="round"/>
  <path d="M 20 76 A 30 30 0 0 1 44 46" fill="none" stroke="#58a6ff" stroke-width="6" stroke-linecap="round"/>
  <line x1="47" y1="78" x2="62" y2="60" stroke="#58a6ff" stroke-width="2.5"/>
  <circle cx="47" cy="78" r="4" fill="#58a6ff"/>
</svg>`

export const waterMeter: HmiSymbol = {
  id: 'ah-water-meter', title: '水表盘', type: 'custom-svg', thumbnail: svgThumbnail(THUMB, 'ah-water-meter'),
  width: 180, height: 140,
  props: {
    fill: { title: '瞬时盘指针色', type: 'color', val: '#58a6ff' },
    total: { title: '累计流量（m³）', type: 'number', val: 0 },
    flow: { title: '瞬时流量（m³/h）', type: 'number', val: 0 },
    reverse: { title: '逆向流（bool）', type: 'switch', val: false },
  },
  ports: [],
}
