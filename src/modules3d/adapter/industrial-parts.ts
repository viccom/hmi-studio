/**
 * 工业图元库（P3）：把「一台设备」表达成一组**基础几何子件**。
 *
 * 为什么不用 `modules3d/geometry.ts` 的 `makeDevice`（three Group 工厂）：
 * 上游编辑器的持久化只认参数化基础几何（`BoxGeometry/SphereGeometry/CylinderGeometry/
 * ConeGeometry/PlaneGeometry`）——`deserializeObject` 逐个 if 分支重建。自定义 three 对象
 * 存不进文档，刷新即丢。
 *
 * 因此工业图元 = **spec 列表**：每台设备由若干「几何 + 变换 + 材质」子件描述，
 * 落库时每个子件是一条普通 objects 记录（独立 bid → 可单独绑定点位，例如只给
 * 三色灯绑告警、只给表盘绑流量）。
 *
 * 视觉沿用 HP-HMI 灰阶（`docs/hmi-style-guide.md`）：常态灰蓝、饱和色只给状态件。
 */

/** 子件：一条可落库的基础几何描述 */
export interface PartSpec {
  /** 子件名（会拼成 `<位号>/<子件名>`，便于场景树识别归属） */
  name: string
  geometry: { type: string; parameters: Record<string, number | boolean> }
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
  material: { color: number; roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number; opacity?: number; transparent?: boolean }
}

export interface IndustrialPart {
  id: string
  name: string
  /** 物料库分类（水/电/气/环境/通用） */
  category: 'water' | 'power' | 'gas' | 'env' | 'common'
  /** 子件列表（相对图元原点的局部坐标） */
  specs: PartSpec[]
}

/** HP-HMI 灰阶令牌（与 geometry.ts 的 C 保持一致；饱和色只给状态件） */
const P = {
  base: 0x2b4a63, body: 0x6b8299, panel: 0x8fa9c0, dark: 0x0a121c,
  frame: 0x24405a, live: 0x1de0ff, green: 0x2ecc71, warn: 0xffd23f, p1: 0xff3b4e,
}

const cyl = (rt: number, rb: number, h: number, seg = 20): PartSpec['geometry'] =>
  ({ type: 'CylinderGeometry', parameters: { radiusTop: rt, radiusBottom: rb, height: h, radialSegments: seg, heightSegments: 1, openEnded: false, thetaStart: 0, thetaLength: Math.PI * 2 } })
const box = (w: number, h: number, d: number): PartSpec['geometry'] =>
  ({ type: 'BoxGeometry', parameters: { width: w, height: h, depth: d, widthSegments: 1, heightSegments: 1, depthSegments: 1 } })
const sph = (r: number, seg = 16): PartSpec['geometry'] =>
  ({ type: 'SphereGeometry', parameters: { radius: r, widthSegments: seg, heightSegments: Math.round(seg * 0.75) } })

/** 一台远传水表：底座 + 表体 + 两侧接管 + 表盘 + 状态灯 */
const waterMeter = (): PartSpec[] => [
  { name: '底座', geometry: cyl(0.6, 0.66, 0.16), position: [0, 0.08, 0], material: { color: P.base, roughness: 0.85, metalness: 0.05 } },
  { name: '表体', geometry: cyl(0.38, 0.42, 0.72), position: [0, 0.52, 0], material: { color: P.body, roughness: 0.85, metalness: 0.05 } },
  { name: '接管左', geometry: cyl(0.14, 0.14, 0.5, 12), position: [-0.5, 0.52, 0], rotation: [0, 0, Math.PI / 2], material: { color: P.dark, roughness: 0.85 } },
  { name: '接管右', geometry: cyl(0.14, 0.14, 0.5, 12), position: [0.5, 0.52, 0], rotation: [0, 0, Math.PI / 2], material: { color: P.dark, roughness: 0.85 } },
  { name: '表盘', geometry: cyl(0.36, 0.36, 0.08, 24), position: [0, 0.95, 0], material: { color: P.panel, roughness: 0.6, metalness: 0.1 } },
  { name: '状态灯', geometry: sph(0.09, 12), position: [0, 1.06, 0.22], material: { color: P.green, emissive: P.green, emissiveIntensity: 1.2, roughness: 0.3 } },
]

/** 一台燃气表：同水表形态但表体更矮粗、状态灯用黄色（警示语义） */
const gasMeter = (): PartSpec[] => [
  { name: '底座', geometry: cyl(0.62, 0.68, 0.16), position: [0, 0.08, 0], material: { color: P.base, roughness: 0.85 } },
  { name: '表体', geometry: cyl(0.46, 0.5, 0.6), position: [0, 0.46, 0], material: { color: P.body, roughness: 0.85 } },
  { name: '接管左', geometry: cyl(0.13, 0.13, 0.44, 12), position: [-0.55, 0.46, 0], rotation: [0, 0, Math.PI / 2], material: { color: P.dark, roughness: 0.85 } },
  { name: '接管右', geometry: cyl(0.13, 0.13, 0.44, 12), position: [0.55, 0.46, 0], rotation: [0, 0, Math.PI / 2], material: { color: P.dark, roughness: 0.85 } },
  { name: '表盘', geometry: cyl(0.4, 0.4, 0.08, 24), position: [0, 0.82, 0], material: { color: P.panel, roughness: 0.6 } },
  { name: '状态灯', geometry: sph(0.09, 12), position: [0, 0.94, 0.24], material: { color: P.warn, emissive: P.warn, emissiveIntensity: 1.2 } },
]

/** 一台三相电表：落地柜 + 面板 + 3 个指示灯 + 顶部散热 */
const powerMeter = (): PartSpec[] => [
  { name: '底座', geometry: cyl(0.72, 0.8, 0.16), position: [0, 0.08, 0], material: { color: P.base, roughness: 0.85 } },
  { name: '柜体', geometry: box(1.05, 1.35, 0.68), position: [0, 0.83, 0], material: { color: P.body, roughness: 0.7, metalness: 0.15 } },
  { name: '面板', geometry: box(0.86, 0.5, 0.04), position: [0, 1.12, 0.36], material: { color: P.panel, roughness: 0.55 } },
  { name: '铭牌', geometry: box(0.5, 0.04, 0.03), position: [0, 1.12, 0.39], material: { color: P.dark, roughness: 0.8 } },
  { name: '指示灯A', geometry: sph(0.07, 10), position: [-0.22, 0.72, 0.36], material: { color: P.green, emissive: P.green, emissiveIntensity: 1.4 } },
  { name: '指示灯B', geometry: sph(0.07, 10), position: [0, 0.72, 0.36], material: { color: P.green, emissive: P.green, emissiveIntensity: 1.4 } },
  { name: '指示灯C', geometry: sph(0.07, 10), position: [0.22, 0.72, 0.36], material: { color: P.green, emissive: P.green, emissiveIntensity: 1.4 } },
  { name: '散热片', geometry: box(0.06, 0.22, 0.05), position: [0.36, 0.75, 0.37], material: { color: P.dark, roughness: 0.9 } },
]

/** 环境传感器：立杆 + 探头盒 + 三个彩色指示点 */
const envSensor = (): PartSpec[] => [
  { name: '底座', geometry: cyl(0.55, 0.6, 0.16), position: [0, 0.08, 0], material: { color: P.base, roughness: 0.85 } },
  { name: '机体', geometry: box(0.62, 1.5, 0.5), position: [0, 0.9, 0], material: { color: P.body, roughness: 0.8 } },
  { name: '顶盖', geometry: box(0.72, 0.14, 0.6), position: [0, 1.68, 0], material: { color: P.dark, roughness: 0.85 } },
  { name: '探头温', geometry: sph(0.09, 10), position: [-0.2, 1.25, 0.28], material: { color: P.live, emissive: P.live, emissiveIntensity: 0.9 } },
  { name: '探头湿', geometry: sph(0.09, 10), position: [0, 1.25, 0.28], material: { color: P.green, emissive: P.green, emissiveIntensity: 0.9 } },
  { name: '探头气', geometry: sph(0.09, 10), position: [0.2, 1.25, 0.28], material: { color: P.body, roughness: 0.8 } },
  { name: '显示屏', geometry: box(0.4, 0.22, 0.03), position: [0, 0.95, 0.27], material: { color: P.panel, roughness: 0.5 } },
]

/** 压力变送器：细杆 + 表头 + 法兰 */
const pressureTransmitter = (): PartSpec[] => [
  { name: '底座', geometry: cyl(0.5, 0.55, 0.16), position: [0, 0.08, 0], material: { color: P.base, roughness: 0.85 } },
  { name: '支杆', geometry: cyl(0.14, 0.2, 1.1, 14), position: [0, 0.68, 0], material: { color: P.body, roughness: 0.8 } },
  { name: '表头', geometry: cyl(0.3, 0.3, 0.36, 16), position: [0, 1.36, 0], material: { color: P.panel, roughness: 0.6 } },
  { name: '法兰', geometry: cyl(0.19, 0.19, 0.06, 18), position: [0, 1.36, 0.19], rotation: [Math.PI / 2, 0, 0], material: { color: P.frame, roughness: 0.5, metalness: 0.4 } },
]

/** 离心泵：底座 + 泵体 + 叶轮罩 + 出口管 */
const pump = (): PartSpec[] => [
  { name: '底座', geometry: cyl(0.6, 0.66, 0.16), position: [0, 0.08, 0], material: { color: P.base, roughness: 0.85 } },
  { name: '泵体', geometry: cyl(0.46, 0.46, 0.55), position: [0, 0.42, 0], material: { color: P.body, roughness: 0.7, metalness: 0.2 } },
  { name: '叶轮罩', geometry: cyl(0.34, 0.34, 0.1, 16), position: [0, 0.74, 0], material: { color: P.dark, roughness: 0.9 } },
  { name: '出口管', geometry: cyl(0.13, 0.13, 0.5, 12), position: [0.5, 0.55, 0], rotation: [0, 0, Math.PI / 2], material: { color: P.frame, roughness: 0.6, metalness: 0.3 } },
]

/** 立式储罐：罐体 + 顶沿 + 呼吸阀 + 基座 */
const tank = (): PartSpec[] => [
  { name: '基座', geometry: cyl(0.85, 0.88, 0.16), position: [0, 0.08, 0], material: { color: P.base, roughness: 0.85 } },
  { name: '罐体', geometry: cyl(0.72, 0.72, 1.8, 24), position: [0, 1.06, 0], material: { color: P.body, roughness: 0.55, metalness: 0.35 } },
  { name: '顶沿', geometry: cyl(0.74, 0.74, 0.06, 24), position: [0, 1.98, 0], material: { color: P.dark, roughness: 0.9 } },
  { name: '呼吸阀', geometry: cyl(0.12, 0.12, 0.3, 12), position: [0.4, 2.1, 0], material: { color: P.frame, roughness: 0.6, metalness: 0.4 } },
]

export const INDUSTRIAL_PARTS: IndustrialPart[] = [
  { id: 'water-meter', name: '远传水表', category: 'water', specs: waterMeter() },
  { id: 'gas-meter', name: '燃气表', category: 'gas', specs: gasMeter() },
  { id: 'power-meter', name: '三相电表', category: 'power', specs: powerMeter() },
  { id: 'env-sensor', name: '环境传感器', category: 'env', specs: envSensor() },
  { id: 'pressure-transmitter', name: '压力变送器', category: 'env', specs: pressureTransmitter() },
  { id: 'pump', name: '离心泵', category: 'common', specs: pump() },
  { id: 'tank', name: '立式储罐', category: 'common', specs: tank() },
]

/** 分类的中文标签（物料库分组用） */
export const CATEGORY_TEXT: Record<IndustrialPart['category'], string> = {
  water: '供水设备',
  power: '配电设备',
  gas: '燃气设备',
  env: '环境与仪表',
  common: '通用设备',
}

export function partCategories(): IndustrialPart['category'][] {
  return [...new Set(INDUSTRIAL_PARTS.map((p) => p.category))]
}

export function partById(id: string): IndustrialPart | undefined {
  return INDUSTRIAL_PARTS.find((p) => p.id === id)
}

export function isIndustrialPart(id: string): boolean {
  return INDUSTRIAL_PARTS.some((p) => p.id === id)
}

/** 可落库的 objects 记录（上游 deserializeObject 认的形状） */
export interface PartRecord {
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

/** 生成唯一 bid（与上游 BidRegistry 的形态一致：bid_<随机>_<随机>） */
function makeBid(): string {
  const rnd = () => Math.random().toString(36).slice(2, 10)
  return `bid_${rnd()}_${rnd()}`
}

/**
 * 图元 → objects 记录数组。
 * `origin` 是放置点（拖到哪就在哪）；`namePrefix` 通常是设备位号（WM-101），
 * 子件名拼成 `WM-101/表体`，场景树里一眼能看出归属。
 */
export function buildPartSpecs(
  part: IndustrialPart,
  opts: { origin: { x: number; y: number; z: number }; namePrefix: string },
): PartRecord[] {
  const { origin, namePrefix } = opts
  return part.specs.map((s) => {
    const bid = makeBid()
    return {
      id: bid,
      bid,
      type: s.geometry.type,
      name: `${namePrefix}/${s.name}`,
      visible: true,
      position: { x: origin.x + s.position[0], y: origin.y + s.position[1], z: origin.z + s.position[2] },
      rotation: { x: s.rotation?.[0] ?? 0, y: s.rotation?.[1] ?? 0, z: s.rotation?.[2] ?? 0 },
      scale: { x: s.scale?.[0] ?? 1, y: s.scale?.[1] ?? 1, z: s.scale?.[2] ?? 1 },
      geometry: s.geometry,
      material: { ...s.material },
    }
  })
}
