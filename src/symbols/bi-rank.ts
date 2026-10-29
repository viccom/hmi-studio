/**
 * 排名条形图（BI 首批 vue 型图元）注册项。
 *
 * 是什么：多序列按整窗单值降序排名的**横向条形图**（label 在左、条在中、数值在右）。
 * 组件：src/symbols/AhBiRank.vue（echarts 按需引入 BarChart + Grid + Tooltip）。
 *
 * 数据通道（通道 B，宿主写回）：宿主 ViewView 的聚合收集器把信封 JSON 串写进
 * 本图元 props.data.val（maotu props 直写），组件 watch 该 prop 自行解析渲染。
 * **图元不发请求、不轮询。**
 *
 * props（8 个，与组件 defineProps 一一对应）：
 * - fill：强调色（边框）——lint 强制 color 型 fill
 * - title：面板标题（input；禁空串，jT 会把 '' 塞成 '#mt_slot' 占位串）
 * - series：查询规格 JSON 串（textArea），每条 {dev_id,tag,label,unit,mode,color}
 * - agg：聚合口径 select（avg/max/min/sum/count/last）
 * - interval：降采样桶宽（秒）
 * - windowSecs：统计窗长（秒）
 * - shape：取数形态 select（aggregate=整窗单值 / series=时间序列）
 * - data：运行时数据通道（textArea），宿主写回，组态员不填
 *
 * ports：[]（图表不接工艺线）。
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="6" fill="#0d1117" stroke="#f5a623"/>
  <rect x="46" y="10" width="58" height="9" rx="2" fill="#f5a623"/>
  <rect x="52" y="26" width="40" height="9" rx="2" fill="#39d353"/>
  <rect x="42" y="42" width="24" height="9" rx="2" fill="#58a6ff"/>
  <rect x="50" y="58" width="14" height="9" rx="2" fill="#bc8cff"/>
  <text x="12" y="18" fill="#8b949e" font-size="7" font-family="monospace">1</text>
  <text x="12" y="34" fill="#8b949e" font-size="7" font-family="monospace">2</text>
  <text x="12" y="50" fill="#8b949e" font-size="7" font-family="monospace">3</text>
</svg>`

export const biRank: HmiSymbol = {
  id: 'ah-bi-rank', title: 'BI-排名条形', type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-rank'),
  width: 280, height: 200,
  props: {
    fill: { title: '强调色（边框）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题', type: 'input', val: '设备排名' },
    series: {
      title: '查询规格（JSON）',
      type: 'textArea',
      val: '[{"dev_id":"home-meter-e1","tag":"energy","label":"1#电表","unit":"kWh"}]',
    },
    agg: {
      title: '聚合口径',
      type: 'select',
      val: 'last',
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
      val: 'aggregate',
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
