<!--
  BI 时间段柱状图（ah-bi-bars，vue 型）。
  ┌─ 数据通道（通道 B，契约见 docs/plans/2026-10-29-bi-monitoring-dashboard-design.md）──
  │ 图元不自开 EventSource、不轮询——宿主聚合收集器把聚合信封 JSON 串写进
  │ props.data（maotu props 直写，路径 props.data.val），本组件 watch 该 prop
  │ → parseEnvelope → 渲染。信封 series[].points 是降采样后的时间序列（ts 秒 + value）。
  └────────────────────────────────────────────────────────────────────────────
  语义：每个时间桶一根柱——「近 N 日/时用量」这类离散区间对比。
  对标 Grafana「Last 7 Days Power Usage」。

  三条易错点（本图元踩过的坑，勿改回）：
  1. **桶跨度来自 props.interval**（宿主发查询时的桶宽，也是本图元宿主侧约定的
     分桶口径）：interval=3600 → 每小时一根柱、标签 'HH:mm'；interval=86400 →
     每天一根柱、标签 'MM-DD'。props.interval 缺失时按相邻桶间隔的中位数推断。
  2. **多序列共用一条类目轴**：x 类目取全部序列 ts 的并集（排序），各序列按 ts
     对齐入格；对不上的桶留空（null → 该序列不画柱，而不是画 0 值——那会谎报
     「该时段无负荷」）。
  3. **图表容器常驻 DOM**：空态用覆盖层遮住（v-if 会让容器消失 → onMounted 拿不到
     元素 → echarts 永不初始化 → 数据到达后仍空白）。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import {
  BI_THEME,
  formatShort,
  formatValue,
  parseEnvelope,
  panelHint,
  panelState,
  seriesColor,
  type BiSeriesResult,
} from './bi-chart-kit'

echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

type BarsOption = ComposeOption<
  BarSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption
>

const props = defineProps<{
  fill?: string          // 强调色（标题前的小色条，不做橙色描边框）
  title?: string         // 面板标题
  series?: string        // 查询规格 JSON 串（组态员填，宿主据此发 /history/batch）
  agg?: string           // 窗口聚合口径（宿主用）
  interval?: number      // 桶宽（秒）——决定分桶粒度与标签格式
  windowSecs?: number    // 统计窗长（秒）
  shape?: string         // 取数形态：aggregate / series / both
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
 * 桶跨度（秒）：优先取 props.interval（宿主发查询的桶宽）；缺失/非法则按
 * 相邻桶间隔的中位数推断（中位数抗个别缺桶）。
 */
function bucketSpan(cats: number[]): number {
  const declared = Number(props.interval)
  if (Number.isFinite(declared) && declared > 0) return declared
  if (cats.length < 2) return 3600
  const gaps: number[] = []
  for (let i = 1; i < cats.length; i++) gaps.push(cats[i] - cats[i - 1])
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)] || 3600
}

/**
 * 桶标签：按桶跨度选精度——
 * - 跨度 ≥ 1 天 → 'MM-DD'（日桶不需要时刻）
 * - 跨度 < 1 天且同一天 → 'HH:mm'（更紧凑）
 * - 跨度 < 1 天且跨天 → 'MM-DD HH:mm'（消歧：同一 HH:mm 会出现两次）
 * formatShort 统一输出 'MM-DD HH:mm'，故短标签由截取得到——不另写一份日期格式化。
 */
function bucketLabel(ts: number, span: number, sameDay: boolean): string {
  if (span >= 86400) return formatShort(ts).slice(0, 5)
  return sameDay ? formatShort(ts).slice(6) : formatShort(ts)
}

/**
 * 柱状数据：x 类目 = 全部序列 ts 的并集（排序）；每条序列按 ts 对齐入格，
 * 对不上的桶留 null（不画柱）。
 */
const bars = computed<{
  xs: string[]
  rows: Array<{ label: string; color: string; data: Array<number | null> }>
}>(() => {
  const e = env.value
  if (!e) return { xs: [], rows: [] }

  const tsSet = new Set<number>()
  e.series.forEach((s: BiSeriesResult) => s.points.forEach((p) => tsSet.add(p.ts)))
  const cats = [...tsSet].sort((a, b) => a - b)
  if (!cats.length) return { xs: [], rows: [] }

  const span = bucketSpan(cats)
  const sameDay = dayKey(cats[0]) === dayKey(cats[cats.length - 1])
  const xs = cats.map((t) => bucketLabel(t, span, sameDay))

  const rows: Array<{ label: string; color: string; data: Array<number | null> }> = []
  e.series.forEach((s: BiSeriesResult, i: number) => {
    if (!s.points.length) return
    const byTs = new Map<number, number>()
    s.points.forEach((p) => byTs.set(p.ts, p.value))
    const data = cats.map((t) => (byTs.has(t) ? (byTs.get(t) as number) : null))
    rows.push({ label: s.label || s.key, color: seriesColor(s, i), data })
  })
  return { xs, rows }
})

/** 局部失败提示：某序列报错时给出文案（其余序列照常出柱）。 */
const errText = computed(() => env.value?.series.find((s) => s.error !== null)?.error ?? '')

function draw(): void {
  if (!chart) return
  const b = bars.value
  const series: BarSeriesOption[] = b.rows.map((r) => ({
    type: 'bar',
    name: r.label,
    // 多序列堆叠（单序列时 stack 无副作用）——与堆叠面积图同款「总量 + 构成」语义
    stack: 'bi-bars',
    barMaxWidth: 26,
    itemStyle: { color: r.color },
    emphasis: { focus: 'series' },
    data: r.data,
  }))
  const opt: BarsOption = {
    animation: false,
    backgroundColor: BI_THEME.bg,
    textStyle: { fontFamily: BI_THEME.fontFamily },
    grid: { left: 54, right: 16, top: 28, bottom: 28 },
    legend: {
      type: 'scroll',
      top: 0,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: BI_THEME.legend, fontSize: 12 },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#161b22',
      borderColor: BI_THEME.axisLine,
      textStyle: { color: BI_THEME.text, fontSize: 13 },
      formatter: (params: unknown) => {
        const arr = (Array.isArray(params) ? params : [params]) as Array<{
          axisValue?: unknown
          seriesName?: string
          value?: unknown
        }>
        if (!arr.length) return ''
        const head = String(arr[0].axisValue ?? '')
        const rows = arr.map((p) => {
          const v = typeof p.value === 'number' ? p.value : null
          return `${p.seriesName ?? ''}: ${formatValue(v)}`
        })
        return `${head}<br/>${rows.join('<br/>')}`
      },
    },
    xAxis: {
      type: 'category',
      data: b.xs,
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 12, hideOverlap: true },
      axisLine: { lineStyle: { color: BI_THEME.axisLine } },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 12 },
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
// 桶宽变了 → 标签精度变了 → 需重绘（组态员调 interval 的场景）
watch(() => props.interval, () => draw())
</script>

<template>
  <div class="ah-bbars" :style="{ background: '#161b22', border: '1px solid #21262d' }">
    <div v-if="props.title" class="ah-bbars-title">
      <i class="ah-bbars-accent" :style="{ background: props.fill ?? '#58a6ff' }"></i>
      <span>{{ props.title }}</span>
    </div>
    <!-- 局部失败提示：有柱可画时只提示，不遮图 -->
    <div v-if="errText && bars.rows.length" class="ah-bbars-err">{{ errText }}</div>
    <!-- 图表容器**常驻**（v-if 会让空态时容器消失 → onMounted 拿不到元素 →
         echarts 永不初始化，数据到达后仍空白）。空态用覆盖层遮住图表。 -->
    <div class="ah-bbars-body">
      <div ref="chartEl" class="ah-bbars-plot"></div>
      <div v-if="!bars.rows.length" class="ah-bbars-hint" :class="{ err: state === 'error' }">
        {{ hint || '暂无历史数据' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.ah-bbars {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bbars-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 0;
  font-size: 14px;
  color: #c9d1d9;
}
.ah-bbars-accent {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex: none;
}
.ah-bbars-err {
  padding: 2px 8px 0;
  font-size: 12px;
  color: #f85149;
}
.ah-bbars-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.ah-bbars-hint {
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
.ah-bbars-hint.err {
  color: #f85149;
}
.ah-bbars-plot {
  width: 100%;
  height: 100%;
}
</style>
