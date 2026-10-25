<script setup lang="ts">
// hmi-studio 最小实证：maotu@0.6.5（npm 闭源版，无许可声明——按依赖方式消费，
// 代码不进本仓；许可证边界见 docs/LICENSE-NOTES.md）作为组态编辑器基座。
// 本页：挂载 MtEdit + 经官方 registerConfig 注入 agent-hmi 图元（MIT）。
import { ref, computed } from 'vue'
import { MtEdit, leftAsideStore } from 'maotu'
import Probe from './probe.vue'
import type { ILeftAsideConfigItemPublic } from 'maotu'
import disSwitch from './dis-switch.svg?raw'
import pump from './pump-centrifugal.svg?raw'
import tank from './tank.svg?raw'
import breaker from './breaker.svg?raw'

// agent-hmi 符号 → maotu 面板项（转换器雏形：svg + 尺寸 + 可编辑 props）
const toM = (id: string, title: string, svg: string, w: number, h: number, props: Record<string, string | number | boolean>): ILeftAsideConfigItemPublic => ({
  id,
  title,
  type: 'svg',
  thumbnail: '',
  svg,
  width: w,
  height: h,
  props: Object.fromEntries(
    Object.entries(props).map(([k, v]) => [k, { title: k, type: typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'switch' : 'string', val: v }]),
  ) as ILeftAsideConfigItemPublic['props'],
})

leftAsideStore.registerConfig('agent-hmi 图元', [
  toM('ah-dis-switch', '隔离开关', disSwitch, 60, 24, { label: '隔离开关' }),
  toM('ah-breaker', '断路器', breaker, 24, 60, { label: '断路器' }),
  toM('ah-pump', '离心泵', pump, 64, 64, { label: '离心泵' }),
  toM('ah-tank', '清水池', tank, 48, 64, { label: '清水池' }),
])

const mode = computed(() => (location.hash === '#probe' ? 'probe' : 'edit'))
const editRef = ref<InstanceType<typeof MtEdit>>()
function onSave() {
  // emit onSaveClick 的 payload 即导出 json（done_json）——桥接 ScreenDoc 的入口
  console.log('[hmi-studio] save payload 见控制台')
}
</script>

<template>
  <Probe v-if="mode === 'probe'" />
  <MtEdit v-else ref="editRef" style="height: 100vh" @on-save-click="onSave" />
</template>
