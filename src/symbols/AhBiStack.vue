<!--
  状态时长堆叠条（ah-bi-stack，vue 型）：多序列「占比构成」横向百分比堆叠条。
  ┌─ 数据通道（通道 B，契约见 docs/plans/2026-10-29-bi-monitoring-dashboard-design.md）──
  │ 图元不自开 EventSource、不轮询——宿主聚合收集器（lib/bi-collector.ts）把聚合
  │ 信封 JSON 串写进 props.data（maotu props 直写，路径 props.data.val），
  │ 本组件 watch 该 prop → parseEnvelope → 渲染。
  │ 信封的 series[].value 是**整窗单值**（宿主已算好累计量的窗口增量 delta），
  │ 故本图元直接按 value 做占比，不再自行求和/求差。
  └────────────────────────────────────────────────────────────────────────────
  语义：每条序列一个色块，宽度 = 该序列 value 占全部 value 之和的百分比——
  用于「电/水/气 用量构成」「各设备占比」这类构成分析。
  非数值（value=null）序列不进构成（不是 0 宽度色块——那会谎报占比）。
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
  formatValue,
  parseEnvelope,
  panelHint,
  panelState,
  seriesColor,
  type BiSeriesResult,
} from './bi-chart-kit'

echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

type StackOption = ComposeOption<
  BarSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption
>

const props = defineProps<{
  fill?: string          // 强调色（面板边框）
  title?: string         // 面板标题
  series?: string | Array<Record<string, unknown>>  // 查询规格 JSON 串（组态员填）
  agg?: string           // 窗口聚合口径
  interval?: number      // 桶宽（秒）
  windowSecs?: number    // 统计窗（秒）
  shape?: string         // 取数形态
  data?: string          // 运行时数据通道（宿主写回）
}>()

const chartEl = ref<HTMLDivElement | null>(null)
let chart: ReturnType<typeof echarts.init> | null = null
let ro: ResizeObserver | null = null

const env = computed(() => parseEnvelope(props.data))
const state = computed(() => panelState(env.value))
const hint = computed(() => panelHint(state.value, env.value))

/** 参与构成的序列：value 为非负有限数（负值与 null 不进构成） */
const parts = computed<Array<{ label: string; value: number; color: string }>>(() => {
  const e = env.value
  if (!e) return []
  const rows: Array<{ label: string; value: number; color: string }> = []
  e.series.forEach((s: BiSeriesResult, i: number) => {
    const v = s.value
    if (v === null || !Number.isFinite(v) || v < 0) return
    rows.push({ label: s.label || s.key, value: v, color: seriesColor(s, i) })
  })
  return rows
})

const total = computed(() => parts.value.reduce((n, p) => n + p.value, 0))

/** 百分比构成（总和为 0 时全为 0——空态另有占位，不靠这里表达） */
const shares = computed(() => parts.value.map((p) => ({
  ...p,
  pct: total.value > 0 ? (p.value / total.value) * 100 : 0,
})))

function draw(): void {
  if (!chart) return
  const rows = shares.value
  const series: BarSeriesOption[] = rows.map((p) => ({
    type: 'bar',
    name: p.label,
    stack: 'bi-stack',
    data: [p.pct],
    itemStyle: { color: p.color },
    emphasis: { focus: 'none' },
  }))
  const opt: StackOption = {
    animation: false,
    backgroundColor: BI_THEME.bg,
    textStyle: { fontFamily: BI_THEME.fontFamily },
    grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
    legend: {
      type: 'scroll',
      orient: 'horizontal',
      bottom: 0,
      itemWidth: 10,
      itemHeight: 8,
      textStyle: { color: BI_THEME.legend, fontSize: 10 },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: '#161b22',
      borderColor: '#30363d',
      textStyle: { color: BI_THEME.text, fontSize: 11 },
      formatter: (p: unknown) => {
        const it = p as { name?: string; value?: number; seriesName?: string }
        const row = rows.find((r) => r.label === (it.name ?? it.seriesName))
        if (!row) return ''
        return `${row.label}<br/>${formatValue(row.value)}（${row.pct.toFixed(1)}%）`
      },
    },
    xAxis: {
      type: 'value',
      max: 100,
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 9, formatter: '{value}%' },
      axisLine: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: [''],
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
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
watch(parts, () => draw())
</script>

<template>
  <div class="ah-bs" :style="{ background: '#0d1117', border: `1px solid ${props.fill ?? '#f5a623'}` }">
    <div v-if="props.title" class="ah-bs-title">{{ props.title }}</div>
    <!-- 图表容器**常驻**（v-if 会让空态时容器消失 → onMounted 拿不到元素 →
         echarts 永不初始化，数据到达后仍空白）。空态用覆盖层遮住图表。 -->
    <div class="ah-bs-body">
      <div ref="chartEl" class="ah-bs-plot"></div>
      <div v-if="state !== 'ok'" class="ah-bs-hint" :class="{ err: state === 'error' }">{{ hint }}</div>
    </div>
    <template v-if="state === 'ok'">
      <div class="ah-bs-legend">
        <span v-for="p in shares" :key="p.label" class="ah-bs-item">
          <i class="ah-bs-dot" :style="{ background: p.color }"></i>
          <span class="ah-bs-label">{{ p.label }}</span>
          <b class="ah-bs-pct" :style="{ color: p.color }">{{ p.pct.toFixed(1) }}%</b>
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ah-bs {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bs-title {
  padding: 4px 8px 0;
  font-size: 11px;
  color: #8b949e;
}
.ah-bs-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.ah-bs-hint {
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
.ah-bs-hint.err {
  color: #f85149;
}
.ah-bs-plot {
  width: 100%;
  height: 100%;
}
.ah-bs-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  padding: 0 8px 4px;
  font-size: 10px;
  color: #8b949e;
}
.ah-bs-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  margin-right: 4px;
}
.ah-bs-label {
  margin-right: 2px;
}
.ah-bs-pct {
  font-weight: 600;
}
</style>
