<!-- 电表面板（P2-B vue 型 1/4）：工业电表卡片——电压/电流/有功/功率因数/频率 五行数显
     （label + 等宽读数 + 小字单位），底部脉冲灯圆点（pulse bool 驱动 CSS 闪烁——vue 型
     真 DOM，scoped style 合法），status 非 0 变黄告警。props 与 rs-iot home-meter-e*
     数据面一一对应：voltage/current/power/pf/frequency/pulse/status（bind 直写通道）。
     fill = 读数色（可绑/可触发变色）。 -->
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  v?: number
  i?: number
  p?: number
  pf?: number
  freq?: number
  pulse?: boolean
  status?: number
  fill?: string
}>(), {})

const accent = computed(() => props.fill ?? '#39d353')
const warn = computed(() => Number.isFinite(Number(props.status)) && Number(props.status) !== 0)

function fmt(n: unknown, d: number): string {
  const x = Number(n)
  return Number.isFinite(x) ? x.toFixed(d) : '--'
}

const rows = computed(() => [
  { label: '电压', val: fmt(props.v, 1), unit: 'V' },
  { label: '电流', val: fmt(props.i, 2), unit: 'A' },
  { label: '有功', val: fmt(props.p, 3), unit: 'kW' },
  { label: '功率因数', val: fmt(props.pf, 2), unit: '' },
  { label: '频率', val: fmt(props.freq, 2), unit: 'Hz' },
])
</script>

<template>
  <div class="ah-mp" :style="{ background: '#0d1117', border: `1px solid ${warn ? '#faad14' : '#30363d'}` }">
    <div class="ah-mp-head">
      <span class="ah-mp-title">电能表</span>
      <span class="ah-mp-status" :style="{ color: warn ? '#faad14' : '#8b949e' }">
        <i class="ah-mp-status-dot" :style="{ background: warn ? '#faad14' : '#2ea043' }"></i>
        {{ warn ? '告警 ' + props.status : '正常' }}
      </span>
    </div>
    <div class="ah-mp-rows">
      <span v-for="r in rows" :key="r.label" class="ah-mp-row">
        <span class="ah-mp-label">{{ r.label }}</span>
        <span class="ah-mp-val" :style="{ color: accent }">{{ r.val }}</span>
        <span class="ah-mp-unit">{{ r.unit }}</span>
      </span>
    </div>
    <div class="ah-mp-foot">
      <i class="ah-mp-led" :class="props.pulse ? 'on' : 'off'"></i>
      <span class="ah-mp-foot-label">脉冲</span>
    </div>
  </div>
</template>

<style scoped>
.ah-mp {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  box-sizing: border-box;
  padding: 6px 10px;
  font-family: Consolas, Menlo, monospace;
  overflow: hidden;
}
.ah-mp-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 20px;
}
.ah-mp-title {
  font-size: 12px;
  font-weight: 600;
  color: #e6f7ff;
  letter-spacing: 2px;
}
.ah-mp-status {
  font-size: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.ah-mp-status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.ah-mp-rows {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
}
.ah-mp-row {
  display: flex;
  align-items: baseline;
}
.ah-mp-label {
  width: 64px;
  font-size: 11px;
  color: #8b949e;
}
.ah-mp-val {
  flex: 1;
  text-align: right;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.ah-mp-unit {
  width: 30px;
  text-align: right;
  font-size: 10px;
  color: #8b949e;
}
.ah-mp-foot {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 14px;
}
.ah-mp-led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.ah-mp-led.on {
  background: #ff4d4f;
  animation: ah-mp-blink 0.9s step-end infinite;
}
.ah-mp-led.off {
  background: #262d36;
}
.ah-mp-foot-label {
  font-size: 9px;
  color: #8b949e;
}
@keyframes ah-mp-blink {
  50% {
    opacity: 0.2;
  }
}
</style>
