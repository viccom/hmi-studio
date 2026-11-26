/**
 * 存储适配器：把上游 `DBManager` 的 HTTP 面换成 rs-iot 的 `scenes` 资源族。
 *
 * 上游只有两个方法（`core/DBManager.js`）：
 *   - `getSceneData(sceneId)` → `{objects, metadata}`
 *   - `saveScene(sceneData)`  ← 形如 `{objects, id, name, description, cameraFar,
 *                                 lastModified, objectCount, environmentUrl,
 *                                 lightingConfig, gisConfig, nodeGraph, deletedSourceNodes}`
 * 适配器实现同一形状，内部调 `sceneStore()`（`/api/v1/scenes`，1 MiB 族）。
 *
 * 为什么不改造 PersistenceManager：序列化/恢复（36 类对象的 deserialize、节点图、
 * 材质、动画、灯光）全在上游，重写风险远大于替换两个端点；这也让 vendor 补丁面
 * 收敛到 1 处（Viewport 的注入点 PATCH-01）。
 *
 * 版本号（乐观锁）：上游 `saveScene` 不认识 `if_version`，故适配器自己持有——
 * 加载时记下、保存时带上、成功后更新；409 抛 `ConflictError` 供 UI 提示。
 */
import { isScene3D, type SceneDoc } from '../scene3d'
import { sceneStore } from '../store'

/** 上游 sceneId → rs-iot 的 scenes 文档 id（同值；留一层映射便于将来加前缀） */
const docIdOf = (sceneId: string): string => sceneId

export interface UpstreamSceneData {
  objects: unknown[]
  metadata: Record<string, unknown>
}

/** 上游 saveScene 的载荷（顶层字段，不是 metadata 包裹——勿按 metadata 结构解析） */
export interface UpstreamSavePayload {
  id?: string
  objects?: unknown[]
  name?: string
  description?: string
  cameraFar?: number
  environmentUrl?: string | null
  lightingConfig?: unknown
  gisConfig?: unknown
  nodeGraph?: unknown[]
  deletedSourceNodes?: unknown[]
  [k: string]: unknown
}

export class ConflictError extends Error {
  constructor(public currentVersion: number) {
    super(`场景已被其他窗口修改（服务端当前版本 ${currentVersion}）`)
    this.name = 'ConflictError'
  }
}

/** 上游 `restoreScene` 认的 metadata 键（其余忽略；见 core/PersistenceManager.js） */
const META_KEYS = [
  'cameraFar', 'environmentUrl', 'lightingConfig', 'gisConfig',
  'nodeGraph', 'deletedSourceNodes', 'initialView', 'thumbnail',
] as const

export class ScenesDbManager {
  private version = 0
  /**
   * 加载时的原文档缓存。用途见 saveScene 注释：上游 saveScene **不传** initialView
   * 与 nodeGraph（它自己算了 nodeGraph 却没放进载荷），不合并就会保存一次丢一次。
   */
  private lastDoc: SceneDoc | null = null
  private store = sceneStore()

  /** 兼容上游 `new DBManager({apiBaseUrl})` 的构造形状（apiBaseUrl 由 sceneStore 内的 api() 决定） */
  constructor(_opts?: { apiBaseUrl?: string }) { /* noop */ }

  async init(): Promise<void> { /* 上游为占位（API 模式无连接态） */ }

  getVersion(): number { return this.version }

  /** 上游契约：`{objects, metadata}` */
  async getSceneData(sceneId = 'default'): Promise<UpstreamSceneData> {
    const { doc, version } = await this.store.get(docIdOf(sceneId))
    this.version = version
    this.lastDoc = doc
    return docToUpstream(doc)
  }

  /** 上游契约：存整个场景 */
  async saveScene(payload: UpstreamSavePayload): Promise<{ success: true; version: number }> {
    const sceneId = docIdOf(String(payload.id ?? 'default'))
    const next = upstreamToDoc(payload)
    // 合并：旧 scene 打底 + 本次载荷覆盖。
    // 上游 saveScene 只传 cameraFar/environmentUrl/lightingConfig/gisConfig/deletedSourceNodes，
    // **不传 initialView，也不传 nodeGraph**（PersistenceManager 算了 nodeGraph 但没放进载荷）。
    // 实测后果：不合并的话保存一次就把 nodeGraph（展厅 292 条）与初始视角抹掉。
    // 取舍：本次载荷里有的字段用新值；没有的保留旧值（宁可让 nodeGraph 略旧，也不能丢）。
    const doc = this.lastDoc
      ? ({ ...next, scene: { ...(this.lastDoc.scene ?? {}), ...(next.scene ?? {}) } } as SceneDoc)
      : next
    if (!isScene3D(doc)) throw new Error('saveScene: 适配器产出的不是 3D 文档（内部错误）')
    try {
      const r = await this.store.put(sceneId, doc, this.version)
      this.version = r.version
      return { success: true, version: r.version }
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status === 409) {
        const cur = Number((e as { body?: { current_version?: number } }).body?.current_version ?? 0)
        this.version = cur
        throw new ConflictError(cur)
      }
      throw e
    }
  }

  // 上游其余方法：本模块不用，保留签名避免调用方崩溃
  async saveObject(): Promise<void> { /* 上游已弃用 */ }
  async getObject(): Promise<null> { return null }
  async getAllObjects(): Promise<unknown[]> { return [] }
  async deleteObject(): Promise<void> { /* 上游未实现 */ }
  async clearAllObjects(): Promise<void> { /* 删除走 hmi-studio 列表页 */ }
}

/**
 * 3D 文档 → 上游 `{objects, metadata}`。
 * `scene` 子对象（lighting/initialView/nodeGraph…）摊平到 metadata——上游 restoreScene
 * 直接读 `metadata.lightingConfig` 等键。
 */
export function docToUpstream(doc: SceneDoc): UpstreamSceneData {
  const v2 = doc as unknown as { objects?: unknown[]; scene?: Record<string, unknown> }
  const scene = v2.scene ?? {}
  const metadata: Record<string, unknown> = { name: doc.meta?.name, group: doc.meta?.group }
  for (const k of META_KEYS) if (k in scene) metadata[k] = scene[k]
  return { objects: v2.objects ?? [], metadata }
}

/**
 * 上游保存载荷 → 3D 文档。保留 bindings/events（若原文档有）**必须由调用方合并**——
 * 上游 saveScene 不携带它们，故这里置空，由 `Scene3DEditView` 在保存前用原文档补齐。
 * （P2 会把 bindings/events 纳入上游载荷，届时本注释与逻辑一并更新。）
 */
export function upstreamToDoc(payload: UpstreamSavePayload): SceneDoc {
  const scene: Record<string, unknown> = {}
  for (const k of META_KEYS) if (payload[k] !== undefined) scene[k] = payload[k]
  // 上游会塞进来的非场景字段：不带入 SceneDoc
  const meta = {
    name: String(payload.name ?? payload.id ?? '未命名场景'),
    group: '',
    unit_m: 1,
    home: { pos: [15, 11, 17] as [number, number, number], target: [-2, 1, -1] as [number, number, number] },
  }
  return {
    $schema: 'agent-hmi.scene3d/1',
    meta,
    objects: (payload.objects ?? []) as never,
    scene,
    bindings: [],
    events: [],
  } as unknown as SceneDoc
}

export { isScene3D }
