<!-- 三色警示灯（批 B custom-svg 型 4/6）：红/黄/绿三段独立 bool prop（各接 trigger 的
     离散通道），灯亮段高亮 + 光晕（半透明外圈，SSR 串化安全）；灯杆/底座 = fill prop。
     ANDON 布局红上/黄中/绿下；灭灯段 = 暗壳同色低透（可辨位置不刺眼）。
     custom-svg 经 maotu SSR 串化——样式全部内联属性。 -->
<script setup lang="ts">
const props = defineProps<{
  red?: boolean
  yellow?: boolean
  green?: boolean
  fill?: string
}>()

const seg = (on: boolean, onColor: string): { body: string; halo: string; stroke: string } =>
  on
    ? { body: onColor, halo: onColor, stroke: 'rgba(255,255,255,0.7)' }
    : { body: '#262d36', halo: 'none', stroke: '#3a424c' }
</script>

<template>
  <svg viewBox="0 0 64 120" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
    <!-- 灯杆 + 底座：fill prop（杆色，组态可映射机柜状态） -->
    <rect x="29" y="96" width="6" height="16" :fill="props.fill ?? '#57606a'" />
    <rect x="16" y="110" width="32" height="8" rx="2" :fill="props.fill ?? '#57606a'" />
    <rect x="14" y="10" width="36" height="4" rx="2" :fill="props.fill ?? '#57606a'" />
    <!-- 红段（顶） -->
    <rect v-if="seg(props.red ?? false, '#f5222d').halo !== 'none'" x="16" y="12" width="32" height="26" rx="6" fill="#f5222d" opacity="0.3" />
    <rect x="20" y="14" width="24" height="22" rx="5" :fill="seg(props.red ?? false, '#f5222d').body" :stroke="seg(props.red ?? false, '#f5222d').stroke" stroke-width="1" />
    <!-- 黄段（中） -->
    <rect v-if="seg(props.yellow ?? false, '#faad14').halo !== 'none'" x="16" y="42" width="32" height="26" rx="6" fill="#faad14" opacity="0.3" />
    <rect x="20" y="44" width="24" height="22" rx="5" :fill="seg(props.yellow ?? false, '#faad14').body" :stroke="seg(props.yellow ?? false, '#faad14').stroke" stroke-width="1" />
    <!-- 绿段（底） -->
    <rect v-if="seg(props.green ?? false, '#52c41a').halo !== 'none'" x="16" y="72" width="32" height="26" rx="6" fill="#52c41a" opacity="0.3" />
    <rect x="20" y="74" width="24" height="22" rx="5" :fill="seg(props.green ?? false, '#52c41a').body" :stroke="seg(props.green ?? false, '#52c41a').stroke" stroke-width="1" />
  </svg>
</template>
