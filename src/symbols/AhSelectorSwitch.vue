<!-- 选择开关（批 B vue 型 6/6）：三态旋钮（0/1/2），value(number) prop + 旋转几何
     （selectorAngle 纯函数，有单测）。运行页点击旋钮 0→1→2→0 循环，update:modelValue
     回写合并进 props（bundle onModelValue 实证路径，规范 §4.1.3 操作类图元用）。
     档位刻度/数字为真 text（vue 型合法）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { selectorAngle } from './gauge-math'

const props = defineProps<{
  value?: number
  fill?: string
  label?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const knobColor = computed(() => props.fill ?? '#faad14')
const deg = computed(() => selectorAngle(props.value))
const cur = computed(() => {
  const n = typeof props.value === 'number' ? props.value : Number(props.value)
  return Number.isFinite(n) ? Math.min(2, Math.max(0, Math.round(n))) : 0
})
const cycle = (): void => { emit('update:modelValue', (cur.value + 1) % 3) }
</script>

<template>
  <svg
    viewBox="0 0 80 96" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"
    class="ah-sel" role="switch"
    @click="cycle"
  >
    <text x="40" y="12" text-anchor="middle" font-size="10" fill="#8b949e">{{ props.label }}</text>
    <!-- 面板 + 档位刻度（-45/0/45 三档）+ 档位数字 -->
    <circle cx="40" cy="48" r="30" fill="#1c2128" stroke="#30363d" stroke-width="2" />
    <g stroke="#6e7681" stroke-width="2">
      <line x1="14.8" y1="69.2" x2="20.2" y2="63.8" />
      <line x1="40" y1="13" x2="40" y2="20" />
      <line x1="65.2" y1="69.2" x2="59.8" y2="63.8" />
    </g>
    <g font-size="10" fill="#c9d1d9" text-anchor="middle">
      <text x="12" y="82">0</text>
      <text x="40" y="10">1</text>
      <text x="68" y="82">2</text>
    </g>
    <!-- 旋钮：指针随 value 旋转（bbox 中心=枢轴 (40,48)） -->
    <g :transform="`rotate(${deg} 40 48)`">
      <circle cx="40" cy="48" r="17" :fill="knobColor" stroke="rgba(0,0,0,0.45)" stroke-width="1.5" />
      <line x1="40" y1="48" x2="40" y2="34" stroke="rgba(0,0,0,0.65)" stroke-width="3" stroke-linecap="round" />
    </g>
    <circle cx="40" cy="48" r="4" fill="rgba(0,0,0,0.55)" />
  </svg>
</template>
