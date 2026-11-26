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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
const values = new Map<string, number>()
const prios = new Map<string, number>()

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
 * 选中设备（mitt click 与顶部下拉共用）——与 threejs-demo 一致：点击只选中 +
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
  void router.push(`/view/iot-faceplate-${selected.value.replace(/^dev_/, '')}?dev=${selected.value}`)
}

/** 详情面板数据（选中设备的关键值 / 状态 / 区域） */
const detail = computed(() => {
  const id = selected.value
  if (!id) return null
  const n: SceneNode | undefined = doc.nodes.find((x) => x.id === id)
  if (!n) return null
  const field = n.points?.value
  const raw = field ? values.get(field) : undefined
  const unit = n.kind === 'emeter' ? 'kW' : n.kind === 'env' ? '°C' : n.kind === 'pt' ? 'MPa' : 'm³/h'
  const prio = prios.get(id) ?? 0
  return {
    id, title: n.label ?? id, tag: (n.label ?? id).split(' ')[0],
    area: n.id.startsWith('dev_wm') ? '供水' : n.id.startsWith('dev_gm') ? '燃气'
      : n.id.startsWith('dev_em') ? '配电' : '环境',
    value: raw === undefined || !Number.isFinite(raw) ? '—' : raw.toFixed(2),
    unit, prio,
    prioText: ['正常', 'P1 严重', 'P2 高', 'P3 中等', 'P4 提示'][prio] ?? '正常',
  }
})

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
  //    标签会冻结在旧投影上——设备越靠画面边缘偏得越远）
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
  connect()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  stream?.close()
  viewer?.destroy() // 完整 dispose + forceContextLoss + scene.clear（threejs-demo 同款）
})
</script>

<template>
  <div class="scene3d-page">
    <header class="bar">
      <button class="back" @click="router.push('/')">← 画面管理</button>
      <div class="title">{{ doc.meta.name }}</div>
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

      <!-- 同页设备详情（threejs-demo 的 Popover 范式，不跳页） -->
      <div v-if="detail" class="detail-panel" :class="'prio-' + detail.prio">
        <div class="detail-head">
          <span class="detail-tag">{{ detail.tag }}</span>
          <span class="detail-prio">{{ detail.prioText }}</span>
        </div>
        <div class="detail-title">{{ detail.title }}</div>
        <div class="detail-grid">
          <div class="detail-cell"><span class="k">区域</span><span class="v">{{ detail.area }}</span></div>
          <div class="detail-cell"><span class="k">实时值</span><span class="v big">{{ detail.value }} <small>{{ detail.unit }}</small></span></div>
          <div class="detail-cell"><span class="k">设备 ID</span><span class="v mono">{{ detail.id }}</span></div>
        </div>
        <button class="detail-enter" @click="enterFaceplate">进入 2D 设备面板 →</button>
        <button class="detail-close" @click="clearSelection">×</button>
      </div>
    </div>
    <div class="hint"><b>左键拖动</b> 旋转 · <b>右键拖动</b> 平移 · <b>滚轮</b> 缩放 · <b>单击设备</b> 查看同页详情（不跳页）</div>
  </div>
</template>

<style scoped>
/* 深色科技风（对齐 threejs-demo）：深蓝底 + 青色强调 + 半透明浮层 */
.scene3d-page { width: 100vw; height: 100vh; display: flex; flex-direction: column; background: #0b1420; color: #d7e6f2; font-family: 'Inter', 'Noto Sans SC', system-ui, sans-serif; }
.bar { height: 52px; flex: 0 0 52px; display: flex; align-items: center; gap: 18px; padding: 0 20px; background: linear-gradient(180deg, #0c1b2c, #0a1420); border-bottom: 1px solid #1b3a52; box-shadow: 0 2px 14px rgba(0,180,255,.12); }
.back { border: 1px solid #21445e; background: rgba(20,48,70,.6); border-radius: 5px; padding: 6px 10px; cursor: pointer; font-size: 13px; color: #8fc7e8; }
.back:hover { border-color: #1de0ff; color: #1de0ff; }
.title { font-size: 16px; font-weight: 600; color: #eaf6ff; letter-spacing: .5px; }
.badges { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.badge { font-size: 12px; color: #7fb6d6; background: rgba(20,52,76,.7); border: 1px solid #1b3a52; border-radius: 4px; padding: 4px 8px; font-variant-numeric: tabular-nums; }
.dev-picker { font-size: 12px; padding: 5px 8px; border: 1px solid #21445e; border-radius: 4px; background: rgba(12,32,50,.9); color: #bfe4f7; cursor: pointer; }
.stage { flex: 1; min-height: 0; position: relative; overflow: hidden; }
.stage :deep(canvas) { display: block; width: 100%; height: 100%; }

/* 设备标签：暗底青边、发光文字 */
.dev-label { position: absolute; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 11px; padding: 4px 7px; border: 1px solid #1b6a88; background: rgba(8,24,38,.82); color: #cfe8f7; border-radius: 3px; box-shadow: 0 0 8px rgba(29,224,255,.18); font-variant-numeric: tabular-nums; pointer-events: none; }
.dev-label .tag { font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #eaf6ff; }
.dev-label .val { color: #1de0ff; }
.dev-label.selected { border-color: #1de0ff; box-shadow: 0 0 14px rgba(29,224,255,.55); outline: 1px solid rgba(29,224,255,.5); outline-offset: 1px; }
.dev-label.prio-1 { border-color: #ff3b4e; color: #ff8b98; box-shadow: 0 0 12px rgba(255,59,78,.5); }
.dev-label.prio-1 .val { color: #ff3b4e; }
.dev-label.prio-2 { border-color: #ff8c2a; color: #ffb87a; }
.dev-label.prio-3 { border-color: #ffd23f; color: #ffe486; }
.dev-label.prio-4 { border-color: #3d9dff; color: #8fc6ff; }

/* 同页设备详情面板（参考 threejs-demo 的 Popover，但承载实际读数） */
.detail-panel { position: absolute; right: 20px; top: 20px; width: 268px; padding: 16px; border: 1px solid #1b6a88; border-radius: 6px; background: linear-gradient(160deg, rgba(10,30,48,.94), rgba(8,20,34,.96)); box-shadow: 0 0 22px rgba(29,224,255,.18), inset 0 1px 0 rgba(255,255,255,.05); }
.detail-panel.prio-1 { border-color: #ff3b4e; box-shadow: 0 0 22px rgba(255,59,78,.28); }
.detail-head { display: flex; align-items: center; justify-content: space-between; }
.detail-tag { font-family: ui-monospace, monospace; font-size: 14px; font-weight: 700; color: #1de0ff; }
.detail-prio { font-size: 11px; color: #7fb6d6; border: 1px solid #21445e; border-radius: 3px; padding: 2px 6px; }
.detail-panel.prio-1 .detail-prio { color: #ff8b98; border-color: #ff3b4e; }
.detail-title { font-size: 13px; color: #cfe8f7; margin-top: 6px; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
.detail-cell { display: flex; flex-direction: column; gap: 3px; padding: 8px; background: rgba(20,52,76,.5); border-radius: 4px; }
.detail-cell .k { font-size: 10px; color: #6f9dbb; }
.detail-cell .v { font-size: 13px; color: #dff1ff; }
.detail-cell .v.big { font-size: 22px; font-weight: 600; color: #1de0ff; font-variant-numeric: tabular-nums; }
.detail-cell .v.big small { font-size: 11px; color: #7fb6d6; font-weight: 400; }
.detail-cell .v.mono { font-family: ui-monospace, monospace; font-size: 11px; }
.detail-enter { width: 100%; margin-top: 12px; padding: 8px; border: 1px solid #1de0ff; border-radius: 4px; background: rgba(29,224,255,.12); color: #1de0ff; font-size: 12px; cursor: pointer; }
.detail-enter:hover { background: rgba(29,224,255,.25); }
.detail-close { position: absolute; right: 8px; top: 8px; width: 22px; height: 22px; border: none; background: transparent; color: #6f9dbb; font-size: 18px; cursor: pointer; }
.detail-close:hover { color: #fff; }
.hint { flex: 0 0 30px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #6f9dbb; background: #0a1420; border-top: 1px solid #1b3a52; }
.hint b { color: #1de0ff; font-weight: 600; }
</style>
