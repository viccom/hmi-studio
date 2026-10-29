/**
 * BI 多设备堆叠面积图注册项（ah-bi-stack-area）。
 *
 * 图元定位：多设备多色堆叠面积——总量与构成同时可读（堆叠上沿 = 总量，层厚 = 构成）。
 * 对标 Grafana「Hourly Power by Device」。
 * 数据通道 = 通道 B（宿主聚合收集器写 props.data.val），详见
 * src/symbols/AhBiStackArea.vue 头注释与
 * docs/plans/2026-10-29-bi-monitoring-dashboard-design.md。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="4" fill="#161b22" stroke="#21262d"/>
  <text x="8" y="16" font-size="9" fill="#8b949e" font-family="monospace">堆叠</text>
  <path d="M14,68 L34,52 L54,58 L74,34 L94,42 L110,26 L110,68 Z" fill="#1f6feb" opacity="0.8"/>
  <path d="M14,68 L34,60 L54,63 L74,48 L94,54 L110,44 L110,68 Z" fill="#f5a623" opacity="0.8"/>
  <polyline points="14,68 34,52 54,58 74,34 94,42 110,26" fill="none" stroke="#58a6ff" stroke-width="1.2"/>
</svg>`

export const biStackArea: HmiSymbol = {
  id: 'ah-bi-stack-area',
  title: 'BI 多设备堆叠面积图',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-stack-area'),
  width: 360,
  height: 220,
  props: {
    fill: { title: '强调色（标题色条）', type: 'color', val: '#58a6ff' },
    title: { title: '面板标题', type: 'input', val: '分设备功率堆叠' },
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
    interval: { title: '桶宽（秒）', type: 'number', val: 3600 },
    windowSecs: { title: '统计窗（秒）', type: 'number', val: 86400 },
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
