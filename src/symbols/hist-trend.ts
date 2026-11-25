/**
 * 历史趋势（工业功能件 9/9，vue 型，浅色 HP-HMI 主题）：**历史**窗口的曲线，
 * 与 `ah-sparkline`（实时环形缓冲）分工不同——本图元消费宿主 BI 通道 B 的聚合信封
 * （`props.data.val`，契约见 lib/bi-contract.ts），是操作层画面里嵌入历史分析的入口。
 *
 * 为什么不用 `ah-bi-trend`：那 20 个 BI 图元硬编码深色面板令牌（BI_PANEL），
 * 塞进灰阶的操作层画面会像深色补丁；本图元用 HP-HMI 浅色卡片 + 暗蓝曲线。
 *
 * 数据面：宿主扫描本图元（tag 前缀 `ah-hist-`）→ 合并查询 → POST /history/batch →
 * 信封写回 props.data.val → 本组件 watch 解析渲染。**图元不自发请求**（架构裁定）。
 *
 * props 与 `ah-bi-trend` 同款（series/agg/interval/windowSecs/shape），外加：
 * - `min`/`max`：纵轴工程量程（缺省按数据自适应 + 10% 余量）
 * - `line_width`：曲线粗细
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'
import { HP } from './hp-hmi'

const THUMB = `<svg viewBox="0 0 460 150" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="458" height="148" rx="4" fill="#ffffff" stroke="#8a939d"/>
  <rect x="14" y="12" width="90" height="7" rx="2" fill="#5b6570"/>
  <polyline points="14,120 60,96 106,104 152,70 198,80 244,48 290,58 336,34 382,44 428,26" fill="none" stroke="#1f4e79" stroke-width="2"/>
  <polyline points="14,132 60,124 106,118 152,110 198,104 244,92 290,86 336,74 382,66 428,58" fill="none" stroke="#2e6b52" stroke-width="2"/>
</svg>`

export const histTrend: HmiSymbol = {
  id: 'ah-hist-trend', title: '历史趋势', type: 'vue', thumbnail: svgThumbnail(THUMB, 'ah-hist-trend'),
  width: 460, height: 150,
  props: {
    fill: { title: '强调色（边框）', type: 'color', val: HP.live },
    title: { title: '面板标题', type: 'input', val: '历史趋势' },
    series: {
      title: '序列配置（JSON，dev_id+tag）',
      type: 'textArea',
      val: '[{"dev_id":"dev_wm1","tag":"flow_rate","label":"1#水表","unit":"m³/h"}]',
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
    shape: { title: '取数形态', type: 'input', val: 'series' },
    data: { title: '数据通道（宿主写回）', type: 'textArea', val: '[]' },
    min: { title: '纵轴下限（缺省自适应）', type: 'number', val: 0 },
    max: { title: '纵轴上限（缺省自适应）', type: 'number', val: 0 },
    line_width: { title: '曲线粗细', type: 'number', val: 2 },
  },
  ports: [],
}
