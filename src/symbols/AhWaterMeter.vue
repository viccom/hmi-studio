<!-- 水表盘（P2-B custom-svg 2/4）：机械字轮风格累计流量窗（整数位黑字白底 + 小数位白字
     红底——机械水表惯例）+ 瞬时流量小指针盘（0~1 m³/h，gauge-math 纯函数）+ 逆向流标记
     （reverse_flag → 红色环流箭头显现）。数据面 home-meter-w*：flow_total/flow_instant/
     reverse_flag（bind 直写通道）。样式全内联属性（SSR 串化），无浏览器 API。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { gaugeAngle, gaugeArcPath, polarPt, clampNum } from './gauge-math'

const props = withDefaults(defineProps<{
  total?: number | string
  flow?: number | string
  reverse?: boolean
  fill?: string
}>(), {})

const accent = computed(() => props.fill ?? '#58a6ff')

/** 字轮拆位：0000.000 定宽（整数位取末 4 位补零——字轮溢出丢高位，机械表同款行为） */
const digits = computed(() => {
  const n = Number(props.total)
  const t = Number.isFinite(n) && n >= 0 ? n : 0
  const [int, dec = ''] = t.toFixed(3).split('.')
  return {
    int: int.slice(-4).padStart(4, '0').split(''),
    dec: dec.padEnd(3, '0').slice(0, 3).split(''),
  }
})

const baselineD = computed(() => gaugeArcPath(48, 100, 26, 1, 0, 1))
const progressD = computed(() => gaugeArcPath(48, 100, 26, props.flow, 0, 1))
const needleTip = computed(() => polarPt(48, 100, 19, gaugeAngle(props.flow, 0, 1)))
const ticks = computed(() => [0, 0.5, 1].map((v) => {
  const deg = gaugeAngle(v, 0, 1)
  return { out: polarPt(48, 100, 28, deg), inn: polarPt(48, 100, 22, deg) }
}))
const flowShown = computed(() => clampNum(props.flow, 0, 1, 0).toFixed(2))
</script>

<template>
  <svg viewBox="0 0 180 140" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
    <text x="12" y="14" font-size="10" fill="#8b949e">累计流量 m³</text>
    <!-- 字轮数字窗：整数位白底黑字 / 小数位红底白字（机械水表惯例） -->
    <rect x="10" y="20" width="118" height="30" rx="3" fill="#111418" stroke="#30363d" />
    <g v-for="(d, i) in digits.int" :key="'i' + i">
      <rect :x="12 + i * 15" y="22" width="14" height="26" rx="1" fill="#f5f5f5" />
      <text :x="19 + i * 15" y="40" text-anchor="middle" font-size="15" fill="#111111" font-family="Consolas, Menlo, monospace">{{ d }}</text>
    </g>
    <text x="76" y="40" text-anchor="middle" font-size="15" fill="#e6f7ff" font-family="Consolas, Menlo, monospace">.</text>
    <g v-for="(d, i) in digits.dec" :key="'d' + i">
      <rect :x="81 + i * 15" y="22" width="14" height="26" rx="1" fill="#a40e0e" />
      <text :x="88 + i * 15" y="40" text-anchor="middle" font-size="15" fill="#ffffff" font-family="Consolas, Menlo, monospace">{{ d }}</text>
    </g>
    <!-- 瞬时流量小盘 -->
    <text x="12" y="66" font-size="10" fill="#8b949e">瞬时 m³/h</text>
    <path :d="baselineD" fill="none" stroke="#30363d" stroke-width="5" stroke-linecap="round" />
    <path :d="progressD" fill="none" :stroke="accent" stroke-width="5" stroke-linecap="round" />
    <g v-for="(t, i) in ticks" :key="'t' + i" stroke="#6e7681" stroke-width="1">
      <line :x1="t.out.x" :y1="t.out.y" :x2="t.inn.x" :y2="t.inn.y" />
    </g>
    <line :x1="48" :y1="100" :x2="needleTip.x" :y2="needleTip.y" :stroke="accent" stroke-width="2" />
    <circle cx="48" cy="100" r="3" :fill="accent" />
    <text x="88" y="100" font-size="13" fill="#e6f7ff" font-family="Consolas, Menlo, monospace">{{ flowShown }}</text>
    <text x="88" y="112" font-size="8" fill="#8b949e">0.00 ~ 1.00 m³/h</text>
    <!-- 逆向流标记：常态暗虚线壳，reverse_flag 命中 → 红色环流箭头 + 字样显现 -->
    <circle cx="150" cy="100" r="16" fill="none" stroke="#30363d" stroke-width="1" stroke-dasharray="3 3" />
    <g v-if="props.reverse">
      <path d="M 157.07 92.93 A 10 10 0 1 1 142.93 107.07" fill="none" stroke="#f5222d" stroke-width="2.5" />
      <polygon points="147.2,102.8 145.76,109.9 140.1,104.24" fill="#f5222d" />
      <text x="150" y="132" text-anchor="middle" font-size="9" fill="#f5222d">逆向流</text>
    </g>
  </svg>
</template>
