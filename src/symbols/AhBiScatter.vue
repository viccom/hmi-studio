<!--
  BI 相关性散点（ah-bi-scatter，vue 型，P3）。
  数据通道 = 通道 B。序列1=X 轴、序列2=Y 轴，pairByTs 按桶时间精确配对
  （同 interval 降采样后桶 ts 一致；单边缺桶丢弃，不猜插值）。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { ScatterSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components'
import { BI_PANEL, BI_THEME, parseEnvelope, panelHint, panelState, seriesColor } from './bi-chart-kit'
import { pairByTs } from './bi-scatter'

echarts.use([ScatterChart, GridComponent, TooltipComponent, CanvasRenderer])

type ScatterOption = ComposeOption<ScatterSeriesOption | GridComponentOption | TooltipComponentOption>

const props = defineProps<{
  fill?: string      // 强调色（点色）
  title?: string     // 面板标题
  series?: string    // 查询规格 JSON 串
  agg?: string       // 窗口聚合口径
  interval?: number  // 桶宽（秒）
  windowSecs?: number // 统计窗长（秒）
  shape?: string     // 取数形态
  data?: string      // 运行时数据通道
}>()

const chartEl = ref<HTMLDivElement | null>(null)
let chart: ReturnType<typeof echarts.init> | null = null
let ro: ResizeObserver | null = null

const env = computed(() => parseEnvelope(props.data))
const state = computed(() => panelState(env.value))
const hint = computed(() => panelHint(state.value, env.value))

/** X/Y 两轴元信息（第一条=X，第二条=Y）。 */
const axes = computed(() => {
  const ss = env.value?.series ?? []
  const x = ss[0]
  const y = ss[1]
  if (!x || !y) return null
  const fmt = (s: typeof x): string => `${s.label || s.key}${s.unit ? ` (${s.unit})` : ''}`
  return { x, y, xLabel: fmt(x), yLabel: fmt(y) }
})

const pairs = computed<Array<[number, number]>>(() => {
  const a = axes.value
  if (!a) return []
  return pairByTs(a.x.points, a.y.points)
})

function draw(): void {
  if (!chart || !axes.value) return
  const color = props.fill || seriesColor(axes.value.x, 0)
  const opt: ScatterOption = {
    animation: false,
    backgroundColor: BI_THEME.bg,
    textStyle: { fontFamily: BI_THEME.fontFamily },
    grid: { left: 56, right: 16, top: 14, bottom: 30 },
    tooltip: {
      trigger: 'item',
      backgroundColor: BI_PANEL.card,
      borderColor: BI_THEME.axisLine,
      textStyle: { color: BI_THEME.text, fontSize: 13 },
      formatter: (p: unknown) => {
        const v = (p as { value?: [number, number] }).value
        return `${axes.value!.xLabel}: ${v?.[0] ?? ''}<br/>${axes.value!.yLabel}: ${v?.[1] ?? ''}`
      },
    },
    xAxis: {
      type: 'value',
      scale: true,
      name: axes.value.xLabel,
      nameTextStyle: { color: BI_THEME.axisLabel, fontSize: 12 },
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 12 },
      axisLine: { lineStyle: { color: BI_THEME.axisLine } },
      splitLine: { lineStyle: { color: BI_THEME.splitLine } },
    },
    yAxis: {
      type: 'value',
      scale: true,
      name: axes.value.yLabel,
      nameTextStyle: { color: BI_THEME.axisLabel, fontSize: 12 },
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 12 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: BI_THEME.splitLine } },
    },
    series: [{
      type: 'scatter',
      symbolSize: 7,
      itemStyle: { color, opacity: 0.75 },
      data: pairs.value,
    }],
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
  <div class="ah-bsc" :style="{ background: BI_PANEL.card, border: `1px solid ${BI_PANEL.hairline}` }">
    <div v-if="props.title" class="ah-bsc-title">
      <i class="ah-bsc-accent" :style="{ background: props.fill ?? BI_PANEL.accent }"></i>
      <span>{{ props.title }}</span>
    </div>
    <div class="ah-bsc-body">
      <div ref="chartEl" class="ah-bsc-plot"></div>
      <div v-if="!pairs.length" class="ah-bsc-hint" :class="{ err: state === 'error' }">
        {{ (hint || '') || '需要两条有序列点的序列（第1条=X，第2条=Y）' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.ah-bsc {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bsc-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 0;
  font-size: 14px;
  color: #c9d1d9;
}
.ah-bsc-accent {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex: none;
}
.ah-bsc-body { position: relative; flex: 1; min-height: 0; }
.ah-bsc-hint {
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
.ah-bsc-hint.err { color: #f85149; }
.ah-bsc-plot { width: 100%; height: 100%; }
</style>
