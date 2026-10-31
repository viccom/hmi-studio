/**
 * 写工具族（设计 §4.2，第 3 轮）：create / put / put_protected / rename_group /
 * rollback / delete / install_plugin。
 *
 * 护栏三层（K1）：
 *  1. 风险档标注（annotations）——reasonix ask 模式据此弹审批（readOnlyHint=false 即拦）；
 *     保护 slug 的 put 走独立 CW 工具（MCP annotations 是静态的，按目标分级只能拆工具）；
 *  2. 服务端前置闸——validate 全绿才落库（error 级 = PUT 必拒，提前拦下省一轮网络）、
 *     put/put_protected 强制 if_version（zod 必填，LLM 必须先 hmi_get_screen）、
 *     create 探测 404 才建 + ?if_version=0 竞态闸、delete 对保护 slug 硬拒（无 force 通道）；
 *  3. 落库前 sanitizeBiProps（单源 import，与编辑器保存链同款——BI 运行态数据不入库）。
 *
 * 单源引用：PROTECTED_SLUGS（screen-assets/protected.ts，K6 翻转后零依赖）、
 * sanitizeBiProps（lib/bi-sanitize.ts，纯函数）。
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { z } from 'zod'
import { PROTECTED_SLUGS, isProtectedSlug } from '../../../src/screen-assets/protected'
import { sanitizeBiProps } from '../../../src/lib/bi-sanitize'
import { HmiBackend, HmiApiError } from '../backend'
import { writeAnnotations } from '../risk'
import type { ToolRegistrar } from '../registrar'
import { validateScreenDoc } from './screens'

const execFileAsync = promisify(execFile)

/** put 命中保护 slug 的拒绝文案前缀（测试锚）。 */
export const PUT_PROTECTED_MESSAGE_PREFIX = '该画面属长期资产保护清单'

export type SpawnImpl = (cmd: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>

/** 默认 spawn：install-plugin.mjs 的退出码/输出原样回传（错误也走 ok:false 结构化，不抛）。 */
function defaultSpawn(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return execFileAsync(cmd, args, { timeout: 60_000 }).then(
    (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }),
    (e: NodeJS.ErrnoException & { code?: number | string; stdout?: string; stderr?: string }) => {
      if (typeof e.code === 'number' || (typeof e.code === 'string' && /^\d+$/.test(e.code))) {
        return { code: Number(e.code), stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
      }
      return { code: -1, stdout: '', stderr: e.message }
    },
  )
}

/** hmi-studio 仓根：esbuild bundle 会摊平模块层级（import.meta.url = dist/index.js，
 *  非 src/tools/writes.ts）——按「脚本存在性」双候选探测，源布局/束布局都命中。 */
function repoRoot(): string {
  const candidates = [
    new URL('../../../scripts/install-plugin.mjs', import.meta.url), // 源布局 mcp/src/tools/
    new URL('../../scripts/install-plugin.mjs', import.meta.url), // 束布局 mcp/dist/
  ]
  for (const c of candidates) {
    const p = fileURLToPath(c)
    if (existsSync(p)) return fileURLToPath(new URL('..', c)) // 脚本在 <repo>/scripts/ → 上一级即仓根
  }
  throw new Error('install-plugin.mjs 不在预期位置（mcp 布局漂移？）——HMI_WIDGETS/安装动作不可用')
}

// ---------- 公共小件 ----------

function textResult(payload: unknown): { content: Array<Record<string, unknown>> } {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
}

/** doc 入参归一：LLM 传对象或 JSON 文本均可（文本保真用于尺寸校验）。 */
function docToText(doc: string | Record<string, unknown>): string {
  return typeof doc === 'string' ? doc : JSON.stringify(doc)
}

const zDoc = z.union([z.string(), z.record(z.unknown())]).describe('完整画面 doc JSON（对象或原文文本均可，与 PUT body 一致）')

/** 校验闸 + sanitize：errors 非空拒绝（warning 透传不拦）；通过则返回可落库的干净 doc 对象。 */
function gateDoc(id: string, doc: string | Record<string, unknown>):
  { ok: false; content: ReturnType<typeof textResult> } | { ok: true; body: Record<string, unknown>; warnings: unknown[] } {
  const text = docToText(doc)
  const v = validateScreenDoc(id, text)
  if (!v.ok) {
    return { ok: false, content: textResult({ ok: false, code: 'validation_failed', errors: v.errors, warnings: v.warnings, message: '画面文档未过后端硬约束校验（error 级），已拒绝写入。请按 errors 修正后重试。' }) }
  }
  let parsed: unknown
  try {
    parsed = typeof doc === 'string' ? JSON.parse(doc) : doc
  } catch {
    return { ok: false, content: textResult({ ok: false, code: 'validation_failed', message: 'doc 非法 JSON' }) }
  }
  return { ok: true, body: sanitizeBiProps(parsed) as Record<string, unknown>, warnings: v.warnings }
}

/** PUT/rollback 的 409 → 结构化冲突（LLM 可自纠：重 get → 重写）；其余非 2xx 原样抛（MCP isError）。 */
async function putOrConflict(backend: HmiBackend, method: 'put' | 'post', path: string, body?: unknown): Promise<Record<string, unknown>> {
  try {
    return method === 'put' ? await backend.put(path, body) as Record<string, unknown> : await backend.post(path, body) as Record<string, unknown>
  } catch (e) {
    if (e instanceof HmiApiError && e.status === 409) {
      let current: unknown
      try { current = JSON.parse(e.body).current_version } catch { /* body 非结构化时留空 */ }
      return { status: '__conflict__', current_version: current }
    }
    throw e
  }
}

/** cap 并发批量（镜像 lib/screen-list batched 的 cap=4 语义，保护 rs-iot）。 */
async function mapBatched<T, R>(items: T[], cap: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += cap) {
    out.push(...await Promise.all(items.slice(i, i + cap).map(fn)))
  }
  return out
}

// ---------- 工具注册 ----------

export function registerWriteTools(server: ToolRegistrar, backend: HmiBackend, opts: { spawnImpl?: SpawnImpl } = {}): void {
  const spawn = opts.spawnImpl ?? defaultSpawn

  // ---- hmi_create_screen（W）----
  server.registerTool(
    'hmi_create_screen',
    {
      description: '新建画面：先本地校验（error 级拒绝），再 GET 探测（已存在拒绝防覆盖），404 才 PUT（带 ?if_version=0 竞态闸）。创建前先调 hmi_validate_screen 预检更稳。',
      inputSchema: {
        id: z.string().describe('画面 slug（^[a-z0-9][a-z0-9-]{0,63}$）'),
        doc: zDoc,
      },
      annotations: writeAnnotations(false),
    },
    async (args) => {
      const { id, doc } = args as { id: string; doc: string | Record<string, unknown> }
      const gate = gateDoc(id, doc)
      if (!gate.ok) return gate.content
      try {
        await backend.get(`/api/v1/screens/${encodeURIComponent(id)}`)
        return textResult({ ok: false, code: 'exists', message: `画面 ${id} 已存在（PUT 为全量覆盖语义，创建已阻止）。要修改请用 hmi_put_screen（需 if_version）。` })
      } catch (e) {
        if (!(e instanceof HmiApiError) || e.status !== 404) {
          return textResult({ ok: false, code: 'probe_failed', message: `探测画面是否可用失败（仅 404 视为可创建）：${e instanceof Error ? e.message : String(e)}` })
        }
      }
      const r = await putOrConflict(backend, 'put', `/api/v1/screens/${encodeURIComponent(id)}?if_version=0`, gate.body)
      if (r.status === '__conflict__') {
        return textResult({ ok: false, code: 'exists', message: `创建竞态：画面 ${id} 在探测后已被他人创建（当前版本 ${String(r.current_version)}）。请改用 hmi_put_screen。` })
      }
      return textResult({ ok: true, id, version: r.version, warnings: gate.warnings })
    },
  )

  // ---- hmi_put_screen（W；保护 slug 由 hmi_put_protected_screen 承接）----
  server.registerTool(
    'hmi_put_screen',
    {
      description: '更新画面（全量覆盖）：必须带 if_version（先 hmi_get_screen 取当前 version）；本地校验 error 级拒绝落库；BI 运行态数据自动复位。409 = 他人/AI 已先写，重取画面再改。长期资产画面（保护清单）用 hmi_put_protected_screen。',
      inputSchema: {
        id: z.string().describe('画面 slug'),
        doc: zDoc,
        if_version: z.number().int().min(0).describe('期望的当前版本号（hmi_get_screen 返回的 version）——乐观锁，防覆盖他人/AI 的并发修改'),
      },
      annotations: writeAnnotations(false),
    },
    async (args) => {
      const { id, doc, if_version } = args as { id: string; doc: string | Record<string, unknown>; if_version: number }
      if (isProtectedSlug(id)) {
        return textResult({ ok: false, code: 'protected', message: `${PUT_PROTECTED_MESSAGE_PREFIX}（${PROTECTED_SLUGS.length} 个长期资产画面）。修改保护画面请用 hmi_put_protected_screen（最高档审批）。清单：${PROTECTED_SLUGS.join(', ')}` })
      }
      return putScreen(backend, id, doc, if_version)
    },
  )

  // ---- hmi_put_protected_screen（CW：仅保护清单成员）----
  server.registerTool(
    'hmi_put_protected_screen',
    {
      description: '更新长期资产画面（保护清单成员，最高档审批）。语义同 hmi_put_screen（if_version 必填 + 校验前置 + BI sanitize）；非保护画面请用 hmi_put_screen。',
      inputSchema: {
        id: z.string().describe('保护清单内的画面 slug'),
        doc: zDoc,
        if_version: z.number().int().min(0).describe('期望的当前版本号（hmi_get_screen 返回的 version）'),
      },
      annotations: writeAnnotations(true),
    },
    async (args) => {
      const { id, doc, if_version } = args as { id: string; doc: string | Record<string, unknown>; if_version: number }
      if (!isProtectedSlug(id)) {
        return textResult({ ok: false, code: 'not_protected', message: `画面 ${id} 不在保护清单，普通画面请用 hmi_put_screen（低一档审批）。` })
      }
      return putScreen(backend, id, doc, if_version)
    },
  )

  // ---- hmi_rename_group（W）----
  server.registerTool(
    'hmi_rename_group',
    {
      description: '画面组重命名（to 已存在即合并语义）：列出全部画面 → 组成员批量改 doc.group → PUT（带 if_version 乐观锁）。长期资产画面（保护清单）不参与重命名、计入 protected_skipped；409 计入 conflicts。画面级隔离（单幅失败计入 fail），cap 4 并发保护 rs-iot。',
      inputSchema: {
        from: z.string().describe('原组名（须已存在）'),
        to: z.string().describe('新组名（与既有组同名 = 合并）'),
      },
      annotations: writeAnnotations(false),
    },
    async (args) => {
      const { from, to } = args as { from: string; to: string }
      const list = await backend.get('/api/v1/screens') as { screens?: string[] }
      const ids = list.screens ?? []
      const docs = await mapBatched(ids, 4, async (id) => {
        try {
          const g = await backend.get(`/api/v1/screens/${encodeURIComponent(id)}`) as { doc?: Record<string, unknown>; version?: number }
          return { id, doc: g.doc, group: g.doc?.group, version: g.version }
        } catch { return { id, doc: undefined, group: undefined, version: undefined } }
      })
      const members = docs.filter((d) => d.doc !== undefined && d.group === from)
      // 保护清单：与 put/delete 同款硬边界——W 档工具不得改长期资产（保护画面请走人工 UI）
      const protectedMembers = members.filter((m) => isProtectedSlug(m.id))
      const writable = members.filter((m) => !isProtectedSlug(m.id))
      let fail = 0
      const done: string[] = []
      const conflicts: string[] = []
      await mapBatched(writable, 4, async (m) => {
        try {
          // 乐观锁：GET 已带回 version（旧版服务端无该字段时退化为无条件写，保持兼容）
          const q = typeof m.version === 'number' ? `?if_version=${m.version}` : ''
          await backend.put(`/api/v1/screens/${encodeURIComponent(m.id)}${q}`, { ...m.doc!, group: to })
          done.push(m.id)
        } catch (e) {
          if (e instanceof HmiApiError && e.status === 409) conflicts.push(m.id)
          else fail += 1
        }
      })
      const message = members.length === 0
        ? `没有画面属于组「${from}」（组名须与列表页显示一致）`
        : protectedMembers.length
          ? `${protectedMembers.length} 个长期资产画面未参与重命名（${protectedMembers.map((m) => m.id).join(', ')}）——保护画面请走人工编辑器`
          : undefined
      return textResult({ ok: true, renamed: done.length, fail, conflicts, protected_skipped: protectedMembers.map((m) => m.id), screens: done, message })
    },
  )

  // ---- hmi_rollback_screen（CW）----
  server.registerTool(
    'hmi_rollback_screen',
    {
      description: '回滚画面到指定版本（改线上内容，最高档审批）：目标版正文成为新 head，回滚前的 head 自动存为新版本（回滚可再回滚）。版本元数据看 hmi_get_screen 的 versions。',
      inputSchema: {
        id: z.string().describe('画面 slug'),
        to_version: z.number().int().min(1).describe('目标版本号（versions 列表里的 seq）'),
        if_version: z.number().int().min(0).optional().describe('可选乐观锁（同 hmi_put_screen 语义）'),
      },
      annotations: writeAnnotations(true),
    },
    async (args) => {
      const { id, to_version, if_version } = args as { id: string; to_version: number; if_version?: number }
      const q = if_version !== undefined ? `?if_version=${if_version}` : ''
      const r = await putOrConflict(backend, 'post', `/api/v1/screens/${encodeURIComponent(id)}/rollback${q}`, { to_version })
      if (r.status === '__conflict__') {
        return textResult({ ok: false, code: 'version_conflict', current_version: r.current_version, message: '回滚前版本已变（他人/AI 已先写），请重取画面后重试。' })
      }
      return textResult({ ok: true, id, to_version, version: r.version })
    },
  )

  // ---- hmi_delete_screen（CW + 保护 slug 硬拒）----
  server.registerTool(
    'hmi_delete_screen',
    {
      description: '删除画面（幂等，最高档审批）。**长期资产画面（保护清单）硬拒绝、无 force 通道**——删保护画面请走人工编辑器 UI 由人操作。',
      inputSchema: {
        id: z.string().describe('画面 slug（保护清单成员将被拒绝）'),
      },
      annotations: writeAnnotations(true),
    },
    async (args) => {
      const { id } = args as { id: string }
      if (isProtectedSlug(id)) {
        return textResult({ ok: false, code: 'protected', message: `画面 ${id} 属长期资产保护清单，AI 不得删除（不可 force）。如确需删除请走人工编辑器 UI 由人操作。清单：${PROTECTED_SLUGS.join(', ')}` })
      }
      const r = await backend.del(`/api/v1/screens/${encodeURIComponent(id)}`) as Record<string, unknown>
      return textResult({ ok: true, id, status: r.status ?? 'ok' })
    },
  )

  // ---- hmi_install_plugin（CW：spawn 安装脚本）----
  server.registerTool(
    'hmi_install_plugin',
    {
      description: '安装图元插件（最高档审批，代码进入信任域）：source_dir 须含 manifest.json（id 不得以 ah- 开头）与 dist.js（ESM 工厂，禁裸 import）。等价于人跑 `node scripts/install-plugin.mjs <source_dir>`；安装后经 /hmi/widgets/ 白名单分发。',
      inputSchema: {
        source_dir: z.string().describe('插件目录绝对路径（manifest.json 所在目录，通常在你的工作区内）'),
      },
      annotations: writeAnnotations(true),
    },
    async (args) => {
      const { source_dir } = args as { source_dir: string }
      const r = await spawn('node', [`${repoRoot()}/scripts/install-plugin.mjs`, source_dir])
      if (r.code !== 0) {
        return textResult({ ok: false, code: 'install_failed', stdout: r.stdout.slice(-2000), stderr: r.stderr.slice(-2000), message: '安装脚本失败（lint/复制/清单维护其一），见 stderr。' })
      }
      return textResult({ ok: true, stdout: r.stdout.slice(-2000), message: '安装完成；编辑器刷新后「扩展图元（本站）」组可见。' })
    },
  )
}

/** put/put_protected 共用主体（调用方已完成保护清单分流）。 */
async function putScreen(backend: HmiBackend, id: string, doc: string | Record<string, unknown>, ifVersion: number) {
  const gate = gateDoc(id, doc)
  if (!gate.ok) return gate.content
  const r = await putOrConflict(backend, 'put', `/api/v1/screens/${encodeURIComponent(id)}?if_version=${ifVersion}`, gate.body)
  if (r.status === '__conflict__') {
    return textResult({ ok: false, code: 'version_conflict', current_version: r.current_version, message: `版本冲突：画面 ${id} 当前版本已是 ${String(r.current_version)}（他人/AI 已先写）。请重新 hmi_get_screen 取最新内容与 version，合并你的修改后再试。` })
  }
  return textResult({ ok: true, id, version: r.version, warnings: gate.warnings })
}
