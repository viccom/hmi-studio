<!--
  BI 增量贡献瀑布（ah-bi-waterfall，vue 型，P3）。
  数据通道 = 通道 B。各序列整窗值按序累叠（waterfallBars 算浮柱几何：透明基座 +
  值段，两根 stack 柱渲染），末列「合计」落底（强调色）——看总量由谁贡献多少。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components'
import { BI_PANEL, BI_THEME, formatValue, parseEnvelope, panelHint, panelState, seriesColor, type BiSeriesResult } from './bi-chart-kit'
import { waterfallBars } from './bi-waterfall'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

type WfOption = ComposeOption<BarSeriesOption | GridComponentOption | TooltipComponentOption>

const props = defineProps<{
  fill?: string      // 强调色（合计列）
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

/** 有值序列 → 类目（含末列「合计」）与浮柱几何。 */
const columns = computed<Array<{ label: string; color: string; value: number }>>(() => {
  const e = env.value
  if (!e) return []
  const out: Array<{ label: string; color: string; value: number }> = []
  e.series.forEach((s: BiSeriesResult, i: number) => {
    if (s.value === null) return
    out.push({
      label: s.label || s.key,
      color: i === 0 && props.fill ? props.fill : seriesColor(s, i),
      value: s.value,
    })
  })
  const total = out.reduce((a, b) => a + b.value, 0)
  if (out.length >= 2) out.push({ label: '合计', color: props.fill || BI_PANEL.accent, value: total })
  return out
})

function draw(): void {
  if (!chart || !columns.value.length) return
  const cols = columns.value
  const bars = waterfallBars(cols.map((c) => c.value))
  const isTotal = (i: number): boolean => i === cols.length - 1 && cols.length >= 3
  // 透明基座：合计列归零（它落底）
  const base = bars.map((b, i) => (isTotal(i) ? 0 : b.start))
  const delta = cols.map((c, i) => ({ value: Math.abs(c.value), itemStyle: { color: c.color, opacity: isTotal(i) ? 1 : 0.8 } }))
  const opt: WfOption = {
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
        const c = cols[(p as { dataIndex?: number }).dataIndex ?? -1]
        return c ? `${c.label}: ${formatValue(c.value)}` : ''
      },
    },
    xAxis: {
      type: 'category',
      data: cols.map((c) => c.label),
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 12, interval: 0, hideOverlap: true },
      axisLine: { lineStyle: { color: BI_THEME.axisLine } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 12 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: BI_THEME.splitLine } },
    },
    series: [
      { type: 'bar', stack: 'bi-wf', silent: true, itemStyle: { color: 'transparent' }, data: base, barMaxWidth: 34 },
      { type: 'bar', stack: 'bi-wf', data: delta, barMaxWidth: 34 },
    ],
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
  <div class="ah-bwf" :style="{ background: BI_PANEL.card, border: `1px solid ${BI_PANEL.hairline}` }">
    <div v-if="props.title" class="ah-bwf-title">
      <i class="ah-bwf-accent" :style="{ background: props.fill ?? BI_PANEL.accent }"></i>
      <span>{{ props.title }}</span>
    </div>
    <div class="ah-bwf-body">
      <div ref="chartEl" class="ah-bwf-plot"></div>
      <div v-if="!columns.length" class="ah-bwf-hint" :class="{ err: state === 'error' }">
        {{ hint || '暂无历史数据' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.ah-bwf {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bwf-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 0;
  font-size: 14px;
  color: #c9d1d9;
}
.ah-bwf-accent {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex: none;
}
.ah-bwf-body { position: relative; flex: 1; min-height: 0; }
.ah-bwf-hint {
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
.ah-bwf-hint.err { color: #f85149; }
.ah-bwf-plot { width: 100%; height: 100%; }
</style>
