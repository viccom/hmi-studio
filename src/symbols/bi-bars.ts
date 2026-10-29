/**
 * BI 时间段柱状图注册项（ah-bi-bars）。
 *
 * 图元定位：按时间桶出柱——「近 N 日/时用量」这类离散区间对比。
 * 对标 Grafana「Last 7 Days Power Usage」。
 * 桶宽由 props.interval 决定（3600 → 每小时一根柱；86400 → 每天一根柱），
 * 标签精度随之切换（HH:mm / MM-DD / MM-DD HH:mm）。
 * 数据通道 = 通道 B（宿主聚合收集器写 props.data.val），详见
 * src/symbols/AhBiBars.vue 头注释与
 * docs/plans/2026-10-29-bi-monitoring-dashboard-design.md。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="4" fill="#161b22" stroke="#21262d"/>
  <text x="8" y="16" font-size="9" fill="#8b949e" font-family="monospace">时段用量</text>
  <rect x="16" y="50" width="12" height="20" fill="#58a6ff"/>
  <rect x="32" y="38" width="12" height="32" fill="#58a6ff"/>
  <rect x="48" y="56" width="12" height="14" fill="#58a6ff"/>
  <rect x="64" y="28" width="12" height="42" fill="#58a6ff"/>
  <rect x="80" y="44" width="12" height="26" fill="#58a6ff"/>
  <rect x="96" y="34" width="12" height="36" fill="#58a6ff"/>
  <line x1="12" y1="70" x2="112" y2="70" stroke="#30363d" stroke-width="1"/>
</svg>`

export const biBars: HmiSymbol = {
  id: 'ah-bi-bars',
  title: 'BI 时间段柱状图',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-bars'),
  width: 360,
  height: 220,
  props: {
    fill: { title: '强调色（标题色条）', type: 'color', val: '#58a6ff' },
    title: { title: '面板标题', type: 'input', val: '近 7 日用量' },
    series: {
      title: '序列配置（JSON，dev_id+tag）',
      type: 'textArea',
      val: '[{"dev_id":"home-meter-e1","tag":"power","label":"1#电表","unit":"kW"}]',
    },
    agg: {
      title: '窗口聚合口径',
      type: 'select',
      val: 'sum',
      options: [
        { value: 'avg', label: '平均' },
        { value: 'max', label: '最大' },
        { value: 'min', label: '最小' },
        { value: 'sum', label: '求和' },
        { value: 'count', label: '计数' },
        { value: 'last', label: '末值' },
      ],
    },
    interval: { title: '桶宽（秒）', type: 'number', val: 86400 },
    windowSecs: { title: '统计窗（秒）', type: 'number', val: 604800 },
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
