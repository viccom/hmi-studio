/**
 * BI 多指标雷达注册项（ah-bi-radar）——P3 图元族扩容。
 *
 * 图元定位：每个有值序列 = 一根雷达轴（同量纲才可比，组态员负责），值 = 整窗单值，
 * 一个多边形看各指标相对强弱（如 两台电表负荷对比）。轴量程 = max(值)×1.2 自动
 * （nice 取整到 1/2/5×10^n），不给手工配置。
 * shape=aggregate。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="4" fill="#161b22" stroke="#21262d"/>
  <text x="8" y="16" font-size="9" fill="#8b949e" font-family="monospace">雷达</text>
  <polygon points="60,22 88,40 78,66 42,66 32,40" fill="none" stroke="#30363d"/>
  <polygon points="60,30 78,42 72,60 48,60 42,42" fill="#f5a623" opacity="0.35"/>
  <polygon points="60,30 78,42 72,60 48,60 42,42" fill="none" stroke="#f5a623"/>
</svg>`

export const biRadar: HmiSymbol = {
  id: 'ah-bi-radar',
  title: 'BI 多指标雷达',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-radar'),
  width: 300,
  height: 240,
  props: {
    fill: { title: '强调色（多边形描边）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题', type: 'input', val: '多指标对比' },
    series: {
      title: '序列配置（JSON，每条=一根轴；须同量纲）',
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
    data: { title: '数据通道（宿主写入）', type: 'textArea', val: '[]' },
  },
  ports: [],
}

import { niceMax } from './bi-chart-kit'

export { niceMax }
