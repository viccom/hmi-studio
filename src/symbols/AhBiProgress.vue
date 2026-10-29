<!--
  BI 利用率进度条（ah-bi-progress，vue 型，P3）。
  数据通道 = 通道 B。自绘 DOM 横条（单条折线不值 echarts 的同款取舍）：
  每条有值序列一行 = 标签 + 进度条 + 百分比 + 读数。
  百分比 = value/maxVal；maxVal<=0 → 各序列最大值相对条。
  >100% 截断显示但保留「超限」红标——不谎报满格。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { BI_PANEL, formatValue, parseEnvelope, panelHint, panelState, seriesColor, type BiSeriesResult } from './bi-chart-kit'

const props = defineProps<{
  fill?: string      // 强调色（首条进度）
  title?: string     // 面板标题
  series?: string    // 查询规格 JSON 串
  agg?: string       // 窗口聚合口径
  interval?: number  // 桶宽（秒）
  windowSecs?: number // 统计窗长（秒）
  shape?: string     // 取数形态
  maxVal?: number    // 满量程（0=相对条）
  data?: string      // 运行时数据通道
}>()

const env = computed(() => parseEnvelope(props.data))
const state = computed(() => panelState(env.value))
const hint = computed(() => panelHint(state.value, env.value))

const rows = computed<Array<{ label: string; color: string; value: number; pct: number; over: boolean }>>(() => {
  const e = env.value
  if (!e) return []
  const items = e.series.filter((s: BiSeriesResult) => s.value !== null)
  const cap = Number(props.maxVal) > 0
    ? Number(props.maxVal)
    : Math.max(0, ...items.map((s) => Math.abs(s.value as number)))
  return items.map((s: BiSeriesResult, i: number) => {
    const v = s.value as number
    const pct = cap > 0 ? (v / cap) * 100 : 0
    return {
      label: s.label || s.key,
      color: i === 0 && props.fill ? props.fill : seriesColor(s, i),
      value: v,
      pct: Math.min(100, Math.max(0, pct)),
      over: pct > 100,
    }
  })
})

const capLabel = computed(() =>
  Number(props.maxVal) > 0 ? `满量程 ${formatValue(Number(props.maxVal))}` : '相对条')
</script>

<template>
  <div class="ah-bpr" :style="{ background: BI_PANEL.card, border: `1px solid ${BI_PANEL.hairline}` }">
    <div v-if="props.title" class="ah-bpr-title">
      <i class="ah-bpr-accent" :style="{ background: props.fill ?? BI_PANEL.accent }"></i>
      <span>{{ props.title }}</span>
      <span class="ah-bpr-cap">{{ capLabel }}</span>
    </div>
    <div v-if="rows.length" class="ah-bpr-rows">
      <div v-for="r in rows" :key="r.label" class="ah-bpr-row">
        <span class="ah-bpr-label" :title="r.label">{{ r.label }}</span>
        <div class="ah-bpr-track">
          <div class="ah-bpr-bar" :style="{ width: `${r.pct}%`, background: r.color }"></div>
        </div>
        <span class="ah-bpr-pct" :class="{ over: r.over }">{{ r.pct.toFixed(1) }}%</span>
        <span class="ah-bpr-val">{{ formatValue(r.value) }}</span>
      </div>
    </div>
    <div v-else class="ah-bpr-hint" :class="{ err: state === 'error' }">{{ hint || '暂无历史数据' }}</div>
  </div>
</template>

<style scoped>
.ah-bpr {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  font-family: Consolas, Menlo, monospace;
}
.ah-bpr-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 0;
  font-size: 14px;
  color: #c9d1d9;
}
.ah-bpr-accent {
  display: inline-block;
  width: 3px;
  height: 12px;
  border-radius: 2px;
  flex: none;
}
.ah-bpr-cap {
  margin-left: auto;
  font-size: 12px;
  color: #8b949e;
}
.ah-bpr-rows {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  padding: 4px 10px 8px;
}
.ah-bpr-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.ah-bpr-label {
  width: 72px;
  color: #8b949e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: none;
}
.ah-bpr-track {
  flex: 1;
  height: 10px;
  background: #1c2128;
  border-radius: 5px;
  overflow: hidden;
}
.ah-bpr-bar { height: 100%; border-radius: 5px; }
.ah-bpr-pct { width: 52px; text-align: right; color: #c9d1d9; flex: none; }
.ah-bpr-pct.over { color: #f85149; font-weight: 700; }
.ah-bpr-val { width: 76px; text-align: right; color: #8b949e; flex: none; }
.ah-bpr-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #8b949e;
}
.ah-bpr-hint.err { color: #f85149; }
</style>
