<!-- 趋势图表（P2 vue 型，本批核心件）：echarts 折线趋势 × 3 曲线，深色工业主题。
     ┌─ 数据通道机制（设计裁定，组态必读）──────────────────────────────
     │ 图元不自开 EventSource、不轮询——宿主 ViewView 已建立 SSE 数据流，
     │ vue 图元拿不到宿主桥回调，故借 maotu bind 双通道的**直写通道**进数：
     │ 组态把 SSE field 绑到 tick0/tick1/tick2（bind_attr = props.tick0.val，
     │ 每个 bind 一条曲线），setDevicePointByID 直写 → 本组件 watch 该 prop
     │ → {到达时刻, 值} push 进对应曲线环形缓冲（trend-buffer 纯函数，容量 =
     │ 窗口/采样估算 + 时间窗裁剪）→ 节流 ≥1s echarts setOption 重绘。
     │ points（textArea JSON 串）只描述曲线元数据 field/label/unit/color——
     │ field 供组态员对照 bind_id，不参与取数；两处须填同一个 field。
     └──────────────────────────────────────────────────────────────
     卸载 dispose + ResizeObserver 断开；jsdom/无 RO 环境降级（typeof 守卫）。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { LineSeriesOption } from 'echarts/charts'
import type { GridComponentOption } from 'echarts/components'
import {
  estimateMaxN, parsePoints, pushPoint, toPointValue, trimWindow,
  type TrendPoint,
} from './trend-buffer'

echarts.use([LineChart, GridComponent, CanvasRenderer])

type TrendOption = ComposeOption<LineSeriesOption | GridComponentOption>

const props = defineProps<{
  fill?: string          // 强调色：容器边框（可绑告警变色）
  points?: string | Array<Record<string, unknown>>  // 曲线元数据 JSON（≤3 条）
  tick0?: number | string  // 数据通道 0（bind 直写入口）
  tick1?: number | string  // 数据通道 1
  tick2?: number | string  // 数据通道 2
  windowSecs?: number      // 趋势窗口（秒）
  yUnit?: string           // Y 轴单位
}>()

const chartEl = ref<HTMLDivElement | null>(null)
let chart: ReturnType<typeof echarts.init> | null = null
let ro: ResizeObserver | null = null
let bufs: TrendPoint[][] = []
let lastSet = 0
let pending: ReturnType<typeof setTimeout> | null = null

const ss = computed(() => parsePoints(props.points))
const winMs = computed(() => {
  const s = Number(props.windowSecs)
  return (Number.isFinite(s) && s > 0 ? s : 600) * 1000
})
const maxN = computed(() => estimateMaxN(Number(props.windowSecs)))
const winLabel = computed(() => `近 ${Number(props.windowSecs) > 0 ? Number(props.windowSecs) : 600}s`)
const lasts = ref<(number | null)[]>([])
const nTotal = ref(0)

function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '--'
  return String(Number(v.toPrecision(5)))
}

function syncCounters(): void {
  nTotal.value = bufs.reduce((n, b) => n + b.length, 0)
  lasts.value = ss.value.map((_, i) => bufs[i]?.[bufs[i].length - 1]?.v ?? null)
}

function draw(): void {
  if (!chart) return
  const series = ss.value.map((s, i) => ({
    type: 'line' as const,
    name: s.label,
    showSymbol: false,
    data: (bufs[i] ?? []).map((p) => [p.t, p.v]),
    lineStyle: { width: 1.5, color: s.color },
    itemStyle: { color: s.color },
  }))
  const opt: TrendOption = {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Consolas, Menlo, monospace' },
    grid: { left: 48, right: 14, top: 24, bottom: 22 },
    xAxis: {
      type: 'time',
      axisLabel: { color: '#8b949e', fontSize: 9, formatter: '{HH}:{mm}:{ss}', hideOverlap: true },
      axisLine: { lineStyle: { color: '#30363d' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: props.yUnit ?? '',
      nameTextStyle: { color: '#8b949e', fontSize: 9 },
      axisLabel: { color: '#8b949e', fontSize: 9 },
      splitLine: { lineStyle: { color: '#1c2128' } },
    },
    series,
  }
  chart.setOption(opt, { notMerge: true })
}

/** setOption 节流：≥1s 一次；窗口期内的到达只登记一次尾随重绘（数据不丢、重绘不抖） */
function scheduleDraw(): void {
  if (!chart) return
  const now = Date.now()
  if (now - lastSet >= 1000) {
    if (pending !== null) { clearTimeout(pending); pending = null }
    lastSet = now
    draw()
    return
  }
  if (pending === null) {
    pending = setTimeout(() => {
      pending = null
      lastSet = Date.now()
      draw()
    }, 1000 - (now - lastSet))
  }
}

/** 通道直写入队：非数值拒收、未配置曲线的通道忽略、入队即裁窗 + 计数 + 节流重绘 */
function push(k: number, raw: unknown): void {
  if (k >= ss.value.length) return
  const v = toPointValue(raw)
  if (v === null) return
  const now = Date.now()
  bufs[k] = trimWindow(pushPoint(bufs[k] ?? [], now, v, maxN.value), now, winMs.value)
  syncCounters()
  scheduleDraw()
}

watch(() => props.tick0, (v) => push(0, v))
watch(() => props.tick1, (v) => push(1, v))
watch(() => props.tick2, (v) => push(2, v))
watch(() => props.windowSecs, () => {
  const now = Date.now()
  bufs = bufs.map((b) => trimWindow(b, now, winMs.value))
  syncCounters()
  scheduleDraw()
})

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
  if (pending !== null) { clearTimeout(pending); pending = null }
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div
    class="ah-trc"
    :style="{ background: '#0d1117', border: `1px solid ${props.fill ?? '#f5a623'}` }"
  >
    <div class="ah-trc-head">
      <span class="ah-trc-win">{{ winLabel }}</span>
      <span class="ah-trc-n">{{ nTotal }} 点</span>
    </div>
    <div ref="chartEl" class="ah-trc-plot"></div>
    <div class="ah-trc-legend">
      <span v-for="(s, i) in ss" :key="s.field + i" class="ah-trc-item">
        <i class="ah-trc-dot" :style="{ background: s.color }"></i>
        <span class="ah-trc-label">{{ s.label }}</span>
        <b class="ah-trc-last" :style="{ color: s.color }">{{ fmt(lasts[i]) }}</b>
        <span class="ah-trc-unit">{{ s.unit }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.ah-trc {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-trc-head {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px 0;
  font-size: 10px;
  color: #8b949e;
}
.ah-trc-plot {
  flex: 1;
  min-height: 0;
}
.ah-trc-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  padding: 0 8px 4px;
  font-size: 10px;
  color: #8b949e;
}
.ah-trc-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  margin-right: 4px;
}
.ah-trc-label {
  margin-right: 2px;
}
.ah-trc-last {
  font-weight: 600;
  margin-right: 2px;
}
</style>
