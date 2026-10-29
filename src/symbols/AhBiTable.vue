<!--
  BI 明细数据表（ah-bi-table，vue 型）：多序列指标明细（标签/数值/单位/口径/状态）。
  ┌─ 数据通道（通道 B，契约见 docs/plans/2026-10-29-bi-monitoring-dashboard-design.md）──
  │ 图元不自开 EventSource、不轮询——宿主聚合收集器把聚合信封 JSON 串写进
  │ props.data（maotu props 直写，路径 props.data.val），本组件 watch → 解析 → 渲染。
  │ 信封的 series[].value 是整窗单值（宿主已算好累计量的窗口增量 delta）。
  └────────────────────────────────────────────────────────────────────────────
  纯 HTML 表格（不用 echarts）：表格是结构化文本，图表库反而更重。
  行数恒等于序列数（一条序列一行）——组态员一眼看得出少了哪条；
  局部失败不升级：一行报错只标该行（状态列红字），其余行照常展示（契约 §1.4）。
  数值口径：formatValue（null → '--'，无数据不是 0）；配色取自 bi-chart-kit 的
  BI_THEME（CSS 变量注入，避免样式里散落重复色值）。
-->
<script setup lang="ts">
import { computed } from 'vue'
import {
  metricLabel,
  BI_THEME,
  formatValue,
  parseEnvelope,
  panelHint,
  panelState,
  type BiSeriesResult,
} from './bi-chart-kit'

const props = defineProps<{
  fill?: string          // 强调色（容器边框）
  title?: string         // 面板标题
  series?: string        // 查询规格 JSON 串（组态员填，宿主据此发 /history/batch）
  agg?: string           // 窗口聚合口径（宿主用）
  interval?: number      // 桶宽（秒）
  windowSecs?: number    // 统计窗长（秒）
  shape?: string         // 取数形态：aggregate / series
  data?: string          // 运行时数据通道（宿主写回的信封 JSON 串）
}>()

const env = computed(() => parseEnvelope(props.data))
const state = computed(() => panelState(env.value))
const hint = computed(() => panelHint(state.value, env.value))

/** 表格行：一条序列一行（值 / 单位 / 口径 / 状态）。 */
const rows = computed<Array<{
  label: string; value: string; unit: string; metric: string; status: string; err: boolean
}>>(() => {
  const e = env.value
  if (!e) return []
  return e.series.map((s: BiSeriesResult) => ({
    label: s.label || s.key,
    value: formatValue(s.value),
    unit: s.unit,
    metric: metricLabel(s.metric),
    // 状态列：报错给错误文案（红字），无值给「无数据」，其余「正常」
    status: s.error !== null ? s.error : s.value === null ? '无数据' : '正常',
    err: s.error !== null,
  }))
})
</script>

<template>
  <div
    class="ah-bitbl"
    :style="{
      background: '#161b22',
      border: '1px solid #21262d',
      '--ah-axis': BI_THEME.axisLine,
      '--ah-text': BI_THEME.text,
      '--ah-label': BI_THEME.axisLabel,
    }"
  >
    <div v-if="props.title" class="ah-bitbl-title">{{ props.title }}</div>
    <div v-if="state === 'empty'" class="ah-bitbl-hint">{{ hint }}</div>
    <div v-else class="ah-bitbl-wrap">
      <table class="ah-bitbl-table">
        <thead>
          <tr>
            <th class="col-label">标签</th>
            <th class="col-value">数值</th>
            <th class="col-unit">单位</th>
            <th class="col-metric">口径</th>
            <th class="col-status">状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="r.label + i" :class="{ err: r.err }">
            <td class="col-label">{{ r.label }}</td>
            <td class="col-value">{{ r.value }}</td>
            <td class="col-unit">{{ r.unit }}</td>
            <td class="col-metric">{{ r.metric }}</td>
            <td class="col-status">{{ r.status }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.ah-bitbl {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bitbl-title {
  padding: 4px 8px 0;
  font-size: 13px;
  color: var(--ah-label);
}
.ah-bitbl-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--ah-label);
}
.ah-bitbl-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 8px 6px;
}
.ah-bitbl-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.ah-bitbl-table th {
  text-align: left;
  color: var(--ah-label);
  font-weight: 500;
  padding: 4px 6px;
  border-bottom: 1px solid var(--ah-axis);
  position: sticky;
  top: 0;
  background: #161b22;
}
.ah-bitbl-table td {
  padding: 3px 6px;
  border-bottom: 1px solid var(--ah-axis);
  color: var(--ah-text);
}
.ah-bitbl-table tr.err td {
  color: #f85149;
}
.col-value {
  text-align: right;
  font-weight: 600;
}
.col-unit {
  color: var(--ah-label);
  width: 56px;
}
.col-metric {
  color: var(--ah-label);
  width: 60px;
}
.col-status {
  color: var(--ah-label);
  width: 96px;
}
</style>
