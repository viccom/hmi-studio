/**
 * BI 时段热力图注册项（ah-bi-heat）。
 *
 * 图元定位：「时间桶 × 序列」矩阵热力——峰谷时段分布、一周 × 24h 负荷热力。
 * 数据通道 = 通道 B（宿主聚合收集器写 props.data.val），详见
 * src/symbols/AhBiHeat.vue 头注释与
 * docs/plans/2026-10-29-bi-monitoring-dashboard-design.md。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="24" y="16" width="14" height="12" fill="#1f6feb"/>
  <rect x="40" y="16" width="14" height="12" fill="#f5a623"/>
  <rect x="56" y="16" width="14" height="12" fill="#f85149"/>
  <rect x="72" y="16" width="14" height="12" fill="#1f6feb"/>
  <rect x="24" y="30" width="14" height="12" fill="#0d1117" stroke="#30363d"/>
  <rect x="40" y="30" width="14" height="12" fill="#1f6feb"/>
  <rect x="56" y="30" width="14" height="12" fill="#f5a623"/>
  <rect x="72" y="30" width="14" height="12" fill="#0d1117" stroke="#30363d"/>
  <text x="10" y="14" font-size="9" fill="#8b949e">热力</text>
</svg>`

export const biHeat: HmiSymbol = {
  id: 'ah-bi-heat',
  title: 'BI 时段热力图',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-heat'),
  width: 320,
  height: 220,
  props: {
    fill: { title: '强调色（边框）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题', type: 'input', val: '时段负荷热力' },
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
    interval: { title: '桶宽（秒）', type: 'number', val: 300 },
    windowSecs: { title: '统计窗（秒）', type: 'number', val: 86400 },
    shape: {
      title: '取数形态',
      type: 'select',
      val: 'series',
      options: [
        { value: 'aggregate', label: '整窗单值' },
        { value: 'series', label: '时间序列' },
      ],
    },
    data: { title: '数据通道（宿主写入）', type: 'textArea', val: '[]' },
  },
  ports: [],
}
