<script setup lang="ts">
/**
 * 3D 空间层运行页（按 threejs-demo 的 Viewer + emitter 架构重写）。
 *
 * - 引擎：modules3d/Viewer（renderer/scene/light/controls/rAF/raycaster/mitt/destroy）
 * - 场景：modules3d/scene（文档 → three 对象图 + setRaycasterObjects）
 * - 交互：viewer.emitter.on('click:raycaster'/'mousemove:raycaster', cb)（不再混 pointerup）
 * - 数据：createRtdataStream（SSE，与 2D 同源）→ 设备几何状态 + 标签值
 * - 导航：mitt click → openDevice → router.push('/view/...?dev=')
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as THREE from 'three'
import type { Intersection } from 'three'
import Viewer from '../modules3d/Viewer'
import Events from '../modules3d/Viewer/Events'
import { buildScene, animateRuntime, type SceneRuntime } from '../modules3d/scene'
import { C, PRIO_COLOR } from '../modules3d/geometry'
import { api } from '../lib/api'
import { createRtdataStream, type RtPoint } from '../lib/sse'
import { buildDemoScene, devsOf, isScene3D, type SceneDoc, type SceneNode } from '../lib/scene3d'
import { DEVICE_BY_ID, faceplateSlug } from '../screen-assets/iot-catalog'

const route = useRoute()
const router = useRouter()
const host = ref<HTMLElement>()
const status = ref('加载中…')
const alarmCount = ref(0)
const fps = ref(0)
const selected = ref('')
const labels = ref<Array<{ id: string; text: string; value: string; x: number; y: number; prio: number }>>([])

let viewer: Viewer | null = null
let rt: SceneRuntime | null = null
let stream: { close(): void } | null = null
let raf = 0, frames = 0, fpsT = 0
// 响应式 Map：普通 Map 不被 computed 追踪 → 面板里的实时值会冻结在首次求值的结果
// （values.set 改了 Map，computed 不知道要重算）。reactive(Map) 的 get/set 都被追踪。
const values = reactive(new Map<string, number>())
const prios = reactive(new Map<string, number>())

let doc: SceneDoc = buildDemoScene()
const slug = computed(() => String(route.params.id ?? 'iot-plant-3d'))
const still = computed(() => String(route.query.still ?? '') === '1')

const deviceNav = computed(() => doc.nodes.filter((n) => n.devId).map((n) => ({ id: n.id, label: n.label ?? n.id })))
function onPickDevice(id: string): void { if (id) openDevice(id) }

/** 标签数据：短位号 + 一个关键实时值（屏幕空间投影，pointer-events:none 不挡拾取） */
function updateLabels(): void {
  if (!viewer) return
  const w = viewer.renderer.domElement.clientWidth
  const h = viewer.renderer.domElement.clientHeight
  const out: Array<{ id: string; text: string; value: string; x: number; y: number; prio: number }> = []
  for (const n of doc.nodes) {
    if (!n.devId) continue
    const g = rt?.devices.get(n.id)
    if (!g) continue
    const v = new THREE.Vector3(n.pos[0], 2.9, n.pos[2]).project(viewer.camera)
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue
    const key = n.points?.value ?? ''
    const raw = values.get(key)
    const unit = n.kind === 'emeter' ? 'kW' : n.kind === 'env' ? '°C' : n.kind === 'pt' ? 'MPa' : 'm³/h'
    out.push({
      id: n.id,
      text: (n.label ?? n.id).split(' ')[0],
      value: raw === undefined || !Number.isFinite(raw) ? '—' : `${raw.toFixed(1)}${unit}`,
      x: Math.round((v.x + 1) / 2 * w), y: Math.round((1 - v.y) / 2 * h),
      prio: prios.get(n.id) ?? 0,
    })
  }
  out.sort((a, b) => a.y - b.y)
  const placed: Array<{ x: number; y: number }> = []
  for (const l of out) {
    let y = l.y
    for (const p of placed) if (Math.abs(l.x - p.x) < 82 && Math.abs(y - p.y) < 26) y = p.y + 27
    l.y = y; placed.push({ x: l.x, y })
  }
  const old = labels.value
  const changed = old.length !== out.length || out.some((o, i) =>
    o.id !== old[i].id || o.x !== old[i].x || o.y !== old[i].y || o.prio !== old[i].prio || o.value !== old[i].value)
  if (changed) labels.value = out
}

/** SSE → 设备几何状态（液位/指针/报警光环） */
function applyPoint(p: RtPoint): void {
  const n = typeof p.value === 'number' ? p.value : (p.value == null ? NaN : Number(p.value))
  if (Number.isFinite(n)) values.set(p.field, n)
  const m = /^(dev_[a-z0-9]+)\.__prio$/.exec(p.field)
  if (m) {
    const v = Math.max(0, Math.min(4, Number(p.value) || 0))
    prios.set(m[1], v)
    const g = rt?.devices.get(m[1])
    if (g) {
      const halo = g.userData.halo as THREE.Mesh | undefined
      if (halo) { halo.visible = v > 0; (halo.material as THREE.MeshStandardMaterial).color.setHex(PRIO_COLOR[v] ?? C.body) }
    }
  }
  for (const [id, d] of (rt?.devices ?? new Map())) {
    const f = doc.nodes.find((x) => x.id === id)?.points?.value
    if (!f || !values.has(f)) continue
    const v = values.get(f)!
    const level = d.userData.level as THREE.Mesh | undefined
    if (level) { const hh = Math.max(0.1, Math.min(1.8, v / 100 * 1.8)); level.scale.y = hh; level.position.y = 0.6 + hh / 2 }
    rt?.spinners.forEach((s) => { if (d.getObjectById(s.mesh.id) && s.speed < 0.3) s.speed = 0.08 + Math.min(v, 50) / 200 })
  }
  viewer?.render()
  if (still.value) updateLabels()
}

function connect(): void {
  const devs = devsOf(doc)
  if (!devs.length) return
  stream = createRtdataStream({
    devs, interval: 1000, onPoint: applyPoint,
    onState: (s) => { status.value = s === 'online' ? '实时' : s === 'offline' ? '离线' : '重连中…' },
  })
}

/**
 * 选中设备（mitt click 与顶部下拉共用）。与 threejs-demo 一致：点击只选中 +
 * 同页详情，**不跳页**。需要精确读数/操作时由用户显式点详情面板的「进入 2D 面板」。
 */
function openDevice(devid: string): void {
  selected.value = devid
  for (const [id, g] of (rt?.devices ?? new Map())) {
    const s = g.userData.sel as THREE.Mesh | undefined
    if (s) s.visible = id === devid
  }
}

function clearSelection(): void {
  selected.value = ''
  for (const g of (rt?.devices ?? new Map()).values()) {
    const s = g.userData.sel as THREE.Mesh | undefined
    if (s) s.visible = false
  }
}

/** 显式进入选中设备的 2D 面板（不在点击时自动触发） */
function enterFaceplate(): void {
  if (!selected.value) return
  void router.push(`/view/${faceplateSlug(selected.value)}?dev=${selected.value}`)
}

/** 详情面板数据：设备元数据取自 iot-catalog（唯一事实源），实时值取自响应式 values */
const detail = computed(() => {
  const id = selected.value
  if (!id) return null
  const n: SceneNode | undefined = doc.nodes.find((x) => x.id === id)
  if (!n) return null
  const meta = DEVICE_BY_ID[id]
  const field = n.points?.value
  const raw = field ? values.get(field) : undefined
  const unit = n.kind === 'emeter' ? 'kW' : n.kind === 'env' ? '°C' : n.kind === 'pt' ? 'MPa' : 'm³/h'
  const prio = prios.get(id) ?? 0
  const has = raw !== undefined && Number.isFinite(raw)
  return {
    id,
    tag: meta?.pos ?? id,                 // 位号 WM-101
    title: meta?.title ?? (n.label ?? id), // 1# 远传水表
    area: AREA_TEXT[meta?.area ?? 'env'],
    valueText: has ? raw!.toFixed(2) : '',
    hasValue: has,
    unit,
    prio,
    prioText: ['正常', 'P1 严重', 'P2 高', 'P3 中等', 'P4 提示'][prio] ?? '正常',
    field: field ?? '—', // taste-skill-ignore: 缺失值用 em dash 占位（app-screen §11）
  }
})

/** 区域中文名（与 2D L1 区域卡一致） */
const AREA_TEXT: Record<string, string> = { water: '供水', gas: '燃气', power: '配电', env: '环境' }

/** 从拾取结果找设备 id（向上遍历 parent，与 threejs-demo 的 findParent 同语义） */
function devidOf(hits: Intersection[]): string | undefined {
  if (!hits.length) return undefined
  let o: THREE.Object3D | null = hits[0].object
  while (o && !o.userData.devid) o = o.parent
  return o?.userData.devid as string | undefined
}

function fpsLoop(): void {
  raf = requestAnimationFrame(fpsLoop)
  frames++
  if (performance.now() - fpsT > 1000) {
    fps.value = Math.round(frames * 1000 / (performance.now() - fpsT))
    frames = 0; fpsT = performance.now()
  }
}

onMounted(async () => {
  try {
    const r = await api().get(`/api/v1/screens/${slug.value}`) as { doc?: unknown } | undefined
    const c = r?.doc ?? r
    if (c && isScene3D(c)) doc = c as SceneDoc
  } catch { /* 回退内置 demo */ }
  alarmCount.value = doc.nodes.filter((n) => n.devId).length
  if (!host.value) return

  // 1) 引擎（threejs-demo 的 Viewer 模式）
  viewer = new Viewer(host.value)
  // 2) 场景装配 + 拾取对象登记（setRaycasterObjects）
  rt = buildScene(viewer, doc)
  viewer.addAnimate({ fun: animateRuntime(rt) as (...a: never[]) => void, content: viewer })

  // 3) mitt 事件总线：拾取与业务解耦（threejs-demo 同款）
  viewer.initRaycaster()
  viewer.emitter.on(Events.click.raycaster, (hits: Intersection[]) => {
    const devid = devidOf(hits)
    if (devid) openDevice(devid)
  })
  viewer.emitter.on(Events.mousemove.raycaster, (hits: Intersection[]) => {
    // 悬停高亮：选中圈跟随（不频繁改材质，避免 threejs-demo 里复刻 material 的复杂度）
    const devid = devidOf(hits)
    for (const [id, g] of rt?.devices ?? new Map()) {
      const sel = g.userData.sel as THREE.Mesh | undefined
      if (sel) sel.visible = id === devid || id === selected.value
    }
  })

  // 4) 标签投影：订阅 render 事件每帧重算（挂载时算一次会用未就绪的 camera.aspect，
  //    标签会冻结在旧投影上（设备越靠画面边缘偏得越远））
  viewer.emitter.on(Events.render, () => updateLabels())
  updateLabels()

  if (still.value) {
    viewer.stopLoop()
    // 静态模式无 render 事件：相机/尺寸变化时手动渲染 + 通知（标签据此重投影）
    viewer.controls.addEventListener('change', () => viewer?.renderAndNotify())
  }
  viewer.renderAndNotify()
  // 调试出口：浏览器控制台可直接查看 3D 运行时（viewer/rt/doc）
  ;(window as unknown as { __scene3d?: unknown }).__scene3d = { viewer, rt, doc }
  fpsT = performance.now(); raf = requestAnimationFrame(fpsLoop)
  window.addEventListener('keydown', onKey)
  connect()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  stream?.close()
  window.removeEventListener('keydown', onKey)
  viewer?.destroy() // 完整 dispose + forceContextLoss + scene.clear（threejs-demo 同款）
})

/** Esc 关闭详情面板 */
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && selected.value) clearSelection()
}
</script>

<template>
  <div class="scene3d-page">
    <header class="bar">
      <button class="back" @click="router.push('/')">← 画面管理</button>
      <h1 class="title">{{ doc.meta.name }}</h1>
      <div class="badges">
        <span class="badge">{{ status }}</span>
        <span class="badge">设备 {{ alarmCount }}</span>
        <span class="badge">{{ fps }} fps</span>
        <select class="dev-picker" :value="selected" @change="onPickDevice(($event.target as HTMLSelectElement).value)">
          <option value="">选择设备查看…</option>
          <option v-for="n in deviceNav" :key="n.id" :value="n.id">{{ n.label }}</option>
        </select>
      </div>
    </header>
    <div ref="host" class="stage">
      <div
        v-for="l in labels" :key="l.id"
        class="dev-label" :class="['prio-' + l.prio, { selected: selected === l.id }]"
        :style="{ left: l.x + 'px', top: l.y + 'px' }"
      ><span class="tag">{{ l.text }}</span><span class="val">{{ l.value }}</span></div>

      <!-- 同页设备详情：选中对象的详情栏（threejs-demo 的 Popover 范式，不跳页） -->
      <aside v-if="detail" class="detail-panel" aria-label="设备详情">
        <header class="detail-head">
          <div class="detail-ident">
            <span class="detail-tag">{{ detail.tag }}</span>
            <span class="detail-title">{{ detail.title }}</span>
          </div>
          <span class="detail-status" :class="'prio-' + detail.prio">{{ detail.prioText }}</span>
          <button class="detail-close" type="button" aria-label="关闭设备详情" @click="clearSelection">×</button>
        </header>

        <!-- 主数据：标签在上、值在下；唯一的强调色给这一个数字 -->
        <div class="detail-figure">
          <span class="detail-label">实时值</span>
          <span v-if="detail.hasValue" class="detail-value">{{ detail.valueText }}<small>{{ detail.unit }}</small></span>
          <!-- 缺失值：小一号的灰破折号，不带单位（32px 的破折号会被读成"加载中"） -->
          <span v-else class="detail-value detail-missing">暂无数据</span>
        </div>

        <!-- 键值行：左标签右值，同一右边界 -->
        <dl class="detail-rows">
          <div class="detail-row"><dt>区域</dt><dd>{{ detail.area }}</dd></div>
          <div class="detail-row"><dt>点位</dt><dd>{{ detail.field }}</dd></div>
          <div class="detail-row"><dt>设备 ID</dt><dd class="mono">{{ detail.id }}</dd></div>
        </dl>

        <button class="detail-enter" type="button" @click="enterFaceplate">进入 2D 设备面板</button>
      </aside>
    </div>
    <div class="hint"><b>左键拖动</b> 旋转 · <b>右键拖动</b> 平移 · <b>滚轮</b> 缩放 · <b>单击设备</b> 查看同页详情（不跳页）</div>
  </div>
</template>

<style scoped>
/* 深色 3D 空间层（对齐 threejs-demo 参考项目与 design-taste-frontend 的 app-screen 规则）：
   画面本身是媒体（深色底由 3D 场景提供），面板是 chrome：无渐变、无发光阴影、
   边框与阴影不同时用、字号不低于 12px、唯一的强调色给主数据（实时值）。 */
.scene3d-page { width: 100vw; height: 100vh; display: flex; flex-direction: column; background: #0b1420; color: #e8f1f8; font-family: 'Inter', 'Noto Sans SC', system-ui, sans-serif; }
.bar { height: 52px; flex: 0 0 52px; display: flex; align-items: center; gap: 18px; padding: 0 20px; background: #0a1420; border-bottom: 1px solid #1e3448; }
.back { border: 1px solid #2a455e; background: #0f1f30; border-radius: 6px; padding: 7px 12px; cursor: pointer; font-size: 13px; color: #b8d6e8; }
.back:hover { border-color: #1de0ff; color: #1de0ff; }
.back:focus-visible, .dev-picker:focus-visible, .detail-close:focus-visible, .detail-enter:focus-visible { outline: 2px solid #1de0ff; outline-offset: 2px; }
.title { margin: 0; font-size: 18px; font-weight: 600; color: #eaf6ff; }
.badges { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.badge { font-size: 12px; color: #9dbdd0; background: #0f1f30; border-radius: 4px; padding: 5px 9px; font-variant-numeric: tabular-nums; }
.dev-picker { font-size: 12px; padding: 6px 9px; border: 1px solid #2a455e; border-radius: 6px; background: #0f1f30; color: #c8e4f4; cursor: pointer; }
.stage { flex: 1; min-height: 0; position: relative; overflow: hidden; }
.stage :deep(canvas) { display: block; width: 100%; height: 100%; }

/* 设备标签（场景内标注）：暗底 + 1px 边 + 强调色只给数值 */
.dev-label { position: absolute; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 12px; padding: 4px 8px; border: 1px solid #24506c; background: rgba(8,18,28,.86); color: #d6e8f4; border-radius: 4px; font-variant-numeric: tabular-nums; pointer-events: none; }
.dev-label .tag { font-weight: 600; color: #eaf6ff; }
.dev-label .val { color: #1de0ff; }
.dev-label.selected { border-color: #1de0ff; }
.dev-label.prio-1 { border-color: #ff3b4e; color: #ff9aa6; }
.dev-label.prio-1 .val { color: #ff6b7a; }
.dev-label.prio-2 { border-color: #ff8c2a; color: #ffc08a; }
.dev-label.prio-3 { border-color: #d9b52a; color: #f0d98a; }
.dev-label.prio-4 { border-color: #3d9dff; color: #9fcaff; }

/* 设备详情面板：深色地面 + 1px 边（无阴影、无渐变），行距 32px */
.detail-panel { position: absolute; right: 20px; top: 20px; width: 292px; padding: 16px; border: 1px solid #2a455e; border-radius: 8px; background: rgba(10,18,26,.96); }
.detail-head { display: flex; align-items: flex-start; gap: 8px; }
.detail-ident { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.detail-tag { font-size: 13px; font-weight: 600; color: #eaf6ff; }
.detail-title { font-size: 12px; color: #9dbdd0; }
.detail-status { flex: none; font-size: 12px; line-height: 20px; padding: 0 8px; border-radius: 4px; background: #16242f; color: #9dbdd0; }
.detail-status.prio-1 { background: #2c1a20; color: #ff8f9c; }
.detail-status.prio-2 { background: #2c2318; color: #ffc08a; }
.detail-status.prio-3 { background: #2a2717; color: #f0d98a; }
.detail-status.prio-4 { background: #16242c; color: #9fcaff; }
.detail-close { flex: none; width: 28px; height: 28px; margin: -4px -6px 0 0; border: none; border-radius: 4px; background: transparent; color: #8aa7ba; font-size: 20px; line-height: 1; cursor: pointer; }
.detail-close:hover { background: #16242f; color: #ffffff; }

/* 主数据：标签在上、值在下；屏幕上唯一的强调色 */
.detail-figure { display: flex; flex-direction: column; gap: 2px; margin: 18px 0 4px; }
.detail-label { font-size: 12px; color: #9dbdd0; }
.detail-value { font-size: 32px; font-weight: 600; color: #1de0ff; line-height: 1.1; font-variant-numeric: tabular-nums; }
.detail-value small { font-size: 13px; font-weight: 400; color: #9dbdd0; margin-left: 4px; }
.detail-value.detail-missing { font-size: 14px; font-weight: 400; color: #8aa7ba; }

/* 键值行：左标签右值，同一右边界；行间 1px 细线 */
.detail-rows { margin: 14px 0 0; padding: 0; border-top: 1px solid #1e3448; }
.detail-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #1e3448; }
.detail-row dt { font-size: 12px; color: #9dbdd0; }
.detail-row dd { margin: 0; font-size: 13px; color: #e8f1f8; text-align: right; }
.detail-row dd.mono { font-family: ui-monospace, monospace; font-size: 12px; } /* taste-skill-ignore: 设备 ID 用等宽（app-screen §7.4） */

.detail-enter { width: 100%; margin-top: 16px; height: 34px; border: none; border-radius: 6px; background: #e8f1f8; color: #0b1420; font-size: 13px; font-weight: 500; cursor: pointer; }
.detail-enter:hover { background: #ffffff; }
.hint { flex: 0 0 30px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #8aa7ba; background: #0a1420; border-top: 1px solid #1e3448; }
.hint b { color: #1de0ff; font-weight: 600; }
</style>
