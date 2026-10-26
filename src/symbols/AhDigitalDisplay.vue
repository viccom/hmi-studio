<!-- 数显面板（批 B vue 型 1/6）：标签 + 大号数字读数 + 单位——真 <span>（vue 型才有自由 DOM，
     svg 型禁 text 的绕行即此，规范 §4.2）。样式自包含深色工业面板（dataURI 之外的真实 DOM，
     不依赖宿主 CSS 变量）。value 可能来自 SSE 直写（number）或触发器（string），显示统一 String()。 -->
<script setup lang="ts">
const props = defineProps<{
  label?: string
  value?: number | string
  unit?: string
  fill?: string
}>()
</script>

<template>
  <div
    class="ah-dsp"
    :style="{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px' }"
  >
    <span class="ah-dsp-label">{{ props.label }}</span>
    <span class="ah-dsp-value" :style="{ color: props.fill ?? '#e6f7ff' }">{{ props.value ?? '--' }}</span>
    <span class="ah-dsp-unit">{{ props.unit }}</span>
  </div>
</template>

<style scoped>
.ah-dsp {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px;
  box-sizing: border-box;
  font-family: Consolas, Menlo, monospace;
  overflow: hidden;
}
.ah-dsp-label {
  font-size: 11px;
  color: #8b949e;
  letter-spacing: 1px;
  white-space: nowrap;
}
.ah-dsp-value {
  font-size: 30px;
  line-height: 1.1;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.ah-dsp-unit {
  font-size: 11px;
  color: #8b949e;
}
</style>
