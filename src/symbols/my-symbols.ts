/**
 * 「我的符号」= 站点自建组合图元模板（P3a，2026-10-31）。
 *
 * 语义（探针报告 2026-10-31-reg-combin-probe.md 实证）：reg-combin 拖入即**模板展开**
 * ——children 提升为顶层独立图元、binds 原样保留、逐项可改。持久组合用内置 Ctrl+G。
 *
 * 分层：本文件在 symbols 层（leftAsideStore/lintSymbol/HmiSymbol 同层，check-layers
 * `symbols:['symbols']` 恰好容纳）；REST 客户端由调用方（views 层）传入——本层不依赖 lib。
 */
import { leftAsideStore } from 'maotu'
import type { IDoneJson } from 'maotu'

/** 左面板组名（「我的符号」= 组态员不写代码的插件入口，设计 §6.1） */
export const MY_SYMBOLS_GROUP = '我的符号'

/** 注册项 id 前缀：与编译期 registry 的 `ah-*` 族隔离（同名会 registerConfig 覆盖） */
const REG_ID_PREFIX = 'sym-'

/** 存储侧符号文档（与 lib/symbols-api 的 SymbolDoc 同形——此处按形状声明避免跨层依赖） */
export interface StoredSymbolDoc {
  name: string
  combin_json: Record<string, unknown>
  width?: number
  height?: number
}

/** reg-combin 注册项形状（ILeftAsideConfigItemPublic 的构造子集） */
export interface RegCombinItem {
  id: string
  title: string
  type: 'reg-combin'
  thumbnail: string
  props: Record<string, never>
  combin_json: IDoneJson
  width: number
  height: number
}

/** 深克隆（structuredClone 语义：Date/Map 等 maotu 项不含，JSON 路径足够且抹掉响应式代理） */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/**
 * 从选中 group 项构造符号文档（「存为符号」的载荷来源——探针报告 §3：槽位项是画布
 * 内存形态，children 自带 symbol 私有部分 + 描述符 props + 百分比 binfo，克隆即合法）。
 * v1 仅接受 group 项（多件先 Ctrl+G 组合——组态员心智模型「符号=组合好的整体」）。
 */
export function buildSymbolDoc(item: IDoneJson, name: string): StoredSymbolDoc {
  if (item.type !== 'group') {
    throw new Error('存为符号 v1 仅支持组合项：先框选多个图元按 Ctrl+G（或工具栏「组合」）')
  }
  const g = item as unknown as { binfo: { width: number; height: number }; children?: unknown[] }
  if (!Array.isArray(g.children) || g.children.length === 0) {
    throw new Error('组合项缺少子图元')
  }
  return {
    name,
    combin_json: clone(item) as unknown as Record<string, unknown>,
    width: Math.round(g.binfo?.width ?? 100),
    height: Math.round(g.binfo?.height ?? 100),
  }
}

/** 存储文档 → 左面板 reg-combin 注册项（编辑器启动 list 后逐项转换）。
 *  id 已带 `sym-` 时不再叠加（2026-10-31 审查：存储 id 由 EditView 生成为 `sym-<uid>`，
 *  旧逻辑注册项变 `sym-sym-…`）；`ah-` 等其它前缀仍走 REG_ID_PREFIX 隔离。 */
export function toRegistrationItem(id: string, doc: StoredSymbolDoc): RegCombinItem {
  const binfo = (doc.combin_json.binfo ?? {}) as { width?: number; height?: number }
  return {
    id: id.startsWith(REG_ID_PREFIX) ? id : REG_ID_PREFIX + id,
    title: doc.name || id,
    type: 'reg-combin',
    thumbnail: '',
    props: {},
    combin_json: doc.combin_json as unknown as IDoneJson,
    width: Math.round(doc.width ?? binfo.width ?? 100),
    height: Math.round(doc.height ?? binfo.height ?? 100),
  }
}

/** 上次注册签名（registerConfig 同名覆盖会弹 info 提示——内容未变时跳过，防每次保存刷屏）。 */
let lastSignature = ''

/** 注册/刷新「我的符号」组（registerConfig 同名覆盖语义，F9）；空清单跳过（不留空组头）；
 *  清单未变跳过（覆盖提示只在真变化时出现一次）。
 *
 *  签名含 **version**（2026-10-31 审查）：同名覆盖复用 id + name，只认 id:name 会漏掉
 *  「同名更新」→ 左面板继续拖出旧 combin_json。version 由调用方从 GET 带出。
 *  畸形文档逐条跳过（缺 combin_json 曾让整组注册抛错、整组静默消失）。 */
export function registerMySymbols(docs: Array<{ id: string; doc: StoredSymbolDoc; version?: number }>): number {
  if (docs.length === 0) return 0
  const valid: Array<{ id: string; doc: StoredSymbolDoc; version?: number }> = []
  for (const d of docs) {
    try {
      const cj = d?.doc?.combin_json
      if (typeof cj !== 'object' || cj === null || Array.isArray(cj)) throw new Error('combin_json 缺失或非对象')
      if (typeof d.doc.name !== 'string') throw new Error('name 缺失')
      valid.push(d)
    } catch (e) {
      console.warn('[my-symbols] 跳过畸形符号文档', d?.id, e instanceof Error ? e.message : String(e))
    }
  }
  if (valid.length === 0) return 0
  const signature = valid.map(({ id, doc, version }) => `${id}:${doc.name}:${version ?? ''}`).join('|')
  if (signature === lastSignature) return valid.length
  lastSignature = signature
  leftAsideStore.registerConfig(MY_SYMBOLS_GROUP, valid.map(({ id, doc }) => toRegistrationItem(id, doc)))
  return valid.length
}
