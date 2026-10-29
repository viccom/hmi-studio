<!--
  BI 多设备堆叠面积图（ah-bi-stack-area，vue 型）。
  ┌─ 数据通道（通道 B，契约见 docs/plans/2026-10-29-bi-monitoring-dashboard-design.md）──
  │ 图元不自开 EventSource、不轮询——宿主聚合收集器把聚合信封 JSON 串写进
  │ props.data（maotu props 直写，路径 props.data.val），本组件 watch 该 prop
  │ → parseEnvelope → 渲染。信封 series[].points 是降采样后的时间序列（ts 秒 + value）。
  └────────────────────────────────────────────────────────────────────────────
  语义：每条序列一层堆叠面积——看总量（堆叠上沿）也看构成（每层厚度）。
  对标 Grafana「Hourly Power by Device」。

  三条易错点（本图元踩过的坑，勿改回）：
  1. **刻度单位是秒**：信封 points[].ts 为秒级时间戳，而 echarts 的 time 轴把数值
     当**毫秒**解释。故轴标签与 tooltip 标题都必须自带 formatter（formatShort 吃秒），
     否则会显示 1970 epoch；x 轴另加 scale:true，避免时间轴按「毫秒」口径把
     范围外扩（外扩会把整条曲线挤成一角）。
  2. **堆叠靠 stack 参数**：每层 series 挂同一个 stack 名 + areaStyle，echarts
     按同一 x 值累加；不同序列桶 ts 不一致处留空档（不填 0——那会谎报该时段无负荷）。
  3. **图表容器常驻 DOM**：空态用覆盖层遮住（v-if 会让容器消失 → onMounted 拿不到
     元素 → echarts 永不初始化 → 数据到达后仍空白）。
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

type StackAreaOption = ComposeOption<
  LineSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption
>

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

/** 参与堆叠的层：有点的序列才成层（无点的序列不占图例也不占层）。 */
const layers = computed<Array<{ label: string; color: string; data: Array<[number, number]> }>>(() => {
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

/** 局部失败提示：某序列报错时给出文案（其余层照常堆叠）。 */
const errText = computed(() => env.value?.series.find((s) => s.error !== null)?.error ?? '')

/**
 * x 轴量程（秒）：显式钉住 min/max。
 *
 * 原因：time 轴按「毫秒」口径做 nice 取整外扩，而本图元的数值是**秒**——
 * 外扩量按毫秒算（1000ms = 1000 秒 ≈ 16.7 分钟），短窗下会把曲线挤到一角。
 * 显式给 min/max 后轴范围 = 数据范围（数值空间一致，标签仍按秒解读 → 显示正确）。
 */
const extent = computed<{ min: number; max: number } | null>(() => {
  const ts = layers.value.flatMap((r) => r.data.map((p) => p[0]))
  if (!ts.length) return null
  const lo = Math.min(...ts)
  const hi = Math.max(...ts)
  return hi > lo ? { min: lo, max: hi } : null
})

/** 轴/指针标签：秒级时间戳 → 文本（formatShort 吃秒，缺 formatter 会显示 1970 epoch）。 */
function tickLabel(v: unknown): string {
  const raw = Array.isArray(v) ? v[0] : v
  const n = Number(raw)
  return Number.isFinite(n) ? formatShort(n) : ''
}

function draw(): void {
  if (!chart) return
  const rows = layers.value
  const series: LineSeriesOption[] = rows.map((r) => ({
    type: 'line',
    name: r.label,
    stack: 'bi-stack-area',
    showSymbol: false,
    smooth: false,
    lineStyle: { width: 1, color: r.color },
    itemStyle: { color: r.color },
    areaStyle: { color: r.color, opacity: 0.8 },
    emphasis: { focus: 'series' },
    data: r.data,
  }))
  const opt: StackAreaOption = {
    animation: false,
    backgroundColor: BI_THEME.bg,
    textStyle: { fontFamily: BI_THEME.fontFamily },
    grid: { left: 54, right: 16, top: 28, bottom: 28 },
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
      // tooltip 标题来自 axisPointer 的 label（缺省按毫秒格式化 → 会显示 1970 epoch）
      axisPointer: { label: { formatter: (p: { value: unknown }) => tickLabel(p.value) } },
    },
    xAxis: {
      type: 'time',
      // 钉住量程：避免 time 轴按「毫秒」口径 nice 外扩（会把曲线挤到一角）
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
  <div class="ah-bsa" :style="{ background: '#161b22', border: '1px solid #21262d' }">
    <div v-if="props.title" class="ah-bsa-title">
      <i class="ah-bsa-accent" :style="{ background: props.fill ?? '#58a6ff' }"></i>
      <span>{{ props.title }}</span>
    </div>
    <!-- 局部失败提示：有层可画时只提示，不遮图 -->
    <div v-if="errText && layers.length" class="ah-bsa-err">{{ errText }}</div>
    <!-- 图表容器**常驻**（v-if 会让空态时容器消失 → onMounted 拿不到元素 →
         echarts 永不初始化，数据到达后仍空白）。空态用覆盖层遮住图表。 -->
    <div class="ah-bsa-body">
      <div ref="chartEl" class="ah-bsa-plot"></div>
      <div v-if="!layers.length" class="ah-bsa-hint" :class="{ err: state === 'error' }">
        {{ hint || '暂无历史数据' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.ah-bsa {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bsa-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 0;
  font-size: 12px;
  color: #c9d1d9;
}
.ah-bsa-accent {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex: none;
}
.ah-bsa-err {
  padding: 2px 8px 0;
  font-size: 10px;
  color: #f85149;
}
.ah-bsa-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.ah-bsa-hint {
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
.ah-bsa-hint.err {
  color: #f85149;
}
.ah-bsa-plot {
  width: 100%;
  height: 100%;
}
</style>
