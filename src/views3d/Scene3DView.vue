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
import { buildDemoScene, devsOf, isScene3D, type SceneDoc } from '../lib/scene3d'

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

/** 打开设备的 2D faceplate（mitt click 与顶部下拉共用） */
function openDevice(devid: string): void {
  const n = doc.nodes.find((x) => x.id === devid)
  selected.value = devid
  for (const [id, g] of (rt?.devices ?? new Map())) {
    const s = g.userData.sel as THREE.Mesh | undefined
    if (s) s.visible = id === devid
  }
  const kind = n?.kind ?? ''
  const target = ['flowmeter', 'pump', 'tank'].includes(kind) ? 'iot-faceplate-water'
    : kind === 'gasmeter' ? 'iot-faceplate-gas'
      : kind === 'emeter' ? 'iot-faceplate-power' : 'iot-faceplate-env'
  void router.push(`/view/${target}?dev=${devid}`)
}

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

  // 4) 标签投影（数据变化 +相机变化 时刷新；仍用我们更优的屏幕投影而非鼠标 Popover）
  viewer.controls.addEventListener('change', () => { if (still.value) updateLabels() })
  updateLabels()

  if (still.value) viewer.stopLoop()
  viewer.render()
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
          <option value="">打开设备面板…</option>
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
    </div>
    <div class="hint"><b>左键拖动</b> 旋转 · <b>右键拖动</b> 平移 · <b>滚轮</b> 缩放 · <b>单击设备</b> 进入 2D 面板</div>
  </div>
</template>

<style scoped>
.scene3d-page { width: 100vw; height: 100vh; display: flex; flex-direction: column; background: #eef1f4; }
.bar { height: 52px; flex: 0 0 52px; display: flex; align-items: center; gap: 18px; padding: 0 20px; background: #fff; border-bottom: 1px solid #d9e0e6; }
.back { border: 1px solid #b9c2ca; background: #fff; border-radius: 5px; padding: 6px 10px; cursor: pointer; font-size: 13px; color: #3d4752; }
.title { font-size: 16px; font-weight: 600; color: #1f2328; }
.badges { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.badge { font-size: 12px; color: #5b6570; background: #eef1f4; border-radius: 4px; padding: 4px 8px; }
.dev-picker { font-size: 12px; padding: 5px 8px; border: 1px solid #b9c2ca; border-radius: 4px; background: #fff; color: #3d4752; cursor: pointer; }
.stage { flex: 1; min-height: 0; position: relative; overflow: hidden; }
.stage :deep(canvas) { display: block; width: 100%; height: 100%; }
.dev-label { position: absolute; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 11px; padding: 4px 7px; border: 1px solid #aab4be; background: rgba(255,255,255,.94); color: #1f2328; border-radius: 4px; box-shadow: 0 2px 6px rgba(40,55,70,.12); font-variant-numeric: tabular-nums; pointer-events: none; }
.dev-label .tag { font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dev-label .val { color: #1f4e79; }
.dev-label.selected { outline: 2px solid #1f4e79; outline-offset: 1px; }
.dev-label.prio-1 { border-color: #d32f2f; color: #d32f2f; }
.dev-label.prio-1 .val { color: #d32f2f; }
.dev-label.prio-2 { border-color: #f57c00; color: #b35a00; }
.dev-label.prio-3 { border-color: #d9a800; color: #8a6f00; }
.dev-label.prio-4 { border-color: #1976d2; color: #1976d2; }
.hint { flex: 0 0 30px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #5b6570; background: #fff; border-top: 1px solid #d9e0e6; }
.hint b { color: #1f4e79; font-weight: 600; }
</style>
