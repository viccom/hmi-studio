<script setup lang="ts">
/**
 * 3D 空间层运行页（真正的 3D HMI demo）。
 * 单一 WebGL 上下文、程序化几何、SSE 实时驱动、射线拾取跳 2D faceplate。
 * 视觉纪律见 docs/hmi-style-guide.md §2「3D 的位置」：灰阶常态、异常才饱和色、禁写实。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as THREE from 'three'
import { api } from '../lib/api'
import { createRtdataStream, type RtPoint } from '../lib/sse'
import { buildDemoScene, devsOf, isScene3D, type SceneDoc, type SceneNode } from '../lib/scene3d'

const route = useRoute()
const router = useRouter()
const host = ref<HTMLElement>()
const status = ref('加载中…')
const activeId = ref('')
const alarmCount = ref(0)
const fps = ref(0)
const labels = ref<Array<{ id: string; text: string; x: number; y: number; prio: number }>>([])

// ---- 主题令牌（hmi-style-guide §2） ----
const PALETTE = {
  bg: 0xf0f0f0, floor: 0xdcdcdc, area: 0xe8e8e8, normal: 0x5b6570,
  p1: 0xd32f2f, p3: 0xfbc02d, p4: 0x1976d2, live: 0x1f4e79,
}
const PRIO_COLOR: Record<number, number> = { 0: PALETTE.normal, 1: PALETTE.p1, 2: 0xf57c00, 3: PALETTE.p3, 4: PALETTE.p4 }

// ---- three 运行时状态（非响应式） ----
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let stream: { close(): void } | null = null
let raf = 0
let ro: ResizeObserver | null = null
let last = 0, frames = 0, fpsT = 0
const devices = new Map<string, THREE.Group>()      // devid → 设备组
const spinners: Array<{ mesh: THREE.Object3D; speed: number }> = []
const flows: Array<{ mesh: THREE.Object3D; speed: number }> = []
const pickables: THREE.Object3D[] = []
const values = new Map<string, number>()            // field → 数值
const prios = new Map<string, number>()             // devid → 优先级
let picking: THREE.Raycaster | null = null
const pointer = new THREE.Vector2()

// ---- 场景文档（先内置 demo，再尝试从 rs-iot 取同 slug 的 3D 文档） ----
let doc: SceneDoc = buildDemoScene()
const slug = computed(() => String(route.params.id ?? 'iot-plant-3d'))

// ---- 程序化几何（无外部资产；flat/matte，状态可参数化） ----
function mat(color: number, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true, ...opts })
}
function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
}
function cyl(rt: number, rb: number, h: number, color: number, seg = 12): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color))
}

function makeDevice(n: SceneNode): THREE.Group {
  const g = new THREE.Group()
  g.position.set(n.pos[0], n.pos[1], n.pos[2])
  g.rotation.y = n.rotY ?? 0
  g.userData.devid = n.devId
  const s = 2.5 // demo 放大：45m 俯视下 1m 设备不可读，放大到 ~2.5m

  switch (n.kind) {
    case 'flowmeter':
    case 'gasmeter': {
      g.add(cyl(0.55, 0.55, 1.1, PALETTE.normal).translateY(0.55))
      const dial = cyl(0.5, 0.5, 0.12, 0xf5f5f5, 20); dial.position.set(0, 1.15, 0); g.add(dial)
      const needle = box(0.06, 0.06, 0.8, PALETTE.live); needle.position.set(0, 1.23, 0.25); g.add(needle)
      spinners.push({ mesh: needle, speed: 0.25 })
      break
    }
    case 'emeter': {
      const body = box(1.2, 1.5, 0.8, PALETTE.normal); body.position.y = 0.75; g.add(body)
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(0x2e7d32, { emissive: 0x2e7d32, emissiveIntensity: 0.6 }))
      lamp.position.set(0.4, 1.2, 0.42); g.add(lamp); g.userData.lamp = lamp
      break
    }
    case 'pt': {
      g.add(cyl(0.15, 0.22, 1.2, PALETTE.normal).translateY(0.6))
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 8, 16), mat(PALETTE.normal))
      ring.position.y = 1.2; ring.rotation.x = Math.PI / 2; g.add(ring); g.userData.ring = ring
      break
    }
    case 'env': {
      g.add(box(0.8, 1.8, 0.8, PALETTE.normal).translateY(0.9))
      for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(PALETTE.live)); p.position.set(-0.2 + i * 0.2, 1.5, 0.42); g.add(p) }
      break
    }
    case 'pump': {
      const imp = cyl(0.5, 0.5, 0.2, PALETTE.normal); imp.position.y = 0.7; g.add(imp)
      spinners.push({ mesh: imp, speed: 1.2 })
      break
    }
    case 'tank': {
      const body = cyl(0.8, 0.8, 2, PALETTE.normal); body.position.y = 1; g.add(body)
      const level = cyl(0.78, 0.78, 1, PALETTE.live); level.position.y = 0.5; g.add(level); g.userData.level = level
      break
    }
    default: break
  }

  // 报警光环（外挂，不改设备几何；颜色随 prio 变）
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 8, 24), mat(PALETTE.normal))
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06; halo.visible = false; g.add(halo)
  g.userData.halo = halo
  g.scale.setScalar(s) // 整体放大（位置仍是场景坐标，缩放只影响几何尺寸）
  g.traverse((o) => { if (o instanceof THREE.Mesh) pickables.push(o) })
  return g
}

function makeLink(l: { from: string; to: string; kind: string; flow?: string }): THREE.Mesh | null {
  const a = doc.nodes.find((n) => n.id === l.from), b = doc.nodes.find((n) => n.id === l.to)
  if (!a || !b) return null
  const p1 = new THREE.Vector3(a.pos[0], 0.35, a.pos[2]), p2 = new THREE.Vector3(b.pos[0], 0.35, b.pos[2])
  const dir = p2.clone().sub(p1); const len = dir.length()
  const geo = new THREE.CylinderGeometry(l.kind === 'pipe' ? 0.1 : 0.06, l.kind === 'pipe' ? 0.1 : 0.06, len, 8)
  const mesh = new THREE.Mesh(geo, mat(l.kind === 'pipe' ? PALETTE.normal : PALETTE.live))
  mesh.position.copy(p1.clone().add(p2).multiplyScalar(0.5))
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  if (l.flow) flows.push({ mesh, speed: 0.6 })
  return mesh
}

function buildScene(): void {
  if (!scene) return
  for (const g of devices.values()) scene.remove(g)
  devices.clear(); spinners.length = 0; flows.length = 0; pickables.length = 0

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(46, 34), mat(PALETTE.floor))
  floor.rotation.x = -Math.PI / 2; scene.add(floor)
  const grid = new THREE.GridHelper(46, 46, 0xc8c8c8, 0xdddddd); grid.position.y = 0.01; scene.add(grid)

  for (const n of doc.nodes) {
    if (n.kind === 'floor') {
      if (n.id === 'floor') continue
      const s = n.scale ?? 1
      const p = new THREE.Mesh(new THREE.PlaneGeometry(10 * s, 10 * s), mat(PALETTE.area))
      p.rotation.x = -Math.PI / 2; p.position.set(n.pos[0], n.pos[1], n.pos[2]); scene.add(p)
      continue
    }
    const g = makeDevice(n); devices.set(n.id, g); scene.add(g)
  }
  for (const l of doc.links) { const m = makeLink(l); if (m) scene.add(m) }
}

// ---- 渲染循环（按需渲染：有动画/数据变化/相机移动才画） ----
function animate(t: number): void {
  raf = requestAnimationFrame(animate)
  if (!renderer || !scene || !camera) return
  const dt = Math.min((t - last) / 1000, 0.1); last = t
  let dirty = false
  for (const s of spinners) { s.mesh.rotation.y += s.speed * dt; dirty = true }
  for (const f of flows) {
    if (!(f.mesh instanceof THREE.Mesh)) continue
    const m = f.mesh.material as THREE.MeshStandardMaterial
    const pulse = 0.75 + 0.25 * Math.sin(t / 300 * f.speed)
    m.emissive.setHex(PALETTE.live); m.emissiveIntensity = pulse * 0.25
    dirty = true
  }
  if (dirty && !document.hidden) {
    renderer.render(scene, camera)
    ;(window as unknown as { __threeDemoRenderInfo?: unknown }).__threeDemoRenderInfo = {
      calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    }
    // 设备位号投影到屏幕（HTML 浮层，非 3D 文字精灵；避开发方案里 CSS2D 滞后坑）
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight
    const out: Array<{ id: string; text: string; x: number; y: number; prio: number }> = []
    for (const n of doc.nodes) {
      if (!n.devId) continue
      const g = devices.get(n.id)
      if (!g) continue
      const v = new THREE.Vector3(n.pos[0], n.pos[1] + 3.2, n.pos[2]).project(camera)
      if (v.z > 1 || v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1) continue
      out.push({ id: n.id, text: n.label ?? n.id, x: Math.round((v.x + 1) / 2 * w), y: Math.round((1 - v.y) / 2 * h), prio: prios.get(n.id) ?? 0 })
    }
    // 内容/坐标未变就不重写响应式数组——避免每帧 DOM 抖动（也修 Playwright 点击稳定性）
    const old = labels.value
    const changed = old.length !== out.length || out.some((o, i) => o.id !== old[i].id || o.x !== old[i].x || o.y !== old[i].y || o.prio !== old[i].prio)
    if (changed) labels.value = out
  }
  frames++
  if (t - fpsT > 1000) { fps.value = Math.round(frames * 1000 / (t - fpsT)); frames = 0; fpsT = t }
}

// ---- 数据：SSE → 点值 → 几何状态 ----
function applyPoint(p: RtPoint): void {
  if (p.value === undefined || p.value === null) return
  const n = typeof p.value === 'number' ? p.value : Number(p.value)
  if (Number.isFinite(n)) values.set(p.field, n)
  // 优先级字段：<devid>.__prio
  const m = /^(dev_[a-z0-9]+)\.__prio$/.exec(p.field)
  if (m) {
    const v = Math.max(0, Math.min(4, Number(p.value) || 0))
    prios.set(m[1], v); const g = devices.get(m[1])
    if (g) {
      const halo = g.userData.halo as THREE.Mesh | undefined
      if (halo) { halo.visible = v > 0; (halo.material as THREE.MeshStandardMaterial).color.setHex(PRIO_COLOR[v] ?? PALETTE.normal) }
    }
  }
  // 数值驱动：指针角度 / 液位 / 灯
  for (const d of devices.values()) {
    const pv = d.userData.devid as string
    const f = doc.nodes.find((x) => x.devId === pv)?.points?.value
    if (!f || !values.has(f)) continue
    const v = values.get(f)!
    d.traverse((o) => {
      if (o.userData.level) {
        const lv = o.userData.level as THREE.Mesh
        const h = Math.max(0.05, Math.min(2, v / 100 * 2)); lv.scale.y = h / 1; lv.position.y = h / 2
      }
      if (o.userData.lamp && v > 0) { (o.userData.lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 }
    })
    spinners.forEach((s) => {
      if (d.getObjectById(s.mesh.id) && s.speed < 0.5) s.speed = 0.15 + Math.min(v, 50) / 100
    })
  }
  if (renderer && scene && camera) renderer.render(scene, camera)
}

function connect(): void {
  const devs = devsOf(doc)
  if (!devs.length) return
  stream = createRtdataStream({
    devs, interval: 1000,
    onPoint: applyPoint,
    onState: (s) => { status.value = s === 'online' ? '实时' : s === 'offline' ? '离线' : '重连中…' },
  })
}

// ---- 拾取：点设备 → 跳 2D faceplate（?dev=） ----
function kindToFaceplate(kind: string): string {
  if (['flowmeter', 'pump', 'tank'].includes(kind)) return 'iot-faceplate-water'
  if (kind === 'gasmeter') return 'iot-faceplate-gas'
  if (kind === 'emeter') return 'iot-faceplate-power'
  return 'iot-faceplate-env'
}
function pick(ev: PointerEvent): void {
  if (!renderer || !camera) return
  const r = renderer.domElement.getBoundingClientRect()
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
  picking = picking ?? new THREE.Raycaster()
  picking.setFromCamera(pointer, camera)
  const hits = picking.intersectObjects(pickables, false)
  if (!hits.length) return
  let o: THREE.Object3D | null = hits[0].object
  while (o && !o.userData.devid) o = o.parent
  const devid = o?.userData.devid as string | undefined
  if (!devid) return
  openDevice(devid)
}

/** 打开设备的 2D faceplate（canvas 拾取与浮动标签共用）；async 让导航错误可诊断。 */
function openDevice(devid: string): void {
  activeId.value = devid
  const n = doc.nodes.find((x) => x.id === devid)
  const target = `/view/${kindToFaceplate(n?.kind ?? '')}?dev=${devid}`
  console.log('[3d] open device', devid, '→', target)
  void router.push(target)
}

// ---- 生命周期 ----
onMounted(async () => {
  try {
    const r = await api().get(`/api/v1/screens/${slug.value}`) as { doc?: unknown } | undefined
    const candidate = r?.doc ?? r // 兼容直返 doc 的后端形态
    if (candidate && isScene3D(candidate)) doc = candidate as SceneDoc
  } catch { /* 无远端文档 → 用内置 demo */ }
  alarmCount.value = doc.nodes.filter((n) => n.devId).length

  if (!host.value) return
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(PALETTE.bg)
  renderer.domElement.addEventListener('pointerdown', pick)
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); status.value = 'WebGL 上下文丢失' })
  host.value.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(PALETTE.bg)
  scene.fog = new THREE.Fog(PALETTE.bg, 40, 110)
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(20, 30, 16); scene.add(sun)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9e9e9e, 0.7))

  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300)
  camera.position.set(...doc.meta.home.pos); camera.lookAt(...doc.meta.home.target)
  buildScene()

  // 相机控制（拖拽旋转 / 滚轮缩放 / 双指平移）——自实现最小版，避免额外依赖
  let drag: { x: number; y: number } | null = null
  const canvas = renderer.domElement
  canvas.addEventListener('pointerdown', (e) => { if (e.button === 0 && e.shiftKey) drag = { x: e.clientX, y: e.clientY } })
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || !camera) return
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }
    const target = new THREE.Vector3(...doc.meta.home.target)
    const off = camera.position.clone().sub(target)
    const sph = new THREE.Spherical().setFromVector3(off)
    sph.theta -= dx * 0.005; sph.phi = Math.max(0.15, Math.min(Math.PI / 2.1, sph.phi - dy * 0.005))
    camera.position.copy(target.clone().add(new THREE.Vector3().setFromSpherical(sph))); camera.lookAt(target)
  })
  canvas.addEventListener('pointerup', () => { drag = null })
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); if (!camera) return
    const target = new THREE.Vector3(...doc.meta.home.target)
    const off = camera.position.clone().sub(target)
    off.multiplyScalar(e.deltaY > 0 ? 1.08 : 0.92)
    camera.position.copy(target.clone().add(off))
  }, { passive: false })

  const resize = () => {
    if (!renderer || !camera || !host.value) return
    const w = host.value.clientWidth, h = host.value.clientHeight
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix()
    renderer.render(scene!, camera)
  }
  ro = new ResizeObserver(resize); ro.observe(host.value); resize()
  last = performance.now(); fpsT = last
  raf = requestAnimationFrame(animate)
  connect()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf); ro?.disconnect(); stream?.close()
  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', pick)
    scene?.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const m = o.material; if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m.dispose() } })
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove()
  }
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
      </div>
    </header>
    <div ref="host" class="stage">
      <button
        v-for="l in labels" :key="l.id"
        class="dev-label" :class="'prio-' + l.prio"
        :style="{ left: l.x + 'px', top: l.y + 'px' }"
        @click="openDevice(l.id)"
      >{{ l.text }}</button>
    </div>
    <div class="hint">左键拖动旋转 · 滚轮缩放 · 点击设备或标签进入 2D 面板</div>
    <div v-if="activeId" class="toast">已打开 {{ activeId }} 的 2D 面板</div>
  </div>
</template>

<style scoped>
.scene3d-page { width: 100vw; height: 100vh; display: flex; flex-direction: column; background: #f0f0f0; }
.bar { height: 52px; flex: 0 0 52px; display: flex; align-items: center; gap: 18px; padding: 0 20px; background: #fff; border-bottom: 1px solid #ddd; }
.back { border: 1px solid #bbb; background: #fff; border-radius: 5px; padding: 6px 10px; cursor: pointer; font-size: 13px; }
.title { font-size: 16px; font-weight: 600; color: #1f2328; }
.badges { margin-left: auto; display: flex; gap: 8px; }
.badge { font-size: 12px; color: #5b6570; background: #f0f0f0; border-radius: 4px; padding: 4px 8px; }
.stage { flex: 1; min-height: 0; position: relative; }
.stage :deep(canvas) { display: block; width: 100%; height: 100%; }
.dev-label { position: absolute; transform: translate(-50%, -50%); white-space: nowrap; font-size: 11px; padding: 3px 7px; border: 1px solid #b5bdc6; background: rgba(255,255,255,.92); color: #1f2328; border-radius: 4px; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.dev-label.prio-1 { border-color: #d32f2f; color: #d32f2f; font-weight: 600; }
.dev-label.prio-2 { border-color: #f57c00; color: #f57c00; }
.dev-label.prio-3 { border-color: #fbc02d; color: #9a7b00; }
.dev-label.prio-4 { border-color: #1976d2; color: #1976d2; }
.hint { flex: 0 0 28px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #5b6570; background: #fff; border-top: 1px solid #ddd; }
.toast { position: absolute; left: 50%; bottom: 70px; transform: translateX(-50%); background: #1f4e79; color: #fff; padding: 8px 14px; border-radius: 5px; font-size: 13px; }
</style>
