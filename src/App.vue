<script setup lang="ts">
// 应用外壳：路由接管一切（研究资产在 /dev/*，见 router.ts）
// AI 面板入口（P2）：内部自带 status 探测降级 + /login、/dev 隐藏，壳只管挂载
import AiDrawerHost from './components/chat/AiDrawerHost.vue'
</script>

<template>
  <router-view />
  <AiDrawerHost />
</template>

<style>
/* 全局底色随主题（element-plus css-vars：html.dark 切深色盘；T16） */
html { background: var(--el-bg-color); color: var(--el-text-color-primary); }
html.dark { color-scheme: dark; }
</style>
