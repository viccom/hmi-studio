/**
 * BI 相关性散点注册项（ah-bi-scatter）——P3 图元族扩容。
 *
 * 图元定位：**两条序列按桶时间对齐**成 (x,y) 点云——序列1=X 轴、序列2=Y 轴
 * （如 功率×电流 看线性度、流量×压力 看泵特性）。对齐用**精确 ts 匹配**
 * （pairByTs 纯函数）：同面板同 interval 降采样后两序列桶 ts 一致，
 * 不一致处（某序列该桶缺数）丢弃——不猜插值。
 * shape=series。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="4" fill="#161b22" stroke="#21262d"/>
  <text x="8" y="16" font-size="9" fill="#8b949e" font-family="monospace">散点</text>
  <line x1="18" y1="66" x2="108" y2="66" stroke="#30363d"/><line x1="18" y1="66" x2="18" y2="22" stroke="#30363d"/>
  <circle cx="30" cy="56" r="3" fill="#f5a623"/><circle cx="44" cy="48" r="3" fill="#f5a623"/>
  <circle cx="56" cy="52" r="3" fill="#f5a623"/><circle cx="70" cy="38" r="3" fill="#f5a623"/>
  <circle cx="84" cy="30" r="3" fill="#f5a623"/><circle cx="96" cy="34" r="3" fill="#f85149"/>
</svg>`

export const biScatter: HmiSymbol = {
  id: 'ah-bi-scatter',
  title: 'BI 相关性散点',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-scatter'),
  width: 320,
  height: 220,
  props: {
    fill: { title: '强调色（点色）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题', type: 'input', val: '功率 × 电流' },
    series: {
      title: '序列配置（JSON）——第1条=X轴，第2条=Y轴',
      type: 'textArea',
      val: '[{"dev_id":"home-meter-e1","tag":"power","label":"功率","unit":"kW"},{"dev_id":"home-meter-e1","tag":"current","label":"电流","unit":"A"}]',
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
        { value: 'both', label: '单值+时序' },
      ],
    },
    data: { title: '数据通道（宿主写入）', type: 'textArea', val: '[]' },
  },
  ports: [],
}

/** 散点对齐点（ts 秒）。 */
export interface BiPoint {
  ts: number
  value: number
}

/**
 * 按 ts 精确匹配把两条序列配成 (x,y) 点对（X=第一条，Y=第二条）。
 * 同 interval 降采样后桶 ts 一致；单边缺桶的 ts 丢弃（不猜插值）。
 */
export function pairByTs(xs: BiPoint[], ys: BiPoint[]): Array<[number, number]> {
  const yByTs = new Map(ys.map((p) => [p.ts, p.value]))
  const out: Array<[number, number]> = []
  for (const p of xs) {
    const y = yByTs.get(p.ts)
    if (y !== undefined) out.push([p.value, y])
  }
  return out
}
