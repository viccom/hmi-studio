#!/usr/bin/env node
/**
 * 图元插件安装器（P3b，设计 §6.2）：人/AI shell 同款（hmi_install_plugin MCP 工具
 * 即 spawn 本脚本）。目录白名单 = 信任边界（D4/D5）：进入 widgets/ 只能经此显式动作。
 *
 * 用法：
 *   node scripts/install-plugin.mjs <source_dir>     # 安装/升级（lint → 复制 → index.json）
 *   node scripts/install-plugin.mjs --remove <id>    # 卸载（目录 + index.json 条目）
 *   node scripts/install-plugin.mjs --list           # 列已装插件
 * 目录：HMI_WIDGETS_DIR 环境变量覆盖，默认 <repo>/widgets/（gitignore 运行时工件）。
 *
 * lint 面（拒绝 = 非零退出，安装不发生）：
 *   1. manifest.json 可解析 + id 合 ^(?!ah-)[a-z][a-z0-9-]{0,63}$（ah- 保留给上游内置）
 *   2. version 合 \d+\.\d+\.\d+；entry 存在于源目录（默认 dist.js）
 *   3. entry 文本无**裸 import**（spec 必须相对 ./ ../ 或绝对 / 或 http(s) URL——
 *      浏览器不解析裸说明符，工厂注入是唯一取依赖通道）
 */
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WIDGETS_DIR = process.env.HMI_WIDGETS_DIR ?? join(REPO, 'widgets')

// ---------- 纯函数（单测直测：scripts/install-plugin.test.ts） ----------

export const ID_RE = /^(?!ah-)[a-z][a-z0-9-]{0,63}$/
export const VERSION_RE = /^\d+\.\d+\.\d+$/

/** entry 路径安全（2026-10-31 审查修复）：安装器对 entry 做两次拼接——读 = resolve(源目录,
 *  entry)、写 = resolve(widgets/<id>, entry)。含 `..` 的相对 entry 会让两次解析各自越界
 *  （实测可读源目录外文件并覆盖 widgets 外的既有文件）。约束：相对路径、无 `..` 段。 */
export function entryIsSafe(entry) {
  if (typeof entry !== 'string' || !entry) return false
  if (entry.startsWith('/') || /^[A-Za-z]:/.test(entry)) return false
  return !entry.split('/').includes('..')
}

/** 安装闸：manifest 校验（返回错误清单，空 = 通过）。entryText 传入时一并做 import 扫描。
 *  相对 import 也拒绝——安装只复制 entry 单文件（src/ 仅为留档），相对依赖装后必 404。 */
export function lintManifest(manifest, opts = {}) {
  const errors = []
  const entry = manifest?.entry ?? 'dist.js'
  if (typeof manifest?.id !== 'string' || !ID_RE.test(manifest.id)) {
    errors.push(`manifest.id 非法（须匹配 ${ID_RE}，ah- 前缀保留给上游内置图元）：${JSON.stringify(manifest?.id)}`)
  }
  if (typeof manifest?.version !== 'string' || !VERSION_RE.test(manifest.version)) {
    errors.push(`manifest.version 非法（须 x.y.z）：${JSON.stringify(manifest?.version)}`)
  }
  if (typeof manifest?.name !== 'string' || !manifest.name) {
    errors.push('manifest.name 缺失')
  }
  if (!entryIsSafe(entry)) {
    errors.push(`manifest.entry 非法（须相对路径且不含 ..——安装器按 entry 在源目录/目标目录各解析一次）：${JSON.stringify(entry)}`)
  }
  if (opts.entryMissing) {
    errors.push(`entry 文件缺失：${JSON.stringify(opts.entryMissing)}`)
  }
  if (typeof opts.entryText === 'string') {
    for (const bare of findBareImports(opts.entryText)) {
      errors.push(`entry 含裸 import（依赖须经宿主注入，spec 需相对/绝对路径或 URL）：${JSON.stringify(bare)}`)
    }
    for (const rel of findRelativeImports(opts.entryText)) {
      errors.push(`entry 含相对 import（安装只复制 entry 单文件，相对依赖装后必丢——请把依赖内联进 entry 或经宿主注入）：${JSON.stringify(rel)}`)
    }
  }
  return errors
}

/** import 说明符全量扫描（静态 import/export-from + 动态 import）。 */
export function collectImportSpecs(text) {
  const specs = []
  const patterns = [
    /(?:^|\n)\s*import\s+[^;'"]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s+[^;'"]*?from\s*['"]([^'"]+)['"]/g,
    // 动态 import 可出现在表达式任意位置（const m = await import('d3')）
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of patterns) {
    for (const m of text.matchAll(re)) specs.push(m[1])
  }
  return [...new Set(specs)]
}

/** 裸 import 扫描：静态 import/export-from + 动态 import('…') 的说明符。 */
export function findBareImports(text) {
  return collectImportSpecs(text).filter(
    (s) => !s.startsWith('.') && !s.startsWith('/') && !/^https?:/.test(s),
  )
}

/** 相对 import 扫描（. 开头）——安装只复制 entry，故视为错误。 */
export function findRelativeImports(text) {
  return collectImportSpecs(text).filter((s) => s.startsWith('.'))
}

/** index.json 合并（按 id 去重覆盖、id 升序）。 */
export function mergeIndex(existing, plugin) {
  const list = (existing?.plugins ?? []).filter((p) => p.id !== plugin.id)
  list.push({ id: plugin.id, name: plugin.name, version: plugin.version, entry: plugin.entry })
  list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { plugins: list }
}

/** 相对 URL（loader 拼在部署 base 后）：`widgets/<id>/dist.js?v=<version>`（非哈希名靠版本 bust）。 */
export function entryUrl(plugin) {
  return `widgets/${plugin.id}/${plugin.entry}?v=${plugin.version}`
}

// ---------- CLI 动作 ----------

/** index.json 解析（纯函数）：null 入参 = 文件缺失（空清单）；解析失败/形状非法 = null（损坏）。
 *  **绝不把损坏当空清单**——那会让下一次写入静默抹掉全部已装插件表项（实测）。 */
export function parseIndex(text) {
  if (text == null) return { plugins: [] }
  try {
    const v = JSON.parse(text)
    if (!v || typeof v !== 'object' || !Array.isArray(v.plugins)) return null
    return { plugins: v.plugins }
  } catch {
    return null
  }
}

function readIndex() {
  const p = join(WIDGETS_DIR, 'index.json')
  if (!existsSync(p)) return { plugins: [] }
  const parsed = parseIndex(readFileSync(p, 'utf8'))
  if (parsed === null) {
    console.error(`✗ ${p} 损坏（JSON 解析失败或 plugins 非数组）——为避免丢失已装插件清单，本次操作中止。请修复或删除该文件后重试。`)
    process.exit(1)
  }
  return parsed
}

/** 原子写（tmp + rename）：半写崩溃不再产生截断的 index.json。 */
function writeIndex(index) {
  mkdirSync(WIDGETS_DIR, { recursive: true })
  const p = join(WIDGETS_DIR, 'index.json')
  const tmp = `${p}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(index, null, 2) + '\n')
  renameSync(tmp, p)
}

/** p 是否在 root 之内（含边界比较，防 /a/bc 误判 /a/b）。 */
function within(root, p) {
  const r = resolve(root)
  return p === r || p.startsWith(r + sep)
}

function install(sourceDir) {
  const abs = resolve(sourceDir)
  const manifestPath = join(abs, 'manifest.json')
  if (!existsSync(manifestPath)) {
    console.error(`✗ 未找到 ${manifestPath}（source_dir 须为含 manifest.json 的插件目录）`)
    process.exit(1)
  }
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (e) {
    console.error(`✗ manifest.json 解析失败：${e.message}`)
    process.exit(1)
  }
  const entry = manifest.entry ?? 'dist.js'
  // 纵深防线：lint 的纯词法检查之外，按真实解析路径再验一次包含性（绝对/.. 均在此拦下）
  const entryPath = resolve(abs, entry)
  if (!within(abs, entryPath)) {
    console.error(`✗ entry 越出插件源目录：${JSON.stringify(entry)} → ${entryPath}`)
    process.exit(1)
  }
  const errors = lintManifest(manifest, {
    entryMissing: existsSync(entryPath) ? undefined : entry,
    entryText: existsSync(entryPath) ? readFileSync(entryPath, 'utf8') : undefined,
  })
  if (errors.length) {
    console.error(`✗ 插件 lint 未过（${errors.length} 项）：`)
    for (const e of errors) console.error('  - ' + e)
    process.exit(1)
  }
  const dest = join(WIDGETS_DIR, manifest.id)
  const destEntry = resolve(dest, entry)
  if (!within(dest, destEntry)) {
    console.error(`✗ entry 越出安装目标目录：${JSON.stringify(entry)} → ${destEntry}`)
    process.exit(1)
  }
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  // 复制面：manifest + entry + src/（源码留档）。其余（node_modules 等）不进信任域
  cpSync(manifestPath, join(dest, 'manifest.json'))
  mkdirSync(dirname(destEntry), { recursive: true })
  cpSync(entryPath, destEntry)
  const src = join(abs, 'src')
  if (existsSync(src)) cpSync(src, join(dest, 'src'), { recursive: true })
  writeIndex(mergeIndex(readIndex(), manifest))
  console.log(`✓ installed ${manifest.id}@${manifest.version} → ${dest}`)
  console.log(`  entry: ${entryUrl(manifest)}（编辑器刷新生效；「扩展图元（本站）」组）`)
}

function remove(id) {
  if (!ID_RE.test(id)) {
    console.error(`✗ id 非法：${id}`)
    process.exit(1)
  }
  rmSync(join(WIDGETS_DIR, id), { recursive: true, force: true })
  writeIndex({ plugins: (readIndex().plugins ?? []).filter((p) => p.id !== id) })
  console.log(`✓ removed ${id}`)
}

function list() {
  const idx = readIndex()
  if (!idx.plugins.length) return console.log('（无已装插件）')
  for (const p of idx.plugins) console.log(`${p.id}@${p.version}  ${p.name}  → ${entryUrl(p)}`)
}

// CLI 入口守卫：被 import（单测）时只暴露纯函数，不执行动作
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  const [cmd, arg] = process.argv.slice(2)
  if (cmd === '--remove') remove(arg)
  else if (cmd === '--list') list()
  else if (cmd && !cmd.startsWith('-')) install(cmd)
  else {
    console.error('用法：install-plugin.mjs <source_dir> | --remove <id> | --list')
    process.exit(1)
  }
}
