/**
 * BI 日历热力注册项（ah-bi-calendar）——P3 图元族扩容。
 *
 * 图元定位：**按日一格**的日历热力（GitHub 贡献图形态）——天然要「按日聚合」的口径，
 * 故 interval 缺省 86400、windowSecs 缺省 30 天。每序列点 = 一天一值（ts 落在当天
 * 任意时刻都归当天），色深 = 值大小（visualMap 连续映射 暗底→序列色）。
 * 注意：窗口切换器把窗切到 1h 时日历只剩一格——组态提示语已注明该图元要长窗。
 * shape=series。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="4" fill="#161b22" stroke="#21262d"/>
  <text x="8" y="16" font-size="9" fill="#8b949e" font-family="monospace">日历</text>
  <g>
    <rect x="16" y="24" width="12" height="12" rx="2" fill="#1c2128"/><rect x="32" y="24" width="12" height="12" rx="2" fill="#3d2f12"/>
    <rect x="48" y="24" width="12" height="12" rx="2" fill="#f5a623"/><rect x="64" y="24" width="12" height="12" rx="2" fill="#6b5320"/>
    <rect x="16" y="40" width="12" height="12" rx="2" fill="#1c2128"/><rect x="32" y="40" width="12" height="12" rx="2" fill="#f5a623"/>
    <rect x="48" y="40" width="12" height="12" rx="2" fill="#8a6a28"/><rect x="64" y="40" width="12" height="12" rx="2" fill="#1c2128"/>
  </g>
</svg>`

export const biCalendar: HmiSymbol = {
  id: 'ah-bi-calendar',
  title: 'BI 日历热力',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-calendar'),
  width: 340,
  height: 220,
  props: {
    fill: { title: '强调色（热力高值色）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题', type: 'input', val: '每日用量热力' },
    series: {
      title: '序列配置（JSON，单序列；按日聚合看长窗）',
      type: 'textArea',
      val: '[{"dev_id":"home-meter-e1","tag":"energy_today","label":"1#电表","unit":"kWh","mode":"daily"}]',
    },
    agg: {
      title: '窗口聚合口径',
      type: 'select',
      val: 'last',
      options: [
        { value: 'avg', label: '平均' },
        { value: 'max', label: '最大' },
        { value: 'min', label: '最小' },
        { value: 'sum', label: '求和' },
        { value: 'count', label: '计数' },
        { value: 'last', label: '末值' },
      ],
    },
    interval: { title: '桶宽（秒）——按日填 86400', type: 'number', val: 86400 },
    windowSecs: { title: '统计窗（秒）——建议 ≥30 天', type: 'number', val: 2592000 },
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

/** 秒级 ts → 'YYYY-MM-DD'（本地时区——日历格按日归并对齐运行环境时区）。 */
export function dayKey(tsSec: number): string {
  const d = new Date(tsSec * 1000)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
