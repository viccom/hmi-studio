/**
 * 3D 场景存储面（模块内）——从 2D 的 `lib/screens.ts` 抽出。
 *
 * 为什么必须放在模块内：`screens.ts` 是 2D 画面的存储契约（maotu done_json + meta 同体）。
 * 若把 `getScene/putScene/blankScene3D` 留在那里，就形成“2D 核心 → 3D 契约”的反向依赖，
 * 删除 3D 模块时 2D 会编译失败。模块化要求（2026-11-26）：剔除本模块，2D 功能不受影响。
 *
 * 资源族（Q1a 决策 2026-11-26）：3D 场景走**独立的 `scenes` 族**（`/api/v1/scenes`），
 * 不寄居 `screens`。原因：①单文档上限 1 MiB（screens 是 128 KiB，实测 172 对象场景
 * 原样即 139 KiB 超限）；②2D/3D 是两条平行功能线，存储层分开后 2D 列表无需逐 doc 读
 * `$schema` 过滤、hmi-mcp 不会用 2D 校验器误判 3D 文档；③观测可分（kind="scene"）。
 * 版本/乐观锁/回滚/级联删除/判重由 rs-iot 的 MetaKind 机制提供，与 screens 同源。
 */
import { api } from '../lib/api'
import type { SceneDoc } from './scene3d'

/** 与 lib/screens 的 ApiClient 同一物（api() 的返回类型） */
type HttpClient = ReturnType<typeof api>

export interface PutResult { status: string; version: number }

/** 资源族根路径（切族只改这一处） */
const BASE = '/api/v1/scenes'

/** 3D 场景的 CRUD 面（与 screensApi 同形） */
export function sceneStore(client: HttpClient = api()) {
  return {
    list: async (): Promise<string[]> =>
      ((await client.get(BASE)) as { scenes: string[] }).scenes,
    /** 原始取回（不校验 $schema）——列表页据 isScene3D 自行过滤 */
    getRaw: (id: string): Promise<{ id: string; doc: unknown; version: number }> =>
      client.get(`${BASE}/${id}`) as Promise<{ id: string; doc: unknown; version: number }>,
    /** 收窄取回：非 3D 文档直接抛错（调用方已按类型分流时用） */
    get: async (id: string): Promise<{ id: string; doc: SceneDoc; version: number }> => {
      const r = await client.get(`${BASE}/${id}`) as { id: string; doc: unknown; version: number }
      const doc = r.doc as SceneDoc
      if (doc?.$schema !== 'agent-hmi.scene3d/1') throw new Error(`getScene: ${id} 不是 3D 场景文档`)
      return { id: r.id, doc, version: r.version }
    },
    put: (id: string, doc: SceneDoc, ifVersion?: number): Promise<PutResult> =>
      client.put(
        ifVersion !== undefined ? `${BASE}/${id}?if_version=${ifVersion}` : `${BASE}/${id}`,
        doc,
      ) as Promise<PutResult>,
    del: (id: string): Promise<unknown> => client.del(`${BASE}/${id}`),
  }
}

/**
 * 空白 3D 场景（$schema=agent-hmi.scene3d/1，空节点空连线）。
 * name/group 放在 3D 文档的 meta 内（SceneDoc 契约），与 2D 的顶层字段不同体。
 */
export function blankScene3D(slug: string): SceneDoc {
  return {
    $schema: 'agent-hmi.scene3d/1',
    meta: { name: slug, group: '', unit_m: 1, home: { pos: [15, 11, 17], target: [-2, 1, -1] } },
    // v1 字段（程序化几何场景用；新建的编辑器场景为空）
    nodes: [],
    links: [],
    // v2 字段：让新建场景**直接可在 3D 编辑器里编辑**（上游只认 objects）
    objects: [],
    scene: {
      // 非零灯光默认（上游 DEFAULT_LIGHTING 全零 → 新场景黑场，实测踩过）
      lightingConfig: {
        enabled: true, ambient: 0.85, hemisphere: 1.8, key: 3,
        fill: 2, head: 1.5, azimuth: 45, elevation: 55, exposure: 1.25,
      },
    },
    bindings: [],
    events: [],
  } as unknown as SceneDoc
}
