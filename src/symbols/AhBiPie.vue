<!-- 占比环图（BI 首批 vue 型图元）：多序列整窗单值构成占比环（echarts PieChart，环形）。
     ┌─ 数据通道（通道 B，宿主写回）──────────────────────────────
     │ 图元**不发请求、不轮询**：宿主 ViewView 的聚合收集器把信封 JSON 串
     │ 写进本图元 props.data.val（maotu props 直写），本组件 watch 该 prop
     │ → parseEnvelope（bi-chart-kit）→ 过滤 → setOption 重绘。
     │ 信封内 series[i].value = 整窗单值（cumulative 序列已是窗口增量 delta）；
     │ value 为 null 或 ≤0 的序列**排除出环**（不是 0 值饼块）；
     │ 全部被排除 → 空态占位。
     └──────────────────────────────────────────────────────────
     环心总量用 overlay div（绝对定位叠在环心）——比 echarts graphic/title 轻，
     字体随宿主主题走，不受 echarts 文本度量限制。
     echarts 按需引入（PieChart + Legend + Tooltip + CanvasRenderer）；
     卸载时 dispose + 断开 ResizeObserver（jsdom/无 RO 环境降级：typeof 守卫）。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { PieSeriesOption } from 'echarts/charts'
import type { LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import { BI_THEME, firstError, formatValue, parseEnvelope, seriesColor } from './bi-chart-kit'

echarts.use([PieChart, LegendComponent, TooltipComponent, CanvasRenderer])

type PieOption = ComposeOption<PieSeriesOption | LegendComponentOption | TooltipComponentOption>

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

/** 一条占比项（信封序列 → 候选扇区；value 可能为 null）。 */
interface PieItem {
  label: string
  value: number | null
  color: string
  err: string | null
}

/** 一个真实扇区（value 必有值）。 */
interface PieSlice {
  label: string
  value: number
  color: string
}

const chartEl = ref<HTMLDivElement | null>(null)
let chart: ReturnType<typeof echarts.init> | null = null
let ro: ResizeObserver | null = null

/** 解析后的信封（坏 JSON / 非对象 → null → 空态）。 */
const env = computed(() => parseEnvelope(props.data))

/** 全部序列（保留原始序号 → 调色板轮转位稳定）。 */
const allItems = computed<PieItem[]>(() =>
  (env.value?.series ?? []).map((s, i) => ({
    label: s.label || s.key || `#${i + 1}`,
    value: s.value,
    err: s.error,
    color: seriesColor(s, i),
  })),
)

/** 入环扇区：value 非空且 > 0（null / 0 / 负值不是饼块，排除）。 */
const slices = computed<PieSlice[]>(() =>
  allItems.value
    .filter((it): it is PieItem & { value: number } => it.value !== null && it.value > 0)
    .map((it) => ({ label: it.label, value: it.value, color: it.color })),
)

/** 面板态：有扇区 → ok；全无扇区且有报错 → error；否则 empty。 */
const state = computed<'ok' | 'empty' | 'error'>(() => {
  if (slices.value.length > 0) return 'ok'
  if (allItems.value.some((it) => it.err)) return 'error'
  return 'empty'
})

/** 占位提示文案。 */
const hint = computed(() =>
  state.value === 'error' ? firstError(env.value) || '数据查询失败' : '暂无历史数据',
)

/** 环心总量（各扇区之和）。 */
const total = computed(() => slices.value.reduce((sum, it) => sum + it.value, 0))

/** 环心单位（占比面板内各序列通常同单位）。 */
const unitText = computed(() => (env.value?.series ?? []).find((s) => s.unit)?.unit ?? '')

/** 重绘：空/错态清空画布（遮罩给提示文案），有数据则整体覆盖式 setOption。 */
function draw(): void {
  if (!chart) return
  if (state.value !== 'ok') {
    chart.clear()
    return
  }
  const opt: PieOption = {
    animation: false,
    backgroundColor: BI_THEME.bg,
    textStyle: { fontFamily: BI_THEME.fontFamily, color: BI_THEME.text },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(13,17,23,0.92)',
      borderColor: BI_THEME.axisLine,
      textStyle: { color: BI_THEME.text, fontSize: 11 },
      valueFormatter: (v) => `${formatValue(Number(v))} ${unitText.value}`.trim(),
    },
    legend: {
      orient: 'vertical',
      right: 6,
      top: 'middle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: BI_THEME.legend, fontSize: 10 },
      formatter: (name: string) => {
        const it = slices.value.find((s) => s.label === name)
        if (!it) return name
        const pct = total.value > 0 ? (it.value / total.value) * 100 : 0
        return `${name}  ${pct.toFixed(1)}%`
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['34%', '50%'],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: '#0d1117', borderWidth: 2 },
        data: slices.value.map((it) => ({
          name: it.label,
          value: it.value,
          itemStyle: { color: it.color },
        })),
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
    class="ah-bip"
    :style="{ '--ah-accent': props.fill ?? '#f5a623' }"
  >
    <div class="ah-bip-head">{{ props.title }}</div>
    <div class="ah-bip-body">
      <div ref="chartEl" class="ah-bip-plot"></div>
      <div v-if="state === 'ok'" class="ah-bip-center">
        <div class="ah-bip-total">{{ formatValue(total) }}</div>
        <div class="ah-bip-unit">{{ unitText }}</div>
      </div>
      <div v-else class="ah-bip-mask">{{ hint }}</div>
    </div>
  </div>
</template>

<style scoped>
.ah-bip {
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
.ah-bip-head {
  font-size: 11px;
  color: #8b949e;
  padding: 4px 8px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ah-bip-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.ah-bip-plot {
  width: 100%;
  height: 100%;
}
.ah-bip-center {
  position: absolute;
  left: 34%;
  top: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  pointer-events: none;
  max-width: 40%;
}
.ah-bip-total {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ah-bip-unit {
  font-size: 9px;
  color: #8b949e;
}
.ah-bip-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #8b949e;
  background: #161b22;
}
</style>
