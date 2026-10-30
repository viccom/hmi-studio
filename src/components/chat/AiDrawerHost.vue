<!-- src/components/chat/AiDrawerHost.vue —— AI 面板入口（P2，设计 §5.1）。
  挂载点 = App.vue（单点挂载，K4：ViewView 全屏画布无顶栏可放）。职责三件：
  1. status 探测降级：mounted 时探 GET /api/agent/status，非 2xx（reasonix 未部署/
     gateway 未配 [reasonix] → 503）→ 按钮整个不出现（appliance 档站点无 AI 也能用，
     不报错不弹窗）
  2. 懒加载：抽屉 defineAsyncComponent——首屏 bundle 不背 chat 依赖
     （@incremark/DOMPurify 不小），首次点击才拉 chunk
  3. 路由可见性：/login（未登录）与 /dev/*（研究资产）不显示
-->
<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { tokenStore } from '../../lib/api'

const AgentDrawer = defineAsyncComponent(() => import('./AgentDrawer.vue'))

const route = useRoute()
const drawerOpen = ref(false)
/** status 探测通过才显示入口（探测一次；面板内 start() 各端点自容错）。 */
const available = ref(false)

onMounted(async () => {
  if (!tokenStore.get()) return
  try {
    const token = tokenStore.get()
    const res = await fetch('/api/agent/status', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
    available.value = res.ok
  } catch {
    available.value = false
  }
})
</script>

<template>
  <template v-if="available && route.path !== '/login' && !route.path.startsWith('/dev/')">
    <button
      v-if="!drawerOpen"
      class="ai-entry"
      title="AI 助手（读画面/查数据/截图自检；写画面需审批）"
      aria-label="打开 AI 助手"
      @click="drawerOpen = true"
    >AI 助手</button>
    <AgentDrawer v-if="drawerOpen" @close="drawerOpen = false" />
  </template>
</template>

<style scoped>
/* 右下角悬浮入口：避开三视图各自的顶栏右区（新建画面按钮/用户名/横幅），
   bottom-right 在全屏运行页也不遮内容 */
.ai-entry {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 90;
  padding: 9px 16px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: var(--el-color-white, #fff);
  background: var(--el-color-primary);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
.ai-entry:hover { background: var(--el-color-primary-dark-2); }
</style>
