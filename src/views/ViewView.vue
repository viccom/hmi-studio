<script setup lang="ts">
// T6 运行页：GET 画面 → MtPreview setImportJson → collectBinds 订阅面 → SSE 桥。
// 数据路径：onPoint(field,value) → preview.setDevicePointByID(field,value)（F5：直写 bind_attr
// + 评估 triggers）。鉴权走同源 Cookie（rs-iot SSE 不认 ?token=，EventSource 无 header——sse.ts）。
// deadFields 简化：静态点集差（bind 集内有、流内未到的字段），不做超时判定——报告已注明。
// T8 告警：初始 GET /api/v1/alarms 快照 + /api/v1/events?types=alarm 命名事件流
// （与数据流是两个端点，subscribe 无 types 参数——第二条连接，routes_rtdata_subscribe.rs 实证）。
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useIntervalFn } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { MtPreview } from 'maotu'
import type { IExportJson } from 'maotu'
import { screensApi, unwrapDoc, type ScreenMeta } from '../lib/screens'
import { collectBinds } from '../lib/binds'
import { createRtdataStream, type RtPoint, type StreamState } from '../lib/sse'
import { api, tokenStore } from '../lib/api'
import { logout, getAuthedUser } from '../lib/auth'
import { installBridge } from '../lib/bridge'
import { createDispatcher, createNavStack } from '../lib/nav'
import { AlarmStore, createAlarmStream, type AlarmItem } from '../lib/alarms'
import { createBiCollector } from '../lib/bi-collector'
import { BI_WINDOW_EVENT, collectBiWindowControls } from '../lib/bi-contract'
import { registerSymbols } from '../symbols'
import { computeFitScale } from '../lib/fit-scale'
import { applyDevContext, isDevParamScreen, META_DEV_FIELD } from '../lib/dev-context'
import AlarmBanner from '../components/AlarmBanner.vue'
import AlarmDrawer from '../components/AlarmDrawer.vue'
import ThemeToggle from '../components/ThemeToggle.vue'

const route = useRoute()
const router = useRouter()
const slug = route.params.id as string
const sApi = screensApi()

const previewRef = ref<InstanceType<typeof MtPreview>>()
const meta = ref<ScreenMeta>({})
const state = ref<StreamState>('offline')
const deadFields = ref<string[]>([])
/** 订阅面（去重点位）——状态栏展示用，故 reactive */
const bindFields = ref<string[]>([])
/** 当前画面 slug：容器内跳转只换 doc 不换组件实例（router-view 无 key），route.params 不再可信 */
const currentSlug = ref(slug)

let stream: ReturnType<typeof createRtdataStream> | undefined
const received = new Set<string>()
/** 卸载标记（P1 竞态）：初始加载/jump 的 GET 在飞期间卸载组件时，onUnmounted 的
 *  stream?.close() 落空（stream 尚为 undefined）——mountScreen 入口拦截，杜绝
 *  卸载后新建永不关闭的 SSE + 迟到的 ?dev 写回 URL 把用户拽回运行页。 */
let disposed = false

const userName = getAuthedUser()?.user_id ?? ''
const stateLabel = (): string =>
  state.value === 'online' ? '在线' : state.value === 'auth-failed' ? '凭证失效' : '离线'

function doLogout(): void {
  logout()
  void router.replace('/login')
}

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

// ---- T9 事件分发器 + 容器内跳转 ----
const navStack = createNavStack()

// ---- W10 自适应缩放（宿主层，零 maotu 改动）：设计分辨率画布 contain 缩放居中于可视区。
// 设计尺寸来自每次加载画面的 canvasCfg（默认 800x600）；缩放施加在本页 wrapper 的 transform，
// MtPreview 内部 canvasCfg.scale 保持原值（多为 1）——画面跳转（jump）换 doc 后自动跟随。
const viewportRef = ref<HTMLElement>()
const design = ref({ w: 800, h: 600 })
const fit = ref(1)
const stageStyle = computed(() => ({
  width: `${design.value.w}px`,
  height: `${design.value.h}px`,
  transform: `translate(-50%, -50%) scale(${fit.value})`,
}))
function applyFit(): void {
  const el = viewportRef.value
  fit.value = computeFitScale(design.value.w, design.value.h, el?.clientWidth ?? 0, el?.clientHeight ?? 0)
}
let resizeObs: ResizeObserver | undefined

/** 每次画面装载后调用：记录设计分辨率并重算缩放（装载改 layout，等一帧再量） */
async function adoptDesign(done: IExportJson): Promise<void> {
  design.value = { w: done.canvasCfg?.width ?? 800, h: done.canvasCfg?.height ?? 600 }
  await nextTick(applyFit)
}

const onPoint = (p: RtPoint): void => {
  received.add(p.field)
  deadFields.value = bindFields.value.filter((f) => !received.has(f))
  previewRef.value?.setDevicePointByID(p.field, p.value)
}

// ---- W11 设备参数化（传统 HMI 画面模板 + 标签前缀模式）----
// 模板画面 bind_id 前缀 `@dev.` 由本页在加载/切换时重写为 `<devid>.<tag>`（dev-context.ts），
// maotu 与 SSE 协议无感知。`@meta.dev` = 当前设备显示通道（挂载/切换后直推，标题/选择器
// 绑它即回显）。切换 = 重映射 + setImportJson 重挂（趋势缓冲随重挂重置，换源不混线）。
// 默认激活（W11.1 用户反馈修正）：首次进入即激活清单首台（meta.devs → 首个选择器 JSON），
// 不存在"待选态"——界面上显示了选择就该有数据；?dev= 深链可覆盖默认。
const templateDone = ref<IExportJson>()
const activeDev = ref('')

/** 设备清单：meta.devs 权威；缺省回退画布首个 ah-dev-selector 的 devices JSON（手工授权路径） */
function faceplateDevs(done: IExportJson): Array<{ id: string; label?: string }> {
  const fromMeta = meta.value.devs
  if (fromMeta?.length) return fromMeta
  for (const item of Array.isArray(done.json) ? done.json : []) {
    const it = item as { tag?: unknown; props?: { devices?: unknown } }
    if (it?.tag !== 'ah-dev-selector') continue
    try {
      const arr = JSON.parse(String(it.props?.devices ?? '[]')) as Array<{ id: string }>
      if (Array.isArray(arr) && arr.length) return arr
    } catch { /* 清单 JSON 坏 → 视为无清单 */ }
  }
  return []
}

/** 画面装载（挂载/跳转/切设备共用管线）。
 *  devOverride：显式设备上下文——jump 传 ''（新画面不继承旧画面 ?dev=，P2 竞态：
 *  replace 是异步导航，紧跟其后的同步代码读 route.query 拿到的是旧画面 query，
 *  旧设备 id 重写到新画面会产生整屏 deadFields）；缺省（深链路径）读 route.query.dev。 */
async function mountScreen(done: IExportJson, devOverride?: string): Promise<void> {
  if (disposed) return
  templateDone.value = done
  const param = isDevParamScreen(done)
  const qdev = devOverride ?? (typeof route.query.dev === 'string' ? route.query.dev : '')
  activeDev.value = param ? (qdev || faceplateDevs(done)[0]?.id || '') : ''
  const inst = param && activeDev.value ? applyDevContext(done, activeDev.value) : done
  previewRef.value?.setImportJson(inst)
  if (param && activeDev.value) {
    // 深链缺省时把默认设备写回 URL（刷新/分享保持同一上下文）
    if (!qdev) void router.replace({ path: `/view/${currentSlug.value}`, query: { ...route.query, dev: activeDev.value } })
    previewRef.value?.setDevicePointByID(META_DEV_FIELD, activeDev.value)
  }
  await adoptDesign(done)
  resubscribe(inst)
  // BI 聚合采集（通道 B）：画面含 ah-bi- 图元时才启动——普通 HMI 画面零开销。
  // 必须在 setImportJson 之后（写回按画布元素 id 定位，元素需已装载）。
  startBiCollect(inst)
}

/**
 * BI 聚合采集（通道 B，P2）：宿主扫描画面里的 ah-bi- 图元 → 合并查询 →
 * /history/batch → 结果按面板组装信封 → 写回图元 props.data.val。
 * 画面含 ah-bi-alarms 面板时同拍拉活动告警快照写告警信封（fetchAlarms 注入）。
 *
 * 拉模式刷新（30s）：历史分析对实时性不敏感；SSE 通道（A）继续承担实时刷新。
 * 图元不自发请求（架构裁定），故本方法是 BI 数据的唯一出口。
 */
const BI_REFRESH_MS = 30_000
let biTimer: ReturnType<typeof setInterval> | undefined
let biRunning = false
/** 在飞期间收到触发（如窗口切换）→ 记账，本轮结束后立即补跑（不等下一拍） */
let biPending = false
/** 当前采集轮（窗口切换器切换后立即触发一轮，不等下一拍） */
let biTick: () => Promise<void> = async () => {}
/** 当前采集的画面 doc（窗口切换器回显写回的扫描源） */
let biDone: unknown
/** 窗口切换器（ah-bi-window）的生效覆盖窗（秒）；null = 各面板用自己配置的窗 */
const biWindowOverride = ref<number | null>(null)

function stopBiCollect(): void {
  if (biTimer !== undefined) { clearInterval(biTimer); biTimer = undefined }
}

/** 窗口切换器回显：把当前生效档写回画面里全部 ah-bi-window 的 props.data.val。 */
function syncBiWindowControls(): void {
  const payload = JSON.stringify({ activeSecs: biWindowOverride.value ?? 0 })
  for (const c of collectBiWindowControls(biDone)) {
    previewRef.value?.setItemAttrByID(c.id, 'props.data.val', payload)
  }
}

/** 窗口切换器上行事件（图元 → 宿主）：改覆盖窗 → 回显 → 立即重采一轮。 */
function onBiWindowChange(e: Event): void {
  const n = Number((e as CustomEvent<{ secs?: unknown }>).detail?.secs)
  biWindowOverride.value = Number.isFinite(n) && n > 0 ? Math.floor(n) : null
  syncBiWindowControls()
  void biTick()
}

/** 启动采集：无 BI 图元则 collect 内部判空返回，普通 HMI 画面零开销。 */
function startBiCollect(done: IExportJson): void {
  stopBiCollect()
  biDone = done
  const collector = createBiCollector({
    fetchBatch: async (body) => {
      const res = await api().post('/api/v1/history/batch', body)
      return (res ?? {}) as { results?: never[] }
    },
    // 告警快照（ah-bi-alarms 面板在画面才被调用）：与 AlarmBanner 同一 REST 源
    fetchAlarms: async () => await api().get('/api/v1/alarms'),
    // 写回 maotu 画布元素：props.data.val 是 props 直写路径（jT 平面化喂给图元）
    write: (itemId, payload, attr) => { previewRef.value?.setItemAttrByID(itemId, attr, payload) },
    now: () => Math.floor(Date.now() / 1000),
  }, { windowOverride: () => biWindowOverride.value })
  const tick = async (): Promise<void> => {
    if (biRunning) { biPending = true; return } // 上一轮未完不叠加——记账，结束后补跑
    biRunning = true
    try {
      await collector.collect(done)
    } catch {
      /* 采集失败不打断画面——图元保留上一轮信封 */
    } finally {
      biRunning = false
    }
    if (biPending) { biPending = false; void tick() }
  }
  biTick = tick
  void tick()
  syncBiWindowControls() // 跳转后新画面的切换器立即回显当前生效档
  biTimer = setInterval(() => { void tick() }, BI_REFRESH_MS)
}

function setDev(dev: string): void {
  if (!templateDone.value || !dev || dev === activeDev.value) return
  activeDev.value = dev
  void router.replace({ path: `/view/${currentSlug.value}`, query: { ...route.query, dev } })
  const inst = applyDevContext(templateDone.value, dev)
  previewRef.value?.setImportJson(inst)
  previewRef.value?.setDevicePointByID(META_DEV_FIELD, dev)
  resubscribe(inst)
}

/** SSE 按新画面 bind 集重订（挂载/跳转共用）：关旧流（或改订）+ 清收数；无绑定 → 关流离线 */
const resubscribe = (done: IExportJson): void => {
  const { fields, devs } = collectBinds(done)
  bindFields.value = fields
  received.clear()
  deadFields.value = []
  if (devs.length === 0) {
    stream?.close()
    stream = undefined
    state.value = 'offline'
    return
  }
  if (stream) stream.resubscribe(devs)
  else stream = createRtdataStream({
    devs,
    getToken: tokenStore.get,
    onPoint,
    onState: onStreamState,
  })
}

/** 状态桥 + 凭证失效登出链（T16 relogin 选型）：SSE 探测 401 → 走全局同款登出（不存凭据自动重登录） */
function onStreamState(s: StreamState): void {
  state.value = s
  if (s === 'auth-failed') doLogout()
}

/** 容器内跳转：GET 目标 doc → mountScreen（W11 参数化重映射同管线）→ URL 同步（replace，
 *  path 形式丢弃旧 query.dev）→ SSE 重订；404 报错停留当前画面。
 *  在飞互斥（P2 竞态）：连点不同目标时响应乱序会"后返回者被先返回者覆盖"（画面/URL/历史栈
 *  三者错乱）——序号守卫丢弃过期响应；mount 失败回退 currentSlug，避免同目标重跳被拦成死锁。 */
let jumpSeq = 0
const jump = async (target: string): Promise<boolean> => {
  if (target === currentSlug.value) return false
  const seq = ++jumpSeq
  const prev = currentSlug.value
  try {
    const { doc } = await sApi.get(target)
    if (disposed || seq !== jumpSeq) return false
    const { done, meta: m } = unwrapDoc(doc)
    meta.value = m
    currentSlug.value = target
    void router.replace(`/view/${target}`)
    await mountScreen(done, '')
    return true
  } catch {
    if (currentSlug.value === target) currentSlug.value = prev
    ElMessage.error(`画面 ${target} 加载失败`)
    return false
  }
}

const dispatcher = createDispatcher({
  onNav(target) {
    // 组头哨兵（W9b：目标下拉树形视觉的组头条目被误选）——提示后忽略，不发起请求
    if (target.startsWith('__group__:')) {
      ElMessage.warning('请选择组内的具体画面')
      return
    }
    void jump(target).then((ok) => {
      if (!ok) return
      navStack.nav(target)
      // E2E 钩子（G-M2 跳转段）：__navCount 递增证明容器内跳转无整页刷新（刷新会清零 window）
      const w = window as Window & { __navCount?: number }
      w.__navCount = (w.__navCount ?? 0) + 1
    })
  },
  onDev(devid) {
    // W11：设备参数化画面切设备（canvas 按钮/选择器 → 词表 dev）；非参数屏忽略
    if (templateDone.value && isDevParamScreen(templateDone.value)) setDev(devid)
  },
  onBack() {
    const dest = navStack.back()
    if (dest === '/') void router.push('/')
    else void jump(dest)
  },
  onHome() { void router.push('/') },
  onAlarm() { drawerOpen.value = true },
})

/** $mtEventCallBack(type, id, ...rest) → emit onEventCallBack(type, id, ...rest) → 词表分发。
 *  监听必须写 @onEventCallBack（kebab 写法大小写失配收不到事件——见 nav.ts 文件头实证） */
const onMtEvent = (type: unknown, id: unknown, ...rest: unknown[]): void => {
  dispatcher.dispatch([type, id, ...rest])
}

const bridge = installBridge({
  mode: 'view',
  router,
  // $rsiot.nav/back/home 与 $mtEventCallBack('nav') 同源同栈（设计 §5 等价别名）
  navHandler: {
    nav: (target) => dispatcher.dispatch(['nav', '', target]),
    back: () => dispatcher.dispatch(['back', '']),
    home: () => dispatcher.dispatch(['home']),
  },
})

// ---- T16 状态栏：命令历史（bridge 环形 20 条）----
const cmdHistory = bridge.history
const fmtTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
const stateTagType = (s: string): 'success' | 'danger' | 'warning' | 'info' =>
  s === 'confirmed' ? 'success' : s === 'error' ? 'danger' : s === 'timeout' ? 'warning' : 'info'

onMounted(async () => {
  resizeObs = new ResizeObserver(applyFit)
  if (viewportRef.value) resizeObs.observe(viewportRef.value)
  // 窗口切换器上行事件（ah-bi-window 图元 → 本页）：全局 DOM 事件，卸载时摘除
  window.addEventListener(BI_WINDOW_EVENT, onBiWindowChange)
  // 自绘图元注册（幂等）：MtPreview 渲染 svg 图元同样查注册表——不注册则自绘图元静默空白
  registerSymbols()
  // 告警双源（与画面加载独立——画面失败告警仍可见）：REST 快照 + events SSE 命名事件
  void api().get('/api/v1/alarms')
    .then((items) => { alarmStore.applySnapshot((items as AlarmItem[]) ?? []); refreshAlarms() })
    .catch(() => { /* 告警源不可达不阻断画面——横幅保持隐藏 */ })
  alarmStream = createAlarmStream({
    getToken: tokenStore.get,
    onEvent: (e) => { alarmStore.applyEvent(e); refreshAlarms() },
    // 凭证失效链与数据流同款（T16 relogin 选型）：画面无绑定点位时告警流是唯一失效信号源
    onState: (st) => { if (st === 'auth-failed') doLogout() },
  })

  let done: IExportJson
  try {
    const { doc } = await sApi.get(slug)
    const unwrapped = unwrapDoc(doc)
    done = unwrapped.done
    meta.value = unwrapped.meta
  } catch {
    ElMessage.error('画面加载失败')
    return
  }
  await mountScreen(done)
  navStack.nav(slug) // 历史栈起点（back 弹空 → '/' 画面列表）
})

onUnmounted(() => {
  disposed = true
  resizeObs?.disconnect()
  window.removeEventListener(BI_WINDOW_EVENT, onBiWindowChange)
  stream?.close()
  alarmStream?.close()
  stopBiCollect()
  bridge.uninstall()
})
</script>

<template>
  <main class="view-page">
    <AlarmBanner :alarm="currentAlarm" @open="drawerOpen = true" />
    <div ref="viewportRef" class="fit-viewport">
      <div class="fit-stage" :style="stageStyle" :data-fit="fit.toFixed(4)">
        <MtPreview ref="previewRef" :show-popover="false" class="view-body" @onEventCallBack="onMtEvent" />
      </div>
    </div>
    <AlarmDrawer v-model="drawerOpen" :active="activeAlarms" :history="historyAlarms" @clear="clearAlarm" />

    <!-- T16 底部状态栏：左 画面名/在线灯/订阅点数/deadFields；右 命令历史/用户/登出。
         offline 时整条警示色（断线 UX）。 -->
    <footer class="view-statusbar" :class="{ offline: state !== 'online' }" data-testid="status-bar">
      <span class="sb-name">{{ meta.name ?? currentSlug }}</span>
      <span class="sb-slug">{{ currentSlug }}</span>
      <span v-if="activeDev" class="sb-dev" data-testid="active-dev">设备 {{ activeDev }}</span>
      <span class="state" :class="state" :data-state="state">{{ stateLabel() }}</span>
      <span class="sb-points" title="订阅点位数（去重 field）">订阅 {{ bindFields.length }} 点</span>
      <el-popover v-if="deadFields.length" trigger="click" :width="280">
        <template #reference>
          <button class="sb-btn sb-dead" data-testid="dead-trigger">无数据 {{ deadFields.length }} 点</button>
        </template>
        <ul class="dead-list">
          <li v-for="f in deadFields" :key="f">{{ f }}</li>
        </ul>
      </el-popover>
      <span class="sb-flex" />
      <el-popover trigger="click" :width="420">
        <template #reference>
          <button class="sb-btn" data-testid="history-trigger">
            命令历史<span v-if="cmdHistory.length" class="sb-badge">{{ cmdHistory.length }}</span>
          </button>
        </template>
        <el-table v-if="cmdHistory.length" :data="cmdHistory" size="small" max-height="260">
          <el-table-column label="时间" width="88">
            <template #default="{ row }">{{ fmtTime(row.ts) }}</template>
          </el-table-column>
          <el-table-column label="点位">
            <template #default="{ row }">{{ row.devid }}.{{ row.tag }}</template>
          </el-table-column>
          <el-table-column label="值" width="70">
            <template #default="{ row }">{{ JSON.stringify(row.value) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="92">
            <template #default="{ row }">
              <el-tag :type="stateTagType(row.state)" size="small">{{ row.state }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="暂无命令" :image-size="40" />
      </el-popover>
      <ThemeToggle />
      <span v-if="userName" class="sb-user">{{ userName }}</span>
      <el-button class="sb-logout" link size="small" @click="doLogout">登出</el-button>
    </footer>
  </main>
</template>

<style scoped>
.view-page { height: 100vh; display: flex; flex-direction: column; }
/* W10 自适应：视口裁剪 + 设计分辨率舞台居中缩放（contain），letterbox 随主题底色 */
.fit-viewport { flex: 1; min-height: 0; position: relative; overflow: hidden; background: var(--el-bg-color-page); }
.fit-stage { position: absolute; left: 50%; top: 50%; transform-origin: center; }
.view-body { width: 100%; height: 100%; }
.view-statusbar {
  display: flex; align-items: center; gap: 12px;
  height: 32px; padding: 0 16px; flex-shrink: 0;
  border-top: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-lighter);
  font-size: 12px;
}
/* 断线 UX：offline 整条警示色 */
.view-statusbar.offline {
  background: color-mix(in srgb, var(--el-color-warning) 18%, var(--el-bg-color));
  border-top-color: color-mix(in srgb, var(--el-color-warning) 45%, transparent);
}
.sb-name { font-weight: 600; }
.sb-slug { color: var(--el-text-color-secondary); font-family: monospace; }
.sb-dev { color: var(--el-color-primary); font-family: monospace; }
.state { display: inline-flex; align-items: center; }
.state::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.state.online { color: var(--el-color-success); }
.state.online::before { background: var(--el-color-success); }
.state.offline { color: var(--el-color-warning); }
.state.offline::before { background: var(--el-color-warning); }
.state.auth-failed { color: var(--el-color-danger); }
.state.auth-failed::before { background: var(--el-color-danger); }
.sb-points { color: var(--el-text-color-secondary); }
.sb-flex { flex: 1; }
.sb-btn {
  display: inline-flex; align-items: center; gap: 4px;
  border: none; padding: 2px 6px; border-radius: 4px; font-size: 12px;
  background: transparent; color: var(--el-text-color-regular); cursor: pointer;
}
.sb-btn:hover { background: var(--el-fill-color-light); }
.sb-dead { color: var(--el-color-warning); }
.sb-badge {
  min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px;
  background: var(--el-color-primary); color: #fff;
  font-size: 11px; line-height: 16px; text-align: center;
}
.sb-user { color: var(--el-text-color-secondary); }
.dead-list { margin: 0; padding: 0 0 0 4px; list-style: none; font-family: monospace; }
.dead-list li { padding: 2px 0; }
</style>
