<!--
  BI 仪表盘（ah-bi-gauge，vue 型，P3）。
  数据通道 = 通道 B（宿主写 props.data，图元不取数）。有值序列各画一枚表盘横排均分；
  量程 = maxVal>0 ? maxVal : max(值)×1.2（nice 化）。空态覆盖层（容器常驻）。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { GaugeChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { GaugeSeriesOption } from 'echarts/charts'
import { BI_PANEL, BI_THEME, formatValue, niceMax, parseEnvelope, panelHint, panelState, seriesColor, type BiSeriesResult } from './bi-chart-kit'

echarts.use([GaugeChart, CanvasRenderer])

type GaugeOption = ComposeOption<GaugeSeriesOption>

const props = defineProps<{
  fill?: string      // 强调色（首枚表盘）
  title?: string     // 面板标题
  series?: string    // 查询规格 JSON 串
  agg?: string       // 窗口聚合口径
  interval?: number  // 桶宽（秒）
  windowSecs?: number // 统计窗长（秒）
  shape?: string     // 取数形态
  maxVal?: number    // 量程上限（0=自动）
  data?: string      // 运行时数据通道
}>()

const chartEl = ref<HTMLDivElement | null>(null)
let chart: ReturnType<typeof echarts.init> | null = null
let ro: ResizeObserver | null = null

const env = computed(() => parseEnvelope(props.data))
const state = computed(() => panelState(env.value))
const hint = computed(() => panelHint(state.value, env.value))

/** 有值的序列才成表盘。 */
const dials = computed<Array<{ label: string; unit: string; color: string; value: number }>>(() => {
  const e = env.value
  if (!e) return []
  return e.series
    .filter((s: BiSeriesResult) => s.value !== null)
    .map((s: BiSeriesResult, i: number) => ({
      label: s.label || s.key,
      unit: s.unit,
      color: i === 0 && props.fill ? props.fill : seriesColor(s, i),
      value: s.value as number,
    }))
})

/** 量程：手工上限优先；否则数据最大值 ×1.2 nice 化（不出现碎数轴）。 */
const rangeMax = computed<number>(() => {
  if (Number(props.maxVal) > 0) return Number(props.maxVal)
  const peak = Math.max(0, ...dials.value.map((d) => Math.abs(d.value)))
  return niceMax(peak * 1.2)
})

function draw(): void {
  if (!chart) return
  const n = dials.value.length
  const series: GaugeSeriesOption[] = dials.value.map((d, i) => ({
    type: 'gauge',
    // 横排均分：第 i 枚圆心在 (i+0.5)/n 处
    center: [`${((i + 0.5) / n) * 100}%`, '58%'],
    radius: `${Math.min(78, 150 / Math.max(n, 1))}%`,
    startAngle: 210,
    endAngle: -30,
    min: 0,
    max: rangeMax.value,
    axisLine: { lineStyle: { width: 8, color: [[1, d.color]] } },
    pointer: { length: '58%', width: 3, itemStyle: { color: BI_PANEL.text } },
    axisTick: { show: false },
    splitLine: { length: 4, lineStyle: { color: BI_PANEL.textDim } },
    axisLabel: { color: BI_THEME.axisLabel, fontSize: 10, distance: 2 },
    anchor: { show: false },
    title: { show: true, offsetCenter: [0, '32%'], color: BI_PANEL.textDim, fontSize: 12 },
    detail: {
      valueAnimation: false,
      offsetCenter: [0, '62%'],
      color: d.color,
      fontSize: 16,
      fontWeight: 600,
      formatter: (v: number) => `${formatValue(v)}${d.unit ? ` ${d.unit}` : ''}`,
    },
    data: [{ value: d.value, name: d.label }],
  }))
  const opt: GaugeOption = {
    animation: false,
    backgroundColor: BI_THEME.bg,
    textStyle: { fontFamily: BI_THEME.fontFamily },
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
  <div class="ah-bga" :style="{ background: BI_PANEL.card, border: `1px solid ${BI_PANEL.hairline}` }">
    <div v-if="props.title" class="ah-bga-title">
      <i class="ah-bga-accent" :style="{ background: props.fill ?? BI_PANEL.accent }"></i>
      <span>{{ props.title }}</span>
    </div>
    <div class="ah-bga-body">
      <div ref="chartEl" class="ah-bga-plot"></div>
      <div v-if="!dials.length" class="ah-bga-hint" :class="{ err: state === 'error' }">
        {{ hint || '暂无历史数据' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.ah-bga {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bga-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 0;
  font-size: 14px;
  color: #c9d1d9;
}
.ah-bga-accent {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex: none;
}
.ah-bga-body { position: relative; flex: 1; min-height: 0; }
.ah-bga-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #8b949e;
  padding: 0 8px;
  text-align: center;
  background: #161b22;
}
.ah-bga-hint.err { color: #f85149; }
.ah-bga-plot { width: 100%; height: 100%; }
</style>
