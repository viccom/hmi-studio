#!/usr/bin/env node
/**
 * rollback-dist.mjs — P4 回滚：旧 index 换回（assets 增量共存，未清空 → 旧资产仍在）。
 *
 * deploy-dist.mjs 每次换装前把旧 index 备份进 dist/.rollback/index-<ts>-<sha>.html
 * （保留最近 N 份）。本脚本把指定备份换回 dist/index.html 并同步 version.json。
 *
 * 用法：
 *   node scripts/rollback-dist.mjs           # 回滚到上一份
 *   node scripts/rollback-dist.mjs --list    # 列出可回滚的备份
 *   node scripts/rollback-dist.mjs --to index-1769...-a1b2c3.html
 */
import { cpSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')
const ROLLBACK_DIR = join(DIST, '.rollback')

const backups = readdirSync(ROLLBACK_DIR)
  .filter((f) => f.startsWith('index-') && f.endsWith('.html'))
  .sort() // 文件名时间戳字典序 = 部署时间序
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1) }

if (process.argv.includes('--list') || backups.length === 0) {
  console.log(backups.length === 0 ? '（无备份——首次部署后才会产生）' : '可回滚的 index 备份（新→旧）：')
  for (const f of [...backups].reverse()) {
    const m = f.match(/^index-(\d+)-([0-9a-f]+|unknown)\.html$/)
    const when = m ? new Date(Number(m[1])).toISOString() : '?'
    console.log(`  ${f}   (${when})`)
  }
  process.exit(0)
}

const toArg = process.argv.includes('--to') ? process.argv[process.argv.indexOf('--to') + 1] : null
const target = toArg ?? backups[backups.length - 1] // 缺省回滚到最近一份
if (!backups.includes(target)) fail(`备份不存在：${target}（--list 查看）`)

// 回滚 = 备份 index 换回 + version.json 同步（sha 取自备份名）
const m = target.match(/^index-(\d+)-([0-9a-f]+|unknown)\.html$/)
const sha = m && m[2] !== 'unknown' ? m[2] : null
cpSync(join(ROLLBACK_DIR, target), join(DIST, 'index.html'))
writeFileSync(
  join(DIST, 'version.json'),
  `${JSON.stringify({ gitSha: sha, builtAt: m ? new Date(Number(m[1])).toISOString() : null, rolledBackFrom: target }, null, 2)}\n`,
)
// 消耗该备份（防二次回滚到同一点产生回环）；更旧的备份仍在
rmSync(join(ROLLBACK_DIR, target))

console.log('✅ 已回滚')
console.log(`   index  : ${target}`)
console.log(`   gitSha : ${sha ?? '（备份未记录）'}`)
console.log('   注意   : 若期间跑过 prune-assets 删掉了该版独有资产，需重新部署该 commit')
