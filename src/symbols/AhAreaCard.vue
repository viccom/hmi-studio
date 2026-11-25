<!-- 区域卡片（工业功能件 7/8）：L1 区域态势——双 KPI + 活动报警计数 + 质量。
     正常态 KPI 暗蓝、报警计数灰；有报警时计数用优先级色 + P<n> 文字（不只靠颜色）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { HP, prioColor, prioLabel, qualityColor, qualityLabel } from './hp-hmi'

const props = defineProps<{
  fill?: string
  title?: string
  total?: number | string
  alarms?: number | string
  prio?: number | string
  kpi1_label?: string
  kpi1_value?: number | string
  kpi1_unit?: string
  kpi1_dec?: number | string
  kpi2_label?: string
  kpi2_value?: number | string
  kpi2_unit?: string
  kpi2_dec?: number | string
  quality?: number | string
}>()

const num = (v: unknown, fb = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fb
}
const fmt = (v: unknown, dec: unknown): string => {
  const n = Number(v)
  const d = Math.max(0, Math.min(4, Math.round(Number(dec))))
  return Number.isFinite(n) ? n.toFixed(Number.isFinite(d) ? d : 2) : '--'
}

const prio = computed(() => {
  const n = Math.round(num(props.prio))
  return n >= 0 && n <= 4 ? n : 0
})
const alarms = computed(() => Math.max(0, Math.round(num(props.alarms))))
const qual = computed(() => {
  const n = Math.round(num(props.quality))
  return n === 1 || n === 2 ? n : 0
})
const alarmColor = computed(() => (prio.value > 0 ? prioColor(prio.value) : HP.off))
</script>

<template>
  <div class="ah-ac" data-testid="ah-area-card">
    <div class="ah-ac-head">
      <span class="ah-ac-title">{{ props.title }}</span>
      <span class="ah-ac-q" :style="{ color: qualityColor(qual) }">{{ qualityLabel(qual) }}</span>
    </div>
    <div class="ah-ac-main">
      <div class="ah-ac-kpi">
        <span class="ah-ac-kpi-label">{{ props.kpi1_label }}</span>
        <span class="ah-ac-kpi-value" :style="{ color: props.fill ?? HP.live }" data-testid="ac-kpi1">{{ fmt(props.kpi1_value, props.kpi1_dec) }}</span>
        <span class="ah-ac-kpi-unit">{{ props.kpi1_unit }}</span>
      </div>
      <div class="ah-ac-kpi">
        <span class="ah-ac-kpi-label">{{ props.kpi2_label }}</span>
        <span class="ah-ac-kpi-value" :style="{ color: props.fill ?? HP.live }" data-testid="ac-kpi2">{{ fmt(props.kpi2_value, props.kpi2_dec) }}</span>
        <span class="ah-ac-kpi-unit">{{ props.kpi2_unit }}</span>
      </div>
      <div class="ah-ac-alarm">
        <span class="ah-ac-alarm-num" :style="{ color: alarmColor }" data-testid="ac-alarms">{{ alarms }}</span>
        <span class="ah-ac-alarm-label">活动报警</span>
        <span class="ah-ac-alarm-prio" :style="{ color: alarmColor }" data-testid="ac-prio">{{ prioLabel(prio) }}</span>
      </div>
    </div>
    <div class="ah-ac-foot">
      <span>设备 {{ Math.max(0, Math.round(num(props.total))) }} 台</span>
      <span class="ah-ac-hint">进入单元画面 →</span>
    </div>
  </div>
</template>

<style scoped>
.ah-ac {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 12px 16px 10px;
  background: #fff;
  border: 1px solid #8a939d;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
  font-family: system-ui, 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
  cursor: pointer;
}
.ah-ac-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.ah-ac-title {
  font-size: 17px;
  font-weight: 600;
  color: #1f2328;
}
.ah-ac-q {
  margin-left: auto;
  font-size: 11px;
  font-weight: 700;
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
}
.ah-ac-main {
  display: flex;
  align-items: stretch;
  gap: 18px;
  flex: 1;
}
.ah-ac-kpi {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 120px;
}
.ah-ac-kpi-label {
  font-size: 11px;
  color: #5b6570;
}
.ah-ac-kpi-value {
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 30px;
  font-weight: 600;
  line-height: 1.15;
}
.ah-ac-kpi-unit {
  font-size: 11px;
  color: #5b6570;
}
.ah-ac-alarm {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 1px;
}
.ah-ac-alarm-num {
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 38px;
  font-weight: 700;
  line-height: 1;
}
.ah-ac-alarm-label {
  font-size: 11px;
  color: #5b6570;
}
.ah-ac-alarm-prio {
  font-size: 12px;
  font-weight: 700;
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
}
.ah-ac-foot {
  display: flex;
  justify-content: space-between;
  padding-top: 6px;
  border-top: 1px solid #e3e6e8;
  font-size: 11px;
  color: #5b6570;
}
.ah-ac-hint {
  color: #9e9e9e;
}
</style>
