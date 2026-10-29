<!--
  BI 尖峰柱图（ah-bi-spike，vue 型）。
  ┌─ 数据通道（通道 B）───────────────────────────────────────────────
  │ 宿主聚合收集器把信封 JSON 串写进 props.data，本组件 watch → parseEnvelope
  │ → 柱图渲染。图元不发请求、不轮询。
  └────────────────────────────────────────────────────────────────────
  语义：时间桶柱图 + 尖峰着色——常态柱 = 序列色淡显，≥阈值染红 + 阈值虚线。
  阈值三档：p90 分位（动态）/ 均值倍数 / 固定值（见 bi-spike.ts spikeThreshold）。

  三条易错点（与 AhBiStackArea 同款，勿改回）：
  1. **刻度单位是秒**：echarts time 轴把数值当毫秒——轴标签/tooltip 必须自带
     formatter（formatShort 吃秒），且 min/max 显式钉住防 nice 外扩。
  2. **图表容器常驻 DOM**：空态用覆盖层（v-if 会废止 onMounted 的容器引用）。
  3. **尖峰判定逐点着色**：itemStyle 下沉到 data 点级（series 级 color 只管常态柱）。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components'
import {
  BI_PANEL,
  BI_THEME,
  formatShort,
  parseEnvelope,
  panelHint,
  panelState,
  seriesColor,
  type BiSeriesResult,
} from './bi-chart-kit'
import { spikeThreshold as computeSpikeThreshold } from './bi-spike'

echarts.use([BarChart, GridComponent, MarkLineComponent, TooltipComponent, CanvasRenderer])

type SpikeOption = ComposeOption<BarSeriesOption | GridComponentOption | TooltipComponentOption>

const props = defineProps<{
  fill?: string          // 强调色（常态柱基色）
  title?: string         // 面板标题
  series?: string        // 查询规格 JSON 串
  agg?: string           // 窗口聚合口径
  interval?: number      // 桶宽（秒）
  windowSecs?: number    // 统计窗长（秒）
  shape?: string         // 取数形态
  spikeMode?: string     // 尖峰阈值模式：p90 / times / fixed
  spikeTimes?: number    // times 模式倍数
  spikeThreshold?: number // fixed 模式绝对阈值
  data?: string          // 运行时数据通道（宿主写回的信封 JSON 串）
}>()

const chartEl = ref<HTMLDivElement | null>(null)
let chart: ReturnType<typeof echarts.init> | null = null
let ro: ResizeObserver | null = null

const env = computed(() => parseEnvelope(props.data))
const state = computed(() => panelState(env.value))
const hint = computed(() => panelHint(state.value, env.value))
const errText = computed(() => env.value?.series.find((s) => s.error !== null)?.error ?? '')

/** 参与绘图的柱序列（有点的序列才成柱组）。 */
const bars = computed<Array<{ label: string; color: string; data: Array<[number, number]> }>>(() => {
  const e = env.value
  if (!e) return []
  const out: Array<{ label: string; color: string; data: Array<[number, number]> }> = []
  e.series.forEach((s: BiSeriesResult, i: number) => {
    if (!s.points.length) return
    out.push({
      label: s.label || s.key,
      color: seriesColor(s, i),
      data: s.points.map((p) => [p.ts, p.value] as [number, number]),
    })
  })
  return out
})

/** 阈值：跨序列合并全部点的值算分布（尖峰是「总量分布」概念，不按序列分摊）。 */
const threshold = computed<number | null>(() => {
  const vals = bars.value.flatMap((b) => b.data.map((p) => p[1]))
  return computeSpikeThreshold(vals, props.spikeMode ?? 'p90', Number(props.spikeTimes ?? 2), Number(props.spikeThreshold ?? 0))
})

/** x 轴量程钉住（秒）——time 轴按毫秒口径 nice 外扩会把柱挤成一角（StackArea 同款）。 */
const extent = computed<{ min: number; max: number } | null>(() => {
  const ts = bars.value.flatMap((r) => r.data.map((p) => p[0]))
  if (!ts.length) return null
  const lo = Math.min(...ts)
  const hi = Math.max(...ts)
  return hi > lo ? { min: lo, max: hi } : null
})

function tickLabel(v: unknown): string {
  const raw = Array.isArray(v) ? v[0] : v
  const n = Number(raw)
  return Number.isFinite(n) ? formatShort(n) : ''
}

function draw(): void {
  if (!chart) return
  const th = threshold.value
  const base = props.fill || BI_PANEL.accent
  const series: BarSeriesOption[] = bars.value.map((r) => ({
    type: 'bar',
    name: r.label,
    barMaxWidth: 16,
    itemStyle: { color: base, opacity: 0.55 },
    emphasis: { focus: 'series' },
    data: r.data.map(([ts, v]) => ({
      value: [ts, v],
      // 尖峰逐点着色：≥阈值染语义红（不透明），常态柱保持序列色淡显
      itemStyle: th !== null && v >= th ? { color: BI_PANEL.bad, opacity: 1 } : { color: base, opacity: 0.55 },
    })),
    // 阈值虚线只画在第一条柱序列上（多条序列时重复画线只是噪声）
    ...(r === bars.value[0] && th !== null
      ? {
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: BI_PANEL.bad, type: 'dashed', width: 1 },
            label: { color: BI_PANEL.bad, fontSize: 10, formatter: () => '尖峰阈值' },
            data: [{ yAxis: th }],
          },
        }
      : {}),
  }))
  const opt: SpikeOption = {
    animation: false,
    backgroundColor: BI_THEME.bg,
    textStyle: { fontFamily: BI_THEME.fontFamily },
    grid: { left: 54, right: 16, top: 28, bottom: 28 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#161b22',
      borderColor: BI_THEME.axisLine,
      textStyle: { color: BI_THEME.text, fontSize: 11 },
      axisPointer: { type: 'shadow', label: { formatter: (p: { value: unknown }) => tickLabel(p.value) } },
    },
    xAxis: {
      type: 'time',
      ...(extent.value ? { min: extent.value.min, max: extent.value.max } : {}),
      splitNumber: 5,
      axisLabel: {
        color: BI_THEME.axisLabel, fontSize: 10, hideOverlap: true,
        formatter: (v: number) => tickLabel(v),
      },
      axisLine: { lineStyle: { color: BI_THEME.axisLine } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: BI_THEME.splitLine } },
    },
    series,
  }
  chart.setOption(opt, { notMerge: true })
}

onMounted(() => {
  const el = chartEl.value
  if (!el) return
  chart = echarts.init(el)
  draw()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => chart?.resize())
    ro.observe(el)
  }
})

onBeforeUnmount(() => {
  if (ro) { ro.disconnect(); ro = null }
  chart?.dispose()
  chart = null
})

watch(() => props.data, () => draw())
</script>

<template>
  <div class="ah-bsp" :style="{ background: BI_PANEL.card, border: `1px solid ${BI_PANEL.hairline}` }">
    <div v-if="props.title" class="ah-bsp-title">
      <i class="ah-bsp-accent" :style="{ background: props.fill ?? BI_PANEL.accent }"></i>
      <span>{{ props.title }}</span>
      <span v-if="threshold !== null" class="ah-bsp-th">阈值 {{ threshold.toFixed(2) }}</span>
    </div>
    <div v-if="errText && bars.length" class="ah-bsp-err">{{ errText }}</div>
    <!-- 容器常驻（v-if 会废止 onMounted 拿到的引用 → echarts 永不初始化） -->
    <div class="ah-bsp-body">
      <div ref="chartEl" class="ah-bsp-plot"></div>
      <div v-if="!bars.length" class="ah-bsp-hint" :class="{ err: state === 'error' }">
        {{ hint || '暂无历史数据' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.ah-bsp {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bsp-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 0;
  font-size: 12px;
  color: #c9d1d9;
}
.ah-bsp-accent {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex: none;
}
.ah-bsp-th {
  margin-left: auto;
  font-size: 10px;
  color: #f85149;
}
.ah-bsp-err {
  padding: 2px 8px 0;
  font-size: 10px;
  color: #f85149;
}
.ah-bsp-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.ah-bsp-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #8b949e;
  padding: 0 8px;
  text-align: center;
  background: #161b22;
}
.ah-bsp-hint.err { color: #f85149; }
.ah-bsp-plot { width: 100%; height: 100%; }
</style>
