/**
 * BI 仪表盘注册项（ah-bi-gauge）——P3 图元族扩容。
 *
 * 图元定位：有值序列各画一枚表盘（横排均分），指针 + 大号读数。
 * maxVal<=0 时按各序列值最大值 ×1.2 自动量程；>0 时用固定量程（利用率上限场景）。
 * shape=aggregate（整窗单值）。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="4" fill="#161b22" stroke="#21262d"/>
  <text x="8" y="16" font-size="9" fill="#8b949e" font-family="monospace">表盘</text>
  <path d="M20,58 A30,30 0 0 1 80,58" fill="none" stroke="#1c2128" stroke-width="8"/>
  <path d="M20,58 A30,30 0 0 1 66,34" fill="none" stroke="#f5a623" stroke-width="8"/>
  <line x1="50" y1="58" x2="66" y2="34" stroke="#c9d1d9" stroke-width="2"/>
  <text x="40" y="74" font-size="11" fill="#f5a623" font-family="monospace">3.2</text>
</svg>`

export const biGauge: HmiSymbol = {
  id: 'ah-bi-gauge',
  title: 'BI 仪表盘',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-gauge'),
  width: 280,
  height: 220,
  props: {
    fill: { title: '强调色（首枚表盘）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题', type: 'input', val: '实时表盘' },
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
    interval: { title: '桶宽（秒）', type: 'number', val: 60 },
    windowSecs: { title: '统计窗（秒）', type: 'number', val: 3600 },
    shape: {
      title: '取数形态',
      type: 'select',
      val: 'aggregate',
      options: [
        { value: 'aggregate', label: '整窗单值' },
        { value: 'series', label: '时间序列' },
        { value: 'both', label: '单值+时序' },
      ],
    },
    maxVal: { title: '量程上限（0=按数据自动）', type: 'number', val: 0 },
    data: { title: '数据通道（宿主写入）', type: 'textArea', val: '[]' },
  },
  ports: [],
}
