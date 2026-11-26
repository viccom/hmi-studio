<script setup lang="ts">
/**
 * 3D 场景编辑器页（`/edit3d/:id`）——P0 最小闭环。
 *
 * 分档（Q8 档②「混合」）：
 *   - **壳层用 element-plus**，与 2D 编辑器（EditView.vue）同构：返回、标题、画面名/slug、
 *     分组、版本、用户、退出、主题
 *   - **画布与面板保持 vendor 原生**（Viewport/SceneTree/PropertiesPanel/MaterialPanel/
 *     AnimationPanel/SceneSettingsPanel），只统一色板（沿用全局 --el-* 主题）
 *
 * 存储：由 `adapter/store-adapter.ts` 注入（`window.__hmi3d.createDbManager`），
 * 上游 Viewport 用注入的 DBManager 走 rs-iot 的 `scenes` 族。
 *
 * P0 未带的功能（有意识裁剪，见 vendor/meteor3d/PATCHES.md）：
 *   - 资产库/模型拖入（依赖 Meteor 自带 `/api/assets`，P3 换成我们的图元库）
 *   - 自动保存（PATCH-03 已置 0；P2 改「脏标记 + 409 即停」）
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import Viewport from '../vendor/meteor3d/editor/components/Viewport.vue'
import SceneTree from '../vendor/meteor3d/editor/components/SceneTree.vue'
import PropertiesPanel from '../vendor/meteor3d/editor/components/PropertiesPanel.vue'
import MaterialPanel from '../vendor/meteor3d/editor/components/MaterialPanel.vue'
import AnimationPanel from '../vendor/meteor3d/editor/components/AnimationPanel.vue'
import SceneSettingsPanel from '../vendor/meteor3d/editor/components/SceneSettingsPanel.vue'
import Toolbar from '../vendor/meteor3d/editor/components/Toolbar.vue'
import LibraryPanel from '../vendor/meteor3d/editor/components/LibraryPanel.vue'
import '../vendor/meteor3d/editor/assets/sidebar-controls.css'
import { ScenesDbManager, ConflictError } from '../adapter/store-adapter'
import { sceneStore } from '../store'
import { getAuthedUser, logout } from '../../lib/auth'
import ThemeToggle from '../../components/ThemeToggle.vue'

const route = useRoute()
const router = useRouter()
const sceneId = computed(() => String(route.params.id ?? ''))
const meta = ref<{ name?: string; group?: string }>({})
const user = getAuthedUser()
const activeTab = ref<'properties' | 'material' | 'animation' | 'settings'>('properties')
const store = sceneStore()

/** 把适配器与自动保存策略挂到模块约定位置（Viewport/Toolbar 读它，见 PATCHES PATCH-01/03） */
function installModuleBridge(): ScenesDbManager {
  const db = new ScenesDbManager()
  const w = window as unknown as { __hmi3d?: Record<string, unknown> }
  w.__hmi3d = {
    ...(w.__hmi3d ?? {}),
    createDbManager: () => db,
    autoSaveMs: 0, // P0：关闭自动保存（P2 改脏标记 + 乐观锁）
  }
  return db
}

// **必须在 setup 同步执行**：Vue 子组件的 onMounted 先于父组件，
// Viewport 挂载时就要读 window.__hmi3d.createDbManager，放到 onMounted 里会晚一步
// （实测后果：上游 DBManager 打 /scene/load → 404，编辑器空场景）。
installModuleBridge()  // 早于子组件挂载（见上）

onMounted(async () => {
  // 读一次元信息（标题/分组）——saveScene 时由适配器补齐，不会因这里读不到而丢
  try {
    const { doc } = await store.get(sceneId.value)
    meta.value = { name: doc.meta?.name, group: doc.meta?.group }
  } catch (e) {
    ElMessage.error(`场景读取失败：${(e as Error).message}`)
  }
  // 乐观锁冲突全局提示（适配器抛 ConflictError）
  const onUnhandled = (ev: PromiseRejectionEvent) => {
    if (ev.reason instanceof ConflictError) {
      ElMessage.error(ev.reason.message)
      ev.preventDefault()
    }
  }
  window.addEventListener('unhandledrejection', onUnhandled)
  onBeforeUnmount(() => window.removeEventListener('unhandledrejection', onUnhandled))
})

// 切场景 = 重挂 Viewport（上游按 route.params 初始化，不重挂会沿用旧 sceneId）
watch(sceneId, () => { /* 路由变化时由 router-view :key 重挂（见模板） */ })

function doLogout(): void {
  logout()
  void router.replace('/login')
}
</script>

<template>
  <div class="edit3d-page">
    <!-- 壳层（element-plus，与 2D EditView 同构） -->
    <header class="edit3d-topbar">
      <el-button size="small" text @click="router.push('/screens3d')">← 3D 场景</el-button>
      <span class="scene-name">{{ meta.name ?? sceneId }}</span>
      <span class="scene-slug">{{ sceneId }}</span>
      <el-tag v-if="meta.group" size="small" type="info">{{ meta.group }}</el-tag>
      <span class="topbar-right">
        <el-tag size="small" type="warning" effect="plain" title="P0 最小闭环：自动保存已关闭，请手动保存">P0</el-tag>
        <span v-if="user" class="topbar-user">{{ user.user_id }}</span>
        <el-button size="small" text @click="doLogout">退出</el-button>
        <ThemeToggle />
      </span>
    </header>

    <div class="edit3d-body">
      <aside class="edit3d-left">
        <div class="edit3d-tree"><SceneTree /></div>
        <div class="edit3d-library">
          <LibraryPanel />
        </div>
      </aside>

      <section class="edit3d-center">
        <div class="edit3d-stage">
          <!-- 上游 Viewport 自己从 route.params 取 sceneId（PATCH-02 兼容 :id） -->
          <Viewport :key="sceneId" />
        </div>
        <Toolbar class="edit3d-toolbar" />
      </section>

      <aside class="edit3d-right">
        <div class="edit3d-tabs">
          <button
            v-for="t in ([
              { id: 'properties', label: '属性' },
              { id: 'material', label: '材质' },
              { id: 'animation', label: '动画' },
              { id: 'settings', label: '场景' },
            ] as const)"
            :key="t.id"
            class="edit3d-tab"
            :class="{ active: activeTab === t.id }"
            @click="activeTab = t.id"
          >{{ t.label }}</button>
        </div>
        <div class="edit3d-panel">
          <PropertiesPanel v-show="activeTab === 'properties'" />
          <MaterialPanel v-show="activeTab === 'material'" />
          <AnimationPanel v-show="activeTab === 'animation'" />
          <SceneSettingsPanel v-show="activeTab === 'settings'" />
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.edit3d-page { height: 100vh; display: flex; flex-direction: column; background: var(--el-bg-color); }
.edit3d-topbar {
  display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 16px;
  flex-shrink: 0; border-bottom: 1px solid var(--el-border-color-light);
}
.scene-name { font-weight: 600; font-size: 13px; color: var(--el-text-color-primary); }
.scene-slug { font-size: 12px; font-family: monospace; color: var(--el-text-color-secondary); }
.topbar-right { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; }
.topbar-user { font-size: 12px; color: var(--el-text-color-secondary); }

.edit3d-body { flex: 1; min-height: 0; display: flex; }
.edit3d-left {
  width: 220px; flex-shrink: 0; display: flex; flex-direction: column;
  border-right: 1px solid var(--el-border-color-light);
}
.edit3d-tree { flex: 1; min-height: 0; overflow: auto; }
.edit3d-library { flex: 0 0 45%; min-height: 0; overflow: auto; border-top: 1px solid var(--el-border-color-light); }
.edit3d-center { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.edit3d-stage { flex: 1; min-height: 0; position: relative; }
/* 上游 Viewport 的容器需要明确尺寸（它按父容器做 ResizeObserver） */
.edit3d-stage :deep(.viewport-container) { width: 100%; height: 100%; }
.edit3d-toolbar { flex-shrink: 0; }

.edit3d-right {
  width: 300px; flex-shrink: 0; display: flex; flex-direction: column;
  border-left: 1px solid var(--el-border-color-light);
}
.edit3d-tabs { display: flex; flex-shrink: 0; border-bottom: 1px solid var(--el-border-color-light); }
.edit3d-tab {
  flex: 1; padding: 7px 0; font-size: 12px; cursor: pointer;
  background: transparent; border: none; color: var(--el-text-color-regular);
  border-bottom: 2px solid transparent;
}
.edit3d-tab.active { color: var(--el-color-primary); border-bottom-color: var(--el-color-primary); font-weight: 600; }
.edit3d-panel { flex: 1; min-height: 0; overflow: auto; }
</style>
