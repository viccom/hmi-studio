/**
 * 状态时长/构成堆叠条注册项（ah-bi-stack）。
 *
 * 图元定位：多序列「占比构成」横向百分比堆叠条——电/水/气 用量构成、各设备占比
 * 这类构成分析（BI 大屏 C 区）。数据通道 = 通道 B（宿主聚合收集器写 props.data.val），
 * 详见 src/symbols/AhBiStack.vue 头注释与
 * docs/plans/2026-10-29-bi-monitoring-dashboard-design.md。
 *
 * props 契约（8 个，与全部 BI 图元一致）：
 * - fill 强调色 / title 面板标题 / series 查询规格 JSON 串 / agg 窗口聚合口径
 * - interval 桶宽 / windowSecs 统计窗 / shape 取数形态 / data 运行时数据通道
 *
 * 注册项约定（maotu 0.6.5 bundle 实证，见 docs/maotu-symbol-development-guide.md）：
 * - id 以 ah- 前缀（canvas 实例 id = `${id}-${n}`，E2E 依赖 [id^="ah-"] 前缀）
 * - type vue → 渲染时 maotu 解析全局组件名 = vueTagFor(id)（symbols/index.ts）
 * - 缩略图走 kit.svgThumbnail（注入 data-ah-id，E2E 定位锚 img[src*="ah-bi-stack"]）
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="30" width="42" height="18" fill="#f5a623"/>
  <rect x="52" y="30" width="30" height="18" fill="#39d353"/>
  <rect x="82" y="30" width="28" height="18" fill="#58a6ff"/>
  <text x="10" y="22" font-size="9" fill="#8b949e">构成</text>
</svg>`

export const biStack: HmiSymbol = {
  id: 'ah-bi-stack',
  title: 'BI 构成堆叠条',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-stack'),
  width: 240,
  height: 120,
  props: {
    fill: { title: '强调色（边框）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题', type: 'input', val: '用量构成' },
    series: {
      title: '序列配置（JSON，dev_id+tag）',
      type: 'textArea',
      val: '[{"dev_id":"home-meter-e1","tag":"energy_today","label":"1#电表","unit":"kWh"}]',
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
        { value: 'both', label: '单值+时序（带迷你趋势）' },
      ],
    },
    data: { title: '数据通道（宿主写入）', type: 'textArea', val: '[]' },
  },
  ports: [],
}
