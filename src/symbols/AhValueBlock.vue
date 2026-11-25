<!-- 值块（工业功能件 1/8）：标签 + PV + 单位 + 限值带 + SP 标记 + 报警/质量态。
     浅色 HP-HMI 主题（白卡片 + 暗蓝数值）；饱和色只由 prio/限值区提供，正常态不出现。
     props 键与 value-block.ts 描述符严格一致（测试锁定）；数值可能来自 SSE 直写或
     触发器字符串，统一 Number() 归一。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { HP, limitOf, prioColor, prioLabel, qualityColor, qualityLabel } from './hp-hmi'

const props = defineProps<{
  fill?: string
  label?: string
  value?: number | string
  unit?: string
  precision?: number
  min?: number | string
  max?: number | string
  show_limits?: boolean
  ll?: number | string
  l?: number | string
  h?: number | string
  hh?: number | string
  show_sp?: boolean
  sp?: number | string
  prio?: number | string
  quality?: number | string
  compact?: boolean
}>()

const num = (v: unknown, fb = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fb
}

const pv = computed(() => num(props.value, NaN))
const precision = computed(() => Math.max(0, Math.min(6, Math.round(num(props.precision, 2)))))
const text = computed(() => (Number.isFinite(pv.value) ? pv.value.toFixed(precision.value) : '--'))
const prio = computed(() => Math.round(num(props.prio)))
const qual = computed(() => Math.round(num(props.quality)))
const valueColor = computed(() =>
  prio.value > 0 ? prioColor(prio.value) : qual.value > 0 ? HP.off : (props.fill ?? HP.live),
)

/** 工程量程 → 百分比（夹紧；量程退化时居中） */
const pct = (v: unknown): number => {
  const lo = num(props.min)
  const hi = num(props.max)
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return 50
  const x = Number(v)
  if (!Number.isFinite(x)) return 50
  return Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100))
}

const showLimits = computed(() => Boolean(props.show_limits))
const hasLimit = (v: unknown): boolean => limitOf(v) !== undefined

const zones = computed(() => {
  if (!showLimits.value) return []
  const out: Array<{ left: number; width: number; color: string; opacity: number }> = []
  const push = (x1: number, x2: number, color: string) => {
    if (x2 - x1 > 0.1) out.push({ left: x1, width: x2 - x1, color, opacity: 0.22 })
  }
  // 未组态的档位（哨兵）不画；0 是合法限值
  const ll = hasLimit(props.ll) ? pct(props.ll) : null
  const l = hasLimit(props.l) ? pct(props.l) : null
  const h = hasLimit(props.h) ? pct(props.h) : null
  const hh = hasLimit(props.hh) ? pct(props.hh) : null
  // 低侧：LL 外 P1；LL..L P3；无 LL 时 L 外 P3
  if (ll !== null) {
    push(0, ll, HP.alarmP1)
    if (l !== null) push(ll, l, HP.alarmP3)
  } else if (l !== null) push(0, l, HP.alarmP3)
  // 正常区
  push(l ?? 0, h ?? 100, HP.bandOk)
  // 高侧：H..HH P3；HH 外 P1；无 HH 时 H 外 P3
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

const bandTitle = computed(() => {
  if (!showLimits.value) return ''
  const parts = ([['LL', props.ll], ['L', props.l], ['H', props.h], ['HH', props.hh]] as const)
    .filter(([, v]) => hasLimit(v))
    .map(([n, v]) => `${n} ${num(v).toFixed(precision.value)}`)
  return parts.join(' · ')
})

const pvLeft = computed(() => pct(pv.value))
const spLeft = computed(() => pct(props.sp))

/** 紧凑行模式的限值摘要（只列已设置项） */
const limitShort = computed(() =>
  ([
    ['LL', props.ll],
    ['L', props.l],
    ['H', props.h],
    ['HH', props.hh],
  ] as const)
    .filter(([, v]) => hasLimit(v))
    .map(([n, v]) => `${n} ${num(v).toFixed(precision.value)}`)
    .join(' · '),
)
</script>

<template>
  <div v-if="props.compact" class="ah-vb ah-vb-compact" data-testid="ah-value-block">
    <span class="ah-vb-label">{{ props.label }}</span>
    <span class="ah-vb-value" :style="{ color: valueColor }" data-testid="vb-value">{{ text }}</span>
    <span class="ah-vb-unit">{{ props.unit }}</span>
    <span v-if="qual > 0" class="ah-vb-q" :style="{ color: qualityColor(qual) }">{{ qualityLabel(qual) }}</span>
    <span v-if="showLimits" class="ah-vb-lim">{{ limitShort }}</span>
  </div>
  <div v-else class="ah-vb" data-testid="ah-value-block">
    <div class="ah-vb-head">
      <span class="ah-vb-label">{{ props.label }}</span>
      <span v-if="qual > 0" class="ah-vb-q" :style="{ color: qualityColor(qual) }" data-testid="vb-quality">
        {{ qualityLabel(qual) }}
      </span>
      <span
        v-if="prio > 0" class="ah-vb-prio" data-testid="vb-prio"
        :style="{ color: prioColor(prio), borderColor: prioColor(prio) }"
      >{{ prioLabel(prio) }}</span>
    </div>
    <div class="ah-vb-value-row">
      <span class="ah-vb-value" :style="{ color: valueColor }" data-testid="vb-value">{{ text }}</span>
      <span class="ah-vb-unit">{{ props.unit }}</span>
    </div>
    <div v-if="showLimits" class="ah-vb-band" :title="bandTitle" data-testid="vb-band">
      <div class="ah-vb-track">
        <i
          v-for="(z, i) in zones" :key="'z' + i"
          class="ah-vb-zone"
          :style="{ left: z.left + '%', width: z.width + '%', background: z.color, opacity: z.opacity }"
        ></i>
        <i
          v-for="t in ticks" :key="t.name"
          class="ah-vb-tick" :style="{ left: t.left + '%', background: t.color }"
        ></i>
      </div>
      <i class="ah-vb-pv" :style="{ left: pvLeft + '%' }" data-testid="vb-pv-marker"></i>
      <i
        v-if="props.show_sp" class="ah-vb-sp" :style="{ left: spLeft + '%' }" data-testid="vb-sp-marker"
      ></i>
    </div>
  </div>
</template>

<style scoped>
.ah-vb {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 6px 10px 8px;
  background: #fff;
  border: 1px solid #8a939d;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  font-family: system-ui, 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
}
.ah-vb-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 14px;
}
.ah-vb-label {
  flex: 1;
  font-size: 11px;
  color: #5b6570;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ah-vb-q {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
}
.ah-vb-prio {
  font-size: 10px;
  font-weight: 700;
  border: 1px solid;
  border-radius: 2px;
  padding: 0 3px;
  line-height: 13px;
}
.ah-vb-value-row {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-height: 34px;
}
.ah-vb-value {
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 27px;
  font-weight: 600;
  line-height: 1.15;
}
.ah-vb-unit {
  font-size: 11px;
  color: #5b6570;
}
.ah-vb-band {
  position: relative;
  height: 14px;
  margin-top: auto;
}
.ah-vb-track {
  position: absolute;
  inset: 4px 0 2px;
  background: #e3e6e8;
  border-radius: 2px;
  overflow: hidden;
}
.ah-vb-zone {
  position: absolute;
  top: 0;
  bottom: 0;
}
.ah-vb-tick {
  position: absolute;
  top: -1px;
  bottom: -1px;
  width: 2px;
  margin-left: -1px;
}
.ah-vb-pv {
  position: absolute;
  top: 0;
  width: 0;
  height: 0;
  margin-left: -4px;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid #1f2328;
}
.ah-vb-sp {
  position: absolute;
  top: 3px;
  bottom: 1px;
  width: 1px;
  margin-left: -0.5px;
  background: #1f2328;
}
/* 紧凑行模式（参数表）：单行 label | 值 | 单位 | 质量 | 限值摘要 */
.ah-vb-compact {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border: none;
  border-bottom: 1px solid #e3e6e8;
  border-radius: 0;
  background: transparent;
}
.ah-vb-compact .ah-vb-label {
  flex: 1;
  min-width: 0;
}
.ah-vb-compact .ah-vb-value {
  font-size: 15px;
  font-weight: 600;
  min-width: 84px;
  text-align: right;
}
.ah-vb-compact .ah-vb-unit {
  min-width: 56px;
}
.ah-vb-lim {
  min-width: 190px;
  text-align: right;
  font-size: 10px;
  color: #5b6570;
  font-family: Consolas, Menlo, 'DejaVu Sans Mono', monospace;
  white-space: nowrap;
}
</style>
