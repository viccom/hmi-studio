<!--
  BI 日历热力（ah-bi-calendar，vue 型，P3）。
  数据通道 = 通道 B。逐桶点按「当天」归格（dayKey，本地时区），日历 range =
  数据首末日所在月；色深 = visualMap 连续映射（暗底 → 序列色）。
  该图元天然要**按日桶长窗**（interval 86400 / 窗 ≥30 天），组态时配短窗只剩一格。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { HeatmapChart } from 'echarts/charts'
import { CalendarComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { HeatmapSeriesOption } from 'echarts/charts'
import type { CalendarComponentOption, TooltipComponentOption, VisualMapComponentOption } from 'echarts/components'
import { BI_PANEL, BI_THEME, parseEnvelope, panelHint, panelState, seriesColor, formatValue } from './bi-chart-kit'
import { dayKey } from './bi-calendar'

echarts.use([HeatmapChart, CalendarComponent, TooltipComponent, VisualMapComponent, CanvasRenderer])

type CalOption = ComposeOption<
  HeatmapSeriesOption | CalendarComponentOption | TooltipComponentOption | VisualMapComponentOption
>

const props = defineProps<{
  fill?: string      // 强调色（热力高值色）
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

/** 首个有点的序列 → 一天一值（同日多点取末值——桶聚合后本就一天一点，防御性归并）。 */
const cells = computed<Array<[string, number]>>(() => {
  const s = env.value?.series.find((x) => x.points.length)
  if (!s) return []
  const byDay = new Map<string, number>()
  for (const p of [...s.points].sort((a, b) => a.ts - b.ts)) byDay.set(dayKey(p.ts), p.value)
  return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
})

const unit = computed(() => env.value?.series.find((x) => x.points.length)?.unit ?? '')
const color = computed(() => {
  const s = env.value?.series.find((x) => x.points.length)
  return props.fill || seriesColor(s ?? { color: '' }, 0)
})

function draw(): void {
  if (!chart || !cells.value.length) return
  const opt: CalOption = {
    animation: false,
    backgroundColor: BI_THEME.bg,
    textStyle: { fontFamily: BI_THEME.fontFamily },
    tooltip: {
      backgroundColor: BI_PANEL.card,
      borderColor: BI_THEME.axisLine,
      textStyle: { color: BI_THEME.text, fontSize: 13 },
      formatter: (p: unknown) => {
        const v = (p as { value?: [string, number] }).value
        return `${v?.[0] ?? ''}  ${formatValue(v?.[1] ?? null)}${unit.value ? ` ${unit.value}` : ''}`
      },
    },
    visualMap: {
      type: 'continuous',
      min: Math.min(...cells.value.map((c) => c[1])),
      max: Math.max(...cells.value.map((c) => c[1])),
      show: false,
      inRange: { color: ['#1c2128', color.value] },
    },
    calendar: {
      top: 28,
      left: 34,
      right: 10,
      cellSize: ['auto', 13],
      range: [cells.value[0][0], cells.value[cells.value.length - 1][0]],
      splitLine: { show: false },
      itemStyle: { color: BI_PANEL.cardAlt, borderColor: 'transparent', borderWidth: 2 },
      yearLabel: { show: false },
      monthLabel: { color: BI_THEME.axisLabel, fontSize: 12 },
      dayLabel: { color: BI_THEME.axisLabel, fontSize: 10, nameMap: 'ZH' },
    },
    series: [{
      type: 'heatmap',
      coordinateSystem: 'calendar',
      data: cells.value,
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
  <div class="ah-bcl" :style="{ background: BI_PANEL.card, border: `1px solid ${BI_PANEL.hairline}` }">
    <div v-if="props.title" class="ah-bcl-title">
      <i class="ah-bcl-accent" :style="{ background: props.fill ?? BI_PANEL.accent }"></i>
      <span>{{ props.title }}</span>
    </div>
    <div class="ah-bcl-body">
      <div ref="chartEl" class="ah-bcl-plot"></div>
      <div v-if="!cells.length" class="ah-bcl-hint" :class="{ err: state === 'error' }">
        {{ hint || '暂无历史数据' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.ah-bcl {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bcl-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 0;
  font-size: 14px;
  color: #c9d1d9;
}
.ah-bcl-accent {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex: none;
}
.ah-bcl-body { position: relative; flex: 1; min-height: 0; }
.ah-bcl-hint {
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
.ah-bcl-hint.err { color: #f85149; }
.ah-bcl-plot { width: 100%; height: 100%; }
</style>
