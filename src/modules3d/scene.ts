/**
 * 场景装配：场景文档 → three 对象图（从 Scene3DView.vue 抽出）。
 * 与 threejs-demo 的约定一致：装配完调用 viewer.setRaycasterObjects(pickables)，
 * 拾取范围只包含可交互设备，不扫全场景。
 */
import * as THREE from 'three'
import type Viewer from './Viewer'
import { C, makeArea, makeDevice, makeLink, type AnimatedParts } from './geometry'
import type { SceneDoc } from '../lib/scene3d'

export interface SceneRuntime {
  devices: Map<string, THREE.Group>
  anim: AnimatedParts
  spinners: Array<{ mesh: THREE.Object3D; speed: number }>
  pulses: Array<{ mesh: THREE.Mesh; phase: number }>
}

/** 装配（先清空旧对象，再建地面/围墙/道路/区域/设备/管线），返回运行时引用 */
export function buildScene(viewer: Viewer, doc: SceneDoc): SceneRuntime {
  const scene = viewer.scene
  const anim: AnimatedParts = { spinners: [], pulses: [] }
  const devices = new Map<string, THREE.Group>()
  const pickables: THREE.Object3D[] = []

  // 清空上一场景（保留光源；引擎重建时也无所谓）
  for (const o of [...scene.children]) if (!(o instanceof THREE.Light)) scene.remove(o)

  // 地面 + 网格 + 围墙 + 十字道路
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), new THREE.MeshStandardMaterial({ color: C.floor, roughness: 1 }))
  floor.rotation.x = -Math.PI / 2; scene.add(floor)
  // 发光青色网格（threejs-demo 的标志性视觉：深色底 + 青色发光线）
  const grid = new THREE.GridHelper(70, 70, 0x1de0ff, 0x123a52)
  grid.position.y = 0.005
  ;(grid.material as THREE.Material).transparent = true
  ;(grid.material as THREE.Material).opacity = 0.55
  scene.add(grid)
  const wh = 1.1
  for (const [x, z, w, d] of [[0, -25, 70, 0.25], [0, 25, 70, 0.25], [-35, 0, 0.25, 50], [35, 0, 0.25, 50]] as number[][]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wh, d), new THREE.MeshStandardMaterial({ color: C.wall, roughness: 1 }))
    wall.position.set(x, wh / 2, z); scene.add(wall)
  }
  for (const [w, d] of [[66, 2.4], [2.4, 46]] as number[][]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: C.road, roughness: 1 }))
    road.rotation.x = -Math.PI / 2; road.position.y = 0.012; scene.add(road)
  }

  for (const n of doc.nodes) {
    if (n.kind === 'floor') { if (n.id !== 'floor') makeArea(scene, n); continue }
    const g = makeDevice(n, anim)
    devices.set(n.id, g)
    scene.add(g)
    g.traverse((o) => { if (o instanceof THREE.Mesh) pickables.push(o) })
  }
  for (const l of doc.links) {
    const grp = makeLink(
      doc.nodes.find((x) => x.id === l.from), doc.nodes.find((x) => x.id === l.to),
      l.kind, l.flow, anim,
    )
    if (grp) scene.add(grp)
  }

  // 关键：拾取只在设备几何上（threejs-demo 同款 setRaycasterObjects）
  viewer.setRaycasterObjects(pickables)
  return { devices, anim, spinners: anim.spinners, pulses: anim.pulses }
}

/** 动画回调工厂（交给 viewer.addAnimate，每帧统一执行） */
export function animateRuntime(rt: SceneRuntime): (now: number) => void {
  let lastAnim = 0
  return (now: number) => {
    if (now - lastAnim < 50) return // 限速 ~20fps，省电
    const adt = Math.min((now - (lastAnim || now)) / 1000, 0.1)
    lastAnim = now
    for (const s of rt.spinners) s.mesh.rotation.y += s.speed * adt
    for (const p of rt.pulses) {
      const m = p.mesh.material as THREE.MeshStandardMaterial
      m.emissive.setHex(C.live)
      m.emissiveIntensity = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(now / 500 + p.phase))
    }
  }
}
