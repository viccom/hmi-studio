<!-- 电表功率盘（P2-B custom-svg 1/4）：模拟量表盘风格（非卡通）——量程 0~5kW 扫 240°，
     刻度 0/1/2/3/4/5，指针角 = f(value)（gauge-math 纯函数）。alarm 区（>4.5kW）静态红弧
     常画（越线即入红区，无需触发链）。pulse(bool) → 盘角指示灯亮（bind 直写/触发链均可）。
     custom-svg 经 maotu SSR 串化 dataURI img（M_/$f 实证）——样式全内联属性、无浏览器 API；
     触发链入口：value(连续直写) / pulse(离散 change_attr)。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { gaugeAngle, gaugeArcPath, polarPt, clampNum } from './gauge-math'

const props = withDefaults(defineProps<{
  value?: number | string
  pulse?: boolean
  fill?: string
}>(), {})

const CX = 90
const CY = 92
const MAX_KW = 5

const accent = computed(() => props.fill ?? '#e6b32a')
const baselineD = computed(() => gaugeArcPath(CX, CY, 64, MAX_KW, 0, MAX_KW))
const progressD = computed(() => gaugeArcPath(CX, CY, 64, props.value, 0, MAX_KW))
// 静态报警区（>4.5kW）：自 4.5 角扫到满量程角（gaugeArcPath 的 min 参数即起始角，复用）
const alarmD = computed(() => gaugeArcPath(CX, CY, 64, MAX_KW, 4.5, MAX_KW))
const needleDeg = computed(() => gaugeAngle(props.value, 0, MAX_KW))
const needleTip = computed(() => polarPt(CX, CY, 50, needleDeg.value))

const majors = computed(() => Array.from({ length: 6 }, (_, k) => {
  const deg = gaugeAngle(k, 0, MAX_KW)
  return {
    out: polarPt(CX, CY, 68, deg),
    inn: polarPt(CX, CY, 56, deg),
    lbl: polarPt(CX, CY, 45, deg),
    v: k,
  }
}))
const minors = computed(() => Array.from({ length: 21 }, (_, k) => {
  const deg = gaugeAngle(k / 4, 0, MAX_KW)
  return { out: polarPt(CX, CY, 68, deg), inn: polarPt(CX, CY, 60, deg), major: k % 4 === 0 }
}))
const shown = computed(() => {
  const n = clampNum(props.value, 0, MAX_KW, NaN)
  return Number.isFinite(n) ? n.toFixed(2) : '--'
})
const lamp = computed(() => (props.pulse ? '#ff4d4f' : '#262d36'))
</script>

<template>
  <svg viewBox="0 0 180 160" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
    <text :x="CX" y="14" text-anchor="middle" font-size="10" fill="#8b949e">有功功率 kW</text>
    <path :d="baselineD" fill="none" stroke="#30363d" stroke-width="8" stroke-linecap="round" />
    <path :d="alarmD" fill="none" stroke="#f5222d" stroke-width="8" stroke-linecap="round" opacity="0.9" />
    <path :d="progressD" fill="none" :stroke="accent" stroke-width="8" stroke-linecap="round" />
    <g v-for="(t, i) in minors" :key="'m' + i" stroke="#6e7681" stroke-width="1">
      <line v-if="!t.major" :x1="t.out.x" :y1="t.out.y" :x2="t.inn.x" :y2="t.inn.y" />
    </g>
    <g v-for="(t, i) in majors" :key="'M' + i" stroke="#c9d1d9" stroke-width="2">
      <line :x1="t.out.x" :y1="t.out.y" :x2="t.inn.x" :y2="t.inn.y" />
    </g>
    <g font-size="9" fill="#c9d1d9" text-anchor="middle">
      <text v-for="(t, i) in majors" :key="'L' + i" :x="t.lbl.x" :y="t.lbl.y + 3">{{ t.v }}</text>
    </g>
    <line :x1="CX" :y1="CY" :x2="needleTip.x" :y2="needleTip.y" :stroke="accent" stroke-width="2.5" />
    <circle :cx="CX" :cy="CY" r="4" :fill="accent" />
    <!-- 盘角脉冲指示灯（外圈光晕 + 灯芯；灭态暗壳） -->
    <circle cx="158" cy="16" :r="props.pulse ? 11 : 8" :fill="lamp" :opacity="props.pulse ? 0.35 : 1" />
    <circle cx="158" cy="16" r="6" :fill="lamp" :stroke="props.pulse ? '#ffb3b8' : '#30363d'" stroke-width="1" />
    <text :x="CX" y="140" text-anchor="middle" font-size="14" fill="#e6f7ff" font-family="Consolas, Menlo, monospace">{{ shown }}</text>
    <text :x="CX" y="154" text-anchor="middle" font-size="8" fill="#8b949e">0.0 ~ 5.0 kW</text>
  </svg>
</template>
