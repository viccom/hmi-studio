/**
 * 画面契约（F4 实测）：doc = {name?,group?,...IExportJson}——meta 与 maotu done_json 同体存 rs-iot。
 * GET /screens → {screens:[id...]}；GET /:id → {id,doc}（404）；PUT /:id 全量（创建=PUT 新 id）；DELETE 幂等。
 */
import type { IExportJson } from 'maotu'
import { api } from './api'

export interface ScreenMeta { name?: string; group?: string }
export type ScreenDoc = IExportJson & ScreenMeta

export type ApiClient = ReturnType<typeof api>

/** done_json + meta → 同体 doc（PUT body 形状） */
export function wrapDoc(done: IExportJson, meta: ScreenMeta): ScreenDoc {
  return { ...done, ...meta }
}

/** doc → {done, meta}：剔除 name/group 后 done 完整；裸 done_json（无 meta）不炸 */
export function unwrapDoc(doc: ScreenDoc): { done: IExportJson; meta: ScreenMeta } {
  const { name, group, ...done } = doc
  return { done, meta: { name, group } }
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

/** CRUD 薄封装：只管 URL 拼接与方法，错误统一走 api client（ApiError/401 回调） */
export function screensApi(client: ApiClient = api()) {
  return {
    list: async (): Promise<string[]> =>
      ((await client.get('/api/v1/screens')) as { screens: string[] }).screens,
    get: (id: string): Promise<{ id: string; doc: ScreenDoc }> =>
      client.get(`/api/v1/screens/${id}`) as Promise<{ id: string; doc: ScreenDoc }>,
    put: (id: string, doc: ScreenDoc): Promise<unknown> =>
      client.put(`/api/v1/screens/${id}`, doc),
    del: (id: string): Promise<unknown> =>
      client.del(`/api/v1/screens/${id}`),
  }
}
