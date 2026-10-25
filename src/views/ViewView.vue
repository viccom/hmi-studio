<script setup lang="ts">
// T6 运行页：GET 画面 → MtPreview setImportJson → collectBinds 订阅面 → SSE 桥。
// 数据路径：onPoint(field,value) → preview.setDevicePointByID(field,value)（F5：直写 bind_attr
// + 评估 triggers）。鉴权走同源 Cookie（rs-iot SSE 不认 ?token=，EventSource 无 header——sse.ts）。
// deadFields 简化：静态点集差（bind 集内有、流内未到的字段），不做超时判定——报告已注明。
// T8 告警：初始 GET /api/v1/alarms 快照 + /api/v1/events?types=alarm 命名事件流
// （与数据流是两个端点，subscribe 无 types 参数——第二条连接，routes_rtdata_subscribe.rs 实证）。
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useIntervalFn } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { MtPreview } from 'maotu'
import type { IExportJson } from 'maotu'
import { screensApi, unwrapDoc } from '../lib/screens'
import { collectBinds } from '../lib/binds'
import { createRtdataStream, type StreamState } from '../lib/sse'
import { api, tokenStore } from '../lib/api'
import { installBridge } from '../lib/bridge'
import { AlarmStore, createAlarmStream, type AlarmItem } from '../lib/alarms'
import AlarmBanner from '../components/AlarmBanner.vue'
import AlarmDrawer from '../components/AlarmDrawer.vue'

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

// ---- T8 告警骨架 ----
const alarmStore = new AlarmStore()
const activeAlarms = ref<AlarmItem[]>([])
const historyAlarms = ref<AlarmItem[]>([])
const currentAlarm = ref<AlarmItem | undefined>(undefined)
const drawerOpen = ref(false)
let alarmStream: ReturnType<typeof createAlarmStream> | undefined

const refreshAlarms = (): void => {
  activeAlarms.value = alarmStore.active()
  historyAlarms.value = alarmStore.history()
  currentAlarm.value = alarmStore.current()
}

/** 确认清除：DELETE /api/v1/alarms?key=（rs-iot 无 confirm 路由——实测，后端发 Clear 事件收敛） */
async function clearAlarm(key: string): Promise<void> {
  try {
    await api().del(`/api/v1/alarms?key=${encodeURIComponent(key)}`)
  } catch {
    ElMessage.error('告警清除失败')
    return
  }
  alarmStore.clear(key) // SSE Clear 再到时 store 幂等
  refreshAlarms()
}

// 横幅轮播 5s（空表/抽屉打开照常推进——纯下标变化，无副作用）
useIntervalFn(() => { alarmStore.next(); refreshAlarms() }, 5000)

onMounted(async () => {
  // 告警双源（与画面加载独立——画面失败告警仍可见）：REST 快照 + events SSE 命名事件
  void api().get('/api/v1/alarms')
    .then((items) => { alarmStore.applySnapshot((items as AlarmItem[]) ?? []); refreshAlarms() })
    .catch(() => { /* 告警源不可达不阻断画面——横幅保持隐藏 */ })
  alarmStream = createAlarmStream({
    getToken: tokenStore.get,
    onEvent: (e) => { alarmStore.applyEvent(e); refreshAlarms() },
  })

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
  alarmStream?.close()
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
    <AlarmBanner :alarm="currentAlarm" @open="drawerOpen = true" />
    <MtPreview ref="previewRef" :show-popover="false" class="view-body" />
    <AlarmDrawer v-model="drawerOpen" :active="activeAlarms" :history="historyAlarms" @clear="clearAlarm" />
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
