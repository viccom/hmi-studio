<script setup lang="ts">
/**
 * 3D 空间层运行页（真正的 3D HMI demo，v2）。
 * 单一 WebGL 上下文 / OrbitControls（左键旋转·右键平移·滚轮缩放）/ 程序化几何 /
 * SSE 实时驱动 / 射线拾取跳 2D faceplate / 屏幕空间标签（防重叠）。
 * 视觉纪律见 docs/hmi-style-guide.md §2：灰阶常态、异常才饱和色、禁照片级写实。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { api } from '../lib/api'
import { createRtdataStream, type RtPoint } from '../lib/sse'
import { buildDemoScene, devsOf, isScene3D, type SceneDoc, type SceneNode } from '../lib/scene3d'

const route = useRoute()
const router = useRouter()
const host = ref<HTMLElement>()
const status = ref('加载中…')
const alarmCount = ref(0)
const fps = ref(0)
const labels = ref<Array<{ id: string; text: string; value: string; x: number; y: number; prio: number }>>([])
const selected = ref('')

// ---- 主题令牌（hmi-style-guide §2：灰阶底 + 异常饱和色） ----
const C = {
  bg: 0xeef1f4, floor: 0xe3e7eb, road: 0xd2d8de, wall: 0xb9c2ca,
  frame: 0xc8d0d8, base: 0x8d99a6, body: 0x5b6570, panel: 0xdfe5ea,
  dark: 0x3d4752, live: 0x1f4e79, green: 0x2e7d32,
  p1: 0xd32f2f, p2: 0xf57c00, p3: 0xfbc02d, p4: 0x1976d2,
}
const PRIO: Record<number, number> = { 0: C.body, 1: C.p1, 2: C.p2, 3: C.p3, 4: C.p4 }

// ---- three 运行时（非响应式） ----
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let stream: { close(): void } | null = null
let raf = 0, ro: ResizeObserver | null = null
let last = 0, frames = 0, fpsT = 0, lastAnim = 0
const devices = new Map<string, THREE.Group>()
const spinners: Array<{ mesh: THREE.Object3D; speed: number }> = []
const pulses: Array<{ mesh: THREE.Mesh; phase: number }> = []
const pickables: THREE.Object3D[] = []
const values = new Map<string, number>()
const prios = new Map<string, number>()
let picking: THREE.Raycaster | null = null
const pointer = new THREE.Vector2()
let down: { x: number; y: number } | null = null

let doc: SceneDoc = buildDemoScene()
const slug = computed(() => String(route.params.id ?? 'iot-plant-3d'))
// ?still=1：静态模式（弱 GPU/软件渲染/自动化验证）——只渲染静态帧，不跑动画循环
const still = computed(() => String(route.query.still ?? '') === '1')

// ---- 材质与基础网格 ----
function mat(color: number, o: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, flatShading: true, ...o })
}
function box(w: number, h: number, d: number, color: number, o?: THREE.MeshStandardMaterialParameters) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o))
}
function cyl(rt: number, rb: number, h: number, color: number, seg = 16, o?: THREE.MeshStandardMaterialParameters) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, o))
}
function addAt(g: THREE.Group, m: THREE.Mesh, x: number, y: number, z: number) { m.position.set(x, y, z); g.add(m); return m }

/** 设备基础（每台一个台座 + 螺栓圈） */
function addBase(g: THREE.Group, r: number): void {
  addAt(g, cyl(r, r * 1.1, 0.16, C.base, 20), 0, 0.08, 0)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.78, 0.025, 6, 20), mat(C.dark))
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.17; g.add(ring)
}

function makeDevice(n: SceneNode): THREE.Group {
  const g = new THREE.Group()
  g.position.set(n.pos[0], n.pos[1], n.pos[2])
  g.rotation.y = n.rotY ?? 0
  g.userData.devid = n.devId

  switch (n.kind) {
    case 'flowmeter':
    case 'gasmeter': {
      addBase(g, 0.6)
      addAt(g, cyl(0.38, 0.42, 0.72, C.body, 20), 0, 0.52, 0)
      // 两侧管道接口
      const p1 = addAt(g, cyl(0.14, 0.14, 0.5, C.dark, 12), -0.5, 0.52, 0); p1.rotation.z = Math.PI / 2
      const p2 = addAt(g, cyl(0.14, 0.14, 0.5, C.dark, 12), 0.5, 0.52, 0); p2.rotation.z = Math.PI / 2
      // 表盘（浅色面 + 刻度环 + 指针）
      addAt(g, cyl(0.36, 0.36, 0.08, C.panel, 24), 0, 0.95, 0)
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 24), mat(C.dark)); rim.rotation.x = -Math.PI / 2; rim.position.y = 1.0; g.add(rim)
      const needle = addAt(g, box(0.045, 0.05, 0.56, C.live), 0, 1.02, 0.2)
      spinners.push({ mesh: needle, speed: 0.12 })
      break
    }
    case 'emeter': {
      addBase(g, 0.72)
      addAt(g, box(1.05, 1.35, 0.68, C.body), 0, 0.83, 0)
      addAt(g, box(0.86, 0.5, 0.04, C.panel), 0, 1.12, 0.36) // 显示面板
      addAt(g, box(0.5, 0.04, 0.03, C.dark), 0, 1.12, 0.39)
      // 三相指示灯
      for (let i = 0; i < 3; i++) {
        const lamp = addAt(g, new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), mat(C.green, { emissive: C.green, emissiveIntensity: 0.5 })), -0.22 + i * 0.22, 0.72, 0.36)
        pulses.push({ mesh: lamp as THREE.Mesh, phase: i * 0.9 })
      }
      addAt(g, box(0.06, 0.22, 0.05, C.dark), 0.36, 0.75, 0.37) // 门把手
      break
    }
    case 'pt': {
      addBase(g, 0.5)
      addAt(g, cyl(0.14, 0.2, 1.1, C.body, 14), 0, 0.68, 0)
      addAt(g, cyl(0.3, 0.3, 0.36, C.panel, 16), 0, 1.36, 0) // 显示头
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 18), mat(C.body)); ring.rotation.x = Math.PI / 2; ring.position.y = 1.36; ring.position.z = 0.19; g.add(ring)
      break
    }
    case 'env': {
      addBase(g, 0.55)
      addAt(g, box(0.62, 1.5, 0.5, C.body), 0, 0.9, 0)
      addAt(g, box(0.72, 0.14, 0.6, C.dark), 0, 1.68, 0)
      // 三探头（温度/湿度/CO2，常态暗色）
      for (let i = 0; i < 3; i++) {
        addAt(g, new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), mat([C.live, C.green, C.body][i])), -0.2 + i * 0.2, 1.25, 0.28)
      }
      addAt(g, box(0.4, 0.22, 0.03, C.panel), 0, 0.95, 0.27)
      break
    }
    case 'pump': {
      addBase(g, 0.6)
      addAt(g, cyl(0.46, 0.46, 0.55, C.body, 20), 0, 0.42, 0)
      const imp = addAt(g, cyl(0.34, 0.34, 0.1, C.dark, 16), 0, 0.74, 0)
      spinners.push({ mesh: imp, speed: 1.1 })
      const outlet = addAt(g, cyl(0.13, 0.13, 0.5, C.dark, 12), 0.5, 0.55, 0); outlet.rotation.z = Math.PI / 2
      break
    }
    case 'tank': {
      addBase(g, 0.8)
      addAt(g, cyl(0.72, 0.72, 1.8, C.body, 24), 0, 1.06, 0)
      const level = addAt(g, cyl(0.7, 0.7, 1, C.live, 24, { transparent: true, opacity: 0.75 }), 0, 0.6, 0)
      g.userData.level = level
      addAt(g, cyl(0.74, 0.74, 0.06, C.dark, 24), 0, 1.98, 0)
      break
    }
    default: break
  }

  // 选中框（点击后显示）+ 报警光环
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 8, 24), mat(C.body))
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.2; halo.visible = false; g.add(halo); g.userData.halo = halo
  const sel = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.03, 6, 24), mat(C.live, { emissive: C.live, emissiveIntensity: 0.4 }))
  sel.rotation.x = -Math.PI / 2; sel.position.y = 0.22; sel.visible = false; g.add(sel); g.userData.sel = sel

  g.scale.setScalar(2.0)
  g.traverse((o) => { if (o instanceof THREE.Mesh) pickables.push(o) })
  return g
}

/** 区域厂房：地面色块 + 边框 + 四角立柱（用线框感表达"区域"，不写实） */
function addArea(scene: THREE.Scene, n: SceneNode): void {
  const s = n.scale ?? 1, w = 10 * s, d = 10 * s
  // 区域底色调（低饱和灰蓝/灰绿，仅用于空间分区，不是报警色）
  const tints: Record<string, number> = { 'area-water': 0xdfe8ee, 'area-power': 0xe8e3f0, 'area-gas': 0xe2ebe2, 'area-env': 0xeae7df }
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(tints[n.id] ?? C.floor))
  pad.rotation.x = -Math.PI / 2; pad.position.set(n.pos[0], n.pos[1], n.pos[2]); scene.add(pad)
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.02, d)),
    new THREE.LineBasicMaterial({ color: C.wall, transparent: true, opacity: 0.75 }),
  )
  edge.position.set(n.pos[0], n.pos[1] + 0.02, n.pos[2]); scene.add(edge)
  // 四角立柱 + 顶部细框（厂房轮廓）
  const h = 2.6
  for (const [sx, sz] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
    const post = box(0.12, h, 0.12, C.frame)
    post.position.set(n.pos[0] + sx*w/2, h/2, n.pos[2] + sz*d/2); scene.add(post)
  }
  const top = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.01, d)),
    new THREE.LineBasicMaterial({ color: C.frame, transparent: true, opacity: 0.5 }),
  )
  top.position.set(n.pos[0], h, n.pos[2]); scene.add(top)
}

function makeLink(l: { from: string; to: string; kind: string; flow?: string }): THREE.Group | null {
  const a = doc.nodes.find((x) => x.id === l.from), b = doc.nodes.find((x) => x.id === l.to)
  if (!a || !b) return null
  const grp = new THREE.Group()
  const p1 = new THREE.Vector3(a.pos[0], 0.6, a.pos[2]), p2 = new THREE.Vector3(b.pos[0], 0.6, b.pos[2])
  const dir = p2.clone().sub(p1), len = dir.length()
  const r = l.kind === 'pipe' ? 0.12 : 0.07
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat(l.kind === 'pipe' ? C.body : C.live))
  pipe.position.copy(p1.clone().add(p2).multiplyScalar(0.5))
  pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  grp.add(pipe)
  // 两端法兰
  for (const p of [p1, p2]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(r*1.5, r*1.5, 0.08, 12), mat(C.dark))
    f.position.copy(p); f.quaternion.copy(pipe.quaternion); grp.add(f)
  }
  if (l.flow) { pulses.push({ mesh: pipe, phase: 0 }); grp.userData.flow = l.flow }
  return grp
}

function buildScene(): void {
  if (!scene) return
  for (const g of devices.values()) scene.remove(g)
  devices.clear(); spinners.length = 0; pulses.length = 0; pickables.length = 0
  // 清空非设备装饰（保留光源）
  for (const o of [...scene.children]) if (!(o instanceof THREE.Light)) scene.remove(o)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), mat(C.floor))
  floor.rotation.x = -Math.PI / 2; scene.add(floor)
  const grid = new THREE.GridHelper(70, 70, 0xccd3da, 0xdde2e7); grid.position.y = 0.005; scene.add(grid)
  // 厂区围墙
  const wh = 1.1
  for (const [x, z, w, d] of [[0,-25,70,0.25],[0,25,70,0.25],[-35,0,0.25,50],[35,0,0.25,50]] as number[][]) {
    const wall = box(w, wh, d, C.wall)
    wall.position.set(x, wh / 2, z)
    scene.add(wall)
  }
  // 主道路（十字）
  const road1 = new THREE.Mesh(new THREE.PlaneGeometry(66, 2.4), mat(C.road)); road1.rotation.x = -Math.PI/2; road1.position.y = 0.012; scene.add(road1)
  const road2 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 46), mat(C.road)); road2.rotation.x = -Math.PI/2; road2.position.y = 0.012; scene.add(road2)

  for (const n of doc.nodes) {
    if (n.kind === 'floor') { if (n.id !== 'floor') addArea(scene, n); continue }
    const g = makeDevice(n); devices.set(n.id, g); scene.add(g)
  }
  for (const l of doc.links) { const m = makeLink(l); if (m) scene.add(m) }
}

// ---- 渲染循环 ----
function animate(t: number): void {
  raf = requestAnimationFrame(animate)
  if (!renderer || !scene || !camera || !controls) return
  last = t
  controls.update()
  let dirty = false
  // 动画限速 ~20fps：静止场景不再每帧全速重绘（省电，也让软件渲染可截图）
  if (t - (lastAnim ?? 0) > 50) {
    const adt = Math.min((t - (lastAnim ?? t)) / 1000, 0.1); lastAnim = t
    for (const s of spinners) { s.mesh.rotation.y += s.speed * adt; dirty = true }
    for (const p of pulses) {
      const m = p.mesh.material as THREE.MeshStandardMaterial
      m.emissive.setHex(C.live); m.emissiveIntensity = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(t / 500 + p.phase))
      dirty = true
    }
  }
  if (dirty && !document.hidden) {
    renderer.render(scene, camera)
    ;(window as unknown as { __threeDemoRenderInfo?: unknown }).__threeDemoRenderInfo = {
      calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    }
    updateLabels()
  }
  frames++
  if (t - fpsT > 1000) { fps.value = Math.round(frames * 1000 / (t - fpsT)); frames = 0; fpsT = t }
}

/** 屏幕空间标签：短位号 + 关键值；按 y 排序做简单排斥防重叠 */
function updateLabels(): void {
  if (!renderer || !camera) return
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight
  const out: Array<{ id: string; text: string; value: string; x: number; y: number; prio: number }> = []
  for (const n of doc.nodes) {
    if (!n.devId) continue
    if (!devices.has(n.id)) continue
    const v = new THREE.Vector3(n.pos[0], 2.9, n.pos[2]).project(camera)
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue
    const key = n.points?.value ?? ''
    const raw = values.get(key)
    const unit = n.kind === 'emeter' ? 'kW' : (n.kind === 'env' ? '°C' : (n.kind === 'pt' ? 'MPa' : 'm³/h'))
    out.push({
      id: n.id,
      text: (n.label ?? n.id).split(' ')[0], // 只取位号 WM-101
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

// ---- SSE → 几何状态 ----
function applyPoint(p: RtPoint): void {
  const n = typeof p.value === 'number' ? p.value : (p.value == null ? NaN : Number(p.value))
  if (Number.isFinite(n)) values.set(p.field, n)
  const m = /^(dev_[a-z0-9]+)\.__prio$/.exec(p.field)
  if (m) {
    const v = Math.max(0, Math.min(4, Number(p.value) || 0))
    prios.set(m[1], v)
    const g = devices.get(m[1])
    if (g) {
      const halo = g.userData.halo as THREE.Mesh | undefined
      if (halo) { halo.visible = v > 0; (halo.material as THREE.MeshStandardMaterial).color.setHex(PRIO[v] ?? C.body) }
    }
  }
  // 数值驱动：液位 / 指示灯 / 指针速度
  for (const d of devices.values()) {
    const pv = d.userData.devid as string
    const f = doc.nodes.find((x) => x.devId === pv)?.points?.value
    if (!f || !values.has(f)) continue
    const v = values.get(f)!
    const level = d.userData.level as THREE.Mesh | undefined
    if (level) { const hh = Math.max(0.1, Math.min(1.8, v / 100 * 1.8)); level.scale.y = hh; level.position.y = 0.6 + hh / 2 }
    spinners.forEach((s) => { if (d.getObjectById(s.mesh.id) && s.speed < 0.3) s.speed = 0.08 + Math.min(v, 50) / 200 })
  }
  if (renderer && scene && camera) renderer.render(scene, camera)
}

function connect(): void {
  const devs = devsOf(doc)
  if (!devs.length) return
  stream = createRtdataStream({
    devs, interval: 1000, onPoint: applyPoint,
    onState: (s) => { status.value = s === 'online' ? '实时' : s === 'offline' ? '离线' : '重连中…' },
  })
}

// ---- 拾取（拖拽不误触）与跳转 ----
function kindToFaceplate(kind: string): string {
  if (['flowmeter', 'pump', 'tank'].includes(kind)) return 'iot-faceplate-water'
  if (kind === 'gasmeter') return 'iot-faceplate-gas'
  if (kind === 'emeter') return 'iot-faceplate-power'
  return 'iot-faceplate-env'
}
function openDevice(devid: string): void {
  const n = doc.nodes.find((x) => x.id === devid)
  selected.value = devid
  for (const [id, g] of devices) { const s = g.userData.sel as THREE.Mesh | undefined; if (s) s.visible = id === devid }
  const target = `/view/${kindToFaceplate(n?.kind ?? '')}?dev=${devid}`
  void router.push(target)
}
function pick(ev: PointerEvent): void {
  if (!down || !renderer || !camera) return
  if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return // 拖拽，不拾取
  const r = renderer.domElement.getBoundingClientRect()
  pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
  picking = picking ?? new THREE.Raycaster()
  picking.setFromCamera(pointer, camera)
  const hits = picking.intersectObjects(pickables, false)
  if (!hits.length) return
  let o: THREE.Object3D | null = hits[0].object
  while (o && !o.userData.devid) o = o.parent
  const devid = o?.userData.devid as string | undefined
  if (devid) openDevice(devid)
}

// ---- 生命周期 ----
onMounted(async () => {
  try {
    const r = await api().get(`/api/v1/screens/${slug.value}`) as { doc?: unknown } | undefined
    const c = r?.doc ?? r
    if (c && isScene3D(c)) doc = c as SceneDoc
  } catch { /* 回退内置 demo */ }
  alarmCount.value = doc.nodes.filter((n) => n.devId).length
  if (!host.value) return

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(C.bg)
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY } })
  renderer.domElement.addEventListener('pointerup', pick)
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); status.value = 'WebGL 上下文丢失' })
  host.value.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(C.bg)
  scene.fog = new THREE.Fog(C.bg, 55, 130)
  const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(24, 34, 18); scene.add(sun)
  scene.add(new THREE.HemisphereLight(0xffffff, 0xaab4be, 1.0))

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400)
  camera.position.set(26, 15, 28)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 1, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.maxPolarAngle = Math.PI / 2.15   // 不到地平线以下
  controls.minPolarAngle = 0.15
  controls.minDistance = 8
  controls.maxDistance = 100
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
  controls.update()
  buildScene()

  const resize = () => {
    if (!renderer || !camera || !host.value) return
    const w = host.value.clientWidth, h = host.value.clientHeight
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix()
    renderer.render(scene!, camera); updateLabels()
  }
  ro = new ResizeObserver(resize); ro.observe(host.value); resize()
  last = performance.now(); fpsT = last
  if (!still.value) raf = requestAnimationFrame(animate)
  else { renderer.render(scene!, camera!); updateLabels() }
  connect()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf); ro?.disconnect(); stream?.close(); controls?.dispose()
  if (renderer) {
    scene?.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose()
        const m = o.material as THREE.Material | THREE.Material[]
        if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m.dispose()
      }
    })
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
        class="dev-label" :class="['prio-' + l.prio, { selected: selected === l.id }]"
        :style="{ left: l.x + 'px', top: l.y + 'px' }"
        @click="openDevice(l.id)"
      ><span class="tag">{{ l.text }}</span><span class="val">{{ l.value }}</span></button>
    </div>
    <div class="hint">
      <b>左键拖动</b> 旋转 · <b>右键拖动</b> 平移 · <b>滚轮</b> 缩放 · <b>单击设备/标签</b> 进入 2D 面板
    </div>
  </div>
</template>

<style scoped>
.scene3d-page { width: 100vw; height: 100vh; display: flex; flex-direction: column; background: #eef1f4; }
.bar { height: 52px; flex: 0 0 52px; display: flex; align-items: center; gap: 18px; padding: 0 20px; background: #fff; border-bottom: 1px solid #d9e0e6; }
.back { border: 1px solid #b9c2ca; background: #fff; border-radius: 5px; padding: 6px 10px; cursor: pointer; font-size: 13px; color: #3d4752; }
.title { font-size: 16px; font-weight: 600; color: #1f2328; }
.badges { margin-left: auto; display: flex; gap: 8px; }
.badge { font-size: 12px; color: #5b6570; background: #eef1f4; border-radius: 4px; padding: 4px 8px; }
.stage { flex: 1; min-height: 0; position: relative; overflow: hidden; }
.stage :deep(canvas) { display: block; width: 100%; height: 100%; }
.dev-label {
  position: absolute; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 6px;
  white-space: nowrap; font-size: 11px; padding: 4px 7px; border: 1px solid #aab4be;
  background: rgba(255,255,255,.94); color: #1f2328; border-radius: 4px; cursor: pointer;
  box-shadow: 0 2px 6px rgba(40,55,70,.12); font-variant-numeric: tabular-nums;
}
.dev-label .tag { font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dev-label .val { color: #1f4e79; }
.dev-label:hover { border-color: #1f4e79; }
.dev-label.selected { outline: 2px solid #1f4e79; outline-offset: 1px; }
.dev-label.prio-1 { border-color: #d32f2f; color: #d32f2f; }
.dev-label.prio-1 .val { color: #d32f2f; }
.dev-label.prio-2 { border-color: #f57c00; color: #b35a00; }
.dev-label.prio-3 { border-color: #d9a800; color: #8a6f00; }
.dev-label.prio-4 { border-color: #1976d2; color: #1976d2; }
.hint { flex: 0 0 30px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #5b6570; background: #fff; border-top: 1px solid #d9e0e6; }
.hint b { color: #1f4e79; font-weight: 600; }
</style>
