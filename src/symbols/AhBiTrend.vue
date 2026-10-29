<!--
  BI 多序列趋势图（ah-bi-trend，vue 型）：时间序列折线（多序列同图对比）。
  ┌─ 数据通道（通道 B，契约见 docs/plans/2026-10-29-bi-monitoring-dashboard-design.md）──
  │ 图元不自开 EventSource、不轮询——宿主聚合收集器（lib/bi-collector.ts）把聚合
  │ 信封 JSON 串写进 props.data（maotu props 直写，路径 props.data.val），
  │ 本组件 watch 该 prop → parseEnvelope → 渲染。
  │ 信封的 series[].points 是降采样后的时间序列（ts 秒 + value）；shape=series
  │ 形态由宿主按 interval 桶宽降采样，instant 序列用声明的 agg，cumulative 用 last。
  └────────────────────────────────────────────────────────────────────────────
  与既有 AhTrendChart 的分工：AhTrendChart 走 SSE 直写通道（实时环形缓冲），
  本图元走宿主聚合通道（历史窗口序列）——两者数据源不同，不可互换。

  三条易错点（本图元踩过的坑，勿改回）：
  1. **刻度单位是秒**：信封 points[].ts 为秒级时间戳，而 echarts 的 time 轴把
     数值当**毫秒**解释。故轴标签必须自带 formatter（formatShort 吃秒），
     且 tooltip 标题取自 axisPointer 的 label（默认按毫秒格式化 → 会显示
     1970 epoch），故 tooltip.axisPointer.label.formatter 同样必须带。
  2. **图表容器常驻**：空态用覆盖层遮住图表，而不是 v-if 摘掉容器——
     v-if 会让 onMounted 拿不到元素 → echarts 永不初始化，后续数据到了仍空白。
  3. **局部失败不拖全屏**：某条序列报错只让它没有折线，其余序列照常画，
     错误文案在标题区提示；只有「一条线都画不出来」才落空态覆盖层。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { LineSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import {
  BI_THEME,
  formatShort,
  parseEnvelope,
  panelHint,
  panelState,
  seriesColor,
  type BiSeriesResult,
} from './bi-chart-kit'

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

type TrendOption = ComposeOption<
  LineSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption
>

const props = defineProps<{
  fill?: string          // 强调色（容器边框）
  title?: string         // 面板标题
  series?: string        // 查询规格 JSON 串（组态员填，宿主据此发 /history/batch）
  agg?: string           // 窗口聚合口径（宿主用）
  interval?: number      // 桶宽（秒）
  windowSecs?: number    // 统计窗长（秒）
  shape?: string         // 取数形态：aggregate / series
  data?: string          // 运行时数据通道（宿主写回的信封 JSON 串）
}>()

const chartEl = ref<HTMLDivElement | null>(null)
let chart: ReturnType<typeof echarts.init> | null = null
let ro: ResizeObserver | null = null

const env = computed(() => parseEnvelope(props.data))
const state = computed(() => panelState(env.value))
const hint = computed(() => panelHint(state.value, env.value))

/** 有时间序列点的序列（无点的序列不进图，也不拖全屏）。 */
const lines = computed<Array<{ label: string; color: string; data: Array<[number, number]> }>>(() => {
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

/** 局部失败提示：某序列报错时给出文案（其余序列照常画）。 */
const errText = computed(() => env.value?.series.find((s) => s.error !== null)?.error ?? '')

/** 刻度值（秒）→ 文本。formatShort 吃秒级时间戳，直接喂刻度原值即可。 */
function tickLabel(v: number): string {
  return formatShort(v)
}

function draw(): void {
  if (!chart) return
  const rows = lines.value
  const series: LineSeriesOption[] = rows.map((r) => ({
    type: 'line',
    name: r.label,
    showSymbol: false,
    smooth: false,
    data: r.data,
    lineStyle: { width: 1.5, color: r.color },
    itemStyle: { color: r.color },
  }))
  const opt: TrendOption = {
    animation: false,
    backgroundColor: BI_THEME.bg,
    textStyle: { fontFamily: BI_THEME.fontFamily },
    grid: { left: 52, right: 16, top: 30, bottom: 30 },
    legend: {
      type: 'scroll',
      top: 0,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: BI_THEME.legend, fontSize: 10 },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#161b22',
      borderColor: BI_THEME.axisLine,
      textStyle: { color: BI_THEME.text, fontSize: 11 },
      // tooltip 标题来自 axisPointer 的 label formatter（缺省按毫秒格式化 → 1970 epoch）
      axisPointer: {
        label: { formatter: (p: { value: unknown }) => tickLabel(Number(p.value)) },
      },
    },
    xAxis: {
      type: 'time',
      axisLabel: {
        color: BI_THEME.axisLabel, fontSize: 9, hideOverlap: true,
        formatter: (v: number) => tickLabel(v),
      },
      axisLine: { lineStyle: { color: BI_THEME.axisLine } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 9 },
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
  <div class="ah-bit" :style="{ '--ah-accent': props.fill ?? '#f5a623' }">
    <div v-if="props.title" class="ah-bit-title">{{ props.title }}</div>
    <!-- 局部失败提示：有线可画时只提示，不遮图 -->
    <div v-if="errText && lines.length" class="ah-bit-err">{{ errText }}</div>
    <!-- 图表容器**常驻**（v-if 会让空态时容器消失 → onMounted 拿不到元素 →
         echarts 永不初始化，数据到达后仍空白）。空态用覆盖层遮住图表。 -->
    <div class="ah-bit-body">
      <div ref="chartEl" class="ah-bit-plot"></div>
      <div v-if="!lines.length" class="ah-bit-hint" :class="{ err: state === 'error' }">
        {{ hint || '暂无历史数据' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.ah-bit {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bit-title {
  padding: 4px 8px 0;
  font-size: 11px;
  color: #8b949e;
}
.ah-bit-err {
  padding: 2px 8px 0;
  font-size: 10px;
  color: #f85149;
}
.ah-bit-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.ah-bit-hint {
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
.ah-bit-hint.err {
  color: #f85149;
}
.ah-bit-plot {
  width: 100%;
  height: 100%;
}
</style>
