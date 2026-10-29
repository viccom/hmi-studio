<!--
  BI 多指标雷达（ah-bi-radar，vue 型，P3）。
  数据通道 = 通道 B。有值序列各成一轴（组态员保证同量纲），一个多边形看相对强弱；
  轴上限 = max(值)×1.2 nice 化（bi-radar.ts niceMax）。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { RadarChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { RadarSeriesOption } from 'echarts/charts'
import type { TooltipComponentOption } from 'echarts/components'
import { BI_PANEL, BI_THEME, formatValue, parseEnvelope, panelHint, panelState, seriesColor, type BiSeriesResult } from './bi-chart-kit'
import { niceMax } from './bi-radar'

echarts.use([RadarChart, TooltipComponent, CanvasRenderer])

type RadarOption = ComposeOption<RadarSeriesOption | TooltipComponentOption>

const props = defineProps<{
  fill?: string      // 强调色（多边形描边）
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

const points = computed<Array<{ label: string; color: string; value: number }>>(() => {
  const e = env.value
  if (!e) return []
  return e.series
    .filter((s: BiSeriesResult) => s.value !== null)
    .map((s: BiSeriesResult, i: number) => ({
      label: s.label || s.key,
      color: i === 0 && props.fill ? props.fill : seriesColor(s, i),
      value: s.value as number,
    }))
})

const rangeMax = computed<number>(() => niceMax(Math.max(0, ...points.value.map((p) => Math.abs(p.value))) * 1.2))

function draw(): void {
  if (!chart || points.value.length < 3) return // 两轴以下画不出多边形——空态提示
  const opt: RadarOption = {
    animation: false,
    backgroundColor: BI_THEME.bg,
    textStyle: { fontFamily: BI_THEME.fontFamily },
    tooltip: {
      backgroundColor: BI_PANEL.card,
      borderColor: BI_THEME.axisLine,
      textStyle: { color: BI_THEME.text, fontSize: 13 },
    },
    radar: {
      indicator: points.value.map((p) => ({ name: p.label, max: rangeMax.value })),
      radius: '62%',
      center: ['50%', '54%'],
      axisName: { color: BI_THEME.axisLabel, fontSize: 12 },
      splitLine: { lineStyle: { color: BI_THEME.splitLine } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: BI_THEME.axisLine } },
    },
    series: [{
      type: 'radar',
      symbolSize: 4,
      lineStyle: { width: 1.5, color: props.fill || BI_PANEL.accent },
      itemStyle: { color: props.fill || BI_PANEL.accent },
      areaStyle: { color: props.fill || BI_PANEL.accent, opacity: 0.25 },
      data: [{
        value: points.value.map((p) => p.value),
        name: props.title || '对比',
      }],
    }],
  }
  chart.setOption(opt, { notMerge: true })
}

/** 读数条：轴少时（<3）退化为数值列表（比空白有用）。 */
const fallback = computed(() => points.value.map((p) => `${p.label}  ${formatValue(p.value)}`))

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
  <div class="ah-brd" :style="{ background: BI_PANEL.card, border: `1px solid ${BI_PANEL.hairline}` }">
    <div v-if="props.title" class="ah-brd-title">
      <i class="ah-brd-accent" :style="{ background: props.fill ?? BI_PANEL.accent }"></i>
      <span>{{ props.title }}</span>
    </div>
    <div class="ah-brd-body">
      <div ref="chartEl" class="ah-brd-plot"></div>
      <!-- 轴 <3 画不出多边形：退化为读数列表；全无数据才显示空态 -->
      <div v-if="!points.length" class="ah-brd-hint" :class="{ err: state === 'error' }">
        {{ hint || '暂无历史数据' }}
      </div>
      <div v-else-if="points.length < 3" class="ah-brd-hint">
        <span v-for="f in fallback" :key="f" class="ah-brd-item">{{ f }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ah-brd {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-brd-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 0;
  font-size: 14px;
  color: #c9d1d9;
}
.ah-brd-accent {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex: none;
}
.ah-brd-body { position: relative; flex: 1; min-height: 0; }
.ah-brd-hint {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 13px;
  color: #8b949e;
  padding: 0 8px;
  text-align: center;
  background: #161b22;
}
.ah-brd-hint.err { color: #f85149; }
.ah-brd-item { color: #c9d1d9; }
.ah-brd-plot { width: 100%; height: 100%; }
</style>
