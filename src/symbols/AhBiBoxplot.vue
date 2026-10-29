<!--
  BI 分布箱线（ah-bi-boxplot，vue 型，P3）。
  数据通道 = 通道 B。每条序列的逐桶点算五数（min/Q1/中位/Q3/max，线性插值分位），
  一序列一箱——看分布与离群，不看趋势。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BoxplotChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { BoxplotSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components'
import { BI_PANEL, BI_THEME, parseEnvelope, panelHint, panelState, seriesColor, type BiSeriesResult } from './bi-chart-kit'
import { boxplotStats } from './bi-boxplot'

echarts.use([BoxplotChart, GridComponent, TooltipComponent, CanvasRenderer])

type BoxOption = ComposeOption<BoxplotSeriesOption | GridComponentOption | TooltipComponentOption>

const props = defineProps<{
  fill?: string      // 强调色（首箱）
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

/** 有逐桶点的序列才成箱（aggregate 单值无分布）。 */
const boxes = computed<Array<{ label: string; color: string; five: [number, number, number, number, number] }>>(() => {
  const e = env.value
  if (!e) return []
  const out: Array<{ label: string; color: string; five: [number, number, number, number, number] }> = []
  e.series.forEach((s: BiSeriesResult, i: number) => {
    if (!s.points.length) return
    const five = boxplotStats(s.points.map((p) => p.value))
    if (five) out.push({ label: s.label || s.key, color: i === 0 && props.fill ? props.fill : seriesColor(s, i), five })
  })
  return out
})

function draw(): void {
  if (!chart) return
  const opt: BoxOption = {
    animation: false,
    backgroundColor: BI_THEME.bg,
    textStyle: { fontFamily: BI_THEME.fontFamily },
    grid: { left: 56, right: 16, top: 14, bottom: 30 },
    tooltip: {
      trigger: 'item',
      backgroundColor: BI_PANEL.card,
      borderColor: BI_THEME.axisLine,
      textStyle: { color: BI_THEME.text, fontSize: 13 },
    },
    xAxis: {
      type: 'category',
      data: boxes.value.map((b) => b.label),
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 12 },
      axisLine: { lineStyle: { color: BI_THEME.axisLine } },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 12 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: BI_THEME.splitLine } },
    },
    series: [{
      type: 'boxplot',
      itemStyle: { color: 'transparent' },
      data: boxes.value.map((b) => ({
        value: b.five,
        // echarts boxplot 单系列统一色——多箱区分靠箱体描边逐点覆写
        itemStyle: { borderColor: b.color, borderWidth: 1.5 },
      })),
      boxWidth: [10, 26],
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
  <div class="ah-bbx" :style="{ background: BI_PANEL.card, border: `1px solid ${BI_PANEL.hairline}` }">
    <div v-if="props.title" class="ah-bbx-title">
      <i class="ah-bbx-accent" :style="{ background: props.fill ?? BI_PANEL.accent }"></i>
      <span>{{ props.title }}</span>
    </div>
    <div class="ah-bbx-body">
      <div ref="chartEl" class="ah-bbx-plot"></div>
      <div v-if="!boxes.length" class="ah-bbx-hint" :class="{ err: state === 'error' }">
        {{ hint || '暂无历史数据' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.ah-bbx {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bbx-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 0;
  font-size: 14px;
  color: #c9d1d9;
}
.ah-bbx-accent {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex: none;
}
.ah-bbx-body { position: relative; flex: 1; min-height: 0; }
.ah-bbx-hint {
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
.ah-bbx-hint.err { color: #f85149; }
.ah-bbx-plot { width: 100%; height: 100%; }
</style>
