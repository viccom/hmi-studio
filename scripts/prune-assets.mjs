#!/usr/bin/env node
/**
 * prune-assets.mjs — P4 清理：删当前 index 未引用的 hash 资产（防 dist/assets 无限累积）。
 *
 * **保留集 = 当前 index 引用 ∪ 全部回滚备份引用**（回滚可用性优先于磁盘洁癖——
 * 被 prune 删掉的版再 rollback 会缺资产，deploy-dist 输出已提示该交互）。
 *
 * 用法：
 *   node scripts/prune-assets.mjs --dry-run   # 先看后删（推荐第一步）
 *   node scripts/prune-assets.mjs             # 真删
 */
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')
const DRY = process.argv.includes('--dry-run')

// index 对资产的引用形态（vite base=/hmi/）：<script src="/hmi/assets/x.[hash].js">、
// <link href="/hmi/assets/x.[hash].css">。宽松提取 assets/ 目录下的文件名。
const refsOf = (html) => new Set([...html.matchAll(/assets\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]))

let keep = new Set()
try {
  keep = refsOf(readFileSync(join(DIST, 'index.html'), 'utf8'))
} catch {
  console.error('✗ dist/index.html 不存在——先部署再清理')
  process.exit(1)
}
let backupCount = 0
try {
  for (const f of readdirSync(join(DIST, '.rollback'))) {
    if (!f.startsWith('index-')) continue
    backupCount += 1
    for (const r of refsOf(readFileSync(join(DIST, '.rollback', f), 'utf8'))) keep.add(r)
  }
} catch { /* 无备份目录 */ }

const files = readdirSync(join(DIST, 'assets'))
const dead = files.filter((f) => !keep.has(f))

if (dead.length === 0) {
  console.log('✓ 无未引用资产（当前 index + 回滚备份全部保留）')
  process.exit(0)
}
if (DRY) {
  console.log(`dry-run：将删除 ${dead.length} 个未引用资产（保留 ${files.length - dead.length} 个；回滚备份 ${backupCount} 份的引用已计入保留集）`)
  for (const f of dead) console.log(`  rm dist/assets/${f}`)
  process.exit(0)
}
for (const f of dead) rmSync(join(DIST, 'assets', f))
console.log(`✅ 已删除 ${dead.length} 个未引用资产（保留 ${files.length - dead.length} 个）`)
