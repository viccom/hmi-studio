<!-- KPI 数字卡（BI 首批 vue 型图元）：一个主数值 + 单位 + 标签 + 迷你趋势（sparkline）。
     ┌─ 数据通道（通道 B，宿主写回）──────────────────────────────
     │ 图元**不发请求、不轮询**：宿主 ViewView 的聚合收集器把信封 JSON 串
     │ 写进本图元 props.data.val（maotu props 直写），本组件 watch 该 prop
     │ → parseEnvelope（bi-chart-kit）→ 渲染。
     │ 信封形状：{v, window, generatedAt, series:[{key,label,unit,color,mode,
     │ metric,value,points,error}]}——本图元只消费 series[0]：
     │   value  = 整窗单值（累计量的 cumulative 序列已是窗口增量 delta）
     │   points = 时间序列（仅用于迷你趋势）
     │ 无数据（value===null）→ 显示 '--'；序列报错 → 显示错误提示文案。
     └──────────────────────────────────────────────────────────
     迷你趋势用**内联 SVG polyline** 绘制（不引 echarts——一条折线不值一个图表
     实例的内存与初始化代价）。组件无 onMounted 资源，故无卸载清理义务。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { BI_PALETTE, formatValue, parseEnvelope } from './bi-chart-kit'

const props = defineProps<{
  fill?: string          // 强调色：容器边框 + 主数值色
  title?: string         // 面板标题
  series?: string        // 查询规格 JSON 串（组态员填）
  agg?: string           // 聚合口径（宿主用）
  interval?: number      // 桶宽（秒）
  windowSecs?: number    // 统计窗长（秒）
  shape?: string         // 取数形态：aggregate / series
  data?: string          // 运行时数据通道（宿主写回的信封 JSON 串）
}>()

/** 解析后的信封（坏 JSON / 非对象 → null → 空态）。 */
const env = computed(() => parseEnvelope(props.data))

/** 主序列：只展示第一条（组态员配多条时以首条为准，保持单卡语义）。 */
const first = computed(() => env.value?.series[0] ?? null)

/** 序列错误文案（空串 = 无错误）。 */
const errText = computed(() => first.value?.error ?? '')

/** 是否有可用数值（null = 无数据，不是 0）。 */
const hasValue = computed(() => first.value !== null && first.value.value !== null)

/** 主数值文本（无数据 → '--'）。 */
const valueText = computed(() => formatValue(first.value?.value ?? null))

/** 序列标签（缺省回落 key）。 */
const labelText = computed(() => first.value?.label || first.value?.key || '')

/** 单位。 */
const unitText = computed(() => first.value?.unit ?? '')

/** 迷你趋势 polyline 点串（viewBox 0 0 100 24，y 取 3~21）；点数 <2 不画。 */
const sparkPoints = computed(() => {
  const pts = first.value?.points ?? []
  if (pts.length < 2) return ''
  let min = Infinity
  let max = -Infinity
  for (const p of pts) {
    if (p.value < min) min = p.value
    if (p.value > max) max = p.value
  }
  const span = max - min || 1
  const n = pts.length - 1
  return pts
    .map((p, i) => {
      const x = (i / n) * 100
      const y = 21 - ((p.value - min) / span) * 18
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
})
</script>

<template>
  <div
    class="ah-kpi"
    :style="{ border: `1px solid ${props.fill ?? '#f5a623'}` }"
  >
    <div class="ah-kpi-title">{{ props.title }}</div>
    <div class="ah-kpi-label">{{ labelText }}</div>
    <div class="ah-kpi-value" :style="{ color: props.fill ?? '#f5a623' }">
      {{ valueText }}<span class="ah-kpi-unit">{{ unitText }}</span>
    </div>
    <svg
      v-if="sparkPoints"
      class="ah-kpi-spark"
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
    >
      <polyline
        :points="sparkPoints"
        fill="none"
        :stroke="BI_PALETTE[1]"
        stroke-width="1.5"
      />
    </svg>
    <div v-else class="ah-kpi-spark ah-kpi-spark-empty"></div>
    <div v-if="errText" class="ah-kpi-hint ah-kpi-err">{{ errText }}</div>
    <div v-else-if="!hasValue" class="ah-kpi-hint">暂无历史数据</div>
  </div>
</template>

<style scoped>
.ah-kpi {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border-radius: 6px;
  overflow: hidden;
  padding: 4px 8px;
  display: flex;
  flex-direction: column;
  background: #0d1117;
  color: #c9d1d9;
  font-family: Consolas, Menlo, monospace;
}
.ah-kpi-title {
  font-size: 10px;
  color: #8b949e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ah-kpi-label {
  font-size: 11px;
  color: #8b949e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ah-kpi-value {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ah-kpi-unit {
  font-size: 11px;
  color: #8b949e;
  font-weight: 400;
  margin-left: 3px;
}
.ah-kpi-spark {
  width: 100%;
  height: 22px;
  margin-top: 2px;
}
.ah-kpi-spark-empty {
  height: 22px;
}
.ah-kpi-hint {
  font-size: 10px;
  color: #8b949e;
}
.ah-kpi-err {
  color: #f85149;
}
</style>
