/**
 * 迷你趋势（工业功能件 2/8，vue 型）：相邻窗口实时趋势，带限值线与 SP 线。
 * 数据来自 SSE 直写 props.value（watch 采样入环形缓冲），**不发起网络请求**——
 * 历史分析仍由 BI 通道（`bi-station`）承担。
 *
 * 几何算法与 faceplate 内嵌趋势共用 `spark-buffer.ts`（单一事实源）。
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'
import { HP } from './hp-hmi'

const THUMB = `<svg viewBox="0 0 260 90" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="258" height="88" rx="4" fill="#ffffff" stroke="#8a939d"/>
  <polyline points="8,64 36,52 64,58 92,38 120,44 148,26 176,34 204,20 232,28 252,18" fill="none" stroke="#1f4e79" stroke-width="2"/>
  <line x1="8" y1="30" x2="252" y2="30" stroke="#fbc02d" stroke-dasharray="4 3"/>
</svg>`

export const sparkline: HmiSymbol = {
  id: 'ah-sparkline', title: '迷你趋势', type: 'vue', thumbnail: svgThumbnail(THUMB, 'ah-sparkline'),
  width: 260, height: 90,
  props: {
    fill: { title: '曲线色', type: 'color', val: HP.live },
    label: { title: '标签', type: 'input', val: '趋势' },
    value: { title: '数值', type: 'number', val: 0 },
    min: { title: '量程下限', type: 'number', val: 0 },
    max: { title: '量程上限', type: 'number', val: 100 },
    show_limits: { title: '显示限值线', type: 'switch', val: false },
    ll: { title: 'LL 低低限', type: 'number', val: -99999 },
    l: { title: 'L 低限', type: 'number', val: -99999 },
    h: { title: 'H 高限', type: 'number', val: -99999 },
    hh: { title: 'HH 高高限', type: 'number', val: -99999 },
    show_sp: { title: '显示 SP 线', type: 'switch', val: false },
    sp: { title: '设定值 SP', type: 'number', val: 0 },
    window: { title: '窗口（秒）', type: 'number', val: 300 },
  },
  ports: [],
}
