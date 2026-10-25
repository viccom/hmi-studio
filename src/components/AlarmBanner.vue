<script setup lang="ts">
// T8 告警横幅：轮播当前告警（ViewView 5s tick 驱动 store.next）；级别色（未知级别兜底 info 色）；
// 点击展开抽屉。纯展示组件——合并/轮播逻辑在 lib/alarms.ts（单测覆盖）。
import type { AlarmItem } from '../lib/alarms'

defineProps<{ alarm?: AlarmItem }>()
defineEmits<{ open: [] }>()

const LEVEL_COLOR: Record<string, string> = {
  error: 'var(--el-color-danger)',
  warn: 'var(--el-color-warning)',
  info: 'var(--el-color-info)',
}
const levelColor = (level: string): string => LEVEL_COLOR[level] ?? 'var(--el-color-info)'
</script>

<template>
  <div
    v-if="alarm"
    class="alarm-banner"
    :data-level="alarm.level"
    :style="{ '--lv': levelColor(alarm.level) }"
    data-testid="alarm-banner"
    @click="$emit('open')"
  >
    <span class="lv">{{ alarm.level.toUpperCase() }}</span>
    <span class="msg">{{ alarm.message }}</span>
    <span class="src">{{ alarm.source }}</span>
  </div>
</template>

<style scoped>
.alarm-banner {
  display: flex; align-items: center; gap: 12px;
  height: 28px; padding: 0 16px; flex-shrink: 0; cursor: pointer;
  color: var(--lv); background: color-mix(in srgb, var(--lv) 12%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--lv) 40%, transparent);
  font-size: 13px;
}
.lv { font-weight: 700; font-family: monospace; }
.msg { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.src { color: var(--el-text-color-secondary); font-size: 12px; }
</style>
