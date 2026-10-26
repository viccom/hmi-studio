<script setup lang="ts">
// T16 主题切换按钮：消费 useTheme 单例（main.ts initTheme 已保证初始态）。
// 自绘 SVG 图标（不引 @element-plus/icons-vue——非既有依赖）。
import { useTheme } from '../lib/theme'

const { theme, toggle } = useTheme()
</script>

<template>
  <button
    class="theme-toggle"
    data-testid="theme-toggle"
    :title="theme === 'dark' ? '切换到亮色' : '切换到深色'"
    @click="toggle"
  >
    <svg v-if="theme === 'dark'" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
    <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; padding: 0; border: none; border-radius: 4px;
  background: transparent; color: var(--el-text-color-secondary); cursor: pointer;
}
.theme-toggle:hover { background: var(--el-fill-color-light); color: var(--el-color-primary); }
</style>
