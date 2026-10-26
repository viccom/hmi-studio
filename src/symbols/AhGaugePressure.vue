<!-- 压力表盘（批 B custom-svg 型 2/6）：刻度弧 + 数字刻度 + 指针（角度 = f(value,min,max)）。
     custom-svg 经 maotu SSR 串化转 dataURI img（M_/$f 实证）——样式必须全部内联属性
     （SFC <style> 不进 SSR 输出）；无事件无浏览器 API（SSR 纯净）。
     alarm(switch) 触发：指针/弧色变红（#f5222d）；常态弧色 = fill prop。
     刻度数值 = min + k·(max-min)/4（k=0..4 主刻度），几何来自 gauge-math 纯函数（有单测）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { gaugeAngle, gaugeArcPath, polarPt, fracOf, clampNum } from './gauge-math'

const props = withDefaults(defineProps<{
  value?: number | string
  min?: number
  max?: number
  unit?: string
  label?: string
  fill?: string
  alarm?: boolean
}>(), { min: 0, max: 100 })

const CX = 60
const CY = 58
const R_ARC = 44
const R_TICK_OUT = 46
const R_TICK_MAJOR = 38
const R_LABEL = 30

const needleColor = computed(() => (props.alarm ? '#f5222d' : (props.fill ?? '#e6b32a')))
const needleDeg = computed(() => gaugeAngle(props.value, props.min, props.max))
const needleTip = computed(() => polarPt(CX, CY, R_TICK_MAJOR - 6, needleDeg.value))
const arcD = computed(() => gaugeArcPath(CX, CY, R_ARC, props.value, props.min, props.max))
const baselineD = computed(() => gaugeArcPath(CX, CY, R_ARC, props.max, props.min, props.max))

const majors = computed(() => Array.from({ length: 5 }, (_, k) => {
  const deg = gaugeAngle(props.min + ((props.max - props.min) * k) / 4, props.min, props.max)
  const out = polarPt(CX, CY, R_TICK_OUT, deg)
  const inn = polarPt(CX, CY, R_TICK_MAJOR, deg)
  const lbl = polarPt(CX, CY, R_LABEL, deg)
  const v = Math.round(props.min + ((props.max - props.min) * k) / 4)
  return { out, inn, lbl, v, deg }
}))
const minorTicks = computed(() => Array.from({ length: 21 }, (_, k) => {
  const deg = gaugeAngle(props.min + ((props.max - props.min) * k) / 20, props.min, props.max)
  return {
    out: polarPt(CX, CY, R_TICK_OUT, deg),
    inn: polarPt(CX, CY, R_TICK_MAJOR + 4, deg),
    major: k % 5 === 0,
  }
}))
const pct = computed(() => Math.round(fracOf(props.value, props.min, props.max) * 100))
const shown = computed(() => {
  const n = clampNum(props.value, props.min, props.max, NaN)
  return Number.isFinite(n) ? n : '--'
})
</script>

<template>
  <svg viewBox="0 0 120 96" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
    <text :x="CX" y="12" text-anchor="middle" font-size="10" fill="#8b949e">{{ props.label }}</text>
    <path class="ah-gp-baseline" :d="baselineD" fill="none" stroke="#30363d" stroke-width="7" stroke-linecap="round" />
    <path class="ah-gp-arc" :d="arcD" fill="none" :stroke="needleColor" stroke-width="7" stroke-linecap="round" />
    <g v-for="(t, i) in minorTicks" :key="'m' + i" stroke="#6e7681" stroke-width="1">
      <line v-if="!t.major" :x1="t.out.x" :y1="t.out.y" :x2="t.inn.x" :y2="t.inn.y" />
    </g>
    <g v-for="(t, i) in majors" :key="'M' + i" stroke="#c9d1d9" stroke-width="2">
      <line :x1="t.out.x" :y1="t.out.y" :x2="t.inn.x" :y2="t.inn.y" />
    </g>
    <g font-size="9" fill="#c9d1d9" text-anchor="middle">
      <text v-for="(t, i) in majors" :key="'L' + i" :x="t.lbl.x" :y="t.lbl.y + 3">{{ t.v }}</text>
    </g>
    <line class="ah-gp-needle" :x1="CX" :y1="CY" :x2="needleTip.x" :y2="needleTip.y" :stroke="needleColor" stroke-width="2.5" />
    <circle :cx="CX" :cy="CY" r="4" :fill="needleColor" />
    <text :x="CX" y="86" text-anchor="middle" font-size="13" fill="#e6f7ff" font-family="Consolas, Menlo, monospace">
      {{ shown }} {{ props.unit }}
    </text>
    <text :x="CX" y="95" text-anchor="middle" font-size="7" fill="#8b949e">{{ pct }}%</text>
  </svg>
</template>
