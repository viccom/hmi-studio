<script setup lang="ts">
// T4 编辑页：MtEdit 挂载 + 在线设备树（F5）+ 画面存取 round-trip（G-M1 主战场）。
// 装配契约（d.ts 实证）：MtEdit expose setImportJson(done)；onSaveClick payload=IExportJson；
// onReturnClick 无参。doc 真相在 rs-iot（wrapDoc/unwrapDoc 同体契约，见 lib/screens.ts）。
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { MtEdit } from 'maotu'
import type { IExportJson } from 'maotu'
import { screensApi, unwrapDoc, wrapDoc } from '../lib/screens'
import { fetchDeviceTree, type IDeviceInfo } from '../lib/device-tree'
import { installBridge } from '../lib/bridge'
import { registerSymbols } from '../symbols'
import ThemeToggle from '../components/ThemeToggle.vue'

const route = useRoute()
const router = useRouter()
const sApi = screensApi()
const slug = route.params.id as string

const editRef = ref<InstanceType<typeof MtEdit>>()
const deviceInfo = ref<IDeviceInfo[]>([])
const meta = ref<{ name?: string; group?: string }>({})

// D6 编辑态守卫：编辑页同注入 $rsiot，send 确认框按钮为「取消/真实下发」
const bridge = installBridge({ mode: 'edit', router })
onUnmounted(() => bridge.uninstall())

onMounted(async () => {
  registerSymbols()
  try {
    const { doc } = await sApi.get(slug)
    const { done, meta: m } = unwrapDoc(doc)
    meta.value = m
    editRef.value?.setImportJson(done)
  } catch {
    ElMessage.error('画面加载失败')
  }
  // 在线设备树（失败静默为空——编辑器离线仍可组态，绑定列表面板为空）
  deviceInfo.value = await fetchDeviceTree()
})

async function save(payload: IExportJson) {
  try {
    await sApi.put(slug, wrapDoc(payload, { name: meta.value.name ?? slug, group: meta.value.group }))
    ElMessage.success('已保存')
  } catch {
    ElMessage.error('保存失败')
  }
}
</script>

<template>
  <div class="edit-page">
    <header class="edit-topbar">
      <span class="screen-name">{{ meta.name ?? slug }}</span>
      <span class="screen-slug">{{ slug }}</span>
      <el-tag v-if="meta.group" size="small" type="info">{{ meta.group }}</el-tag>
      <span class="topbar-right">
        <ThemeToggle />
      </span>
    </header>
    <!-- use-theme-toggle=false：隐藏 maotu 自带夜间按钮（其 useDark 只切 #mt-edit、
         与全局 html.dark 双源分叉）——编辑器配色经 .dark 祖先选择器随全局主题 -->
    <MtEdit
      ref="editRef"
      class="edit-body"
      :device-info="deviceInfo"
      :use-theme-toggle="false"
      @on-save-click="(payload: IExportJson) => save(payload)"
      @on-return-click="router.replace('/')"
    />
  </div>
</template>

<style scoped>
.edit-page { height: 100vh; display: flex; flex-direction: column; }
.edit-topbar {
  display: flex; align-items: center; gap: 12px;
  height: 32px; padding: 0 16px; flex-shrink: 0;
  border-bottom: 1px solid var(--el-border-color-light);
}
.screen-name { font-weight: 600; }
.screen-slug { color: var(--el-text-color-secondary); font-size: 12px; font-family: monospace; }
.topbar-right { margin-left: auto; display: inline-flex; align-items: center; }
.edit-body { flex: 1; min-height: 0; }
</style>
