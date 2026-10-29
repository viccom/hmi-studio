/**
 * BI 利用率进度条注册项（ah-bi-progress）——P3 图元族扩容。
 *
 * 图元定位：自绘 DOM 横条（不worth 一个 echarts 实例，同 KPI sparkline 取舍）——
 * 每条序列一行：标签 + 进度条 + 百分比 + 读数。百分比 = value / maxVal（上限场景：
 * 容量/额定/阈值）；maxVal<=0 时按「各序列值最大值」做相对条（构成对比语义）。
 * 超 100% 截断显示但**保留红色越限提示**（谎报 100% 会掩盖超限事实）。
 * shape=aggregate。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="4" fill="#161b22" stroke="#21262d"/>
  <text x="8" y="16" font-size="9" fill="#8b949e" font-family="monospace">进度</text>
  <text x="8" y="34" font-size="8" fill="#8b949e" font-family="monospace">1#变</text>
  <rect x="34" y="27" width="76" height="8" rx="4" fill="#1c2128"/><rect x="34" y="27" width="57" height="8" rx="4" fill="#f5a623"/>
  <text x="8" y="54" font-size="8" fill="#8b949e" font-family="monospace">2#变</text>
  <rect x="34" y="47" width="76" height="8" rx="4" fill="#1c2128"/><rect x="34" y="47" width="30" height="8" rx="4" fill="#58a6ff"/>
</svg>`

export const biProgress: HmiSymbol = {
  id: 'ah-bi-progress',
  title: 'BI 利用率进度条',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-progress'),
  width: 320,
  height: 180,
  props: {
    fill: { title: '强调色（首条进度）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题', type: 'input', val: '容量利用率' },
    series: {
      title: '序列配置（JSON）',
      type: 'textArea',
      val: '[{"dev_id":"home-meter-e1","tag":"power","label":"1#电表","unit":"kW"},{"dev_id":"home-meter-e2","tag":"power","label":"2#电表","unit":"kW"}]',
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
    maxVal: { title: '满量程（0=按各序列最大值相对条）', type: 'number', val: 0 },
    data: { title: '数据通道（宿主写入）', type: 'textArea', val: '[]' },
  },
  ports: [],
}
