/**
 * 符号模板存储契约（P3a，2026-10-31）：`/api/v1/symbols`（rs-iot MetaKind 第三资源族，
 * 四端点）。doc = `{name, combin_json, width?, height?}`——combin_json 即 maotu group 项
 * （形状与构造约束见 docs/plans/2026-10-31-reg-combin-probe.md）。薄封装同 screensApi。
 */
import { api } from './api'
import type { ApiClient } from './screens'

/** 符号模板文档（PUT body / GET doc） */
export interface SymbolDoc {
  name: string
  /** maotu group 项（type/tag:'group' + children 画布内存形态） */
  combin_json: Record<string, unknown>
  width?: number
  height?: number
}

export type SymbolsClient = {
  list: () => Promise<string[]>
  get: (id: string) => Promise<{ id: string; doc: SymbolDoc; version: number }>
  put: (id: string, doc: SymbolDoc, ifVersion?: number) => Promise<{ status: string; version: number }>
  del: (id: string) => Promise<unknown>
}

export function symbolsApi(client: ApiClient = api()): SymbolsClient {
  return {
    list: async () =>
      ((await client.get('/api/v1/symbols')) as { symbols: string[] }).symbols,
    get: (id) =>
      client.get(`/api/v1/symbols/${id}`) as Promise<{ id: string; doc: SymbolDoc; version: number }>,
    put: (id, doc, ifVersion) =>
      client.put(
        ifVersion !== undefined ? `/api/v1/symbols/${id}?if_version=${ifVersion}` : `/api/v1/symbols/${id}`,
        doc,
      ) as Promise<{ status: string; version: number }>,
    del: (id) => client.del(`/api/v1/symbols/${id}`),
  }
}
