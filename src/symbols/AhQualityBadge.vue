<!-- 质量徽标（工业功能件 5/8）：GOOD 圆 / STALE 方 / BAD 三角 + 文字。
     颜色只做辅助，文字恒显示——断链时画面不能看起来像"正常"。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { HP, qualityColor, qualityLabel } from './hp-hmi'

const props = defineProps<{
  fill?: string
  quality?: number | string
  label?: string
}>()

const q = computed(() => {
  const n = Math.round(Number(props.quality))
  return n === 1 || n === 2 ? n : 0
})
const color = computed(() => qualityColor(q.value))
const text = computed(() => qualityLabel(q.value))
</script>

<template>
  <div class="ah-qb" data-testid="ah-quality-badge" :title="`质量 ${text}`">
    <svg class="ah-qb-shape" viewBox="0 0 16 16" aria-hidden="true">
      <circle v-if="q === 0" cx="8" cy="8" r="5" :fill="color" />
      <rect v-else-if="q === 1" x="3" y="3" width="10" height="10" :fill="color" />
      <path v-else d="M8 2 L14.5 13.5 H1.5 Z" :fill="color" />
    </svg>
    <span class="ah-qb-label" :style="{ color: props.fill ?? HP.inkDim }">{{ props.label }}</span>
    <span class="ah-qb-text" :style="{ color }" data-testid="qb-text">{{ text }}</span>
  </div>
</template>

<style scoped>
.ah-qb {
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
.ah-qb-shape {
  width: 14px;
  height: 14px;
  flex: none;
}
.ah-qb-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
.ah-qb-text {
  margin-left: auto;
  font-weight: 700;
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
  font-size: 11px;
}
</style>
