<script setup lang="ts">
// 研究资产：maotu@0.6.5 基座实证页（编辑器挂载 + registerConfig 注入试验图元）。
// 保留可达（/dev/spike），不再演进——正式编辑器见 src/views/EditView.vue（T4）。
// 图元注册已抽至 src/symbols/index.ts（T4），此处与正式编辑器共用同一注册管道。
import { MtEdit } from 'maotu'
import { registerSymbols } from '../symbols'

registerSymbols()
</script>

<template>
  <MtEdit style="height: 100vh" />
</template>
