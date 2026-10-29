/**
 * BI 尖峰柱图注册项（ah-bi-spike）。
 *
 * 图元定位：时间桶柱图 + **尖峰着色**——常态柱用序列色淡显，超过尖峰阈值的桶
 * 染语义红并画阈值虚线，一眼看出「什么时候用量异常抬升」。对标 Grafana
 * 「Power Spikes」面板（Home Energy Usage 示例盘）。
 *
 * 尖峰阈值三档（spikeMode）：
 * - p90：窗口内全部点的 90 分位（nearest-rank）——动态基线，推荐
 * - times：均值 × spikeTimes 倍——「平均的几倍算尖峰」
 * - fixed：绝对值 spikeThreshold（>0 才生效）
 *
 * 数据通道 = 通道 B（宿主聚合收集器写 props.data.val），shape 默认 series。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="4" fill="#161b22" stroke="#21262d"/>
  <text x="8" y="16" font-size="9" fill="#8b949e" font-family="monospace">尖峰</text>
  <rect x="16" y="52" width="10" height="20" fill="#f5a623" opacity="0.7"/>
  <rect x="32" y="44" width="10" height="28" fill="#f5a623" opacity="0.7"/>
  <rect x="48" y="58" width="10" height="14" fill="#f5a623" opacity="0.7"/>
  <rect x="64" y="18" width="10" height="54" fill="#f85149"/>
  <rect x="80" y="48" width="10" height="24" fill="#f5a623" opacity="0.7"/>
  <rect x="96" y="26" width="10" height="46" fill="#f85149"/>
  <line x1="12" y1="30" x2="110" y2="30" stroke="#f85149" stroke-width="1" stroke-dasharray="3 2"/>
</svg>`

export const biSpike: HmiSymbol = {
  id: 'ah-bi-spike',
  title: 'BI 尖峰柱图',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-spike'),
  width: 360,
  height: 220,
  props: {
    fill: { title: '强调色（标题色条/常态柱）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题', type: 'input', val: '功率尖峰' },
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
    spikeMode: {
      title: '尖峰阈值模式',
      type: 'select',
      val: 'p90',
      options: [
        { value: 'p90', label: 'P90 分位（动态）' },
        { value: 'times', label: '均值倍数' },
        { value: 'fixed', label: '固定阈值' },
      ],
    },
    spikeTimes: { title: '均值倍数（times 模式）', type: 'number', val: 2 },
    spikeThreshold: { title: '固定阈值（fixed 模式）', type: 'number', val: 0 },
    data: { title: '数据通道（宿主写入）', type: 'textArea', val: '[]' },
  },
  ports: [],
}

/**
 * 尖峰阈值（纯函数，组件与单测共用）。
 *
 * @param values 窗口内全部点的值（跨序列合并——尖峰是「总量分布」概念）
 * @param mode   p90 / times / fixed
 * @param times  times 模式的倍数（非正回落 2）
 * @param fixed  fixed 模式的绝对阈值（非正 → 无阈值 = 不染尖峰）
 * @returns 阈值；null = 无阈值（空数据或 fixed 未配置）
 *
 * p90 用**线性插值分位**而非 nearest-rank（深度审查问题2）：nearest-rank 在并列值上
 * 取到值本身（平坦数据阈值=原值），配合 ≥ 判定会把恒定负荷整图判成尖峰。
 * 插值分位平坦数据阈值=原值，组件侧用严格大于 → 零误报。
 */
export function spikeThreshold(
  values: number[],
  mode: string,
  times: number,
  fixed: number,
): number | null {
  if (!values.length) return null
  if (mode === 'fixed') return fixed > 0 ? fixed : null
  if (mode === 'times') {
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    return avg * (times > 0 ? times : 2)
  }
  // p90（线性插值）：pos = q×(n−1)，落在两值之间按比例内插
  const s = [...values].sort((a, b) => a - b)
  const pos = 0.9 * (s.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return lo === hi ? s[lo] : s[lo] + (pos - lo) * (s[hi] - s[lo])
}
