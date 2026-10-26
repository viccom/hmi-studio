/**
 * W11 设备参数化（传统 HMI「画面模板 + 标签前缀/设备上下文」模式）：
 * bind_id 前缀 `@dev.` = 设备上下文相对标签，运行时按激活设备重写为 `<devid>.<tag>`，
 * 一张 faceplate 服务 N 台同型设备（100 仪表 ≠ 100 张画面）。
 *
 * 约定：
 * - `@dev.<tag>`   设备上下文绑定（编辑器 BindPanel「模板绑定」产出；切换即重写）
 * - `@meta.dev`    宿主注入的当前设备 id 显示通道（不重写；ViewView 挂载/切换后
 *                  setDevicePointByID 推送，标题/选择器 bind 它即显当前设备）
 *
 * 机制落点：重写只发生在 ViewView 数据层（加载/切换时对内存中的 done 做深拷贝替换，
 * 再 setImportJson 重挂 + resubscribe）——maotu 与 SSE 协议均无感知；重挂顺带重置
 * 趋势缓冲（换源不混线）。`@` 开头的 bind_id 不进订阅面（binds.ts 过滤）。
 */
import type { IExportJson } from 'maotu'

export const DEV_PARAM = '@dev'
export const META_DEV_FIELD = '@meta.dev'

type PelLike = { binds?: Array<{ bind_id?: unknown }>; children?: unknown[] }

/** 深拷贝并对全部（含嵌套 children）binds 做前缀重写；入参不被修改。
 *  用 JSON 克隆而非 structuredClone：入参经 ref 存取是 Vue reactive 代理， structuredClone
 *  对 Proxy 抛 DataCloneError（W11 e2e 实测）；画面 doc 是 API 纯 JSON，JSON 克隆无损 */
export function applyDevContext(done: IExportJson, dev: string): IExportJson {
  const out = JSON.parse(JSON.stringify(done)) as IExportJson
  const prefix = `${DEV_PARAM}.`
  const walk = (pels: unknown[]): void => {
    for (const p of pels) {
      if (!p || typeof p !== 'object') continue
      const pel = p as PelLike
      for (const b of pel.binds ?? []) {
        if (typeof b.bind_id === 'string' && b.bind_id.startsWith(prefix)) {
          b.bind_id = `${dev}.${b.bind_id.slice(prefix.length)}`
        }
      }
      if (Array.isArray(pel.children)) walk(pel.children)
    }
  }
  walk(Array.isArray(out.json) ? out.json : [])
  return out
}

/** 参数化画面判定：存在任一 `@dev.` 绑定（`@meta.*` 不算） */
export function isDevParamScreen(done: IExportJson): boolean {
  const prefix = `${DEV_PARAM}.`
  const walk = (pels: unknown[]): boolean => {
    for (const p of pels) {
      if (!p || typeof p !== 'object') continue
      const pel = p as PelLike
      for (const b of pel.binds ?? []) {
        if (typeof b.bind_id === 'string' && b.bind_id.startsWith(prefix)) return true
      }
      if (Array.isArray(pel.children) && walk(pel.children)) return true
    }
    return false
  }
  return walk(Array.isArray(done.json) ? done.json : [])
}
