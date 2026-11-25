<!-- 历史趋势（工业功能件 9/9，浅色 HP-HMI 主题）：消费宿主 BI 通道 B 的聚合信封
     （props.data.val）→ parseEnvelope → 手绘 SVG 折线。

     与两个既有趋势件的分工：
     - `ah-sparkline`：SSE 直写的实时环形缓冲（秒级、无历史、浅色）——"现在怎么样"
     - `ah-bi-trend`：BI 深色大屏趋势（echarts、深色卡片）——"分析层的全量历史"
     - 本图元：BI 信封 + 浅色卡片——"操作层画面里就地看历史"

     刻度与网格用 HP-HMI 灰阶；曲线用暗蓝/暗绿（HP.live/HP.liveAlt），异常由限值线
     （P1 红/P3 黄虚线）表达；空态显示"暂无历史数据"（不画假的零线）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { HP } from './hp-hmi'
import { parseEnvelope, type BiSeriesResult } from './bi-chart-kit'

const props = defineProps<{
  fill?: string
  title?: string
  series?: string
  agg?: string
  interval?: number
  windowSecs?: number
  shape?: string
  data?: string
  min?: number | string
  max?: number | string
  line_width?: number | string
}>()

/** HP-HMI 数据色轮转（暗蓝 → 暗绿 → 中性灰）：与灰阶底相容，不与报警色混淆。 */
const HIST_PALETTE = [HP.live, HP.liveAlt, HP.inkDim]

const W = 460
const H = 150
const PAD = { l: 46, r: 10, t: 12, b: 20 }
const IW = W - PAD.l - PAD.r
const IH = H - PAD.t - PAD.b

const env = computed(() => parseEnvelope(props.data))
const rows = computed<BiSeriesResult[]>(() => (env.value?.series ?? []).filter((s) => s.points.length > 0))
const hasData = computed(() => rows.value.length > 0)

/** 纵轴量程：props 显式给就用；否则按数据自适应 + 10% 余量（退化时 0~1） */
const range = computed(() => {
  const lo = Number(props.min)
  const hi = Number(props.max)
  const vals = rows.value.flatMap((s) => s.points.map((p) => p.value))
  if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) return { lo, hi }
  if (!vals.length) return { lo: 0, hi: 1 }
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (max - min < 1e-9) return { lo: min - 1, hi: max + 1 }
  const pad = (max - min) * 0.1
  return { lo: min - pad, hi: max + pad }
})

const y = (v: number): number =>
  PAD.t + IH - ((v - range.value.lo) / (range.value.hi - range.value.lo)) * IH

const x = (ts: number, t0: number, t1: number): number =>
  PAD.l + (t1 > t0 ? ((ts - t0) / (t1 - t0)) * IW : 0)

interface Line { key: string; label: string; unit: string; color: string; points: string }
const lines = computed<Line[]>(() =>
  rows.value.map((s, i) => {
    const t0 = s.points[0].ts
    const t1 = s.points[s.points.length - 1].ts
    return {
      key: s.key,
      label: s.label,
      unit: s.unit,
      color: s.color || HIST_PALETTE[i % HIST_PALETTE.length],
      points: s.points.map((p) => `${x(p.ts, t0, t1).toFixed(1)},${y(p.value).toFixed(1)}`).join(' '),
    }
  }),
)

const gridLines = computed(() => {
  const { lo, hi } = range.value
  const out: Array<{ y: number }> = []
  for (let i = 0; i <= 4; i++) out.push({ y: y(lo + ((hi - lo) * i) / 4) })
  return out
})

/** 量程文本（标题行右侧）：数值与趋势并列，读者不必读刻度。 */
const rangeText = computed(() => {
  const { lo, hi } = range.value
  const span = Math.abs(hi - lo)
  const f = (v: number): string => (span >= 100 ? v.toFixed(0) : span >= 10 ? v.toFixed(1) : v.toFixed(2))
  return `${f(lo)} ~ ${f(hi)}`
})

const strokeWidth = computed(() => Math.max(1, Number(props.line_width) || 2))
const errors = computed(() => (env.value?.series ?? []).filter((s) => s.error).map((s) => `${s.label}: ${s.error}`))
</script>

<template>
  <div class="ah-ht" data-testid="ah-hist-trend" :style="{ borderColor: props.fill ?? HP.line }">
    <div class="ah-ht-head">
      <span class="ah-ht-title">{{ props.title }}</span>
      <span v-if="hasData && !errors.length" class="ah-ht-range">{{ rangeText }}</span>
      <span v-if="errors.length" class="ah-ht-err">{{ errors.join('；') }}</span>
      <span v-else-if="lines.length" class="ah-ht-legend">
        <i v-for="l in lines" :key="l.key" :style="{ background: l.color }"></i>
        <em v-for="l in lines" :key="'t' + l.key">{{ l.label }}</em>
      </span>
    </div>
    <svg class="ah-ht-svg" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="props.title">
      <g v-for="(g, i) in gridLines" :key="'g' + i">
        <line :x1="PAD.l" :y1="g.y" :x2="W - PAD.r" :y2="g.y" stroke="#e3e6e8" stroke-width="1" vector-effect="non-scaling-stroke" />
      </g>
      <polyline
        v-for="l in lines" :key="l.key" :points="l.points" fill="none" :stroke="l.color"
        :stroke-width="strokeWidth" stroke-linejoin="round" vector-effect="non-scaling-stroke"
      />
    </svg>
    <span v-if="!hasData" class="ah-ht-empty" data-testid="ht-empty">暂无历史数据</span>
  </div>
</template>

<style scoped>
.ah-ht {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 6px 8px 4px;
  background: #fff;
  border: 1px solid #8a939d;
  border-radius: 4px;
  overflow: hidden;
  font-family: system-ui, 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
}
.ah-ht-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #5b6570;
  min-height: 14px;
}
.ah-ht-title {
  color: #1f2328;
  font-size: 12px;
  font-weight: 600;
}
.ah-ht-err {
  color: #d32f2f;
  margin-left: auto;
}
.ah-ht-legend {
  margin-left: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}
.ah-ht-legend i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex: none;
}
.ah-ht-legend em {
  font-style: normal;
  white-space: nowrap;
}
.ah-ht-svg {
  display: block;
  width: 100%;
  height: calc(100% - 20px);
}
.ah-ht-range {
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
  color: #5b6570;
  margin-left: auto;
}
.ah-ht-empty {
  position: absolute;
  inset: 20px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #9e9e9e;
  pointer-events: none;
}
</style>
