/**
 * BI 明细数据表注册项（ah-bi-table）。
 *
 * 图元定位：多序列指标明细表——设备台账 + 关键指标清单（BI 大屏 C 区）。
 * 数据通道 = 通道 B（宿主聚合收集器写 props.data.val），详见
 * src/symbols/AhBiTable.vue 头注释与
 * docs/plans/2026-10-29-bi-monitoring-dashboard-design.md。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="16" width="100" height="12" fill="#21262d"/>
  <rect x="10" y="34" width="100" height="12" fill="#161b22" stroke="#30363d"/>
  <rect x="10" y="52" width="100" height="12" fill="#161b22" stroke="#30363d"/>
  <text x="14" y="26" font-size="8" fill="#8b949e">明细</text>
</svg>`

export const biTable: HmiSymbol = {
  id: 'ah-bi-table',
  title: 'BI 明细数据表',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-table'),
  width: 320,
  height: 200,
  props: {
    fill: { title: '强调色（边框）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题', type: 'input', val: '设备指标明细' },
    series: {
      title: '序列配置（JSON，dev_id+tag）',
      type: 'textArea',
      val: '[{"dev_id":"home-meter-e1","tag":"power","label":"1#电表 功率","unit":"kW"}]',
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
    interval: { title: '桶宽（秒）', type: 'number', val: 0 },
    windowSecs: { title: '统计窗（秒）', type: 'number', val: 86400 },
    shape: {
      title: '取数形态',
      type: 'select',
      val: 'aggregate',
      options: [
        { value: 'aggregate', label: '整窗单值' },
        { value: 'series', label: '时间序列' },
      ],
    },
    data: { title: '数据通道（宿主写入）', type: 'textArea', val: '[]' },
  },
  ports: [],
}
