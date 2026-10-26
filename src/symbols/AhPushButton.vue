<!-- 操作按钮（批 B vue 型 5/6）：工业蘑菇头按钮造型 + 按下视觉反馈（组件内 pressed 态，
     pointerdown/up/leave 三口收口）。命令下发**不走组件事件**——默认 click 事件模板
     （注册项 events）调 $rsiot.send(devid, tag, value)，devid/tag/value 三 prop 供组态填写；
     cmd 不进宿主事件词表，send 由桥处理（bridge.ts D2），编辑态 D6 守卫（二次确认「真实下发」）
     宿主已有——组件保持 maotu 无关，可独立单测。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  label?: string
  devid?: string
  tag?: string
  value?: number
  fill?: string
}>()

const pressed = ref(false)
const down = (): void => { pressed.value = true }
const up = (): void => { pressed.value = false }
// fill 可被绑定/触发回写——computed 保持响应（props 直用会冻结初值）
const capColor = computed(() => props.fill ?? '#1677ff')
</script>

<template>
  <svg
    viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"
    class="ah-btn" role="button"
    @pointerdown="down" @pointerup="up" @pointerleave="up"
  >
    <!-- 外 bezel（定色）+ 安装环 -->
    <circle cx="40" cy="40" r="36" fill="#30363d" stroke="#1c2128" stroke-width="2" />
    <circle cx="40" cy="40" r="28" fill="#1c2128" />
    <!-- 按钮帽：按下沿 y 轴下沉 2px + 缩径（视觉行程） -->
    <circle :cx="40" :cy="pressed ? 42 : 38" r="24" :fill="capColor" stroke="rgba(0,0,0,0.45)" stroke-width="1.5" />
    <circle v-if="!pressed" :cx="40" :cy="38" r="24" fill="rgba(255,255,255,0.12)" />
    <!-- 帽面高光（定色件） -->
    <ellipse :cx="40" :cy="pressed ? 34 : 30" rx="14" ry="7" fill="rgba(255,255,255,0.22)" />
    <!-- 标签（真 text，vue 型合法） -->
    <text x="40" y="74" text-anchor="middle" font-size="11" fill="#c9d1d9">{{ props.label }}</text>
  </svg>
</template>
