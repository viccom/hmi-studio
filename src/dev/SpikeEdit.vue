<script setup lang="ts">
// 研究资产：maotu@0.6.5 基座实证页（编辑器挂载 + registerConfig 注入试验图元）。
// 保留可达（/dev/spike），不再演进——正式编辑器见 src/views/EditView.vue（T4）。
import { MtEdit, leftAsideStore } from 'maotu'
import type { ILeftAsideConfigItemPublic } from 'maotu'
import disSwitch from '../dis-switch.svg?raw'
import pump from '../pump-centrifugal.svg?raw'
import tank from '../tank.svg?raw'
import breaker from '../breaker.svg?raw'

const toM = (id: string, title: string, svg: string, w: number, h: number, props: Record<string, string | number | boolean>): ILeftAsideConfigItemPublic => ({
  id, title, type: 'svg', thumbnail: '', svg, width: w, height: h,
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
</script>

<template>
  <MtEdit style="height: 100vh" />
</template>
