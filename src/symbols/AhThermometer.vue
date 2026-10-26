<!-- 温度计（批 B custom-svg 型 3/6）：液柱计算几何（thermoY 纯函数，有单测）+ 刻度文本。
     custom-svg 经 maotu SSR 串化转 dataURI img——样式全部内联属性、SSR 纯净（无事件/浏览器 API）。
     视觉参考用户学习样例（/tmp/mytest TemperatureMeter）的刻度+液柱思路，按本仓规范重写：
     深色主题自包含配色、props 契约对齐 §2.2（fill=液色）、几何收敛到 gauge-math。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { thermoY, clampNum } from './gauge-math'

const props = withDefaults(defineProps<{
  value?: number | string
  min?: number
  max?: number
  unit?: string
  label?: string
  fill?: string
}>(), { min: -40, max: 160 })

const TUBE_TOP = 18
const TUBE_BOTTOM = 118
const liquidColor = computed(() => props.fill ?? '#f5222d')
const yTop = computed(() => thermoY(props.value, props.min, props.max, TUBE_TOP, TUBE_BOTTOM))
const shown = computed(() => {
  const n = clampNum(props.value, props.min, props.max, NaN)
  return Number.isFinite(n) ? n : '--'
})
const majors = computed(() => Array.from({ length: 5 }, (_, k) => {
  const v = props.min + ((props.max - props.min) * k) / 4
  return { y: thermoY(v, props.min, props.max, TUBE_TOP, TUBE_BOTTOM), v: Math.round(v) }
}))
</script>

<template>
  <svg viewBox="0 0 64 150" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
    <text x="26" y="10" text-anchor="middle" font-size="9" fill="#8b949e">{{ props.label }}</text>
    <!-- 液柱：管内矩形自液面 y 到底（越界值经 clampNum 限幅在量程内） -->
    <rect :x="24" :y="yTop" width="12" :height="TUBE_BOTTOM - yTop" :fill="liquidColor" />
    <!-- 球泡（常满液色）+ 管壳定色描边 -->
    <circle cx="30" cy="130" r="13" :fill="liquidColor" />
    <rect x="22" y="14" width="16" height="106" rx="8" fill="none" stroke="#6e7681" stroke-width="1.5" />
    <circle cx="30" cy="130" r="13" fill="none" stroke="#6e7681" stroke-width="1.5" />
    <rect x="26" y="112" width="8" height="8" :fill="liquidColor" />
    <!-- 刻度（右侧）：主刻度带数值 -->
    <g stroke="#c9d1d9" stroke-width="1.5">
      <line v-for="(t, i) in majors" :key="'M' + i" x1="42" :y1="t.y" x2="49" :y2="t.y" />
    </g>
    <g font-size="8" fill="#c9d1d9">
      <text v-for="(t, i) in majors" :key="'L' + i" x="52" :y="t.y + 3">{{ t.v }}</text>
    </g>
    <!-- 读数文本 -->
    <text x="30" y="148" text-anchor="middle" font-size="10" fill="#e6f7ff" font-family="Consolas, Menlo, monospace">
      {{ shown }}{{ props.unit }}
    </text>
  </svg>
</template>
