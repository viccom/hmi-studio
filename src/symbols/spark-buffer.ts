/**
 * 迷你趋势环形缓冲（工业功能件共用纯函数）：`ah-sparkline` 与 `ah-dev-faceplate`
 * 的内嵌趋势共用同一套采样/裁剪/路径算法，避免两处几何漂移。
 *
 * 约定：样本按时间升序；窗口外样本丢弃；上限 600 点（1280 画布下 300s 窗口 @2s
 * 采样约 150 点，留 4 倍余量）。非数值输入（SSE 坏值/空串）不产生样本。
 */

export interface SparkSample { t: number; v: number }

/** 追加一个样本并裁剪窗口（纯函数：返回新数组，不改入参） */
export function pushSample(
  buf: readonly SparkSample[],
  value: unknown,
  now: number,
  windowSecs: number,
): SparkSample[] {
  const v = Number(value)
  if (!Number.isFinite(v) || !Number.isFinite(now)) return buf as SparkSample[]
  const next = buf.slice(buf.length >= 600 ? buf.length - 599 : 0)
  next.push({ t: now, v })
  const cut = now - Math.max(1, Number(windowSecs) || 300) * 1000
  let i = 0
  while (i < next.length && next[i].t < cut) i++
  return i > 0 ? next.slice(i) : next
}

/** 值 → 画布内 x（0..w），时间线性映射；空缓冲返回 0 */
export function xOf(samples: readonly SparkSample[], w: number): (s: SparkSample) => number {
  if (samples.length === 0) return () => 0
  const t0 = samples[0].t
  const span = samples[samples.length - 1].t - t0 || 1
  return (s) => ((s.t - t0) / span) * w
}

/** 值 → 画布内 y（0..h），工程量程线性映射并夹紧；量程退化时居中 */
export function yOf(value: number, h: number, min: number, max: number): number {
  const lo = Number(min)
  const hi = Number(max)
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return h / 2
  const f = (value - lo) / (hi - lo)
  return h - Math.max(0, Math.min(1, f)) * h
}

/** 样本 → SVG polyline points 串（x,y x,y …） */
export function sparkPoints(
  samples: readonly SparkSample[],
  w: number,
  h: number,
  min: number,
  max: number,
): string {
  const x = xOf(samples, w)
  return samples.map((s) => `${x(s).toFixed(1)},${yOf(s.v, h, min, max).toFixed(1)}`).join(' ')
}
