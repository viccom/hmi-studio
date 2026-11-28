<script setup lang="ts">
/**
 * 3D 场景运行页（v2，`scene3d/2` 文档）——P1。
 *
 * 与 v1（`Scene3DView.vue`）的分工：v1 渲染程序化语义节点（`nodes/links`），
 * v2 渲染上游 Meteor 的 `objects`（编辑器产出的节点图）。运行页按文档形态分派，
 * 两版并存不转换（方案 §4.1）。
 *
 * **5 条数据通路**（与 2D 运行页 `ViewView.vue` 同构，见方案 §5.5）：
 *   ① 实时值   createRtdataStream(boundDevsOf) → applyPointToBindings
 *   ② 告警     createAlarmStream → AlarmStore → aggregateAlarms → prioMap → applyAlarms
 *   ③ 合成点   __sys.quality 等 → 状态徽标（本页用顶栏 status 呈现）
 *   ④ 命令     installBridge({mode:'view'})；事件 command 动作下发
 *   ⑤ 上下文   setAgentPageScreenInfo（AI 页面上下文与 2D 对齐）
 *
 * 性能纪律（本仓踩过的坑）：不在 per-point 回调里强制 render——上游 SceneManager
 * 自带 rAF 循环；本页只在数据变化后标记脏，由循环驱动。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { SceneManager, PersistenceManager } from '../vendor/meteor3d/core/index.js'
import { sceneStore } from '../store'
import { docToUpstream } from '../adapter/store-adapter'
import { applyAlarms, applyPointToBindings, boundDevsOf, prioToColor } from '../adapter/bindings'
import { resolvePanelDevice, type PanelDevice } from '../adapter/device-panel'
import DevicePanel from '../components/DevicePanel.vue'
import { DEVICE_BY_ID } from '../../screen-assets/iot-catalog'
import { resolveEventAction } from '../adapter/events'
import type { SceneDoc } from '../scene3d'
import { createRtdataStream } from '../../lib/sse'
import { AlarmStore, createAlarmStream } from '../../lib/alarms'
import { aggregateAlarms, qualityOfStream } from '../../lib/synthetic'
import { installBridge } from '../../lib/bridge'
import { setAgentPageScreenInfo } from '../../lib/agent-context'
import { api } from '../../lib/api'

const route = useRoute()
const router = useRouter()
const sceneId = computed(() => String(route.params.id ?? ''))
const host = ref<HTMLElement>()
const status = ref('加载中…')
const quality = ref(0)
const objectCount = ref(0)
const hoverName = ref('')
/** 详情面板：点中的对象 bid（v1 契约——点设备出同页详情，不跳页） */
const selectedBid = ref('')
/**
 * 实时值缓存（field → 最新值）——面板要显示实时值，不能只把值涂到材质上。
 *
 * 必须是 **reactive(Map)**：普通 Map 的 get 不被 computed 追踪，SSE 推新值时
 * 面板不会重算 → 实时值冻结在打开瞬间的那一个（v1 页 `Scene3DView.vue:42`
 * 有同款注记，v2 曾重犯过一次，2026-11-28 修）。
 */
const values = reactive(new Map<string, number>())
/** 设备报警优先级（devId → prio）——面板按设备显示状态徽标 */
const prioByDev = ref(new Map<string, number>())
const loadError = ref('')

// 上游实例（类型放宽：vendor 是 JS）
type AnySM = {
  objects: unknown[]
  camera: unknown
  scene: unknown
  renderer: { domElement: HTMLCanvasElement }
  findObjectByBid(bid: string): unknown
  on(ev: string, cb: (d: unknown) => void): void
  off(ev: string, cb: (d: unknown) => void): void
  setView(o: Record<string, unknown>): void
  focusObject(bid: string, o?: Record<string, unknown>): void
  highlightManager?: Parameters<typeof applyAlarms>[0]['highlightManager']
  labelManager?: Parameters<typeof applyAlarms>[0]['labelManager']
  animationManager?: Parameters<typeof applyAlarms>[0]['animationManager']
  dispose(): void
  onWindowResize(w?: number, h?: number): void
}
let sm: AnySM | null = null
let stream: { close(): void } | null = null
let alarmStream: { close(): void } | null = null
const alarmStore = new AlarmStore()
let bridge: { uninstall(): void } | null = null
/** installBridge 把命令面挂到 window.$rsiot（见 lib/bridge.ts） */
type RsiotFace = { send: (devid: string, tag: string, value: unknown) => Promise<void> }
const rsiot = (): RsiotFace | undefined => (window as unknown as { $rsiot?: RsiotFace }).$rsiot
let ro: ResizeObserver | null = null
let doc: SceneDoc | null = null

const prio = ref(0)

/** ①+② 数据通路；③ 合成点用于顶栏状态 */
function connectData(): void {
  if (!doc || !sm) return
  const devs = boundDevsOf(doc)
  if (!devs.length) {
    status.value = '无绑定'
    return
  }
  stream = createRtdataStream({
    devs,
    interval: 1000,
    onPoint: (p) => {
      if (!doc || !sm) return
      const v = typeof p.value === 'number' ? p.value : Number(p.value)
      if (!Number.isFinite(v)) return
      values.set(p.field, v) // 面板的实时值（同时驱动材质）
      applyPointToBindings(sm, doc, p.field, v)
    },
    onState: (s) => { status.value = s === 'online' ? '实时' : s === 'offline' ? '离线' : '重连中…' },
  })

  // ② 告警：与 2D **同一条链**（REST 快照 + events SSE 命名事件 → AlarmStore → aggregateAlarms）
  // 照 ViewView.vue 的用法：快照即权威，事件增量；告警源不可达不阻断场景渲染。
  void api().get('/api/v1/alarms')
    .then((items) => { alarmStore.applySnapshot((items as never[]) ?? []); applyAlarmState() })
    .catch(() => { /* 告警源不可达：保持无告警态 */ })
  alarmStream = createAlarmStream({
    onEvent: (e) => { alarmStore.applyEvent(e); applyAlarmState() },
    onState: (s) => {
      quality.value = qualityOfStream(s)
      if (s === 'auth-failed') status.value = '凭证失效'
    },
  })
}

function applyAlarmState(): void {
  if (!sm || !doc) return
  const agg = aggregateAlarms(alarmStore.active())
  const prioBy = new Map<string, number>()
  for (const [devid, a] of agg.byDev) prioBy.set(devid, a.prio)
  prioByDev.value = prioBy
  applyAlarms(sm, doc, prioBy)
  prio.value = agg.prio
}

/**
 * 面板设备（纯逻辑反查：命中子件 → 设备身份/测点/2D 目标）。
 *
 * 注意 `selectedBid.value` **必须第一个读**：computed 只把它读到的响应式依赖记进
 * 依赖表，若前面的守卫（`!doc || !sm`）先短路返回，首次求值就没登记这个依赖——
 * 之后点击再改 `selectedBid` 也不会让本 computed 重算（2026-11-27 实测踩到：
 * 点设备没反应，探针显示 computed 从未重新求值）。
 */
const panelDevice = computed<PanelDevice | null>(() => {
  const bid = selectedBid.value
  if (!bid || !doc || !sm) return null
  const objects = (sm.objects as Array<{ userData?: { bid?: string }; name?: string }>).map((o) => ({
    bid: o.userData?.bid ?? '',
    name: o.name ?? '',
  }))
  return resolvePanelDevice(bid, objects, doc.bindings ?? [], doc.events ?? [])
})

/** 区域中文名（与 2D L1 区域卡一致） */
const AREA_TEXT: Record<string, string> = { water: '供水', gas: '燃气', power: '配电', env: '环境' }

/** 面板视图数据：设备元信息取自 iot-catalog（唯一事实源），实时值取自 SSE 缓存 */
const panelView = computed(() => {
  const d = panelDevice.value
  if (!d) return null
  const meta = DEVICE_BY_ID[d.devId]
  const raw = values.get(d.field)
  return {
    devId: d.devId,
    tag: meta?.pos ?? d.devId,
    title: meta?.title ?? d.devId,
    area: AREA_TEXT[meta?.area ?? 'env'],
    value: raw !== undefined && Number.isFinite(raw) ? raw : null,
    unit: d.unit,
    precision: d.precision,
    field: d.field,
    prio: prioByDev.value.get(d.devId) ?? 0,
  }
})

/** ④ 事件：点击对象 → 求值 → 执行 */
function onSceneClick(payload: unknown): void {
  if (!sm || !doc) return
  const hit = (payload as { object?: { userData?: { bid?: string }; name?: string } })?.object
  const bid = hit?.userData?.bid
  hoverName.value = hit?.name ?? ''
  if (!bid) return
  // **同页详情，不跳页**（v1 DEMO 的契约）：点设备 → 右上角出设备详情面板；
  // 「进入 2D 设备面板」是面板里的按钮动作，不是点击本身的动作。
  selectedBid.value = bid
  const action = resolveEventAction(doc.events, bid)
  // 无规则 = 只出详情，不动镜头（v1 行为：点设备看详情，不把相机怼到设备跟前——
  // focusObject 会把设备顶满屏，总览视角就没了）
  if (!action) return
  switch (action.type) {
    case 'navigate':
      // 不在此处跳转——目标交给面板按钮（场景规则仍作为面板的目标来源）
      break
    case 'focus':
      sm.focusObject(action.targetBid, { duration: 800 })
      break
    case 'setCamera':
      sm.setView({ position: action.view.position, target: action.view.target, duration: 800 })
      break
    case 'command': {
      const devId = (doc.bindings ?? []).find((b) => b.targetBid === action.targetBid)?.devId
      const face = rsiot()
      if (!devId || !face) { ElMessage.warning('该对象未绑定设备，无法下发命令'); break }
      void face.send(devId, action.cmd, action.params)
      break
    }
  }
}

/** 面板按钮：进入 2D 设备面板（目标来自场景的 navigate 规则，无则回退 2D 目录 faceplate） */
function enterFaceplate(): void {
  const d = panelDevice.value
  if (!d) return
  void router.push(`/view/${d.target.slug}?dev=${d.target.dev ?? d.devId}`)
}

function closePanel(): void {
  selectedBid.value = ''
}

/** Esc 关闭详情面板（v1 的面板有 × 按钮，这里补上键盘路径） */
function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') closePanel()
}

onMounted(async () => {
  // ⑤ AI 页面上下文（与 2D 同构）
  setAgentPageScreenInfo({ name: sceneId.value, group: '空间层' })

  try {
    const { doc: d } = await sceneStore().get(sceneId.value)
    doc = d
  } catch (e) {
    loadError.value = (e as Error).message
    status.value = '加载失败'
    return
  }
  objectCount.value = doc.objects?.length ?? 0
  if (!host.value) return

  // 上游渲染器：无 store（运行页不需要编辑态 store）
  const canvas = document.createElement('canvas')
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  host.value.appendChild(canvas)
  sm = new SceneManager(canvas) as unknown as AnySM

  // 运行页不传 editorStore / dbManager（上游两者均可选；渲染不依赖它们）
  const PM = PersistenceManager as unknown as new (sm: unknown, store?: unknown, db?: unknown) => unknown
  const pm = new PM(sm)
  const { objects, metadata } = docToUpstream(doc)
  const result = await (pm as unknown as {
    restoreScene(d: unknown, o?: unknown): Promise<{ complete?: boolean; successCount?: number; totalCount?: number }>
  }).restoreScene({ objects, metadata }, { syncEditorStore: false, notifyFailures: false })
  if (!result?.complete) status.value = `部分加载（${result?.successCount}/${result?.totalCount}）`

  // 初始视角（文档里存过就用，否则自动取景）
  const iv = (doc.scene as { initialView?: { position: unknown; target: unknown } } | undefined)?.initialView
  if (iv) sm.setView({ position: iv.position, target: iv.target, duration: 0 })
  else (sm as unknown as { fitCameraToScene?: () => void }).fitCameraToScene?.()

  sm.on('scene-click', onSceneClick)
  bridge = installBridge({ mode: 'view', router })

  ro = new ResizeObserver(() => {
    if (!host.value || !sm) return
    sm.onWindowResize(host.value.clientWidth, host.value.clientHeight)
  })
  ro.observe(host.value)

  // 调试出口：控制台/自动化可查运行时（对齐 v1 运行页的 window.__scene3d 惯例）
  ;(window as unknown as { __run3d?: unknown }).__run3d = { sm, doc }

  connectData()
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  stream?.close(); stream = null
  alarmStream?.close(); alarmStream = null
  bridge?.uninstall(); bridge = null
  ro?.disconnect(); ro = null
  setAgentPageScreenInfo(undefined)
  if (sm) {
    sm.off('scene-click', onSceneClick)
    sm.dispose()
    sm = null
    delete (window as unknown as { __run3d?: unknown }).__run3d
  }
})

/** 顶栏告警色（对齐 2D 的 prio 语义） */
const prioColor = computed(() => `#${prioToColor(prio.value).toString(16).padStart(6, '0')}`)
</script>

<template>
  <div class="run3d-page">
    <header class="run3d-bar">
      <el-button size="small" text @click="router.push('/screens3d')">← 3D 场景</el-button>
      <h1 class="run3d-title">{{ sceneId }}</h1>
      <span class="run3d-badges">
        <el-tag size="small" :type="status === '实时' ? 'success' : 'info'">{{ status }}</el-tag>
        <el-tag v-if="quality" size="small" type="warning">质量 {{ quality }}</el-tag>
        <el-tag size="small" type="info">{{ objectCount }} 对象</el-tag>
        <el-tag v-if="prio" size="small" :color="prioColor" effect="dark" style="border: none">P{{ prio }}</el-tag>
      </span>
    </header>

    <div ref="host" class="run3d-stage">
      <div v-if="loadError" class="run3d-error">场景加载失败：{{ loadError }}</div>
      <!-- 设备详情面板（点设备出同页详情，不跳页；跳 2D 由面板按钮触发） -->
      <DevicePanel
        v-if="panelView"
        :tag="panelView.tag"
        :title="panelView.title"
        :area="panelView.area"
        :value="panelView.value"
        :unit="panelView.unit"
        :precision="panelView.precision"
        :field="panelView.field"
        :dev-id="panelView.devId"
        :prio="panelView.prio"
        @close="closePanel"
        @enter="enterFaceplate"
      />
    </div>

    <footer class="run3d-hint">
      <b>左键拖动</b> 旋转 · <b>右键拖动</b> 平移 · <b>滚轮</b> 缩放 · <b>单击设备</b> 查看详情（不跳页）
      <span v-if="hoverName" class="run3d-hover">· {{ hoverName }}</span>
    </footer>
  </div>
</template>

<style scoped>
.run3d-page { width: 100vw; height: 100vh; display: flex; flex-direction: column; background: var(--el-bg-color); }
.run3d-bar {
  height: 48px; flex: 0 0 48px; display: flex; align-items: center; gap: 14px; padding: 0 16px;
  border-bottom: 1px solid var(--el-border-color-light);
}
.run3d-title { margin: 0; font-size: 15px; font-weight: 600; color: var(--el-text-color-primary); }
.run3d-badges { margin-left: auto; display: inline-flex; gap: 8px; align-items: center; }
.run3d-stage { flex: 1; min-height: 0; position: relative; }
.run3d-error {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: var(--el-color-danger); font-size: 14px;
}
.run3d-hint {
  flex: 0 0 30px; display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 12px; color: var(--el-text-color-secondary);
  border-top: 1px solid var(--el-border-color-lighter);
}
.run3d-hover { color: var(--el-color-primary); }
</style>
