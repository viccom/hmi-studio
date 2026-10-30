#!/usr/bin/env node
/**
 * rollback-dist.mjs — P4 回滚：旧 index 换回（assets 增量共存，未清空 → 旧资产仍在）。
 *
 * deploy-dist.mjs 每次换装前把旧 index 备份进 dist/.rollback/index-<ts>-<sha>.html
 * （保留最近 N 份）。本脚本把指定备份换回 dist/index.html 并同步 version.json。
 *
 * **换装前预检**（2026-10-30 两次线上事故的机械门禁）：
 * 1. 备份直接引用的资产必须仍在 dist/assets（缺 = 回滚必白屏）；
 * 2. 入口 chunk 必须含 api/rsiot（缺 = 非 gateway 构建，回滚会复现"列表全空"）。
 * 预检失败拒绝换装；确认要冒险时加 --force。
 *
 * 用法：
 *   node scripts/rollback-dist.mjs           # 回滚到上一份
 *   node scripts/rollback-dist.mjs --list    # 列出可回滚的备份（带预检标注）
 *   node scripts/rollback-dist.mjs --to index-1769...-a1b2c3.html [--force]
 */
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')
const ROLLBACK_DIR = join(DIST, '.rollback')
const FORCE = process.argv.includes('--force')

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1) }
/** index.html 直接引用的 assets 文件名（宽松提取，与 deploy/prune 同款）。 */
const refsOf = (html) => [...html.matchAll(/assets\/([A-Za-z0-9._-]+)/g)].map((m) => m[1])

/** 备份预检：缺失的直接资产 + 入口 chunk 是否烘入 api/rsiot（网关形态标志）。 */
const inspect = (file) => {
  try {
    const refs = refsOf(readFileSync(join(ROLLBACK_DIR, file), 'utf8'))
    const missing = refs.filter((r) => !existsSync(join(DIST, 'assets', r)))
    const js = refs.filter((r) => r.endsWith('.js'))
    const envBaked = js.some((r) => {
      try { return readFileSync(join(DIST, 'assets', r), 'utf8').includes('api/rsiot') } catch { return false }
    })
    return { missing, envBaked }
  } catch {
    return { missing: ['<备份不可读>'], envBaked: false }
  }
}

// 无 .rollback 目录（全新 dist）不崩——走"无备份"提示（复审 D5）
let backups = []
try {
  backups = readdirSync(ROLLBACK_DIR)
    .filter((f) => f.startsWith('index-') && f.endsWith('.html'))
    .sort() // 文件名时间戳字典序 = 部署时间序
} catch { /* 无备份目录 */ }

if (process.argv.includes('--list') || backups.length === 0) {
  console.log(backups.length === 0 ? '（无备份——首次部署后才会产生）' : '可回滚的 index 备份（新→旧；⚠ = 预检不通过）：')
  for (const f of [...backups].reverse()) {
    const m = f.match(/^index-(\d+)-([0-9a-f]+|unknown)\.html$/)
    const when = m ? new Date(Number(m[1])).toISOString() : '?'
    const { missing, envBaked } = inspect(f)
    const warn = missing.length ? ` ⚠ 缺 ${missing.length} 个资产` : envBaked ? '' : ' ⚠ 非 gateway 构建'
    console.log(`  ${f}   (${when})${warn}`)
  }
  process.exit(0)
}

const toArg = process.argv.includes('--to') ? process.argv[process.argv.indexOf('--to') + 1] : null
const target = toArg ?? backups[backups.length - 1] // 缺省回滚到最近一份
if (!backups.includes(target)) fail(`备份不存在：${target}（--list 查看）`)

// 预检（失败 → 拒绝换装；--force 放行并显著告警）
const { missing, envBaked } = inspect(target)
if (missing.length && !FORCE) {
  fail(`${target} 引用的资产已缺失（${missing.join(', ')}）——回滚会白屏。\n  重新部署该 commit，或确认冒险加 --force`)
}
if (!envBaked && !FORCE) {
  fail(`${target} 的入口 chunk 不含 api/rsiot——非 gateway 构建（2026-10-30 列表全空事故同款），回滚会再次打空接口。\n  确认这是有意部署的 dev 形态，加 --force`)
}
if (missing.length || !envBaked) {
  console.warn(`⚠ --force：预检未通过仍继续（缺资产 ${missing.length} 个；env 烘焙=${envBaked}）`)
}

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
console.log('   注意   : 无构建清单的旧制备份只校验直接引用——其懒加载 chunk 可能已不在（失败时重新部署该 commit）')
