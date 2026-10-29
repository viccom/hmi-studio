<!--
  BI 时段热力图（ah-bi-heat，vue 型）：「时间桶 × 序列」矩阵热力。
  ┌─ 数据通道（通道 B，契约见 docs/plans/2026-10-29-bi-monitoring-dashboard-design.md）──
  │ 图元不自开 EventSource、不轮询——宿主聚合收集器把聚合信封 JSON 串写进
  │ props.data（maotu props 直写，路径 props.data.val），本组件 watch → 解析 → 渲染。
  │ 信封的 series[].points 是降采样后的时间序列（ts 秒 + value）。
  └────────────────────────────────────────────────────────────────────────────
  桶对齐口径：以**首个有桶的序列**的 ts 集合为 x 桶基准，其它序列按 ts
  **精确匹配**入格；匹配不上的格留空（不画 0 值——那会谎报「该时段无负荷」）。
  （基准取「首个有桶的序列」而非字面的 series[0]：若首条序列报错无点，
    字面取法会让整张热力图退化成空图，白丢其它序列的数据。）
  x 轴桶标签：全部桶落在同一日历日 → 只给 HH:mm（更紧凑）；跨日 →
  用 formatShort 的 MM-DD HH:mm 消歧（同一 HH:mm 会出现两次，不带日期即歧义）。
  局部失败不拖全屏：某条序列报错只让它那行没有格子，其余行照常上色，
  错误文案在标题区提示；只有「一格都填不出来」才落空态覆盖层。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { HeatmapChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { HeatmapSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption, VisualMapComponentOption } from 'echarts/components'
import {
  BI_THEME,
  formatClock,
  formatShort,
  parseEnvelope,
  panelHint,
  panelState,
  type BiSeriesResult,
} from './bi-chart-kit'

echarts.use([HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent, CanvasRenderer])

type HeatOption = ComposeOption<
  HeatmapSeriesOption | GridComponentOption | TooltipComponentOption | VisualMapComponentOption
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

/** 日历日键（本地时区）——判「所有桶是否同一天」用。 */
function dayKey(ts: number): string {
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/**
 * 矩阵：x = 时间桶标签，y = 序列标签，格值 = 该序列该桶的值。
 * - x 桶基准 = 首个有桶的序列的 ts 集合（去重后按时间序）
 * - 其它序列按 ts **精确匹配**入格；匹配不上 → 留空（不谎报 0）
 * - y 行 = 信封里的全部序列（无点的序列留一行空格，不隐藏该序列）
 */
const matrix = computed<{
  xs: string[]
  ys: string[]
  cells: Array<[number, number, number]>
  max: number
  min: number
}>(() => {
  const e = env.value
  if (!e) return { xs: [], ys: [], cells: [], max: 0, min: 0 }

  const base = e.series.find((s: BiSeriesResult) => s.points.length > 0)
  if (!base) return { xs: [], ys: [], cells: [], max: 0, min: 0 }

  const buckets = [...new Set(base.points.map((p) => p.ts))].sort((a, b) => a - b)
  const bucketIndex = new Map(buckets.map((t, i) => [t, i]))
  // 标签格式由「最长桶跨度」决定：跨天（首尾不同日）或相邻桶间隔 ≥1 天 → 必须带日期
  // （formatShort 的 MM-DD HH:mm），否则同一 HH:mm 会在轴上出现两次 → 用 HH:mm 更紧凑。
  const crossDay = buckets.length > 0 && dayKey(buckets[0]) !== dayKey(buckets[buckets.length - 1])
  let maxGap = 0
  for (let i = 1; i < buckets.length; i++) maxGap = Math.max(maxGap, buckets[i] - buckets[i - 1])
  const withDate = crossDay || maxGap >= 86400
  const xs = buckets.map((t) => (withDate ? formatShort(t) : formatClock(t).slice(0, 5)))

  const ys = e.series.map((s: BiSeriesResult) => s.label || s.key)
  const cells: Array<[number, number, number]> = []
  e.series.forEach((s: BiSeriesResult, yi: number) => {
    for (const p of s.points) {
      const xi = bucketIndex.get(p.ts)
      if (xi === undefined) continue // 桶不对齐 → 留空（不谎报 0）
      cells.push([xi, yi, p.value])
    }
  })
  const values = cells.map((c) => c[2])
  return {
    xs,
    ys,
    cells,
    max: values.length ? Math.max(...values) : 0,
    min: values.length ? Math.min(...values) : 0,
  }
})

/** 局部失败提示：某序列报错时给出文案（其余行照常上色）。 */
const errText = computed(() => env.value?.series.find((s) => s.error !== null)?.error ?? '')

function draw(): void {
  if (!chart) return
  const m = matrix.value
  const opt: HeatOption = {
    animation: false,
    backgroundColor: BI_THEME.bg,
    textStyle: { fontFamily: BI_THEME.fontFamily },
    grid: { left: 92, right: 64, top: 24, bottom: 34 },
    tooltip: {
      position: 'top',
      backgroundColor: '#161b22',
      borderColor: BI_THEME.axisLine,
      textStyle: { color: BI_THEME.text, fontSize: 11 },
      formatter: (p: unknown) => {
        const first = (Array.isArray(p) ? p[0] : p) as { value?: unknown } | undefined
        const v = first?.value
        if (!Array.isArray(v)) return ''
        const xi = Number(v[0])
        const yi = Number(v[1])
        const val = Number(v[2])
        return `${m.ys[yi] ?? ''}<br/>${m.xs[xi] ?? ''}<br/>${val}`
      },
    },
    xAxis: {
      type: 'category',
      data: m.xs,
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 9, hideOverlap: true },
      axisLine: { lineStyle: { color: BI_THEME.axisLine } },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category',
      data: m.ys,
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 9 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitArea: { show: false },
    },
    visualMap: {
      type: 'continuous',
      min: m.min,
      max: m.max,
      calculable: true,
      orient: 'vertical',
      right: 6,
      top: 'middle',
      itemHeight: 120,
      textStyle: { color: BI_THEME.legend, fontSize: 9 },
      inRange: { color: ['#0d1117', '#1f6feb', '#f5a623', '#f85149'] },
    },
    series: [{
      type: 'heatmap',
      name: '值',
      data: m.cells,
      label: { show: false },
      emphasis: { itemStyle: { borderColor: '#c9d1d9', borderWidth: 1 } },
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
  <div class="ah-bih" :style="{ background: '#0d1117', border: `1px solid ${props.fill ?? '#f5a623'}` }">
    <div v-if="props.title" class="ah-bih-title">{{ props.title }}</div>
    <!-- 局部失败提示：有格可画时只提示，不遮图 -->
    <div v-if="errText && matrix.cells.length" class="ah-bih-err">{{ errText }}</div>
    <!-- 图表容器**常驻**（v-if 会让空态时容器消失 → onMounted 拿不到元素 →
         echarts 永不初始化，数据到达后仍空白）。空态用覆盖层遮住图表。 -->
    <div class="ah-bih-body">
      <div ref="chartEl" class="ah-bih-plot"></div>
      <div v-if="!matrix.cells.length" class="ah-bih-hint" :class="{ err: state === 'error' }">
        {{ hint || '暂无历史数据' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.ah-bih {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bih-title {
  padding: 4px 8px 0;
  font-size: 11px;
  color: #8b949e;
}
.ah-bih-err {
  padding: 2px 8px 0;
  font-size: 10px;
  color: #f85149;
}
.ah-bih-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.ah-bih-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #8b949e;
  padding: 0 8px;
  text-align: center;
  background: #0d1117;
}
.ah-bih-hint.err {
  color: #f85149;
}
.ah-bih-plot {
  width: 100%;
  height: 100%;
}
</style>
