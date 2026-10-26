/**
 * 趋势图表（P2 vue 型注册项）：echarts 折线趋势 × 3 曲线（core + line 按需引入）。
 *
 * 数据通道机制（P2 实测裁定，组态与绑定说明）：
 * - 图元**不自开 SSE 连接、不轮询**——宿主 ViewView 的 setDevicePointByID 直写通道是唯一入口：
 *   把每个 SSE field 绑到一个 tick（bind_attr = props.tick0.val / tick1 / tick2），
 *   组件 watch 三通道 prop → 环形缓冲（trend-buffer 纯函数：容量=窗口/采样估算、滚动窗裁剪）
 *   → setOption 节流 ≥1s 重绘。曲线 k ↔ 通道 k ↔ points[k] 一一对应。
 * - points（textArea JSON 串）= 曲线元数据 [{field,label,unit,color}]，≤3 条；
 *   field 仅作组态对照（与对应 bind_id 填同值），取数完全靠 tick 直写。
 * - tick 用 number 描述符（缺省 0）：v1.1 §2.2 的 input 空串禁令（VUE_EMPTY_STR）下，
 *   数据通道语义本就是数值点位——number 型天然合规，bind 直写数字/数字串均可（组件归一）。
 * - fill = 强调色（容器边框），可绑告警变色。
 * - ports：[]（图表不接工艺线）。
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="6" fill="#0d1117" stroke="#f5a623"/>
  <line x1="22" y1="10" x2="22" y2="66" stroke="#30363d"/>
  <line x1="22" y1="66" x2="112" y2="66" stroke="#30363d"/>
  <polyline points="26,58 44,50 60,54 76,34 92,40 108,22" fill="none" stroke="#f5a623" stroke-width="2"/>
  <polyline points="26,62 44,60 60,52 76,56 92,44 108,48" fill="none" stroke="#39d353" stroke-width="2"/>
</svg>`

export const trendChart: HmiSymbol = {
  id: 'ah-trend-chart', title: '趋势图表', type: 'vue', thumbnail: svgThumbnail(THUMB, 'ah-trend-chart'),
  width: 220, height: 150,
  props: {
    fill: { title: '强调色（边框）', type: 'color', val: '#f5a623' },
    points: {
      title: '曲线配置（JSON，≤3 条）',
      type: 'textArea',
      val: '[{"field":"devid.tag","label":"曲线1","unit":"","color":"#f5a623"}]',
    },
    tick0: { title: '数据通道 0（绑定用）', type: 'number', val: 0 },
    tick1: { title: '数据通道 1（绑定用）', type: 'number', val: 0 },
    tick2: { title: '数据通道 2（绑定用）', type: 'number', val: 0 },
    windowSecs: { title: '趋势窗口（秒）', type: 'number', val: 600 },
    yUnit: { title: 'Y 轴单位', type: 'input', val: 'kW' },
  },
  ports: [],
}
