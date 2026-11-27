/**
 * 3D 场景文档契约与厂区布局（iot-demo）。
 *
 * 与 maotu 的 IExportJson **完全独立**——3D 空间层不进 2D 画布（hmi-style-guide §0）。
 * 场景文档存 rs-iot 的 screen:* 键族：$schema 判别类型，复用版本化/回滚/乐观锁。
 * 本文件是纯逻辑（无 three、无 DOM），可单测；渲染在 views3d/Scene3DView.vue。
 */

export type DeviceKind = 'flowmeter' | 'gasmeter' | 'emeter' | 'pump' | 'tank' | 'pt' | 'env'
export type Vec3 = [number, number, number]

export interface SceneNode {
  /** 唯一 id（场景内）；设备节点用 devid 作 id，建筑构件用语义名 */
  id: string
  kind: DeviceKind | 'floor' | 'wall' | 'pillar' | 'label'
  /** 绑定的设备 id；空 = 纯建筑构件 */
  devId?: string
  /** 位置（米）；kind=floor 时为地板中心 */
  pos: Vec3
  /** 绕 Y 轴旋转（弧度） */
  rotY?: number
  /** 缩放 */
  scale?: number
  /** 显示名（浮层标签） */
  label?: string
  /** 状态驱动点（SSE 字段：dev.tag） */
  points?: { value?: string; status?: string }
}

export interface SceneLink {
  from: string
  to: string
  kind: 'pipe' | 'cable'
  /** 流量点（有值时沿线跑光带） */
  flow?: string
}

export interface SceneDoc {
  $schema: 'agent-hmi.scene3d/1'
  meta: {
    name: string
    group: string
    unit_m: number
    home: { pos: Vec3; target: Vec3 }
  }
  /** v1：语义节点模型（程序化几何渲染，见 src/modules3d/scene.ts） */
  nodes: SceneNode[]
  links: SceneLink[]
  // ---- v2（编辑器产出，2026-11-26；方案 §4.2）----
  // v1 与 v2 并存不转换：运行页按是否存在 objects 分派渲染路径。
  /** v2：上游 SceneManager 的精简序列化（节点图，含 transform/geometry/material/animation） */
  objects?: readonly unknown[]
  /** v2：场景级配置（灯光/初始视角/环境贴图/节点图等），上游 restoreScene 直接消费 */
  scene?: Record<string, unknown>
  /** v2：hmi-studio 语义层——设备点位绑定 */
  bindings?: readonly SceneBinding[]
  /** v2：hmi-studio 语义层——点击/联动规则 */
  events?: readonly SceneEventRule[]
}

/** v2 绑定：bid → rs-iot 点位（字段规则复用 lib/binds.ts 的 isSyntheticField） */
export interface SceneBinding {
  id: string
  /** 指向 objects[].bid（上游持久节点标识） */
  targetBid: string
  /** rs-iot 点位：`<devid>.<tag>` */
  field: string
  /** 由 field 前段解析，供命令下发反查目标设备 */
  devId: string
  kind: 'color' | 'visible' | 'label' | 'emissive' | 'animationSpeed'
  config: Record<string, unknown>
}

/** v2 事件：点击对象 → 导航/聚焦/设相机/下发命令 */
export interface SceneEventRule {
  id: string
  on: { type: 'click'; targetBid?: string }
  do:
    | { type: 'navigate'; slug: string; dev?: string }
    | { type: 'focus'; targetBid: string }
    | { type: 'setCamera'; view: { position: Vec3; target: Vec3 } }
    | { type: 'command'; targetBid: string; cmd: string; params?: Record<string, unknown> }
}

/** iot-demo 虚构厂区：4 区域分列，设备按 iot-catalog.ts 的 10 台一一对应。 */
export function buildDemoScene(): SceneDoc {
  const nodes: SceneNode[] = []
  const links: SceneLink[] = []

  // 地板与区域基座（灰阶，纯构件）
  nodes.push({ id: 'floor', kind: 'floor', pos: [0, 0, 0], label: 'iot-demo 厂区' })
  const areas: Array<{ id: string; x: number; z: number; w: number; d: number }> = [
    { id: 'water', x: -12, z: -7, w: 12, d: 10 },
    { id: 'power', x: 4, z: -7, w: 12, d: 10 },
    { id: 'gas', x: -12, z: 8, w: 12, d: 9 },
    { id: 'env', x: 6, z: 8, w: 10, d: 9 },
  ]
  for (const a of areas) {
    nodes.push({ id: `area-${a.id}`, kind: 'floor', pos: [a.x, 0.02, a.z], scale: Math.max(a.w, a.d) / 10, label: a.id })
  }

  // 10 台设备（位置在各区域内错开）
  const devices: Array<{ dev: string; kind: DeviceKind; label: string; pos: Vec3; value: string }> = [
    { dev: 'dev_wm1', kind: 'flowmeter', label: 'WM-101 1#水表', pos: [-16, 0, -10], value: 'dev_wm1.flow_rate' },
    { dev: 'dev_wm2', kind: 'flowmeter', label: 'WM-102 2#水表', pos: [-12, 0, -10], value: 'dev_wm2.flow_rate' },
    { dev: 'dev_wm3', kind: 'flowmeter', label: 'WM-103 3#水表', pos: [-8, 0, -10], value: 'dev_wm3.flow_rate' },
    { dev: 'dev_gm1', kind: 'gasmeter', label: 'GM-201 1#燃气表', pos: [-15, 0, 6], value: 'dev_gm1.flow_rate' },
    { dev: 'dev_gm2', kind: 'gasmeter', label: 'GM-202 2#燃气表', pos: [-9, 0, 10], value: 'dev_gm2.flow_rate' },
    { dev: 'dev_em1', kind: 'emeter', label: 'EM-301 1#电表', pos: [0, 0, -10], value: 'dev_em1.active_power' },
    { dev: 'dev_em2', kind: 'emeter', label: 'EM-302 2#电表', pos: [4, 0, -10], value: 'dev_em2.active_power' },
    { dev: 'dev_em3', kind: 'emeter', label: 'EM-303 3#电表', pos: [8, 0, -10], value: 'dev_em3.active_power' },
    { dev: 'dev_env1', kind: 'env', label: 'ENV-401 环境机', pos: [4, 0, 6], value: 'dev_env1.temperature' },
    { dev: 'dev_pt1', kind: 'pt', label: 'PT-501 变送器', pos: [9, 0, 10], value: 'dev_pt1.pressure_1' },
  ]
  for (const d of devices) {
    nodes.push({
      id: d.dev, kind: d.kind, devId: d.dev, pos: d.pos,
      label: d.label, points: { value: d.value, status: `${d.dev}.status` },
    })
  }

  // 管线/线缆：水表串联、燃气表、电表进线、环境独立
  links.push({ from: 'dev_wm1', to: 'dev_wm2', kind: 'pipe', flow: 'dev_wm1.flow_rate' })
  links.push({ from: 'dev_wm2', to: 'dev_wm3', kind: 'pipe', flow: 'dev_wm2.flow_rate' })
  links.push({ from: 'dev_gm1', to: 'dev_gm2', kind: 'pipe', flow: 'dev_gm1.flow_rate' })
  links.push({ from: 'dev_em1', to: 'dev_em2', kind: 'cable', flow: 'dev_em1.active_power' })
  links.push({ from: 'dev_em2', to: 'dev_em3', kind: 'cable', flow: 'dev_em2.active_power' })

  return {
    $schema: 'agent-hmi.scene3d/1',
    meta: {
      name: 'iot-demo 全厂 3D 空间总览',
      group: '空间层',
      unit_m: 1,
      home: { pos: [15, 11, 17], target: [-2, 1, -1] },
    },
    nodes,
    links,
  }
}

/** 场景文档 → SSE 订阅字段集（设备 point 字段 + 流量字段 + 报警合成字段） */
export function bindFieldsOf(doc: SceneDoc): string[] {
  const out = new Set<string>()
  for (const n of doc.nodes) {
    if (n.points?.value) out.add(n.points.value)
    if (n.points?.status) out.add(n.points?.status)
    if (n.devId) out.add(`${n.devId}.__prio`) // 合成报警优先级（宿主推送，不进订阅面）
  }
  for (const l of doc.links) if (l.flow) out.add(l.flow)
  return [...out].sort()
}

/** 场景文档 → 涉及的 dev id 集（SSE subscribe 参数） */
export function devsOf(doc: SceneDoc): string[] {
  return [...new Set(doc.nodes.filter((n) => n.devId).map((n) => n.devId!))].sort()
}

/** 是否 3D 场景文档（列表分区用） */
export function isScene3D(doc: unknown): boolean {
  return !!doc && typeof doc === 'object' && (doc as SceneDoc).$schema === 'agent-hmi.scene3d/1'
}
