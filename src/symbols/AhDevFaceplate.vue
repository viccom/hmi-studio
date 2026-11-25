<!-- 设备面板（工业功能件 8/8）：ISA-101 faceplate 的画布内实现（maotu 无弹窗能力）。
     布局固定，保证同型设备面板一致：标题/状态 → PV+单位 → 限值带 → 量程条 →
     可选控制区 → 相邻趋势 → 报警/质量页脚。数值等宽 tabular；正常态无饱和色。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { HP, limitOf, prioColor, prioLabel, qualityColor, qualityLabel } from './hp-hmi'
import { pushSample, sparkPoints, type SparkSample } from './spark-buffer'

const props = defineProps<{
  fill?: string
  title?: string
  dev?: string
  unit?: string
  pv?: number | string
  precision?: number | string
  min?: number | string
  max?: number | string
  show_limits?: boolean
  ll?: number | string
  l?: number | string
  h?: number | string
  hh?: number | string
  show_sp?: boolean
  sp?: number | string
  show_control?: boolean
  op?: number | string
  mode?: number | string
  status?: number | string
  quality?: number | string
  prio?: number | string
  pv_prio?: number | string
  alarms?: number | string
  window?: number | string
}>()

const num = (v: unknown, fb = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fb
}
const precision = computed(() => Math.max(0, Math.min(4, Math.round(num(props.precision, 2)))))
const fmt = (v: unknown): string => {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(precision.value) : '--'
}

const pvNum = computed(() => num(props.pv, NaN))
const pvText = computed(() => (Number.isFinite(pvNum.value) ? pvNum.value.toFixed(precision.value) : '--'))
const prio = computed(() => {
  const n = Math.round(num(props.prio))
  return n >= 0 && n <= 4 ? n : 0
})
const alarms = computed(() => Math.max(0, Math.round(num(props.alarms))))
const qual = computed(() => {
  const n = Math.round(num(props.quality))
  return n === 1 || n === 2 ? n : 0
})
const pvPrio = computed(() => {
  const n = Math.round(num(props.pv_prio))
  return n >= 0 && n <= 4 ? n : 0
})
const pvColor = computed(() =>
  pvPrio.value > 0 ? prioColor(pvPrio.value) : qual.value > 0 ? HP.off : (props.fill ?? HP.live),
)

const statusWords = ['停止', '运行', '故障', '维护', '离线']
const st = computed(() => {
  const n = Math.round(num(props.status, 1))
  return n >= 0 && n <= 4 ? n : 4
})
const statusColor = computed(() => {
  switch (st.value) {
    case 1: return HP.ok
    case 2: return HP.alarmP1
    case 3: return HP.alarmP3
    default: return HP.off
  }
})

const pct = (v: unknown): number => {
  const lo = num(props.min)
  const hi = num(props.max)
  const x = Number(v)
  if (!Number.isFinite(x) || hi <= lo) return 50
  return Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100))
}
const hasLimit = (v: unknown): boolean => limitOf(v) !== undefined

const showLimits = computed(() => Boolean(props.show_limits))
const zones = computed(() => {
  if (!showLimits.value) return []
  const out: Array<{ left: number; width: number; color: string }> = []
  const push = (x1: number, x2: number, color: string) => {
    if (x2 - x1 > 0.1) out.push({ left: x1, width: x2 - x1, color })
  }
  const ll = hasLimit(props.ll) ? pct(props.ll) : null
  const l = hasLimit(props.l) ? pct(props.l) : null
  const h = hasLimit(props.h) ? pct(props.h) : null
  const hh = hasLimit(props.hh) ? pct(props.hh) : null
  if (ll !== null) {
    push(0, ll, HP.alarmP1)
    if (l !== null) push(ll, l, HP.alarmP3)
  } else if (l !== null) push(0, l, HP.alarmP3)
  push(l ?? 0, h ?? 100, HP.bandOk)
  if (hh !== null) {
    if (h !== null) push(h, hh, HP.alarmP3)
    push(hh, 100, HP.alarmP1)
  } else if (h !== null) push(h, 100, HP.alarmP3)
  return out
})
const ticks = computed(() => {
  if (!showLimits.value) return []
  return ([
    ['LL', props.ll, HP.alarmP1],
    ['L', props.l, HP.alarmP3],
    ['H', props.h, HP.alarmP3],
    ['HH', props.hh, HP.alarmP1],
  ] as const)
    .filter(([, v]) => hasLimit(v))
    .map(([name, v, color]) => ({ name, left: pct(v), color }))
})
const limitText = computed(() =>
  ([
    ['LL', props.ll],
    ['L', props.l],
    ['H', props.h],
    ['HH', props.hh],
  ] as const)
    .filter(([, v]) => hasLimit(v))
    .map(([n, v]) => `${n} ${fmt(v)}`)
    .join(' · '),
)

const modeText = computed(() => ['MAN', 'AUTO', 'CAS'][Math.max(0, Math.min(2, Math.round(num(props.mode, 1))))])
const modeColor = computed(() => (modeText.value === 'MAN' ? HP.alarmP3 : modeText.value === 'AUTO' ? HP.ink : HP.live))
const opPct = computed(() => Math.max(0, Math.min(100, num(props.op))))

// 内嵌趋势：与 ah-sparkline 共用 spark-buffer（w=480,h=150）
const TW = 480
const TH = 150
const buf = ref<SparkSample[]>([])
watch(
  () => props.pv,
  (v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return
    buf.value = pushSample(buf.value, n, Date.now(), num(props.window, 300))
  },
)
const trendPoints = computed(() => sparkPoints(buf.value, TW, TH, num(props.min), num(props.max)))
const yPos = (v: unknown): number => {
  const lo = num(props.min)
  const hi = num(props.max)
  const x = Number(v)
  if (!Number.isFinite(x) || hi <= lo) return TH / 2
  return TH - Math.max(0, Math.min(1, (x - lo) / (hi - lo))) * TH
}

/** 趋势限值线（y 在此算好，模板不再反查数值） */
const limitLines = computed(() => {
  if (!showLimits.value) return []
  return ([
    ['LL', props.ll, HP.alarmP1],
    ['L', props.l, HP.alarmP3],
    ['H', props.h, HP.alarmP3],
    ['HH', props.hh, HP.alarmP1],
  ] as const)
    .filter(([, v]) => hasLimit(v))
    .map(([name, v, color]) => ({ name, color, y: yPos(v) }))
})

const alarmColor = computed(() => (prio.value > 0 ? prioColor(prio.value) : HP.off))
</script>

<template>
  <div class="ah-fp" data-testid="ah-dev-faceplate">
    <header class="ah-fp-head">
      <div class="ah-fp-id">
        <span class="ah-fp-title">{{ props.title }}</span>
        <span class="ah-fp-dev">{{ props.dev }}</span>
      </div>
      <div class="ah-fp-state">
        <span class="ah-fp-status" :style="{ color: statusColor }">{{ statusWords[st] }}</span>
        <span class="ah-fp-quality" :style="{ color: qualityColor(qual) }">{{ qualityLabel(qual) }}</span>
      </div>
    </header>

    <section class="ah-fp-pv">
      <span class="ah-fp-pv-value" :style="{ color: pvColor }" data-testid="fp-pv">{{ pvText }}</span>
      <span class="ah-fp-pv-unit">{{ props.unit }}</span>
      <span
        v-if="prio > 0" class="ah-fp-prio" data-testid="fp-prio"
        :style="{ color: prioColor(prio), borderColor: prioColor(prio) }"
      >{{ prioLabel(prio) }} ×{{ alarms }}</span>
    </section>

    <section v-if="showLimits" class="ah-fp-band" :title="limitText">
      <div class="ah-fp-track">
        <i
          v-for="(z, i) in zones" :key="'z' + i"
          class="ah-fp-zone" :style="{ left: z.left + '%', width: z.width + '%', background: z.color }"
        ></i>
        <i
          v-for="t in ticks" :key="t.name"
          class="ah-fp-tick" :style="{ left: t.left + '%', background: t.color }"
        ></i>
        <i class="ah-fp-pvmark" :style="{ left: pct(pv) + '%' }" data-testid="fp-pv-mark"></i>
        <i v-if="props.show_sp" class="ah-fp-spmark" :style="{ left: pct(props.sp) + '%' }"></i>
      </div>
      <div class="ah-fp-bandtext">{{ limitText }}</div>
    </section>

    <section class="ah-fp-range">
      <span class="ah-fp-rail-label">量程 {{ fmt(min) }} – {{ fmt(max) }}</span>
      <div class="ah-fp-rail">
        <i class="ah-fp-rail-pv" :style="{ left: pct(pv) + '%' }"></i>
        <i v-if="props.show_sp" class="ah-fp-rail-sp" :style="{ left: pct(props.sp) + '%' }"></i>
      </div>
    </section>

    <section v-if="props.show_control" class="ah-fp-ctrl" data-testid="fp-control">
      <div class="ah-fp-ctrl-cell">
        <span class="ah-fp-ctrl-label">模式</span>
        <span class="ah-fp-ctrl-value" :style="{ color: modeColor }">{{ modeText }}</span>
      </div>
      <div class="ah-fp-ctrl-cell">
        <span class="ah-fp-ctrl-label">SP</span>
        <span class="ah-fp-ctrl-value">{{ fmt(props.sp) }}</span>
      </div>
      <div class="ah-fp-ctrl-cell ah-fp-ctrl-op">
        <span class="ah-fp-ctrl-label">OP {{ opPct.toFixed(0) }}%</span>
        <div class="ah-fp-opbar"><i :style="{ width: opPct + '%' }"></i></div>
      </div>
    </section>

    <section class="ah-fp-trend">
      <span class="ah-fp-trend-label">{{ Math.max(1, Math.round(num(props.window, 300))) }}s 趋势</span>
      <svg :viewBox="`0 0 ${TW} ${TH}`" preserveAspectRatio="none" role="img" aria-label="趋势">
        <line
          v-for="ln in limitLines" :key="'tl' + ln.name"
          x1="0" :y1="ln.y" :x2="TW" :y2="ln.y"
          :stroke="ln.color" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"
        />
        <line
          v-if="props.show_sp" x1="0" :y1="yPos(props.sp)" :x2="TW" :y2="yPos(props.sp)"
          stroke="#1f2328" stroke-width="1" vector-effect="non-scaling-stroke"
        />
        <polyline
          v-if="trendPoints" :points="trendPoints" fill="none" :stroke="props.fill ?? HP.live"
          stroke-width="1.6" vector-effect="non-scaling-stroke"
        />
      </svg>
      <span v-if="!trendPoints" class="ah-fp-trend-empty">等待数据</span>
    </section>

    <footer class="ah-fp-foot">
      <span :style="{ color: alarmColor }" data-testid="fp-alarms">活动报警 ×{{ alarms }} · {{ prioLabel(prio) }}</span>
      <span class="ah-fp-foot-q" :style="{ color: qualityColor(qual) }">质量 {{ qualityLabel(qual) }}</span>
    </footer>
  </div>
</template>

<style scoped>
.ah-fp {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 14px 16px 10px;
  background: #fff;
  border: 1px solid #8a939d;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
  font-family: system-ui, 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
}
.ah-fp-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.ah-fp-id {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.ah-fp-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2328;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ah-fp-dev {
  font-size: 10px;
  color: #5b6570;
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
}
.ah-fp-state {
  margin-left: auto;
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12px;
  font-weight: 600;
}
.ah-fp-quality {
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
}
.ah-fp-pv {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.ah-fp-pv-value {
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 48px;
  font-weight: 600;
  line-height: 1.05;
}
.ah-fp-pv-unit {
  font-size: 14px;
  color: #5b6570;
}
.ah-fp-prio {
  margin-left: auto;
  align-self: center;
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid;
  border-radius: 3px;
  padding: 1px 5px;
}
.ah-fp-band {
  position: relative;
  padding-top: 4px;
}
.ah-fp-track {
  position: relative;
  height: 14px;
  background: #e3e6e8;
  border-radius: 2px;
  overflow: hidden;
}
.ah-fp-zone {
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: 0.28;
}
.ah-fp-tick {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  margin-left: -1px;
}
.ah-fp-pvmark {
  position: absolute;
  top: -3px;
  width: 0;
  height: 0;
  margin-left: -5px;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 7px solid #1f2328;
  z-index: 1;
}
.ah-fp-spmark {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #1f2328;
}
.ah-fp-bandtext {
  margin-top: 3px;
  font-size: 10px;
  color: #5b6570;
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
}
.ah-fp-range {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ah-fp-rail-label {
  font-size: 10px;
  color: #5b6570;
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
}
.ah-fp-rail {
  position: relative;
  height: 6px;
  background: #e3e6e8;
  border-radius: 3px;
}
.ah-fp-rail-pv {
  position: absolute;
  top: -3px;
  width: 3px;
  height: 12px;
  margin-left: -1.5px;
  background: #1f2328;
}
.ah-fp-rail-sp {
  position: absolute;
  top: -3px;
  width: 1px;
  height: 12px;
  background: #5b6570;
}
.ah-fp-ctrl {
  display: flex;
  gap: 14px;
  padding: 8px 10px;
  background: #f5f5f5;
  border: 1px solid #e3e6e8;
  border-radius: 4px;
}
.ah-fp-ctrl-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ah-fp-ctrl-op {
  flex: 1;
}
.ah-fp-ctrl-label {
  font-size: 10px;
  color: #5b6570;
}
.ah-fp-ctrl-value {
  font-size: 15px;
  font-weight: 600;
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
}
.ah-fp-opbar {
  height: 8px;
  background: #e3e6e8;
  border-radius: 2px;
  overflow: hidden;
}
.ah-fp-opbar i {
  display: block;
  height: 100%;
  background: #1f4e79;
}
.ah-fp-trend {
  position: relative;
  flex: 1;
  min-height: 120px;
  border: 1px solid #e3e6e8;
  border-radius: 4px;
  overflow: hidden;
}
.ah-fp-trend svg {
  display: block;
  width: 100%;
  height: 100%;
}
.ah-fp-trend-label {
  position: absolute;
  left: 6px;
  top: 4px;
  z-index: 1;
  font-size: 10px;
  color: #5b6570;
}
.ah-fp-trend-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #9e9e9e;
}
.ah-fp-foot {
  display: flex;
  justify-content: space-between;
  padding-top: 6px;
  border-top: 1px solid #e3e6e8;
  font-size: 11px;
  font-weight: 600;
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
}
</style>
