<!-- 迷你趋势（工业功能件 2/8）：watch props.value 采样入环形缓冲（spark-buffer.ts），
     SVG polyline 绘制；限值线虚线（P3 黄 / SP 黑）。空缓冲显示"等待数据"占位，
     不画一条假的零线。浅色 HP-HMI 主题；不依赖宿主 CSS 变量。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { HP, limitOf } from './hp-hmi'
import { pushSample, sparkPoints, type SparkSample } from './spark-buffer'

const props = defineProps<{
  fill?: string
  label?: string
  value?: number | string
  min?: number | string
  max?: number | string
  show_limits?: boolean
  ll?: number | string
  l?: number | string
  h?: number | string
  hh?: number | string
  show_sp?: boolean
  sp?: number | string
  window?: number | string
}>()

const W = 260
const H = 90
const buf = ref<SparkSample[]>([])

const num = (v: unknown, fb = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fb
}

watch(
  () => props.value,
  (v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return
    buf.value = pushSample(buf.value, n, Date.now(), num(props.window, 300))
  },
)

const points = computed(() => sparkPoints(buf.value, W, H, num(props.min), num(props.max)))
const last = computed(() => buf.value[buf.value.length - 1])

const yPos = (v: unknown): number => {
  const lo = num(props.min)
  const hi = num(props.max)
  const x = Number(v)
  if (!Number.isFinite(x) || hi <= lo) return H / 2
  return H - Math.max(0, Math.min(1, (x - lo) / (hi - lo))) * H
}
const limitLines = computed(() => {
  if (!props.show_limits) return []
  return ([
    ['LL', props.ll, '#d32f2f'],
    ['L', props.l, '#fbc02d'],
    ['H', props.h, '#fbc02d'],
    ['HH', props.hh, '#d32f2f'],
  ] as const)
    .filter(([, v]) => limitOf(v) !== undefined)
    .map(([name, v, color]) => ({ name, y: yPos(v), color }))
})
</script>

<template>
  <div class="ah-sp" data-testid="ah-sparkline">
    <span class="ah-sp-label">{{ props.label }}</span>
    <svg class="ah-sp-svg" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="props.label">
      <line
        v-for="ln in limitLines" :key="ln.name"
        x1="0" :y1="ln.y" :x2="W" :y2="ln.y"
        :stroke="ln.color" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"
      />
      <line
        v-if="props.show_sp" x1="0" :y1="yPos(props.sp)" :x2="W" :y2="yPos(props.sp)"
        stroke="#1f2328" stroke-width="1" vector-effect="non-scaling-stroke"
      />
      <polyline
        v-if="points" :points="points" fill="none" :stroke="props.fill ?? HP.live"
        stroke-width="1.6" vector-effect="non-scaling-stroke"
      />
      <circle
        v-if="last && points" :cx="W - 2" :cy="yPos(last.v)" r="2.5" :fill="props.fill ?? HP.live"
      />
    </svg>
    <span v-if="!points" class="ah-sp-empty">等待数据</span>
  </div>
</template>

<style scoped>
.ah-sp {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #8a939d;
  border-radius: 4px;
  overflow: hidden;
  font-family: system-ui, 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
}
.ah-sp-label {
  position: absolute;
  left: 8px;
  top: 5px;
  z-index: 1;
  font-size: 11px;
  color: #5b6570;
}
.ah-sp-svg {
  display: block;
  width: 100%;
  height: 100%;
}
.ah-sp-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #9e9e9e;
  pointer-events: none;
}
</style>
