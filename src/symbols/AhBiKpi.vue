<!--
  KPI 数字卡（BI 图元，Grafana 风格重做 2026-10-29）：大数字 + 卡内迷你趋势（sparkline）。
  ┌─ 数据通道（通道 B，宿主写回）──────────────────────────────
  │ 图元**不发请求、不轮询**：宿主 ViewView 的聚合收集器把信封 JSON 串
  │ 写进本图元 props.data.val（maotu props 直写），本组件 watch 该 prop
  │ → parseEnvelope（bi-chart-kit）→ 渲染。
  │ 信封形状：{v, window, generatedAt, series:[{key,label,unit,color,mode,
  │ metric,value,points,error}]}——本图元只消费 series[0]：
  │   value  = 整窗单值（累计量的 cumulative 序列已是窗口用量）
  │   points = 同窗降采样时序（仅 shape='both' 时宿主才一并取回，用于 sparkline）
  │ 无数据（value===null）→ 显示 '--'；序列报错 → 显示错误提示文案。
  └──────────────────────────────────────────────────────────
  视觉（Grafana 对标）：卡片靠**底色分区**而非描边；数字是主角（40px 粗体，
  色彩语义）；单位与标签退居次级；sparkline 铺在卡片底部做半透明面积。
  迷你趋势用**内联 SVG**（一条折线不值一个 echarts 实例的内存与初始化代价）。
  组件无 onMounted 资源，故无卸载清理义务。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { BI_PANEL, formatValue, parseEnvelope, seriesColor } from './bi-chart-kit'

const props = defineProps<{
  fill?: string          // 强调色：主数值色 + 顶部语义条
  title?: string         // 面板标题
  series?: string        // 查询规格 JSON 串（组态员填）
  agg?: string           // 聚合口径（宿主用）
  interval?: number      // 桶宽（秒）
  windowSecs?: number    // 统计窗长（秒）
  shape?: string         // 取数形态：aggregate / series / both
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

/** 语义色：显式 fill 优先，否则取序列自身配色，再否则强调色。 */
const accent = computed(() => {
  if (props.fill) return props.fill
  const s = first.value
  return s ? seriesColor(s, 0) : BI_PANEL.accent
})

/**
 * 迷你趋势：折线点串 + 面积点串（viewBox 0 0 100 30，y 取 4~26）。
 * 点数 <2 不画（一条点画不出趋势）。
 */
const spark = computed(() => {
  const pts = first.value?.points ?? []
  if (pts.length < 2) return null
  let min = Infinity
  let max = -Infinity
  for (const p of pts) {
    if (p.value < min) min = p.value
    if (p.value > max) max = p.value
  }
  const span = max - min || 1
  const n = pts.length - 1
  const line = pts
    .map((p, i) => {
      const x = (i / n) * 100
      const y = 26 - ((p.value - min) / span) * 22
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
  return { line, area: `0,30 ${line} 100,30` }
})
</script>

<template>
  <div class="ah-kpi">
    <!-- 顶部语义色条（Grafana 彩色卡片的等价表达） -->
    <div class="ah-kpi-bar" :style="{ background: accent }"></div>
    <div class="ah-kpi-head">
      <span class="ah-kpi-label">{{ labelText }}</span>
      <span v-if="unitText" class="ah-kpi-unit-top">{{ unitText }}</span>
    </div>
    <div class="ah-kpi-value" :style="{ color: accent }">
      {{ valueText }}<span v-if="unitText" class="ah-kpi-unit">{{ unitText }}</span>
    </div>
    <!-- sparkline 铺底（半透明面积 + 亮线），无趋势时保留占位高度防卡片跳动 -->
    <svg v-if="spark" class="ah-kpi-spark" viewBox="0 0 100 30" preserveAspectRatio="none">
      <polygon :points="spark.area" :fill="accent" fill-opacity="0.12" />
      <polyline :points="spark.line" fill="none" :stroke="accent" stroke-width="1.6"
                stroke-linejoin="round" vector-effect="non-scaling-stroke" />
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
  border-radius: 4px;
  overflow: hidden;
  padding: 10px 12px 0;
  display: flex;
  flex-direction: column;
  background: #161b22;
  color: #c9d1d9;
  font-family: Consolas, Menlo, monospace;
  position: relative;
}
.ah-kpi-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
}
.ah-kpi-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.ah-kpi-label {
  font-size: 12px;
  color: #8b949e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ah-kpi-unit-top {
  font-size: 11px;
  color: #6e7681;
  white-space: nowrap;
}
.ah-kpi-value {
  /* 数字是主角（Grafana 观感的关键） */
  font-size: 40px;
  font-weight: 600;
  line-height: 1.1;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ah-kpi-unit {
  font-size: 13px;
  color: #8b949e;
  font-weight: 400;
  margin-left: 5px;
}
.ah-kpi-spark {
  width: 100%;
  height: 34px;
  margin-top: 4px;
  flex: 1;
  min-height: 0;
}
.ah-kpi-spark-empty {
  height: 34px;
}
.ah-kpi-hint {
  font-size: 11px;
  color: #8b949e;
}
.ah-kpi-err {
  color: #f85149;
}
</style>
