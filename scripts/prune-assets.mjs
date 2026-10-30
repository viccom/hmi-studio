#!/usr/bin/env node
/**
 * prune-assets.mjs — P4 清理：删不再被任何保留构建引用的 hash 资产（防 dist/assets 无限累积）。
 *
 * **保留集 = 当前 index 引用 ∪ 全部构建清单（.rollback/build-*.files）∪ 旧制
 * index 备份直接引用**。构建清单是构建级完备集（一次 vite build 的全部 chunk
 * 含 import() 懒加载块——index.html 扫不出它们）；只扫 index 引用会误删懒加载
 * chunk 致白屏（2026-10-30 实测事故，已修）。回滚可用性优先于磁盘洁癖。
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
    // build-*.files = 构建级完备清单（含懒加载 chunk——index.html 扫不出它们，
    // 2026-10-30 实测曾因此误删 EditView/ViewView 致白屏）
    if (f.startsWith('build-') && f.endsWith('.files')) {
      backupCount += 1
      for (const line of readFileSync(join(DIST, '.rollback', f), 'utf8').split('\n')) {
        if (line.trim()) keep.add(line.trim())
      }
    } else if (f.startsWith('index-')) {
      // 旧制备份（无清单时代）兜底：至少保住其直接引用
      for (const r of refsOf(readFileSync(join(DIST, '.rollback', f), 'utf8'))) keep.add(r)
    }
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
