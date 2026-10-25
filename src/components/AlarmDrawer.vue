<script setup lang="ts">
// T8 告警抽屉：活动 + 已清除同表（状态列区分，任务书「历史区简化：同一列表带状态列」）；
// 行内「确认清除」按钮 → ViewView 调 DELETE /api/v1/alarms?key=（rs-iot 无 confirm 语义，实测结论）。
import type { AlarmItem } from '../lib/alarms'

const props = defineProps<{ modelValue: boolean; active: AlarmItem[]; history: AlarmItem[] }>()
defineEmits<{ 'update:modelValue': [v: boolean]; clear: [key: string] }>()

type Row = AlarmItem & { cleared: boolean }
const rows = (): Row[] => [
  ...props.active.map((a) => ({ ...a, cleared: false })),
  ...props.history.map((a) => ({ ...a, cleared: true })),
]

const LEVEL_TAG: Record<string, 'danger' | 'warning' | 'info'> = { error: 'danger', warn: 'warning', info: 'info' }
const tagType = (level: string): 'danger' | 'warning' | 'info' => LEVEL_TAG[level] ?? 'info'
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="告警中心"
    size="480px"
    data-testid="alarm-drawer"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-table :data="rows()" size="small" row-key="key" empty-text="无告警">
      <el-table-column prop="ts" label="时间" width="170">
        <template #default="{ row }">{{ row.ts?.replace('T', ' ').replace(/\.\d+.*$/, '') || '-' }}</template>
      </el-table-column>
      <el-table-column prop="source" label="设备" width="90" />
      <el-table-column prop="message" label="内容" min-width="140" show-overflow-tooltip />
      <el-table-column label="级别" width="70">
        <template #default="{ row }">
          <el-tag size="small" :type="tagType(row.level)">{{ row.level }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <span :class="['st', row.cleared ? 'cleared' : 'firing']">{{ row.cleared ? '已清除' : '告警中' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90">
        <template #default="{ row }">
          <el-button v-if="!row.cleared" size="small" type="danger" link @click="$emit('clear', row.key)">确认清除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-drawer>
</template>

<style scoped>
.st.firing { color: var(--el-color-danger); }
.st.cleared { color: var(--el-text-color-secondary); }
</style>
