/**
 * 仪表几何纯函数（批 B）：vue/custom-svg 图元的计算几何统一在此（§4.2 路线的合法化
 * 前提——纯函数可脱离 maotu 单测，组件模板只消费）。
 * 角度约定：SVG 坐标系 y 向下，deg 为「SVG 极角」（0=右，90=下，180=左，270=上）；
 * 视觉顺时针 = 极角递增。压力表盘量程扫过 240°：min@150°（左下）→ max@390°≡30°（右下），
 * 经顶部——指针角度 = f(value, min, max) 的单一事实源。
 */

export const GAUGE_SWEEP_DEG = 240
export const GAUGE_START_DEG = 150

/** 数值限幅：NaN → fallback（绑定点位可能给非数串，指针不得飞出盘面） */
export function clampNum(v: unknown, min: number, max: number, fallback = min): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** 量程比例 t∈[0,1]（限幅后） */
export function fracOf(value: unknown, min: number, max: number): number {
  const lo = Math.min(min, max), hi = Math.max(min, max)
  return (clampNum(value, lo, hi, lo) - lo) / (hi - lo || 1)
}

/** 指针极角（deg）：min→150°，max→390°（≡30°），线性内插 */
export function gaugeAngle(value: unknown, min: number, max: number): number {
  return GAUGE_START_DEG + fracOf(value, min, max) * GAUGE_SWEEP_DEG
}

/** 极角 → 直角坐标（deg） */
export function polarPt(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/** 表盘进度弧 path（stroke 用）：自 min 角扫到当前值角；>180° 走大弧标志 */
export function gaugeArcPath(cx: number, cy: number, r: number, value: unknown, min: number, max: number): string {
  const a0 = GAUGE_START_DEG
  const a1 = gaugeAngle(value, min, max)
  const p0 = polarPt(cx, cy, r, a0)
  const p1 = polarPt(cx, cy, r, a1)
  const largeArc = a1 - a0 > 180 ? 1 : 0
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`
}

/** 温度计液面 y（viewBox 内几何）：t=0 → tubeBottom（空），t=1 → tubeTop（满） */
export function thermoY(value: unknown, min: number, max: number, tubeTop: number, tubeBottom: number): number {
  const t = fracOf(value, min, max)
  return tubeBottom - t * (tubeBottom - tubeTop)
}

/** 选择开关旋钮指针极角：value 0/1/2 → -45°/0°/45°（非法值回落 0 档） */
export function selectorAngle(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return [-45, 0, 45][Number.isFinite(n) ? Math.min(2, Math.max(0, Math.round(n))) : 0]
}
