<script setup lang="ts">
// 插件缺席占位图元（P3b 降级渲染，plugin-fallback.ts 的渲染面）：灰框 + 原 tag 名
// 标注——「满屏占位 = 插件没装/被卸载」一眼可判，不再整画面拒载（设计 §6.2）。
// props 经 maotu 归一化为描述符（missing_tag.val = 原 tag）——prop 名必须与
// fallback 写的键一致（Vue 不做 missing_tag↔missingTag 下划线映射，实测踩到）。
defineProps<{
  missing_tag?: string
  mtItemJson?: Record<string, unknown> | null
}>()
</script>

<template>
  <div class="ah-plugin-missing" :data-missing-tag="missing_tag ?? ''">
    <span class="apm-badge">插件缺席</span>
    <span class="apm-tag">{{ missing_tag ?? '未知图元' }}</span>
  </div>
</template>

<style scoped>
.ah-plugin-missing {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1.5px dashed #909399;
  border-radius: 4px;
  background: repeating-linear-gradient(45deg, rgba(144, 147, 153, 0.08) 0 8px, transparent 8px 16px);
  color: #909399;
  font-size: 12px;
  overflow: hidden;
  font-family: inherit;
}
.apm-badge {
  font-size: 10px;
  line-height: 14px;
  padding: 0 6px;
  border-radius: 3px;
  background: rgba(144, 147, 153, 0.2);
}
.apm-tag {
  font-family: monospace;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 100%;
}
</style>
