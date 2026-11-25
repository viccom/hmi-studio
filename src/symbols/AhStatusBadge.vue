<!-- 状态徽标（工业功能件 3/8）：形状 + 颜色 + 文字三重冗余。
     形状映射：0 方 / 1 圆 / 2 三角 / 3 菱形 / 4 圆+斜线；`texts` 逗号分隔按 0-4 取词。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { HP } from './hp-hmi'

const props = defineProps<{
  fill?: string
  state?: number | string
  label?: string
  texts?: string
}>()

const st = computed(() => {
  const n = Math.round(Number(props.state))
  return n >= 0 && n <= 4 ? n : 4
})

const words = computed(() => {
  const arr = String(props.texts ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return arr.length >= 5 ? arr : ['停止', '运行', '故障', '维护', '离线']
})

const color = computed(() => {
  switch (st.value) {
    case 1: return HP.ok
    case 2: return HP.alarmP1
    case 3: return HP.alarmP3
    default: return HP.off
  }
})

const textColor = computed(() => (st.value === 2 || st.value === 3 ? color.value : HP.ink))
</script>

<template>
  <div class="ah-sb" data-testid="ah-status-badge" :title="`状态 ${st}`">
    <svg class="ah-sb-shape" viewBox="0 0 16 16" aria-hidden="true">
      <rect v-if="st === 0" x="3" y="3" width="10" height="10" :fill="color" />
      <circle v-else-if="st === 1" cx="8" cy="8" r="5" :fill="color" />
      <path v-else-if="st === 2" d="M8 2 L14.5 13.5 H1.5 Z" :fill="color" />
      <path v-else-if="st === 3" d="M8 2 L14 8 L8 14 L2 8 Z" :fill="color" />
      <g v-else>
        <circle cx="8" cy="8" r="5" :fill="color" opacity="0.35" />
        <line x1="3.5" y1="12.5" x2="12.5" y2="3.5" :stroke="color" stroke-width="2" />
      </g>
    </svg>
    <span class="ah-sb-name" :style="{ color: props.fill ?? HP.inkDim }">{{ props.label }}</span>
    <span class="ah-sb-text" :style="{ color: textColor }" data-testid="sb-text">{{ words[st] }}</span>
  </div>
</template>

<style scoped>
.ah-sb {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  background: #fff;
  border: 1px solid #8a939d;
  border-radius: 4px;
  overflow: hidden;
  font-family: system-ui, 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
  font-size: 12px;
  white-space: nowrap;
}
.ah-sb-shape {
  width: 14px;
  height: 14px;
  flex: none;
}
.ah-sb-name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.ah-sb-text {
  font-weight: 600;
  margin-left: auto;
}
</style>
