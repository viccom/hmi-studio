/**
 * 3D 场景存储面（模块内）——从 2D 的 `lib/screens.ts` 抽出。
 *
 * 为什么必须放在模块内：`screens.ts` 是 2D 画面的存储契约（maotu done_json + meta 同体）。
 * 若把 `getScene/putScene/blankScene3D` 留在那里，就形成“2D 核心 → 3D 契约”的反向依赖，
 * 删除 3D 模块时 2D 会编译失败。模块化要求（2026-11-26）：剔除本模块，2D 功能不受影响。
 *
 * 资源族：当前与 2D 共用 `screen:*` 键族（后端 PUT 不校验 schema）。若采纳
 * `docs/plans/2026-11-26-3d-editor-meteor-implementation-plan.md` §13.2 的 `scenes`
 * 独立资源族，只需把本文件的 URL 前缀从 `/api/v1/screens` 换成 `/api/v1/scenes`。
 */
import { api } from '../lib/api'
import type { SceneDoc } from './scene3d'

/** 与 lib/screens 的 ApiClient 同一物（api() 的返回类型） */
type HttpClient = ReturnType<typeof api>

export interface PutResult { status: string; version: number }

/** 3D 场景的 CRUD 面（与 screensApi 同形，便于将来切资源族时只改本文件） */
export function sceneStore(client: HttpClient = api()) {
  return {
    list: async (): Promise<string[]> =>
      ((await client.get('/api/v1/screens')) as { screens: string[] }).screens,
    /** 原始取回（不校验 $schema）——列表页据 isScene3D 自行过滤 */
    getRaw: (id: string): Promise<{ id: string; doc: unknown; version: number }> =>
      client.get(`/api/v1/screens/${id}`) as Promise<{ id: string; doc: unknown; version: number }>,
    /** 收窄取回：非 3D 文档直接抛错（调用方已按类型分流时用） */
    get: async (id: string): Promise<{ id: string; doc: SceneDoc; version: number }> => {
      const r = await client.get(`/api/v1/screens/${id}`) as { id: string; doc: unknown; version: number }
      const doc = r.doc as SceneDoc
      if (doc?.$schema !== 'agent-hmi.scene3d/1') throw new Error(`getScene: ${id} 不是 3D 场景文档`)
      return { id: r.id, doc, version: r.version }
    },
    put: (id: string, doc: SceneDoc, ifVersion?: number): Promise<PutResult> =>
      client.put(
        ifVersion !== undefined ? `/api/v1/screens/${id}?if_version=${ifVersion}` : `/api/v1/screens/${id}`,
        doc,
      ) as Promise<PutResult>,
    del: (id: string): Promise<unknown> => client.del(`/api/v1/screens/${id}`),
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
    nodes: [],
    links: [],
  }
}
