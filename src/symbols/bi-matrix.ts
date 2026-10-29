/**
 * BI 设备 × 时间矩阵热力图注册项（ah-bi-matrix）。
 *
 * 图元定位：设备 × 时间桶的矩阵热力——行=设备、列=时间桶、格色=该时段量值。
 * 对标 Grafana「Month Power Total」：密集小格，一眼看出「哪台设备在哪个时段高」。
 * 数据通道 = 通道 B（宿主聚合收集器写 props.data.val），详见
 * src/symbols/AhBiMatrix.vue 头注释与
 * docs/plans/2026-10-29-bi-monitoring-dashboard-design.md。
 *
 * 与既有 ah-bi-heat 的分工：ah-bi-heat 是「单序列 × 时段」的峰谷热力；
 * 本图元是**多设备 × 时段**的对照矩阵（多行设备 → 需要列桶对齐 + 连续色阶）。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="4" fill="#161b22" stroke="#21262d"/>
  <text x="8" y="16" font-size="9" fill="#8b949e" font-family="monospace">矩阵</text>
  <rect x="30" y="22" width="18" height="12" fill="#0b3d5c"/>
  <rect x="50" y="22" width="18" height="12" fill="#1f6feb"/>
  <rect x="70" y="22" width="18" height="12" fill="#f5a623"/>
  <rect x="90" y="22" width="18" height="12" fill="#f85149"/>
  <rect x="30" y="36" width="18" height="12" fill="#1f6feb"/>
  <rect x="50" y="36" width="18" height="12" fill="#0b3d5c"/>
  <rect x="70" y="36" width="18" height="12" fill="#f5a623"/>
  <rect x="90" y="36" width="18" height="12" fill="#1f6feb"/>
  <rect x="30" y="50" width="18" height="12" fill="#0b3d5c"/>
  <rect x="50" y="50" width="18" height="12" fill="#f85149"/>
  <rect x="70" y="50" width="18" height="12" fill="#1f6feb"/>
  <rect x="90" y="50" width="18" height="12" fill="#0b3d5c"/>
</svg>`

export const biMatrix: HmiSymbol = {
  id: 'ah-bi-matrix',
  title: 'BI 设备×时间矩阵热力图',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-matrix'),
  width: 360,
  height: 220,
  props: {
    fill: { title: '强调色（标题色条）', type: 'color', val: '#58a6ff' },
    title: { title: '面板标题', type: 'input', val: '设备×时段矩阵' },
    series: {
      title: '序列配置（JSON，dev_id+tag）',
      type: 'textArea',
      val: '[{"dev_id":"home-meter-e1","tag":"power","label":"1#电表","unit":"kW"}]',
    },
    agg: {
      title: '窗口聚合口径',
      type: 'select',
      val: 'avg',
      options: [
        { value: 'avg', label: '平均' },
        { value: 'max', label: '最大' },
        { value: 'min', label: '最小' },
        { value: 'sum', label: '求和' },
        { value: 'count', label: '计数' },
        { value: 'last', label: '末值' },
      ],
    },
    interval: { title: '桶宽（秒）', type: 'number', val: 3600 },
    windowSecs: { title: '统计窗（秒）', type: 'number', val: 86400 },
    shape: {
      title: '取数形态',
      type: 'select',
      val: 'series',
      options: [
        { value: 'aggregate', label: '整窗单值' },
        { value: 'series', label: '时间序列' },
        { value: 'both', label: '单值+时序' },
      ],
    },
    data: { title: '数据通道（宿主写入）', type: 'textArea', val: '[]' },
  },
  ports: [],
}
