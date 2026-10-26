<!-- 燃气表盘（P2-B custom-svg 3/4）：字轮数字窗（gas_total m³）+ 余额数显（balance，
     <20 元橙色预警——rs-iot 递减余额的关阀前兆）+ 阀门状态标（valve 开/关）+ 泄漏报警灯
     （leak_alarm → 红闪）。数据面 home-meter-g*：gas_total/gas_instant/balance/valve/
     leak_alarm（bind 直写通道）。
     闪烁实现（P2 两次实测裁定）：①模板内 <svg><style> 被 vue SFC 编译器剥除（「Tags with
     side effect (<script> and <style>) are ignored in client component templates」——SSR
     串化输出永不含它，CSS 闪烁路线死）；②改用 SVG SMIL <animate>（声明式动画、普通元素
     照常串化、dataURI img 内浏览器照跑）——红闪 = leak 条件渲染 <animate>（e2e 锁定）。
     样式仍全内联属性（不依赖宿主 CSS）。 -->
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  total?: number | string
  balance?: number | string
  valve?: boolean
  leak?: boolean
  fill?: string
}>(), {})

const BALANCE_WARN = 20

/** 字轮拆位（同水表：0000.000 定宽，整数位溢出丢高位） */
const digits = computed(() => {
  const n = Number(props.total)
  const t = Number.isFinite(n) && n >= 0 ? n : 0
  const [int, dec = ''] = t.toFixed(3).split('.')
  return {
    int: int.slice(-4).padStart(4, '0').split(''),
    dec: dec.padEnd(3, '0').slice(0, 3).split(''),
  }
})

const balanceNum = computed(() => {
  const n = Number(props.balance)
  return Number.isFinite(n) ? n : NaN
})
const balanceWarn = computed(() => Number.isFinite(balanceNum.value) && balanceNum.value < BALANCE_WARN)
const balanceColor = computed(() => (balanceWarn.value ? '#faad14' : (props.fill ?? '#e6f7ff')))
const balanceShown = computed(() => (Number.isFinite(balanceNum.value) ? balanceNum.value.toFixed(2) : '--'))
const valveColor = computed(() => (props.valve ? '#52c41a' : '#f5222d'))
const lampFill = computed(() => (props.leak ? '#f5222d' : '#262d36'))
</script>

<template>
  <svg viewBox="0 0 180 140" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
    <text x="12" y="14" font-size="10" fill="#8b949e">累计气量 m³</text>
    <!-- 字轮数字窗：整数位白底黑字 / 小数位红底白字 -->
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
    <!-- 余额数显：<20 元橙色预警（关阀前兆） -->
    <text x="12" y="72" font-size="11" fill="#8b949e">余额</text>
    <text x="156" y="74" text-anchor="end" font-size="18" :fill="balanceColor" font-family="Consolas, Menlo, monospace">{{ balanceShown }}</text>
    <text x="160" y="74" font-size="10" fill="#8b949e">元</text>
    <text v-if="balanceWarn" x="156" y="86" text-anchor="end" font-size="8" fill="#faad14">余额不足（&lt;{{ BALANCE_WARN }} 元）</text>
    <!-- 阀门状态标：开绿 / 关红（余额 &lt;10 关阀的业务语义由数据面决定） -->
    <rect x="12" y="92" width="64" height="26" rx="4" :fill="props.valve ? 'rgba(82,196,26,0.12)' : 'rgba(245,34,45,0.12)'" :stroke="valveColor" />
    <text x="44" y="109" text-anchor="middle" font-size="11" :fill="valveColor">阀 · {{ props.valve ? '开' : '关' }}</text>
    <!-- 泄漏报警灯：leak_alarm → 红闪（SMIL <animate> 声明式动画，见头注释两次实测裁定） -->
    <circle v-if="props.leak" cx="140" cy="105" r="13" fill="#f5222d" opacity="0.35">
      <animate attributeName="opacity" values="0.35;0.05;0.35" dur="1s" repeatCount="indefinite" />
    </circle>
    <circle cx="140" cy="105" r="8" :fill="lampFill" :stroke="props.leak ? '#ffb3b8' : '#30363d'" stroke-width="1">
      <animate v-if="props.leak" attributeName="fill" values="#f5222d;#7a1010;#f5222d" dur="1s" repeatCount="indefinite" />
    </circle>
    <text x="140" y="132" text-anchor="middle" font-size="9" :fill="props.leak ? '#f5222d' : '#8b949e'">泄漏</text>
  </svg>
</template>
