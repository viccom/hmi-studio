/**
 * 程序化几何工厂（从 Scene3DView.vue 抽出）。
 * 视觉纪律（hmi-style-guide §2）：灰阶常态、异常饱和色、flat/matte、禁照片级写实。
 * 与 threejs-demo 的约定一致：每个构建函数返回对象组，拾取列表单独登记（setRaycasterObjects）。
 */
import * as THREE from 'three'
import type { SceneNode } from '../lib/scene3d'

/**
 * 3D 空间层主题令牌——深色科技风（对齐 threejs-demo 参考项目的视觉）。
 * 与 2D 操作层（HP-HMI 灰阶）刻意不同：空间层是态势/导航层，不承载精确读数。
 * 常态深色中性、发光青色网格；饱和色只给报警与选中。
 */
export const C = {
  bg: 0x0b1420, floor: 0x101d2e, road: 0x16283d, wall: 0x1e3448,
  frame: 0x24405a, base: 0x2b4a63, body: 0x6b8299, panel: 0x8fa9c0,
  dark: 0x0a121c, live: 0x1de0ff, green: 0x2ecc71,
  p1: 0xff3b4e, p2: 0xff8c2a, p3: 0xffd23f, p4: 0x3d9dff,
}
export const PRIO_COLOR: Record<number, number> = { 0: C.body, 1: C.p1, 2: C.p2, 3: C.p3, 4: C.p4 }

export interface AnimatedParts {
  spinners: Array<{ mesh: THREE.Object3D; speed: number }>
  pulses: Array<{ mesh: THREE.Mesh; phase: number }>
}

function matte(color: number, o: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, flatShading: true, ...o })
}
function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matte(color))
}
function cyl(rt: number, rb: number, h: number, color: number, seg = 16, o?: THREE.MeshStandardMaterialParameters): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), matte(color, o))
}
function at(g: THREE.Group, m: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh {
  m.position.set(x, y, z); g.add(m); return m
}

/** 设备几何（工厂）；写入 anim 的动画部件，g.userData 带 halo/sel/level */
export function makeDevice(n: SceneNode, anim: AnimatedParts): THREE.Group {
  const g = new THREE.Group()
  g.position.set(n.pos[0], n.pos[1], n.pos[2])
  g.rotation.y = n.rotY ?? 0
  g.userData.devid = n.devId

  switch (n.kind) {
    case 'flowmeter':
    case 'gasmeter': {
      at(g, cyl(0.6, 0.66, 0.16, C.base, 20), 0, 0.08, 0)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.025, 6, 20), matte(C.dark))
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.17; g.add(ring)
      at(g, cyl(0.38, 0.42, 0.72, C.body, 20), 0, 0.52, 0)
      const p1 = at(g, cyl(0.14, 0.14, 0.5, C.dark, 12), -0.5, 0.52, 0); p1.rotation.z = Math.PI / 2
      const p2 = at(g, cyl(0.14, 0.14, 0.5, C.dark, 12), 0.5, 0.52, 0); p2.rotation.z = Math.PI / 2
      at(g, cyl(0.36, 0.36, 0.08, C.panel, 24), 0, 0.95, 0)
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 24), matte(C.dark))
      rim.rotation.x = -Math.PI / 2; rim.position.y = 1.0; g.add(rim)
      const needle = at(g, box(0.045, 0.05, 0.56, C.live), 0, 1.02, 0.2)
      anim.spinners.push({ mesh: needle, speed: 0.12 })
      break
    }
    case 'emeter': {
      at(g, cyl(0.72, 0.8, 0.16, C.base, 20), 0, 0.08, 0)
      at(g, box(1.05, 1.35, 0.68, C.body), 0, 0.83, 0)
      at(g, box(0.86, 0.5, 0.04, C.panel), 0, 1.12, 0.36)
      at(g, box(0.5, 0.04, 0.03, C.dark), 0, 1.12, 0.39)
      for (let i = 0; i < 3; i++) {
        const lamp = at(g, new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), matte(C.green, { emissive: C.green, emissiveIntensity: 0.5 })), -0.22 + i * 0.22, 0.72, 0.36)
        anim.pulses.push({ mesh: lamp, phase: i * 0.9 })
      }
      at(g, box(0.06, 0.22, 0.05, C.dark), 0.36, 0.75, 0.37)
      break
    }
    case 'pt': {
      at(g, cyl(0.5, 0.55, 0.16, C.base, 20), 0, 0.08, 0)
      at(g, cyl(0.14, 0.2, 1.1, C.body, 14), 0, 0.68, 0)
      at(g, cyl(0.3, 0.3, 0.36, C.panel, 16), 0, 1.36, 0)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 18), matte(C.body))
      ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.36, 0.19); g.add(ring)
      break
    }
    case 'env': {
      at(g, cyl(0.55, 0.6, 0.16, C.base, 20), 0, 0.08, 0)
      at(g, box(0.62, 1.5, 0.5, C.body), 0, 0.9, 0)
      at(g, box(0.72, 0.14, 0.6, C.dark), 0, 1.68, 0)
      for (let i = 0; i < 3; i++) {
        at(g, new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), matte([C.live, C.green, C.body][i])), -0.2 + i * 0.2, 1.25, 0.28)
      }
      at(g, box(0.4, 0.22, 0.03, C.panel), 0, 0.95, 0.27)
      break
    }
    case 'pump': {
      at(g, cyl(0.6, 0.66, 0.16, C.base, 20), 0, 0.08, 0)
      at(g, cyl(0.46, 0.46, 0.55, C.body, 20), 0, 0.42, 0)
      const imp = at(g, cyl(0.34, 0.34, 0.1, C.dark, 16), 0, 0.74, 0)
      anim.spinners.push({ mesh: imp, speed: 1.1 })
      const outlet = at(g, cyl(0.13, 0.13, 0.5, C.dark, 12), 0.5, 0.55, 0); outlet.rotation.z = Math.PI / 2
      break
    }
    case 'tank': {
      at(g, cyl(0.8, 0.88, 0.16, C.base, 20), 0, 0.08, 0)
      at(g, cyl(0.72, 0.72, 1.8, C.body, 24), 0, 1.06, 0)
      const level = at(g, cyl(0.7, 0.7, 1, C.live, 24, { transparent: true, opacity: 0.75 }), 0, 0.6, 0)
      g.userData.level = level
      at(g, cyl(0.74, 0.74, 0.06, C.dark, 24), 0, 1.98, 0)
      break
    }
    default: break
  }

  // 报警光环 + 选中圈（外挂，不改设备几何）
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 8, 24), matte(C.body))
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.2; halo.visible = false; g.add(halo)
  g.userData.halo = halo
  const sel = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.03, 6, 24), matte(C.live, { emissive: C.live, emissiveIntensity: 0.4 }))
  sel.rotation.x = -Math.PI / 2; sel.position.y = 0.22; sel.visible = false; g.add(sel)
  g.userData.sel = sel
  g.scale.setScalar(2)
  return g
}

/** 厂房区域：地面色块 + 边框 + 四角立柱（深色场景：底板比地面高一档的暗色，不用浅色板） */
export function makeArea(scene: THREE.Scene, n: SceneNode): void {
  const s = n.scale ?? 1, w = 10 * s, d = 10 * s
  const tints: Record<string, number> = {
    'area-water': 0x16283a, 'area-power': 0x1b2438, 'area-gas': 0x172a2a, 'area-env': 0x2a2830,
  }
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), matte(tints[n.id] ?? 0x16212e))
  pad.rotation.x = -Math.PI / 2; pad.position.set(n.pos[0], n.pos[1], n.pos[2]); scene.add(pad)
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.02, d)),
    new THREE.LineBasicMaterial({ color: C.wall, transparent: true, opacity: 0.75 }),
  )
  edge.position.set(n.pos[0], n.pos[1] + 0.02, n.pos[2]); scene.add(edge)
  const h = 2.6
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const post = box(0.12, h, 0.12, C.frame)
    post.position.set(n.pos[0] + sx * w / 2, h / 2, n.pos[2] + sz * d / 2)
    scene.add(post)
  }
  const top = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.01, d)),
    new THREE.LineBasicMaterial({ color: C.frame, transparent: true, opacity: 0.5 }),
  )
  top.position.set(n.pos[0], h, n.pos[2]); scene.add(top)
}

/** 管线 + 法兰（写到 anim.pulses，flow tag 存在 grp.userData） */
export function makeLink(
  a: SceneNode | undefined, b: SceneNode | undefined,
  kind: string, flow: string | undefined, anim: AnimatedParts,
): THREE.Group | null {
  if (!a || !b) return null
  const grp = new THREE.Group()
  const p1 = new THREE.Vector3(a.pos[0], 0.6, a.pos[2])
  const p2 = new THREE.Vector3(b.pos[0], 0.6, b.pos[2])
  const dir = p2.clone().sub(p1), len = dir.length()
  const r = kind === 'pipe' ? 0.12 : 0.07
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), matte(kind === 'pipe' ? C.body : C.live))
  pipe.position.copy(p1.clone().add(p2).multiplyScalar(0.5))
  pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  grp.add(pipe)
  for (const p of [p1, p2]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.5, r * 1.5, 0.08, 12), matte(C.dark))
    f.position.copy(p); f.quaternion.copy(pipe.quaternion); grp.add(f)
  }
  if (flow) {
    anim.pulses.push({ mesh: pipe, phase: 0 })
    grp.userData.flow = flow
  }
  return grp
}
