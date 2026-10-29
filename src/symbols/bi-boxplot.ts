/**
 * BI 分布箱线注册项（ah-bi-boxplot）——P3 图元族扩容。
 *
 * 图元定位：每条序列一个箱体（min/Q1/中位数/Q3/max），看窗口内取值的**分布与离群**
 * ——恒定负荷是扁箱、波动负荷是高箱。五数用线性插值分位（quantile，与尖峰阈值同款
 * 插值口径，审查问题2 的教训：nearest-rank 在并列值上失真）。
 * shape=series（箱线从逐桶点算分布，单值形态无分布可言）。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="4" fill="#161b22" stroke="#21262d"/>
  <text x="8" y="16" font-size="9" fill="#8b949e" font-family="monospace">箱线</text>
  <line x1="30" y1="26" x2="30" y2="58" stroke="#f5a623"/><rect x="20" y="34" width="20" height="16" fill="none" stroke="#f5a623" stroke-width="1.5"/>
  <line x1="70" y1="32" x2="70" y2="60" stroke="#58a6ff"/><rect x="60" y="40" width="20" height="14" fill="none" stroke="#58a6ff" stroke-width="1.5"/>
  <circle cx="30" cy="22" r="2" fill="#f85149"/>
</svg>`

export const biBoxplot: HmiSymbol = {
  id: 'ah-bi-boxplot',
  title: 'BI 分布箱线',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-boxplot'),
  width: 320,
  height: 220,
  props: {
    fill: { title: '强调色（首箱描边）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题', type: 'input', val: '负荷分布' },
    series: {
      title: '序列配置（JSON，每条序列一个箱）',
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

/** 线性插值分位（q∈[0,1]；输入须升序）。与 bi-spike 的 p90 同款插值口径。 */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN
  const pos = q * (sorted.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return lo === hi ? sorted[lo] : sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo])
}

/** 箱线五数：[min, Q1, 中位数, Q3, max]；空数据 → null。 */
export function boxplotStats(values: number[]): [number, number, number, number, number] | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  return [s[0], quantile(s, 0.25), quantile(s, 0.5), quantile(s, 0.75), s[s.length - 1]]
}
