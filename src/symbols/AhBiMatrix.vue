<!--
  BI 设备 × 时间矩阵热力图（ah-bi-matrix，vue 型）。
  ┌─ 数据通道（通道 B，契约见 docs/plans/2026-10-29-bi-monitoring-dashboard-design.md）──
  │ 图元不自开 EventSource、不轮询——宿主聚合收集器把聚合信封 JSON 串写进
  │ props.data（maotu props 直写，路径 props.data.val），本组件 watch 该 prop
  │ → parseEnvelope → 渲染。信封 series[].points 是降采样后的时间序列（ts 秒 + value）。
  └────────────────────────────────────────────────────────────────────────────
  语义：行 = 设备（信封的一条 series），列 = 时间桶，格色 = 该设备该桶的量。
  对标 Grafana「Month Power Total」——密集小格（Grafana 面板风格），不留大块空白。

  三条易错点（本图元踩过的坑，勿改回）：
  1. **桶基准取「首个有 points 的序列」而非字面 series[0]**：首条序列报错无点时，
     字面取法会让整张矩阵退化成空图，白丢其它序列的数据。
  2. **其余序列按 ts 精确匹配入格**：匹配不上的格留空（不画 0 值——那会谎报
     「该时段无负荷」）。故 x 桶集合只认基准序列的 ts，不做并集。
  3. **图表容器常驻 DOM**：空态用覆盖层遮住（v-if 会让容器消失 → onMounted 拿不到
     元素 → echarts 永不初始化 → 数据到达后仍空白）。
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
  formatShort,
  parseEnvelope,
  panelHint,
  panelState,
  type BiSeriesResult,
} from './bi-chart-kit'

echarts.use([HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent, CanvasRenderer])

type MatrixOption = ComposeOption<
  HeatmapSeriesOption | GridComponentOption | TooltipComponentOption | VisualMapComponentOption
>

/** 卡片底色（Grafana 面板底）；同时用作格子间隙色——间隙与底同色 → 密集小格观感。 */
const CARD_BG = '#161b22'
/** 连续色阶：低值深蓝/青 → 中值黄 → 高值红。 */
const SCALE = ['#0b3d5c', '#1f6feb', '#f5a623', '#f85149']

const props = defineProps<{
  fill?: string          // 强调色（标题前的小色条，不做橙色描边框）
  title?: string         // 面板标题
  series?: string        // 查询规格 JSON 串（组态员填，宿主据此发 /history/batch）
  agg?: string           // 窗口聚合口径（宿主用）
  interval?: number      // 桶宽（秒）
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
 * 桶标签：同一天内 'HH:mm'（更紧凑），跨天 'MM-DD HH:mm'（消歧）。
 * formatShort 统一输出 'MM-DD HH:mm'，故 HH:mm 由截取得到——不另写一份日期格式化。
 */
function bucketLabel(ts: number, withDate: boolean): string {
  return withDate ? formatShort(ts) : formatShort(ts).slice(6)
}

/**
 * 矩阵：x = 时间桶，y = 设备（序列），格值 = 该序列该桶的值。
 * - x 桶基准 = 首个有点的序列的 ts 集合（去重后按时间序）
 * - 其余序列按 ts **精确匹配**入格；匹配不上 → 留空（不谎报 0）
 * - y 行 = 信封里的全部序列（无点的序列留一行空格，不隐藏该设备）
 */
const matrix = computed<{
  xs: string[]
  ys: string[]
  cells: Array<[number, number, number]>
  min: number
  max: number
}>(() => {
  const e = env.value
  if (!e) return { xs: [], ys: [], cells: [], min: 0, max: 0 }

  const base = e.series.find((s: BiSeriesResult) => s.points.length > 0)
  if (!base) return { xs: [], ys: [], cells: [], min: 0, max: 0 }

  const buckets = [...new Set(base.points.map((p) => p.ts))].sort((a, b) => a - b)
  const bucketIndex = new Map(buckets.map((t, i) => [t, i]))
  // 跨天必须带日期：同一 HH:mm 会在轴上出现两次 → 不带日期即歧义
  const withDate = buckets.length > 0 && dayKey(buckets[0]) !== dayKey(buckets[buckets.length - 1])
  const xs = buckets.map((t) => bucketLabel(t, withDate))

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
  const lo = values.length ? Math.min(...values) : 0
  const hi = values.length ? Math.max(...values) : 0
  return { xs, ys, cells, min: lo, max: hi === lo ? lo + 1 : hi }
})

/** 局部失败提示：某序列报错时给出文案（其余行照常上色）。 */
const errText = computed(() => env.value?.series.find((s) => s.error !== null)?.error ?? '')

function draw(): void {
  if (!chart) return
  const m = matrix.value
  const opt: MatrixOption = {
    animation: false,
    backgroundColor: BI_THEME.bg,
    textStyle: { fontFamily: BI_THEME.fontFamily },
    // 密集小格：边距压到最小，containLabel 让轴标签不裁切
    grid: { left: 6, right: 42, top: 6, bottom: 18, containLabel: true },
    tooltip: {
      position: 'top',
      backgroundColor: '#161b22',
      borderColor: BI_THEME.axisLine,
      textStyle: { color: BI_THEME.text, fontSize: 13 },
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
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 12, hideOverlap: true },
      axisLine: { lineStyle: { color: BI_THEME.axisLine } },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category',
      data: m.ys,
      // 第一条序列显示在最上方（读表顺序：上→下 = 配置顺序）
      inverse: true,
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 12 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitArea: { show: false },
    },
    visualMap: {
      type: 'continuous',
      min: m.min,
      max: m.max,
      calculable: false,
      orient: 'vertical',
      right: 2,
      top: 'middle',
      itemWidth: 10,
      itemHeight: 90,
      textStyle: { color: BI_THEME.legend, fontSize: 12 },
      inRange: { color: SCALE },
    },
    series: [{
      type: 'heatmap',
      name: '值',
      data: m.cells,
      label: { show: false },
      // 1px 边框与卡片底同色 → 格间出现细缝（Grafana 密集小格观感）
      itemStyle: { borderWidth: 1, borderColor: CARD_BG },
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
  <div class="ah-bmx" :style="{ background: CARD_BG, border: '1px solid #21262d' }">
    <div v-if="props.title" class="ah-bmx-title">
      <i class="ah-bmx-accent" :style="{ background: props.fill ?? '#58a6ff' }"></i>
      <span>{{ props.title }}</span>
    </div>
    <!-- 局部失败提示：有格可画时只提示，不遮图 -->
    <div v-if="errText && matrix.cells.length" class="ah-bmx-err">{{ errText }}</div>
    <!-- 图表容器**常驻**（v-if 会让空态时容器消失 → onMounted 拿不到元素 →
         echarts 永不初始化，数据到达后仍空白）。空态用覆盖层遮住图表。 -->
    <div class="ah-bmx-body">
      <div ref="chartEl" class="ah-bmx-plot"></div>
      <div v-if="!matrix.cells.length" class="ah-bmx-hint" :class="{ err: state === 'error' }">
        {{ hint || '暂无历史数据' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.ah-bmx {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bmx-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 0;
  font-size: 14px;
  color: #c9d1d9;
}
.ah-bmx-accent {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex: none;
}
.ah-bmx-err {
  padding: 2px 8px 0;
  font-size: 12px;
  color: #f85149;
}
.ah-bmx-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.ah-bmx-hint {
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
.ah-bmx-hint.err {
  color: #f85149;
}
.ah-bmx-plot {
  width: 100%;
  height: 100%;
}
</style>
