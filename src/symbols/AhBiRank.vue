<!-- 排名条形图（BI 首批 vue 型图元）：多序列按整窗单值降序，横向条形（echarts BarChart）。
     ┌─ 数据通道（通道 B，宿主写回）──────────────────────────────
     │ 图元**不发请求、不轮询**：宿主 ViewView 的聚合收集器把信封 JSON 串
     │ 写进本图元 props.data.val（maotu props 直写），本组件 watch 该 prop
     │ → parseEnvelope（bi-chart-kit）→ 排序 → setOption 重绘。
     │ 信封内 series[i].value = 整窗单值（cumulative 序列已是窗口增量 delta）；
     │ value=null 的序列画 0 长条并在条端标注「无数据」；无数据整体 → 空态占位。
     └──────────────────────────────────────────────────────────
     echarts 按需引入（BarChart + Grid + Tooltip + CanvasRenderer）；
     卸载时 dispose + 断开 ResizeObserver（jsdom/无 RO 环境降级：typeof 守卫）。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components'
import {
  BI_THEME, firstError, formatValue, parseEnvelope, seriesColor,
} from './bi-chart-kit'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

type RankOption = ComposeOption<BarSeriesOption | GridComponentOption | TooltipComponentOption>

const props = defineProps<{
  fill?: string          // 强调色：容器边框
  title?: string         // 面板标题
  series?: string        // 查询规格 JSON 串（组态员填）
  agg?: string           // 聚合口径（宿主用）
  interval?: number      // 桶宽（秒）
  windowSecs?: number    // 统计窗长（秒）
  shape?: string         // 取数形态：aggregate / series
  data?: string          // 运行时数据通道（宿主写回的信封 JSON 串）
}>()

/** 一条排名行（信封序列 → 排名条目）。 */
interface RankItem {
  label: string
  value: number | null
  color: string
  err: string | null
}

const chartEl = ref<HTMLDivElement | null>(null)
let chart: ReturnType<typeof echarts.init> | null = null
let ro: ResizeObserver | null = null

/** 解析后的信封（坏 JSON / 非对象 → null → 空态）。 */
const env = computed(() => parseEnvelope(props.data))

/** 排名条目（保留原始序号 → 调色板轮转位稳定）。 */
const items = computed<RankItem[]>(() =>
  (env.value?.series ?? []).map((s, i) => ({
    label: s.label || s.key || `#${i + 1}`,
    value: s.value,
    color: seriesColor(s, i),
    err: s.error,
  })),
)

/**
 * 面板态：**部分序列坏不拖全屏**（契约 §1.4「单图失败不拖全屏」）——
 * 有可用值即 ok（坏序列画 0 长条并标「无数据」）；全无值且有报错 → error；否则 empty。
 */
const state = computed<'ok' | 'empty' | 'error'>(() => {
  if (items.value.some((it) => it.value !== null)) return 'ok'
  if (items.value.some((it) => it.err)) return 'error'
  return 'empty'
})

/** 占位提示文案（错误态给出失败原因，空态给「暂无历史数据」）。 */
const hint = computed(() =>
  state.value === 'error' ? firstError(env.value) || '数据查询失败' : '暂无历史数据',
)

/** 单位（取首个非空 unit，排名面板内各序列通常同单位）。 */
const unitText = computed(() => (env.value?.series ?? []).find((s) => s.unit)?.unit ?? '')

/**
 * 排名行序：按值降序（null 沉底）；echarts 类目轴自下而上排布，
 * 故再反转一次 —— 结果数组末尾 = 最大值 → 渲染在顶部。
 */
const ranked = computed<RankItem[]>(() => {
  const sorted = [...items.value]
  sorted.sort((a, b) => {
    const av = a.value === null ? -Infinity : a.value
    const bv = b.value === null ? -Infinity : b.value
    if (av === bv) return 0
    return bv > av ? 1 : -1
  })
  return sorted.reverse()
})

/** 重绘：空/错态清空画布（遮罩给提示文案），有数据则整体覆盖式 setOption。 */
function draw(): void {
  if (!chart) return
  if (state.value !== 'ok') {
    chart.clear()
    return
  }
  const rows = ranked.value
  const opt: RankOption = {
    animation: false,
    backgroundColor: BI_THEME.bg,
    textStyle: { fontFamily: BI_THEME.fontFamily, color: BI_THEME.text },
    grid: { left: 4, right: 8, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(13,17,23,0.92)',
      borderColor: BI_THEME.axisLine,
      textStyle: { color: BI_THEME.text, fontSize: 13 },
      valueFormatter: (v) => `${formatValue(Number(v))} ${unitText.value}`.trim(),
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 11 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: BI_THEME.splitLine } },
    },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.label),
      axisLabel: { color: BI_THEME.axisLabel, fontSize: 12 },
      axisLine: { lineStyle: { color: BI_THEME.axisLine } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    series: [
      {
        type: 'bar',
        name: props.title || '排名',
        barMaxWidth: 18,
        data: rows.map((r) => ({ value: r.value ?? 0, itemStyle: { color: r.color } })),
        label: {
          show: true,
          position: 'right',
          color: BI_THEME.text,
          fontSize: 12,
          formatter: (p: { value: unknown; dataIndex: number }) => {
            const it = rows[p.dataIndex]
            if (!it || it.value === null) return '无数据'
            return formatValue(it.value)
          },
        },
      },
    ],
  }
  chart.setOption(opt, { notMerge: true })
}

watch(() => props.data, () => draw())

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
</script>

<template>
  <div
    class="ah-bir"
    :style="{ '--ah-accent': props.fill ?? '#f5a623' }"
  >
    <div class="ah-bir-head">{{ props.title }}</div>
    <div class="ah-bir-body">
      <div ref="chartEl" class="ah-bir-plot"></div>
      <div v-if="state !== 'ok'" class="ah-bir-mask">{{ hint }}</div>
    </div>
  </div>
</template>

<style scoped>
.ah-bir {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border-radius: 4px;
  overflow: hidden;
  background: #161b22;
  color: #c9d1d9;
  font-family: Consolas, Menlo, monospace;
  display: flex;
  flex-direction: column;
}
.ah-bir-head {
  font-size: 13px;
  color: #8b949e;
  padding: 4px 8px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ah-bir-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.ah-bir-plot {
  width: 100%;
  height: 100%;
}
.ah-bir-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #8b949e;
  background: #161b22;
}
</style>
