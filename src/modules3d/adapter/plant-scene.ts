/**
 * 厂区 DEMO 场景生成器（`iot-plant-3d`）——v1 语义模型 → **v2 编辑器产物形态**。
 *
 * 背景（2026-11-27）：`iot-plant-3d` 是 3D 组态编辑器落地**之前**的 DEMO，文档形态
 * 是 v1（`nodes`/`links` 语义节点 + 程序化几何渲染，见 `scene.ts`/`geometry.ts`）。
 * 新编辑器与新运行页消费的是 v2 形态（上游 SceneManager 的 `objects` 节点图 +
 * hmi-studio 语义层 `bindings`/`events`），于是这个场景在新编辑器里是空的、
 * 在新运行页里也走不到 v2 渲染路径（`Scene3DHost` 按是否存在 `objects` 分派）。
 *
 * 本模块把它**重做**成 v2：
 *   - 设备改用工业图元库（`./industrial-parts.ts`）——与编辑器「物料库」同一份规格，
 *     从物料库再拖一台水表进来尺寸一致，不会大小不一；
 *   - 每个子件是**独立对象**（独立 bid）：上游按对象序列化，Group 会把子件的
 *     bid/几何吞掉（见 vendor `PATCHES.md` PATCH-05），子件独立才能单独绑点位；
 *   - 对象字段形状与上游 `PersistenceManager.serializeObject` 完全一致（vendor core），
 *     因此编辑器能原样加载 → 编辑 → 保存，往返保真；
 *   - 语义层：每台设备一条**发光绑定**（状态灯随实测值亮）+ 一条**数值标签绑定**
 *     （设备上方浮出实时读数），每条管线一条**流量发光绑定**；
 *     每台设备一条**点击事件**（跳对应 2D 设备面板，沿用 v1 DEMO 的「进入 2D 设备面板」）。
 *
 * 位置约定：**1× 原生尺寸**（工业图元库规格，与编辑器拖入一致），因此设备间距
 * 收紧到 ~3 m，区域底板相应缩小（v1 DEMO 设备是 2× 缩放的观感，不沿用）。
 *
 * 纯逻辑（无 three 运行时依赖——只用 three 的数学做管线朝向换算），可单测；
 * 迁移执行见 `scripts/migrate-plant-scene.ts`。
 */
import * as THREE from 'three'
import { partById, type PartSpec } from './industrial-parts'
import { faceplateSlug, tagOf } from '../../screen-assets/iot-catalog'
import type { SceneBinding, SceneDoc, SceneEventRule, Vec3 } from '../scene3d'

/** 空间层色板（与 `geometry.ts` 的 C 同源——HP-HMI 灰阶，饱和色只给状态件） */
const C = {
  floor: 0x101d2e,
  frame: 0x24405a,
  body: 0x6b8299,
  live: 0x1de0ff,
  area: {
    water: 0x16283a,
    power: 0x1b2438,
    gas: 0x172a2a,
    env: 0x2a2830,
  },
} as const

/** 场景名与分组（沿用 v1 DEMO 的命名，列表页与 2D 引用一致） */
const SCENE_NAME = 'iot-demo 全厂 3D 空间总览'
const SCENE_GROUP = '空间层'

/** 厂区地面（米） */
const GROUND = { w: 30, d: 22 } as const

/** 四个区域底板（分区：供水 / 配电 / 燃气 / 环境） */
const AREAS = [
  { id: 'water', name: '水区', x: -6.5, z: -5, w: 9, d: 6 },
  { id: 'power', name: '配电区', x: 6.5, z: -5, w: 9, d: 6 },
  { id: 'gas', name: '燃气区', x: -6.5, z: 5, w: 7.5, d: 5 },
  { id: 'env', name: '环境区', x: 6.5, z: 5, w: 7.5, d: 5 },
] as const

/** 10 台设备（位置沿用 v1 DEMO 的分区意图，间距收紧到 1× 尺寸） */
const DEVICES = [
  { devid: 'dev_wm1', part: 'water-meter', label: 'WM-101 1#水表', pos: [-9.5, 0, -5], tag: 'flow_rate' },
  { devid: 'dev_wm2', part: 'water-meter', label: 'WM-102 2#水表', pos: [-6.5, 0, -5], tag: 'flow_rate' },
  { devid: 'dev_wm3', part: 'water-meter', label: 'WM-103 3#水表', pos: [-3.5, 0, -5], tag: 'flow_rate' },
  { devid: 'dev_em1', part: 'power-meter', label: 'EM-301 1#电表', pos: [3.5, 0, -5], tag: 'active_power' },
  { devid: 'dev_em2', part: 'power-meter', label: 'EM-302 2#电表', pos: [6.5, 0, -5], tag: 'active_power' },
  { devid: 'dev_em3', part: 'power-meter', label: 'EM-303 3#电表', pos: [9.5, 0, -5], tag: 'active_power' },
  { devid: 'dev_gm1', part: 'gas-meter', label: 'GM-201 1#燃气表', pos: [-8, 0, 5], tag: 'flow_rate' },
  { devid: 'dev_gm2', part: 'gas-meter', label: 'GM-202 2#燃气表', pos: [-5, 0, 5], tag: 'flow_rate' },
  { devid: 'dev_env1', part: 'env-sensor', label: 'ENV-401 环境机', pos: [5, 0, 5], tag: 'temperature' },
  { devid: 'dev_pt1', part: 'pressure-transmitter', label: 'PT-501 变送器', pos: [8, 0, 5], tag: 'pressure_1' },
] as const

/**
 * 每个图元的「主体件」（发光/标签绑定目标）与「可点击件」（点击跳 2D 面板）。
 *
 * 为什么每个设备有多个可点击件：v2 里一台设备是**若干独立对象**（子件各一个 bid），
 * 点到哪一件取决于射线命中——只给主体件挂规则的话，点中面板/接管只会「聚焦」而
 * 不跳转，操作员会觉得「有的地方能点、有的地方不能」。故把视觉上会点到的主要件
 * 都挂上同一条跳转规则（底座/铭牌/指示灯这类小件不挂，命中它们走聚焦兜底）。
 */
const PART_ANCHOR: Record<string, { main: string; lamp: string; clickable: string[] }> = {
  'water-meter': { main: '表体', lamp: '状态灯', clickable: ['表体', '表盘'] },
  'gas-meter': { main: '表体', lamp: '状态灯', clickable: ['表体', '表盘'] },
  'power-meter': { main: '柜体', lamp: '指示灯A', clickable: ['柜体', '面板'] },
  'env-sensor': { main: '机体', lamp: '探头温', clickable: ['机体', '显示屏'] },
  'pressure-transmitter': { main: '表头', lamp: '表头', clickable: ['表头', '支杆'] },
}

/** 管线 / 电缆（沿用 v1 DEMO 的连接关系；flow = 管线上的流量点） */
const LINKS = [
  { from: 'dev_wm1', to: 'dev_wm2', kind: 'pipe' as const, flow: 'dev_wm1.flow_rate' },
  { from: 'dev_wm2', to: 'dev_wm3', kind: 'pipe' as const, flow: 'dev_wm2.flow_rate' },
  { from: 'dev_gm1', to: 'dev_gm2', kind: 'pipe' as const, flow: 'dev_gm1.flow_rate' },
  { from: 'dev_em1', to: 'dev_em2', kind: 'cable' as const, flow: 'dev_em1.active_power' },
  { from: 'dev_em2', to: 'dev_em3', kind: 'cable' as const, flow: 'dev_em2.active_power' },
] as const

/** 初始视角（米）——与 `meta.home` 一致，编辑器/运行页都按它定相机 */
const HOME = { pos: [10.5, 6.5, 10.5] as Vec3, target: [0, 0.6, 0] as Vec3 }

/** 上游支持的基础几何（`deserializeObject` 的 if 分支集合）——生成器只允许这几种 */
export const SUPPORTED_GEOMETRIES = [
  'BoxGeometry',
  'CylinderGeometry',
  'ConeGeometry',
  'SphereGeometry',
  'PlaneGeometry',
] as const

/** v2 对象（形状对齐上游 `serializeObject` 的产物） */
export interface PlantObject {
  id: string
  bid: string
  type: string
  name: string
  visible: boolean
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
  geometry: { type: string; parameters: Record<string, number | boolean> }
  material: Record<string, unknown>
}

/** devid → 短标识（bid 用：`plant_wm1_02`） */
const shortOf = (devid: string): string => devid.replace(/^dev_/, '')

/** 材质：与上游 deserializeObject 消费的字段对齐（缺省值由上游兜底） */
function materialOf(spec: PartSpec['material']): Record<string, unknown> {
  return {
    color: spec.color,
    roughness: spec.roughness ?? 0.85,
    metalness: spec.metalness ?? 0.05,
    emissive: spec.emissive ?? 0x000000,
    emissiveIntensity: spec.emissiveIntensity ?? 1,
    opacity: spec.opacity ?? 1,
    transparent: spec.transparent ?? false,
  }
}

/** 几何参数：补齐上游需要的缺省段数（undefined 也会被 three 默认值兜住，这里写实） */
function geometryOf(spec: PartSpec): { type: string; parameters: Record<string, number | boolean> } {
  const p = { ...spec.geometry.parameters }
  if (spec.geometry.type === 'BoxGeometry') {
    p.widthSegments = p.widthSegments ?? 1
    p.heightSegments = p.heightSegments ?? 1
    p.depthSegments = p.depthSegments ?? 1
  } else if (spec.geometry.type === 'PlaneGeometry') {
    p.widthSegments = p.widthSegments ?? 1
    p.heightSegments = p.heightSegments ?? 1
  }
  return { type: spec.geometry.type, parameters: p }
}

/** 设备 → 它的全部子件对象（每个子件一个独立 bid） */
function deviceObjects(dev: (typeof DEVICES)[number]): PlantObject[] {
  const part = partById(dev.part)
  if (!part) throw new Error(`plant-scene: 未知工业图元 ${dev.part}`)
  const short = shortOf(dev.devid)
  return part.specs.map((spec, i) => {
    const bid = `plant_${short}_${String(i + 1).padStart(2, '0')}`
    return {
      id: bid,
      bid,
      type: spec.geometry.type,
      name: `${dev.label}/${spec.name}`,
      visible: true,
      position: {
        x: dev.pos[0] + spec.position[0],
        y: dev.pos[1] + spec.position[1],
        z: dev.pos[2] + spec.position[2],
      },
      rotation: {
        x: spec.rotation?.[0] ?? 0,
        y: spec.rotation?.[1] ?? 0,
        z: spec.rotation?.[2] ?? 0,
      },
      scale: { x: 1, y: 1, z: 1 },
      geometry: geometryOf(spec),
      material: materialOf(spec.material),
    }
  })
}

/** 两点间管线的朝向（圆柱默认沿 Y 轴，需转到连线方向） */
function pipeRotation(from: Vec3, to: Vec3): { x: number; y: number; z: number } {
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2])
  if (dir.lengthSq() === 0) return { x: 0, y: 0, z: 0 }
  dir.normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  const e = new THREE.Euler().setFromQuaternion(q)
  return { x: e.x, y: e.y, z: e.z }
}

/** 管线（+ 两端法兰）：从设备中心连到设备中心，抬高 0.55 m */
function linkObjects(link: (typeof LINKS)[number], byDev: Map<string, Vec3>): PlantObject[] {
  const a = byDev.get(link.from)
  const b = byDev.get(link.to)
  if (!a || !b) throw new Error(`plant-scene: 管线端点缺失 ${link.from}→${link.to}`)
  const p1: Vec3 = [a[0], 0.55, a[2]]
  const p2: Vec3 = [b[0], 0.55, b[2]]
  const len = Math.hypot(p2[0] - p1[0], p2[2] - p1[2])
  const r = link.kind === 'pipe' ? 0.09 : 0.05
  const rot = pipeRotation(p1, p2)
  const mid: Vec3 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2]
  const cyl = (radius: number, height: number, at: Vec3, tag: string): PlantObject => {
    const bid = `plant_link_${shortOf(link.from)}_${shortOf(link.to)}_${tag}`
    return {
      id: bid,
      bid,
      type: 'CylinderGeometry',
      name: `${link.kind === 'pipe' ? '水管' : '电缆'} ${link.from}→${link.to}${tag === 'pipe' ? '' : ` ${tag}`}`,
      visible: true,
      position: { x: at[0], y: at[1], z: at[2] },
      rotation: rot,
      scale: { x: 1, y: 1, z: 1 },
      geometry: {
        type: 'CylinderGeometry',
        parameters: {
          radiusTop: radius,
          radiusBottom: radius,
          height,
          radialSegments: 12,
          heightSegments: 1,
          openEnded: false,
          thetaStart: 0,
          thetaLength: Math.PI * 2,
        },
      },
      material: {
        color: link.kind === 'pipe' ? C.body : C.live,
        roughness: 0.7,
        metalness: link.kind === 'pipe' ? 0.25 : 0.1,
        emissive: link.kind === 'pipe' ? 0x000000 : C.live,
        emissiveIntensity: link.kind === 'pipe' ? 1 : 0.6,
        opacity: 1,
        transparent: false,
      },
    }
  }
  return [
    cyl(r, len, mid, 'pipe'),
    cyl(r * 1.5, 0.06, p1, 'flange_a'),
    cyl(r * 1.5, 0.06, p2, 'flange_b'),
  ]
}

/**
 * 生成 `iot-plant-3d` 的 v2 文档。
 *
 * 与 v1 DEMO 的对应关系：15 nodes → 地面 + 4 区域（底板 + 立柱）+ 10 台设备；
 * 5 links → 5 条管线/电缆（含法兰）；设备点位（v1 的 `points.value/status`）
 * → v2 的 `bindings`（发光 + 数值标签）。
 */
export function buildPlantScene(): SceneDoc {
  const objects: PlantObject[] = []
  const bindings: SceneBinding[] = []
  const events: SceneEventRule[] = []

  // 地面（薄板：避免与设备底座 z-fighting）
  objects.push({
    id: 'plant_ground',
    bid: 'plant_ground',
    type: 'BoxGeometry',
    name: '厂区地面',
    visible: true,
    position: { x: 0, y: 0.01, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    geometry: {
      type: 'BoxGeometry',
      parameters: { width: GROUND.w, height: 0.02, depth: GROUND.d, widthSegments: 1, heightSegments: 1, depthSegments: 1 },
    },
    material: { color: C.floor, roughness: 0.95, metalness: 0.02, emissive: 0x000000, emissiveIntensity: 1, opacity: 1, transparent: false },
  })

  // 区域：底板 + 四角立柱（v1 的 makeArea 同款构图）
  for (const area of AREAS) {
    objects.push({
      id: `plant_area_${area.id}`,
      bid: `plant_area_${area.id}`,
      type: 'PlaneGeometry',
      name: `${area.name}底板`,
      visible: true,
      position: { x: area.x, y: 0.03, z: area.z },
      rotation: { x: -Math.PI / 2, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      geometry: {
        type: 'PlaneGeometry',
        parameters: { width: area.w, height: area.d, widthSegments: 1, heightSegments: 1 },
      },
      material: { color: C.area[area.id], roughness: 0.95, metalness: 0.02, emissive: 0x000000, emissiveIntensity: 1, opacity: 1, transparent: false },
    })
    let n = 0
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      n += 1
      const bid = `plant_area_${area.id}_post${n}`
      objects.push({
        id: bid,
        bid,
        type: 'BoxGeometry',
        name: `${area.name}立柱${n}`,
        visible: true,
        position: { x: area.x + (sx * area.w) / 2, y: 1.1, z: area.z + (sz * area.d) / 2 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        geometry: {
          type: 'BoxGeometry',
          parameters: { width: 0.1, height: 2.2, depth: 0.1, widthSegments: 1, heightSegments: 1, depthSegments: 1 },
        },
        material: { color: C.frame, roughness: 0.8, metalness: 0.15, emissive: 0x000000, emissiveIntensity: 1, opacity: 1, transparent: false },
      })
    }
  }

  // 设备：工业图元逐子件展开 + 语义层（发光 / 数值标签 / 点击跳 2D 面板）
  const byDev = new Map<string, Vec3>()
  for (const dev of DEVICES) {
    const part = partById(dev.part)
    const anchor = PART_ANCHOR[dev.part]
    if (!part || !anchor) throw new Error(`plant-scene: 图元 ${dev.part} 缺锚点定义`)
    const objs = deviceObjects(dev)
    objects.push(...objs)
    byDev.set(dev.devid, dev.pos as unknown as Vec3)

    const main = objs.find((o) => o.name.endsWith(`/${anchor.main}`))
    const lamp = objs.find((o) => o.name.endsWith(`/${anchor.lamp}`))
    if (!main || !lamp) throw new Error(`plant-scene: ${dev.devid} 缺 ${anchor.main}/${anchor.lamp} 子件`)

    const field = `${dev.devid}.${dev.tag}`
    const tag = tagOf(dev.devid, dev.tag)
    // 发光强度按量程归一（1.5 = 满量程时的自发光强度）
    const span = Math.max(1, tag.max - tag.min)

    bindings.push({
      id: `bind_${shortOf(dev.devid)}_lamp`,
      targetBid: lamp.bid,
      field,
      devId: dev.devid,
      kind: 'emissive',
      config: { color: C.live, scale: 1.5 / span },
    })
    bindings.push({
      id: `bind_${shortOf(dev.devid)}_label`,
      targetBid: main.bid,
      field,
      devId: dev.devid,
      kind: 'label',
      config: {
        unit: tag.unit,
        precision: tag.dec,
        position: { x: dev.pos[0], y: dev.pos[1] + 1.6, z: dev.pos[2] },
      },
    })
    events.push({
      id: `evt_${shortOf(dev.devid)}_panel`,
      on: { type: 'click', targetBid: main.bid },
      do: { type: 'navigate', slug: faceplateSlug(dev.devid), dev: dev.devid },
    })
    // 同设备的其他可点击件挂同一条跳转规则（见 PART_ANCHOR.clickable 注释）
    for (const sub of anchor.clickable) {
      if (sub === anchor.main) continue
      const obj = objs.find((o) => o.name.endsWith(`/${sub}`))
      if (!obj) continue
      events.push({
        id: `evt_${shortOf(dev.devid)}_${sub}`,
        on: { type: 'click', targetBid: obj.bid },
        do: { type: 'navigate', slug: faceplateSlug(dev.devid), dev: dev.devid },
      })
    }
  }

  // 管线 / 电缆 + 流量发光绑定
  for (const link of LINKS) {
    const objs = linkObjects(link, byDev)
    objects.push(...objs)
    const pipe = objs[0]
    const tag = tagOf(link.flow.split('.')[0], link.flow.split('.')[1])
    const span = Math.max(1, tag.max - tag.min)
    bindings.push({
      id: `bind_${shortOf(link.from)}_${shortOf(link.to)}_flow`,
      targetBid: pipe.bid,
      field: link.flow,
      devId: link.from,
      kind: 'emissive',
      config: { color: C.live, scale: 1.2 / span },
    })
  }

  return {
    $schema: 'agent-hmi.scene3d/1',
    meta: {
      name: SCENE_NAME,
      group: SCENE_GROUP,
      unit_m: 1,
      home: { pos: HOME.pos, target: HOME.target },
    },
    // v1 语义字段留空：运行页按 `objects` 存在与否分派 v2（见 Scene3DHost）
    nodes: [],
    links: [],
    objects,
    scene: {
      lightingConfig: {
        enabled: true,
        ambient: 0.85,
        hemisphere: 1.8,
        key: 3,
        fill: 2,
        head: 1.5,
        azimuth: 45,
        elevation: 55,
        exposure: 1.25,
      },
      initialView: {
        position: { x: HOME.pos[0], y: HOME.pos[1], z: HOME.pos[2] },
        target: { x: HOME.target[0], y: HOME.target[1], z: HOME.target[2] },
      },
      cameraFar: 1000000,
      environmentUrl: null,
      gisConfig: null,
      nodeGraph: [],
      deletedSourceNodes: [],
    },
    bindings,
    events,
  } as unknown as SceneDoc
}
