/**
 * 画面契约（F4 实测）：doc = {name?,group?,...IExportJson}——meta 与 maotu done_json 同体存 rs-iot。
 * GET /screens → {screens:[id...]}；GET /:id → {id,doc,version}（404）；PUT /:id 全量（创建=PUT 新 id，
 * 可选 ?if_version= 乐观锁，P0）；DELETE 幂等。版本三端点（P0）：versions 列表/单版取回/rollback。
 */
import type { IExportJson } from 'maotu'
import { api } from './api'

/** 设备参数化画面的设备清单（W11）：faceplate 的选择器/按钮清单同源；
 * 首项 = 运行页默认激活设备（传统 HMI：进入即有上下文，无需先选） */
export interface DevOpt { id: string; label?: string }
export interface ScreenMeta { name?: string; group?: string; devs?: DevOpt[] }
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

