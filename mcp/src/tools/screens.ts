/**
 * 画面读工具族（设计 §4.2）：hmi_list_screens / hmi_get_screen / hmi_validate_screen。
 *
 * validate 是**纯计算**（零网络）：后端硬约束镜像 routes_meta.rs:282-297（id 词法
 * ≤64、doc ≤128KiB、JSON 语法——这三项越线 PUT 直接 4xx/413，故为 error 级）；
 * 语义面（图元 tag 存在性 / binds 路径 / custom_code 词表 / BI series 契约）为
 * warning 级——后端不校验这些，越线只是渲染降级或 AI 协作质量差，不拦发布。
 * 单源引用：registry.ts + groups.ts 直接相对 import（D1 的核心价值——编辑器认
 * 什么 schema 这里就校验什么，永不漂移）。
 */
import { z } from 'zod'
import { allSymbols } from '../../../src/symbols/registry'
// maotu 内置标签白名单单源（src/symbols/builtin-tags.ts，与前端 plugin-fallback 共用；
// 曾双源手抄漂移——mcp 侧漏 group 致组合项恒报 unknown_tag，2026-10-31 审查修复）
import { BUILTIN_TAGS } from '../../../src/symbols/builtin-tags'
import { collectBiPanels, planQueries, BI_MAX_BATCH, BI_TAG_PREFIX } from '../../../src/lib/bi-contract'
import { HmiBackend } from '../backend'
import { readOnlyAnnotations, type RiskTier } from '../risk'
import type { ToolRegistrar } from '../registrar'

// ---------- 后端硬约束镜像（routes_meta.rs） ----------

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
export const MAX_DOC_BYTES = 131_072

export interface ValidationIssue {
  /** 'error' = PUT 会被后端拒；'warning' = 可发布但质量/渲染风险 */
  level: 'error' | 'warning'
  code: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

/** custom_code 词表白名单（设计 §4.2：$rsiot/$mtEventCallBack/$getItemAttrByID 之外标红）。 */
export const CUSTOM_CODE_IDENTS = new Set(['$rsiot', '$mtEventCallBack', '$getItemAttrByID', '$item_info', '$args'])

export function registryTagIds(): Set<string> {
  return new Set(allSymbols().map((s) => s.id))
}

/** 画面文档结构校验（全部纯函数，单测直测）。docText 用原文——尺寸按字节算。 */
export function validateScreenDoc(id: string, docText: string): ValidationResult {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  if (!ID_RE.test(id)) {
    errors.push({ level: 'error', code: 'invalid_id', message: `画面 id 不合词法（首字符小写字母/数字，其余小写字母/数字/连字符，≤64）：${JSON.stringify(id)}` })
  }
  if (Buffer.byteLength(docText, 'utf8') > MAX_DOC_BYTES) {
    errors.push({ level: 'error', code: 'too_large', message: `文档 ${Buffer.byteLength(docText, 'utf8')} 字节超过 128KiB 上限（PUT 将 413）` })
  }
  let doc: unknown
  try {
    doc = JSON.parse(docText) as unknown
  } catch (e) {
    errors.push({ level: 'error', code: 'invalid_json', message: `JSON 语法非法：${e instanceof Error ? e.message : String(e)}` })
    return { ok: false, errors, warnings }
  }

  const knownTags = registryTagIds()
  const items = typeof doc === 'object' && doc !== null && Array.isArray((doc as Record<string, unknown>).json)
    ? (doc as Record<string, unknown>).json as unknown[]
    : undefined
  if (!items) {
    warnings.push({ level: 'warning', code: 'no_json_array', message: 'doc.json 非数组（maotu done_json 缺画布元素列表？）' })
  } else {
    for (const item of items) {
      collectItemWarnings(item, knownTags, warnings)
    }
  }
  collectBiWarnings(doc, warnings)

  return { ok: errors.length === 0, errors, warnings }
}

function collectItemWarnings(item: unknown, knownTags: Set<string>, warnings: ValidationIssue[]): void {
  if (typeof item !== 'object' || item === null) {
    warnings.push({ level: 'warning', code: 'item_not_object', message: 'json[] 存在非对象元素' })
    return
  }
  const it = item as Record<string, unknown>
  if (typeof it.id !== 'string' || !it.id) {
    warnings.push({ level: 'warning', code: 'item_no_id', message: `图元缺 id（title=${String(it.title)}）` })
  }
  const tag = typeof it.tag === 'string' ? it.tag : undefined
  if (!tag) {
    warnings.push({ level: 'warning', code: 'item_no_tag', message: `图元缺 tag（id=${String(it.id)}）` })
  } else if (!knownTags.has(tag) && !BUILTIN_TAGS.has(tag)) {
    warnings.push({ level: 'warning', code: 'unknown_tag', message: `tag "${tag}" 不在图元注册表（maotu 内置标签白名单之外——渲染将降级占位）` })
  }
  // binds：bind_attr 一律指 props.<name>.val（types.ts ⑤ 归一化契约）；bind_id = <devid>.<tag>
  if (Array.isArray(it.binds)) {
    for (const b of it.binds) {
      if (typeof b !== 'object' || b === null) continue
      const bind = b as Record<string, unknown>
      if (typeof bind.bind_attr === 'string' && bind.bind_attr && !/^props\.[^.]+\.val$/.test(bind.bind_attr)) {
        warnings.push({ level: 'warning', code: 'bad_bind_attr', message: `bind_attr "${bind.bind_attr}" 不合 props.<name>.val 契约（id=${String(it.id)}）` })
      }
      if (typeof bind.bind_id === 'string' && bind.bind_id && !bind.bind_id.includes('.')) {
        warnings.push({ level: 'warning', code: 'bad_bind_id', message: `bind_id "${bind.bind_id}" 应为 <devid>.<tag>（唯一 field 格式）` })
      }
    }
  }
  // events：custom_code 词表扫描（$ 标识符白名单外标红——写审批时人可见）
  if (Array.isArray(it.events)) {
    for (const ev of it.events) {
      if (typeof ev !== 'object' || ev === null) continue
      const code = (ev as Record<string, unknown>).custom_code
      if (typeof code !== 'string' || !code) continue
      for (const ident of code.matchAll(/\$[A-Za-z_][A-Za-z0-9_]*/g)) {
        if (!CUSTOM_CODE_IDENTS.has(ident[0])) {
          warnings.push({ level: 'warning', code: 'custom_code_ident', message: `custom_code 引用词表外标识 ${ident[0]}（允许：${[...CUSTOM_CODE_IDENTS].join(' ')}；id=${String(it.id)}）` })
        }
      }
    }
  }
}

/**
 * BI 图元契约校验：逐个 ah-bi-* 顶层元素走 collectBiPanels（单源解析）。
 * 注意 collectBiPanels 对空 series 面板是**跳过**语义（宿主收集器同款）——
 * "面板缺席"正是校验要抓的信号，故这里按元素逐个判：0 面板 = 契约解析空 → warning。
 */
export function collectBiWarnings(doc: unknown, warnings: ValidationIssue[]): void {
  const items = typeof doc === 'object' && doc !== null && Array.isArray((doc as Record<string, unknown>).json)
    ? (doc as Record<string, unknown>).json as unknown[]
    : []
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue
    const it = item as Record<string, unknown>
    if (typeof it.tag !== 'string' || !it.tag.startsWith(BI_TAG_PREFIX)) continue
    const id = typeof it.id === 'string' ? it.id : '(缺 id)'
    let panels
    try {
      panels = collectBiPanels([item])
    } catch (e) {
      warnings.push({ level: 'warning', code: 'bi_contract', message: `BI 图元 ${id} 契约解析异常：${e instanceof Error ? e.message : String(e)}` })
      continue
    }
    if (!panels.length) {
      warnings.push({ level: 'warning', code: 'bi_no_series', message: `BI 图元 ${id}（tag=${it.tag}）series 解析为空（props.series 需 JSON 串：[{dev_id,tag,label,unit,mode,color}]）——面板将渲染空态` })
      continue
    }
    for (const p of panels) {
      try {
        const planned = planQueries([p], Math.floor(Date.now() / 1000))
        if (planned.length > BI_MAX_BATCH) {
          warnings.push({ level: 'warning', code: 'bi_batch_overflow', message: `BI 图元 ${p.id} 单面板查询 ${planned.length} 条 > 单批上限 ${BI_MAX_BATCH}（宿主收集器会分批，跨面板合并收益归零）` })
        }
      } catch {
        /* planQueries 异常已在 parse 侧兜住 */
      }
    }
  }
}

// ---------- MCP 工具注册 ----------

function textResult(payload: unknown): { content: Array<Record<string, unknown>> } {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
}

export function registerScreenTools(server: ToolRegistrar, backend: HmiBackend): void {
  server.registerTool(
    'hmi_list_screens',
    {
      description: '列出全部画面 slug（GET /api/v1/screens）。无参数。',
      inputSchema: {},
      annotations: readOnlyAnnotations(),
    },
    async () => {
      const data = await backend.get('/api/v1/screens') as { screens?: string[] }
      return textResult({ screens: data.screens ?? [], count: data.screens?.length ?? 0 })
    },
  )

  server.registerTool(
    'hmi_get_screen',
    {
      description: '取单个画面：完整 doc JSON + 当前版本号 + 版本元数据摘要（seq/ts/author/size）。作者 hmi-mcp 的条目即 AI 写作历史。',
      inputSchema: { id: zString('画面 slug') },
      annotations: readOnlyAnnotations(),
    },
    async (args) => {
      const { id } = args as { id: string }
      const head = await backend.get(`/api/v1/screens/${encodeURIComponent(id)}`)
      let versions: unknown = null
      try {
        const v = await backend.get(`/api/v1/screens/${encodeURIComponent(id)}/versions`) as { versions?: unknown[] }
        versions = { count: v.versions?.length ?? 0, latest: v.versions?.slice(0, 5) }
      } catch {
        /* 旧版 rs-iot 无版本端点——head 照常返回 */
      }
      return textResult({ ...(head as Record<string, unknown>), versions })
    },
  )

  server.registerTool(
    'hmi_validate_screen',
    {
      description: '校验画面文档（纯计算，零写入）：error = 后端将拒（id 词法/128KiB/JSON 语法）；warning = 语义风险（未知 tag/bind 路径/custom_code 词表外标识/BI 契约）。落库前必调。',
      inputSchema: {
        id: zString('画面 slug（PUT 目标 id，同一词法约束）'),
        doc: zString('完整画面 doc JSON 原文（与 PUT body 一致）'),
      },
      annotations: readOnlyAnnotations(),
    },
    async (args) => {
      const { id, doc } = args as { id: string; doc: string }
      return textResult(validateScreenDoc(id, doc))
    },
  )
}

/** 统一字符串参数（带描述喂给 LLM）。 */
function zString(description: string) {
  return z.string().describe(description)
}

export type ScreenToolTier = RiskTier
