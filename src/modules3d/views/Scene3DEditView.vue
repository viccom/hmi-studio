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
 *
 * 预览（2026-11-27）：顶栏眼睛图标 → **先保存当前编辑态**，再在新标签打开
 * `/view3d/:id` 运行态（与 2D 预览的差异见 openPreview 注释）。
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
import '../vendor/meteor3d/editor/assets/theme-bridge.css'
import { ScenesDbManager, ConflictError } from '../adapter/store-adapter'
import { sceneStore } from '../store'
import { getAuthedUser, logout } from '../../lib/auth'
import ThemeToggle from '../../components/ThemeToggle.vue'
import BindingPanel from '../components/BindingPanel.vue'
import EventPanel from '../components/EventPanel.vue'
import VersionPanel from '../../components/VersionPanel.vue'
import { useEditorStore } from '../vendor/meteor3d/editor/stores/editorStore.js'
import type { SceneDoc } from '../scene3d'
import * as THREE from 'three'
import { buildPartSpecs, partById } from '../adapter/industrial-parts'

const route = useRoute()
const router = useRouter()
const sceneId = computed(() => String(route.params.id ?? ''))
const meta = ref<{ name?: string; group?: string }>({})
const user = getAuthedUser()
const activeTab = ref<'properties' | 'material' | 'animation' | 'settings' | 'binding' | 'event'>('properties')
const store = sceneStore()

/** 当前场景文档（绑定/事件面板读写它；保存时与上游 objects 合并） */
const doc = ref<SceneDoc | null>(null)
/** 上游 store 的选中对象（响应式：面板据此显示"绑定对象"） */
const editorStore = useEditorStore()
const selectedBid = computed(() => (editorStore.selectedObject as { userData?: { bid?: string } } | null)?.userData?.bid ?? '')
const selectedName = computed(() => (editorStore.selectedObject as { name?: string } | null)?.name ?? '')
const hasAnimation = computed(() => {
  const o = editorStore.selectedObject as { animations?: unknown[] } | null
  return Array.isArray(o?.animations) && o.animations.length > 0
})

/** 脏标记：绑定/事件改动后置脏（自动保存只保存脏场景；上游定时器已由 PATCH-03 关闭） */
const dirty = ref(false)
/** 预览进行中（预览会先保存再开窗，按钮置 loading 防重复点击） */
const previewing = ref(false)
const verDrawer = ref(false)
/** 自动保存定时器（脏才保存；409 后停） */
let autoTimer = 0
const AUTO_SAVE_MS = 15_000

/**
 * 工业图元工厂（供 Viewport 的 PATCH-05 分支调用）：
 * spec 列表 → three Mesh 数组。**每个子件是独立 Mesh**（不包 Group）——
 * 上游序列化按对象存，Group 会把子件的 bid/几何吞掉。
 */
/**
 * 同类图元的实例序号——拖入第 2 台水表不能与第 1 台**同名**。
 *
 * 设备反查（`adapter/device-panel.ts`）靠对象名「`<设备标签>/<子件名>`」的前缀分组；
 * 若两台同名，分组会把它们并成一台 → 面板显示的设备身份错配（2026-11-28 修）。
 */
const partInstanceSeq = new Map<string, number>()

function buildIndustrialPart(partId: string, origin: { x: number; y: number; z: number }): THREE.Mesh[] {
  const part = partById(partId)
  if (!part) return []
  const seq = (partInstanceSeq.get(partId) ?? 0) + 1
  partInstanceSeq.set(partId, seq)
  const prefix = `${part.name} ${seq}`
  const recs = buildPartSpecs(part, { origin, namePrefix: prefix })
  return recs.map((r) => {
    const geo = makeGeometry(r.geometry)
    const mat = new THREE.MeshStandardMaterial({
      color: Number(r.material.color ?? 0x6b8299),
      roughness: Number(r.material.roughness ?? 0.8),
      metalness: Number(r.material.metalness ?? 0.1),
      ...(r.material.emissive !== undefined ? { emissive: Number(r.material.emissive), emissiveIntensity: Number(r.material.emissiveIntensity ?? 1) } : {}),
      ...(r.material.opacity !== undefined ? { transparent: true, opacity: Number(r.material.opacity) } : {}),
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = r.name
    mesh.userData.bid = r.bid
    mesh.position.set(r.position.x, r.position.y, r.position.z)
    mesh.rotation.set(r.rotation.x, r.rotation.y, r.rotation.z)
    mesh.scale.set(r.scale.x, r.scale.y, r.scale.z)
    return mesh
  })
}

/** 参数化几何构造（上游 deserializeObject 认的那几类） */
function makeGeometry(g: { type: string; parameters: Record<string, number | boolean> }): THREE.BufferGeometry {
  const p = g.parameters as Record<string, number>
  switch (g.type) {
    case 'BoxGeometry': return new THREE.BoxGeometry(p.width, p.height, p.depth)
    case 'SphereGeometry': return new THREE.SphereGeometry(p.radius, p.widthSegments, p.heightSegments)
    case 'CylinderGeometry': return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, p.radialSegments)
    case 'ConeGeometry': return new THREE.ConeGeometry(p.radius, p.height, p.radialSegments)
    case 'PlaneGeometry': return new THREE.PlaneGeometry(p.width, p.height)
    default: return new THREE.BoxGeometry(1, 1, 1)
  }
}

/** 把适配器与自动保存策略挂到模块约定位置（Viewport/Toolbar 读它，见 PATCHES PATCH-01/03） */
function installModuleBridge(): ScenesDbManager {
  const db = new ScenesDbManager()
  const w = window as unknown as { __hmi3d?: Record<string, unknown> }
  w.__hmi3d = {
    ...(w.__hmi3d ?? {}),
    createDbManager: () => db,
    autoSaveMs: 0, // 自动保存由壳层接管（脏标记 + 409 即停，见 P2）
    buildIndustrialPart, // PATCH-05：工业图元工厂
    /**
     * 「保存视角」的唯一写路径（2026-11-28 收口）。
     *
     * 原实现由 vendor 本地替换件 `sceneService.saveInitialView` 自己 GET+PUT，
     * **绕开适配器**：① 服务器版本已 +1 而适配器缓存的 version 变旧 → 下一次保存必撞 409；
     * ② 适配器合并用旧 `lastDoc.scene` 打底 → 刚存的视角被回退。
     * 现在把视角写进当前文档 → 走**唯一保存链路**（适配器 + 乐观锁 + 语义层合并）。
     */
    saveInitialView: async (view: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }) => {
      if (!doc.value) throw new Error('场景未加载完成，无法保存视角')
      doc.value = { ...doc.value, scene: { ...(doc.value.scene ?? {}), initialView: view } }
      const ok = await saveSceneNow(true)
      if (!ok) throw new Error('视角保存失败')
      return view
    },
  }
  return db
}

// **必须在 setup 同步执行**：Vue 子组件的 onMounted 先于父组件，
// Viewport 挂载时就要读 window.__hmi3d.createDbManager，放到 onMounted 里会晚一步
// （实测后果：上游 DBManager 打 /scene/load → 404，编辑器空场景）。
const db: ScenesDbManager = installModuleBridge()  // 早于子组件挂载（见上）；同时供 saveNow/自动保存使用

onMounted(async () => {
  // 读一次元信息（标题/分组）——saveScene 时由适配器补齐，不会因这里读不到而丢
  try {
    const r = await store.get(sceneId.value)
    doc.value = r.doc
    meta.value = { name: r.doc.meta?.name, group: r.doc.meta?.group }
  } catch (e) {
    ElMessage.error(`场景读取失败：${(e as Error).message}`)
  }
  // 自动保存：只在脏时保存；适配器进入冲突态后停（方案 §5.3）
  autoTimer = window.setInterval(() => {
    if (!dirty.value || !doc.value) return
    if (db?.hasConflict()) { dirty.value = false; return } // 已冲突：不再尝试，等用户处置
    void saveSceneNow(true)
  }, AUTO_SAVE_MS)

  // 乐观锁冲突全局提示（适配器抛 ConflictError）
  const onUnhandled = (ev: PromiseRejectionEvent) => {
    if (ev.reason instanceof ConflictError) {
      ElMessage({
        type: 'error',
        duration: 0,
        showClose: true,
        message: `${ev.reason.message}。自动保存已停止——请刷新页面加载他人修改，或另存为新场景。`,
      })
      ev.preventDefault()
    }
  }
  window.addEventListener('unhandledrejection', onUnhandled)
  onBeforeUnmount(() => {
    window.removeEventListener('unhandledrejection', onUnhandled)
    if (autoTimer) { window.clearInterval(autoTimer); autoTimer = 0 }
  })
})

// 切场景 = 重挂 Viewport（上游按 route.params 初始化，不重挂会沿用旧 sceneId）
watch(sceneId, () => { /* 路由变化时由 router-view :key 重挂（见模板） */ })

/**
 * 语义层实时同步（2026-11-28 修**静默丢数据**）。
 *
 * 适配器合并时取 `sem?.bindings ?? lastDoc.bindings ?? next.bindings`——语义层若只在
 * 壳层「保存」前刷新，**vendor 工具栏的「💾 保存」**（直连 persistenceManager.saveScene，
 * 不经过 setSemantic）就会拿旧语义层覆盖新绑定，并照样弹「场景已保存」。
 * 让语义层跟着文档实时走 → 任何保存路径都带上最新的 bindings/events/meta。
 */
watch(doc, (d) => { if (d) db.setSemantic(d) }, { deep: true })

/**
 * 上游 vendor 的保存面（Viewport 挂在 `window.editor` 上）。
 * 序列化 objects/scene 由上游负责；我们只负责「语义层合并 + 落库」。
 */
type UpstreamPersistence = {
  saveScene(opts?: { allowIncomplete?: boolean }): Promise<void>
}

function upstreamPersistence(): UpstreamPersistence | null {
  const ed = (window as unknown as { editor?: { persistenceManager?: UpstreamPersistence } }).editor
  return ed?.persistenceManager ?? null
}

/**
 * 保存当前编辑态并**等待真正落库**（成功返回 true）。
 *
 * 为什么不再用 DOM 点击 hack（2026-11-27 改）：原实现用
 * `document.querySelector('.edit3d-toolbar button…')` 去点 vendor Toolbar 的 💾，
 * 拿不到「存好了没有」的信号（提示无条件报「已保存」），选择器也会随 vendor 模板漂移。
 * 现在直接调上游 `persistenceManager.saveScene`——**与 vendor Toolbar 的 💾 同一条链路**
 * （上游序列化 objects/scene → 注入的适配器合并语义层并 PUT），但可 await：
 * 预览必须确认落库后才敢打开运行页，否则预览到的是旧版。
 */
async function saveSceneNow(silent = false): Promise<boolean> {
  if (!doc.value) {
    if (!silent) ElMessage.error('场景未加载完成，无法保存')
    return false
  }
  const pm = upstreamPersistence()
  if (!pm) {
    if (!silent) ElMessage.error('编辑器尚未就绪，无法保存')
    return false
  }
  // 语义层先入适配器（bindings/events 上游不认识，必须由我们合并）
  db.setSemantic(doc.value)
  try {
    await pm.saveScene({ allowIncomplete: editorStore.allowPartialSave })
  } catch (e) {
    if (e instanceof ConflictError) {
      // 冲突是「必须人工处置」的一类：与全局 unhandledrejection 提示同文案（此处自己抛出，不再走全局兜底）
      ElMessage({
        type: 'error',
        duration: 0,
        showClose: true,
        message: `${e.message}。自动保存已停止——请刷新页面加载他人修改，或另存为新场景。`,
      })
      return false
    }
    if (!silent) {
      if ((e as { code?: string }).code === 'SCENE_NOT_FOUND') ElMessage.error('场景已被删除，保存已停止')
      else ElMessage.error(`保存失败：${(e as Error).message ?? String(e)}`)
    }
    return false
  }
  dirty.value = false
  return true
}

/** 「保存」按钮：成功才提示（此前无论成败都报「已保存」） */
async function onSave(): Promise<void> {
  if (await saveSceneNow()) ElMessage.success('已保存')
}

/**
 * 预览：在新标签打开 3D 运行态（`/view3d/:id`）。
 *
 * 与 2D 预览的差异（3D ≠ 2D 的关键点）：2D 预览直接开运行页，看到的是**已保存版本**；
 * 3D 的改动（视口里摆/移图元、绑定与事件）保存前只在编辑器内存里，直接开运行页会
 * **预览到旧版**。故这里先保存当前编辑态再打开——「预览 = 所见」；保存失败（409 冲突 /
 * 场景已删 / 未完整加载）则**中止并提示**，绝不打开旧版冒充当前态。
 */
async function openPreview(): Promise<void> {
  if (previewing.value) return
  previewing.value = true
  const href = router.resolve({ path: `/view3d/${sceneId.value}` }).href
  // ① 同步开窗：必须在用户手势内 window.open，await 之后再开会被弹窗拦截
  const win = window.open('about:blank', '_blank')
  try {
    // ② 先落库（运行页读的是库里已保存的文档）
    const ok = await saveSceneNow()
    if (!ok) {
      win?.close()
      return
    }
    if (win) win.location.href = href
    else ElMessage.warning('新标签被浏览器拦截，请允许本站弹出窗口后重试')
  } finally {
    previewing.value = false
  }
}

/** 面板改动写回本地 doc 并置脏（不立即保存——由手动保存/自动保存决定时机） */
function onDocUpdate(next: SceneDoc): void {
  doc.value = next
  dirty.value = true
}

function onRollbackDone(): void {
  // 回滚后重新加载编辑器（上游 SceneManager 已按旧文档建好对象图，重挂最干净）
  window.location.reload()
}

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
        <el-tag v-if="dirty" size="small" type="warning" effect="plain">未保存</el-tag>
        <el-button
          size="small"
          data-testid="preview3d-btn"
          title="预览（先保存当前编辑态，再在新标签打开运行态）"
          :loading="previewing"
          @click="openPreview"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </el-button>
        <el-button size="small" type="primary" data-testid="save3d-btn" @click="onSave">保存</el-button>
        <el-button size="small" text data-testid="version-btn" @click="verDrawer = true">版本</el-button>
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
              { id: 'binding', label: '绑定' },
              { id: 'event', label: '事件' },
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
          <BindingPanel
            v-if="doc"
            v-show="activeTab === 'binding'"
            :doc="doc" :selected-bid="selectedBid" :selected-name="selectedName"
            :has-animation="hasAnimation"
            @update-doc="onDocUpdate"
          />
          <EventPanel
            v-if="doc"
            v-show="activeTab === 'event'"
            :doc="doc" :selected-bid="selectedBid" :selected-name="selectedName"
            @update-doc="onDocUpdate"
          />
        </div>
      </aside>
    </div>

    <el-drawer v-model="verDrawer" title="版本历史" size="360px">
      <VersionPanel :slug="sceneId" :client="store" @rollback-done="onRollbackDone" />
    </el-drawer>
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
