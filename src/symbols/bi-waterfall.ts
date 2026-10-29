/**
 * BI 增量贡献瀑布注册项（ah-bi-waterfall）——P3 图元族扩容。
 *
 * 图元定位：各序列的整窗值按序**累叠**（每根柱悬浮在「之前各柱之和」上），
 * 末列「合计」落底——看「总量由谁贡献多少」（如 各表用量 → 总用量）。
 * 浮柱 = 两根 stack 柱叠成（透明基座 + 值段），合计列基座归零。
 * shape=aggregate。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="4" fill="#161b22" stroke="#21262d"/>
  <text x="8" y="16" font-size="9" fill="#8b949e" font-family="monospace">瀑布</text>
  <rect x="18" y="46" width="16" height="20" fill="#f5a623"/>
  <rect x="42" y="34" width="16" height="12" fill="#39d353"/>
  <rect x="66" y="24" width="16" height="10" fill="#58a6ff"/>
  <rect x="90" y="24" width="16" height="42" fill="#bc8cff"/>
  <line x1="14" y1="68" x2="110" y2="68" stroke="#30363d"/>
</svg>`

export const biWaterfall: HmiSymbol = {
  id: 'ah-bi-waterfall',
  title: 'BI 增量贡献瀑布',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-waterfall'),
  width: 340,
  height: 220,
  props: {
    fill: { title: '强调色（合计列）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题', type: 'input', val: '用量构成瀑布' },
    series: {
      title: '序列配置（JSON，同量纲才可加和）',
      type: 'textArea',
      val: '[{"dev_id":"home-meter-e1","tag":"energy_today","label":"1#电表","unit":"kWh","mode":"daily"},{"dev_id":"home-meter-e2","tag":"energy_today","label":"2#电表","unit":"kWh","mode":"daily"}]',
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
    interval: { title: '桶宽（秒）', type: 'number', val: 300 },
    windowSecs: { title: '统计窗（秒）', type: 'number', val: 86400 },
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

/** 一根浮柱：基座高（透明段）+ 值段高。 */
export interface WaterfallBar {
  start: number
  delta: number
}

/**
 * 瀑布浮柱几何：按序累叠。负值序列（反向贡献）同样成立——基座取「当前累加值与
 * 累加后的较小者」，值段为 |delta|（echarts 用基座+值段两根 stack 柱渲染）。
 */
export function waterfallBars(values: number[]): WaterfallBar[] {
  const out: WaterfallBar[] = []
  let run = 0
  for (const v of values) {
    const next = run + v
    out.push({ start: Math.min(run, next), delta: Math.abs(v) })
    run = next
  }
  return out
}
