<!-- 报警徽标（工业功能件 4/8）：颜色 + 形状 + 文字三重冗余；活动报警缓慢闪烁。
     prio=0 = "正常"中性态（灰），不出现饱和色；计数为 0 时省略 ×N。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { HP, prioColor, prioLabel } from './hp-hmi'

const props = defineProps<{
  fill?: string
  prio?: number | string
  count?: number | string
  label?: string
  blink?: boolean
}>()

const prio = computed(() => {
  const n = Math.round(Number(props.prio))
  return n >= 0 && n <= 4 ? n : 0
})
const count = computed(() => {
  const n = Math.round(Number(props.count))
  return Number.isFinite(n) && n > 0 ? n : 0
})
const active = computed(() => prio.value > 0)
const color = computed(() => (active.value ? prioColor(prio.value) : (props.fill ?? HP.off)))
const blinking = computed(() => active.value && Boolean(props.blink))
</script>

<template>
  <div
    class="ah-ab"
    :class="{ blink: blinking }"
    data-testid="ah-alarm-badge"
    :style="{ borderColor: active ? color : '#8a939d' }"
  >
    <svg class="ah-ab-shape" viewBox="0 0 16 16" aria-hidden="true">
      <path v-if="prio === 1" d="M8 1.5 L15 14.5 H1 Z" :fill="color" />
      <path v-else-if="prio === 2" d="M4.2 2 H11.8 L15 8 L11.8 14 H4.2 L1 8 Z" :fill="color" />
      <rect v-else-if="prio === 3" x="2.5" y="2.5" width="11" height="11" :fill="color" />
      <circle v-else-if="prio === 4" cx="8" cy="8" r="6" :fill="color" />
      <circle v-else cx="8" cy="8" r="5" fill="none" :stroke="color" stroke-width="1.5" />
    </svg>
    <span class="ah-ab-label">{{ props.label }}</span>
    <span class="ah-ab-prio" :style="{ color }" data-testid="ab-prio">{{ prioLabel(prio) }}</span>
    <span v-if="active && count > 0" class="ah-ab-count" :style="{ color }" data-testid="ab-count">×{{ count }}</span>
  </div>
</template>

<style scoped>
.ah-ab {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  background: #fff;
  border: 1px solid #8a939d;
  border-radius: 4px;
  overflow: hidden;
  font-family: system-ui, 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
  font-size: 12px;
  white-space: nowrap;
}
.ah-ab.blink {
  animation: ah-ab-blink 1.4s ease-in-out infinite alternate;
}
@keyframes ah-ab-blink {
  from { opacity: 1; }
  to { opacity: 0.55; }
}
.ah-ab-shape {
  width: 15px;
  height: 15px;
  flex: none;
}
.ah-ab-label {
  color: #5b6570;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ah-ab-prio {
  margin-left: auto;
  font-weight: 700;
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
}
.ah-ab-count {
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
  font-weight: 700;
}
</style>
