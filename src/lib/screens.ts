/**
 * 画面契约（F4 实测）：doc = {name?,group?,...IExportJson}——meta 与 maotu done_json 同体存 rs-iot。
 * GET /screens → {screens:[id...]}；GET /:id → {id,doc,version}（404）；PUT /:id 全量（创建=PUT 新 id，
 * 可选 ?if_version= 乐观锁，P0）；DELETE 幂等。版本三端点（P0）：versions 列表/单版取回/rollback。
 */
import type { IExportJson } from 'maotu'
import { api } from './api'
import type { SceneDoc } from './scene3d'

/** 设备参数化画面的设备清单（W11）：faceplate 的选择器/按钮清单同源；
 * 首项 = 运行页默认激活设备（传统 HMI：进入即有上下文，无需先选） */
export interface DevOpt { id: string; label?: string }
export interface ScreenMeta { name?: string; group?: string; devs?: DevOpt[] }
/** 2D 画面文档（maotu done_json + meta 同体） */
export type ScreenDoc = IExportJson & ScreenMeta

/** 版本元数据行（GET /:id/versions，seq 降序）；expired = 正文已过 TTL（取回将 410） */
export interface ScreenVersionMeta {
  seq: number
  /** 该内容成为 head 的 Unix 秒 */
  ts: number
  /** JWT sub（`hmi-mcp` = AI 写作） */
  author: string
  size: number
  sha: string
  expired: boolean
}

/** 单版取回（GET /:id/versions/:seq）：doc 是当时的完整画面文档 */
export interface ScreenVersionDoc {
  id: string
  seq: number
  ts: number
  author: string
  doc: ScreenDoc
}

/** PUT 成功响应（P0）：version = 本次写入后的版本号（判重命中 = 当前版本号不变） */
export interface PutResult { status: string; version: number }

export type ApiClient = ReturnType<typeof api>

/** done_json + meta → 同体 doc（PUT body 形状） */
export function wrapDoc(done: IExportJson, meta: ScreenMeta): ScreenDoc {
  return { ...done, ...meta }
}

/** doc → {done, meta}：剔除 name/group/devs 后 done 完整；裸 done_json（无 meta）不炸 */
export function unwrapDoc(doc: ScreenDoc): { done: IExportJson; meta: ScreenMeta } {
  const { name, group, devs, ...done } = doc
  return { done, meta: { name, group, devs } }
}

/** 空白画面（800x600 深色画布，空 json/eventList/eventFlow），name 先取 slug 供 T3 新建对话框覆盖 */
export function blankScreen(slug: string): ScreenDoc {
  return {
    name: slug,
    canvasCfg: {
      width: 800, height: 600, scale: 1, color: '#141414', img: '',
      guide: true, adsorp: true, adsorp_diff: 3,
      transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
    },
    gridCfg: { enabled: true, align: true, size: 10 },
    json: [], eventList: [], eventFlow: [],
  }
}

/**
 * 空白 3D 场景（$schema=agent-hmi.scene3d/1，空节点空连线）。
 *
 * 与 blankScreen 的分工：2D 画面的 done_json 走 maotu 的 IExportJson（canvasCfg/json…），
 * 3D 场景是独立文档契约（src/lib/scene3d.ts 的 SceneDoc），两者靠 $schema 判别——
 * 后端 PUT 只校验 id 词法 / ≤128 KiB / JSON 合法，不看 schema，故可同存 screen:* 键族。
 * name/group 放在 3D 文档的 meta 内（与 SceneDoc 契约一致）。
 */
export function blankScene3D(slug: string): SceneDoc {
  return {
    $schema: 'agent-hmi.scene3d/1',
    meta: { name: slug, group: '', unit_m: 1, home: { pos: [15, 11, 17], target: [-2, 1, -1] } },
    nodes: [],
    links: [],
  }
}

/** CRUD 薄封装：只管 URL 拼接与方法，错误统一走 api client（ApiError/401 回调）。
 *  put 的 ifVersion 可选（P0 乐观锁）：缺省 = 无条件写，签名向后兼容（e2e fixtures 同用此封装）。 */
export function screensApi(client: ApiClient = api()) {
  return {
    list: async (): Promise<string[]> =>
      ((await client.get('/api/v1/screens')) as { screens: string[] }).screens,
    get: (id: string): Promise<{ id: string; doc: ScreenDoc; version: number }> =>
      client.get(`/api/v1/screens/${id}`) as Promise<{ id: string; doc: ScreenDoc; version: number }>,
    put: (id: string, doc: ScreenDoc, ifVersion?: number): Promise<PutResult> =>
      client.put(
        ifVersion !== undefined ? `/api/v1/screens/${id}?if_version=${ifVersion}` : `/api/v1/screens/${id}`,
        doc,
      ) as Promise<PutResult>,
    /**
     * 取 3D 场景文档（$schema=agent-hmi.scene3d/1）。
     *
     * 与 get 的关系：同一 URL、同一返回，只是类型收窄到 SceneDoc——3D 文档的
     * name/group 在 meta 内（SceneDoc 契约），不是 2D 的顶层字段，故单列方法，
     * 不把联合类型泄进 2D 调用方（screen-group / EditView / ViewView 仍是 ScreenDoc）。
     */
    getScene: async (id: string): Promise<{ id: string; doc: SceneDoc; version: number }> => {
      const r = await client.get(`/api/v1/screens/${id}`) as { id: string; doc: unknown; version: number }
      const doc = r.doc as SceneDoc
      if (doc?.$schema !== 'agent-hmi.scene3d/1') throw new Error(`getScene: ${id} 不是 3D 场景文档`)
      return { id: r.id, doc, version: r.version }
    },
    /** 写 3D 场景文档（SceneDoc 直传，不经 wrapDoc——避免把 meta 摊平到顶层） */
    putScene: (id: string, doc: SceneDoc, ifVersion?: number): Promise<PutResult> =>
      client.put(
        ifVersion !== undefined ? `/api/v1/screens/${id}?if_version=${ifVersion}` : `/api/v1/screens/${id}`,
        doc,
      ) as Promise<PutResult>,
    del: (id: string): Promise<unknown> =>
      client.del(`/api/v1/screens/${id}`),
    /** 版本列表（seq 降序；expired 行只可看正文不可回滚） */
    versions: async (id: string): Promise<ScreenVersionMeta[]> =>
      ((await client.get(`/api/v1/screens/${id}/versions`)) as { versions: ScreenVersionMeta[] }).versions,
    /** 单版取回（404 无该版 / 410 正文过期 → ApiError） */
    versionDoc: (id: string, seq: number): Promise<ScreenVersionDoc> =>
      client.get(`/api/v1/screens/${id}/versions/${seq}`) as Promise<ScreenVersionDoc>,
    /** 回滚：toVersion 正文成为新 head；回滚前的 head 已被存为新版本（回滚可再回滚） */
    rollback: (id: string, toVersion: number, ifVersion?: number): Promise<PutResult> =>
      client.post(
        ifVersion !== undefined
          ? `/api/v1/screens/${id}/rollback?if_version=${ifVersion}`
          : `/api/v1/screens/${id}/rollback`,
        { to_version: toVersion },
      ) as Promise<PutResult>,
  }
}

