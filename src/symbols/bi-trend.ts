/**
 * BI 多序列趋势图注册项（ah-bi-trend）。
 *
 * 图元定位：时间序列折线（多序列同图对比）——功率/流量随时间的变化。
 * 数据通道 = 通道 B（宿主聚合收集器写 props.data.val），详见
 * src/symbols/AhBiTrend.vue 头注释与
 * docs/plans/2026-10-29-bi-monitoring-dashboard-design.md。
 *
 * 与既有 ah-trend-chart 的分工：后者走 SSE 直写（实时环形缓冲），本图元走宿主
 * 聚合（历史窗口降采样序列）——数据源不同，不可互换。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <polyline points="10,60 30,40 50,48 70,24 90,32 110,16" fill="none" stroke="#f5a623" stroke-width="2"/>
  <polyline points="10,68 30,58 50,62 70,50 90,54 110,46" fill="none" stroke="#39d353" stroke-width="2"/>
  <text x="10" y="14" font-size="9" fill="#8b949e">趋势</text>
</svg>`

export const biTrend: HmiSymbol = {
  id: 'ah-bi-trend',
  title: 'BI 多序列趋势图',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-trend'),
  width: 320,
  height: 200,
  props: {
    fill: { title: '强调色（边框）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题', type: 'input', val: '功率趋势' },
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
