<script setup lang="ts">
// T6 运行页：GET 画面 → MtPreview setImportJson → collectBinds 订阅面 → SSE 桥。
// 数据路径：onPoint(field,value) → preview.setDevicePointByID(field,value)（F5：直写 bind_attr
// + 评估 triggers）。鉴权走同源 Cookie（rs-iot SSE 不认 ?token=，EventSource 无 header——sse.ts）。
// deadFields 简化：静态点集差（bind 集内有、流内未到的字段），不做超时判定——报告已注明。
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { MtPreview } from 'maotu'
import type { IExportJson } from 'maotu'
import { screensApi, unwrapDoc } from '../lib/screens'
import { collectBinds } from '../lib/binds'
import { createRtdataStream, type StreamState } from '../lib/sse'
import { tokenStore } from '../lib/api'
import { installBridge } from '../lib/bridge'

const route = useRoute()
const router = useRouter()
const slug = route.params.id as string
const sApi = screensApi()

const previewRef = ref<InstanceType<typeof MtPreview>>()
const meta = ref<{ name?: string; group?: string }>({})
const state = ref<StreamState>('offline')
const deadFields = ref<string[]>([])

let stream: ReturnType<typeof createRtdataStream> | undefined
const received = new Set<string>()
let bindFields: string[] = []
const bridge = installBridge({ mode: 'view', router })

onMounted(async () => {
  let done: IExportJson
  try {
    const { doc } = await sApi.get(slug)
    const unwrapped = unwrapDoc(doc)
    done = unwrapped.done
    meta.value = unwrapped.meta
    previewRef.value?.setImportJson(done)
  } catch {
    ElMessage.error('画面加载失败')
    return
  }
  const { fields, devs } = collectBinds(done)
  bindFields = fields
  if (devs.length === 0) return
  stream = createRtdataStream({
    devs,
    getToken: tokenStore.get,
    onPoint: (p) => {
      received.add(p.field)
      deadFields.value = bindFields.filter((f) => !received.has(f))
      previewRef.value?.setDevicePointByID(p.field, p.value)
    },
    onState: (s) => { state.value = s },
  })
})

onUnmounted(() => {
  stream?.close()
  bridge.uninstall()
})
</script>

<template>
  <main class="view-page">
    <header class="view-topbar">
      <span class="screen-name">{{ meta.name ?? slug }}</span>
      <span class="screen-slug">{{ slug }}</span>
      <span class="state" :class="state" :data-state="state">{{ state === 'online' ? '在线' : '离线' }}</span>
      <span v-if="deadFields.length" class="dead" :title="deadFields.join('、')">无数据 {{ deadFields.length }} 点</span>
    </header>
    <MtPreview ref="previewRef" :show-popover="false" class="view-body" />
  </main>
</template>

<style scoped>
.view-page { height: 100vh; display: flex; flex-direction: column; }
.view-topbar {
  display: flex; align-items: center; gap: 12px;
  height: 32px; padding: 0 16px; flex-shrink: 0;
  border-bottom: 1px solid var(--el-border-color-light);
}
.screen-name { font-weight: 600; }
.screen-slug { color: var(--el-text-color-secondary); font-size: 12px; font-family: monospace; }
.state { margin-left: auto; font-size: 12px; }
.state::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.state.online { color: var(--el-color-success); }
.state.online::before { background: var(--el-color-success); }
.state.offline { color: var(--el-text-color-secondary); }
.state.offline::before { background: var(--el-text-color-disabled); }
.dead { color: var(--el-color-warning); font-size: 12px; }
.view-body { flex: 1; min-height: 0; }
</style>
