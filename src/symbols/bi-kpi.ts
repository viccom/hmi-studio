/**
 * KPI 数字卡（BI 首批 vue 型图元）注册项。
 *
 * 是什么：一个主数值 + 单位 + 标签的数字卡，附内联 SVG 迷你趋势（sparkline）。
 * 组件：src/symbols/AhBiKpi.vue（不引 echarts——单折线不值一个图表实例）。
 *
 * 数据通道（通道 B，宿主写回）：宿主 ViewView 的聚合收集器把信封 JSON 串写进
 * 本图元 props.data.val（maotu props 直写），组件 watch 该 prop 自行解析渲染。
 * **图元不发请求、不轮询。**
 *
 * props（8 个，与组件 defineProps 一一对应）：
 * - fill：强调色（边框 + 主数值色）——lint 强制 color 型 fill
 * - title：面板标题（input；禁空串，jT 会把 '' 塞成 '#mt_slot' 占位串）
 * - series：查询规格 JSON 串（textArea），每条 {dev_id,tag,label,unit,mode,color}
 * - agg：聚合口径 select（avg/max/min/sum/count/last）
 * - interval：降采样桶宽（秒）
 * - windowSecs：统计窗长（秒）
 * - shape：取数形态 select（aggregate=整窗单值 / series=时间序列）
 * - data：运行时数据通道（textArea），宿主写回，组态员不填
 *
 * ports：[]（卡片不接工艺线）。
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="6" fill="#0d1117" stroke="#f5a623"/>
  <text x="10" y="20" fill="#8b949e" font-size="9" font-family="monospace">KPI</text>
  <text x="10" y="48" fill="#f5a623" font-size="26" font-weight="bold" font-family="monospace">12.5</text>
  <polyline points="10,68 32,62 54,65 76,54 98,58 110,48" fill="none" stroke="#39d353" stroke-width="1.5"/>
</svg>`

export const biKpi: HmiSymbol = {
  id: 'ah-bi-kpi', title: 'BI-KPI 数字卡', type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-kpi'),
  width: 200, height: 120,
  props: {
    fill: { title: '强调色（边框）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题', type: 'input', val: 'KPI 指标' },
    series: {
      title: '查询规格（JSON）',
      type: 'textArea',
      val: '[{"dev_id":"home-meter-e1","tag":"power","label":"1#电表","unit":"kW"}]',
    },
    agg: {
      title: '聚合口径',
      type: 'select',
      val: 'avg',
      options: [
        { value: 'avg', label: '平均值' },
        { value: 'max', label: '最大值' },
        { value: 'min', label: '最小值' },
        { value: 'sum', label: '求和' },
        { value: 'count', label: '计数' },
        { value: 'last', label: '末值' },
      ],
    },
    interval: { title: '桶宽（秒）', type: 'number', val: 60 },
    windowSecs: { title: '统计窗长（秒）', type: 'number', val: 3600 },
    shape: {
      title: '取数形态',
      type: 'select',
      val: 'both',
      options: [
        { value: 'aggregate', label: '整窗单值' },
        { value: 'series', label: '时间序列' },
        { value: 'both', label: '单值+时序（带迷你趋势）' },
      ],
    },
    data: { title: '运行时数据（宿主写回）', type: 'textArea', val: '[]' },
  },
  ports: [],
}
