#!/usr/bin/env node
/**
 * deploy-dist.mjs — P4 L2 部署纪律单点收口（总体设计 §7：「工具不绿不给换 index」）。
 *
 * 流程：
 * 1. 门禁：工作区非干净即拒（脏树不可部署——无法回答"线上跑的是什么"）→
 *    typecheck → vitest →（--e2e 旗标时）playwright → build
 * 2. 原子换装：vite 构建到 dist-next/ → assets 增量并入 dist/assets/（**不清空**）→
 *    旧 index 备份进 dist/.rollback/（最近 N 份）→ index.html 与 version.json
 *    **最后落位**（近似原子：换装窗口内旧页面引用的旧 hash 资产仍在，刷新前不坏）
 * 3. version.json：{ gitSha, builtAt }——「线上跑的是什么」一句话可答；
 *    回滚 = rollback-dist.mjs（旧 index 换回）
 *
 * 用法：
 *   node scripts/deploy-dist.mjs            # 常规（不含 e2e）
 *   node scripts/deploy-dist.mjs --e2e      # 里程碑档（e2e 打真实 8790）
 * 环境变量：KEEP_ROLLBACKS（默认 5）。
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')
const DIST_NEXT = join(ROOT, 'dist-next')
const ROLLBACK_DIR = join(DIST, '.rollback')
const KEEP = Number(process.env.KEEP_ROLLBACKS ?? 5)
const WITH_E2E = process.argv.includes('--e2e')

const run = (cmd, args, opts = {}) => {
  console.log(`▶ ${cmd} ${args.join(' ')}`)
  execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts })
}

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1) }

// ---------- 1. 门禁 ----------

const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString().trim()
if (dirty) {
  fail(`工作区非干净，拒绝部署（部署必须可回答"线上跑的是什么"）：\n${dirty}\n先提交或 stash 后重试`)
}

run('pnpm', ['run', 'typecheck'])
run('pnpm', ['test'])
if (WITH_E2E) run('pnpm', ['e2e'])

// ---------- 2. 构建到 dist-next（不动线上） ----------

rmSync(DIST_NEXT, { recursive: true, force: true })
run('pnpm', ['exec', 'vite', 'build', '--outDir', 'dist-next', '--emptyOutDir'])

// ---------- 3. 原子换装 ----------

const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim()
const builtAt = new Date().toISOString()

mkdirSync(ROLLBACK_DIR, { recursive: true })
mkdirSync(join(DIST, 'assets'), { recursive: true })

// 3a. 备份旧 index（回滚源）——备份名含 sha 与序号，rollback-dist.mjs 消费
let oldSha = null
try {
  const prev = JSON.parse(readFileSync(join(DIST, 'version.json'), 'utf8'))
  oldSha = prev.gitSha ?? null
} catch { /* 首次部署无 version.json */ }
try {
  const old = readFileSync(join(DIST, 'index.html'))
  const stamp = Date.now()
  writeFileSync(join(ROLLBACK_DIR, `index-${stamp}-${oldSha ?? 'unknown'}.html`), old)
  // 只保留最近 KEEP 份 index 备份
  const backups = readdirSync(ROLLBACK_DIR).filter((f) => f.startsWith('index-')).sort()
  for (const f of backups.slice(0, Math.max(0, backups.length - KEEP))) {
    rmSync(join(ROLLBACK_DIR, f))
  }
} catch { /* 首次部署无旧 index */ }

// 3b. assets 增量并入（不清空——旧 index 的引用继续有效）
let added = 0
for (const f of readdirSync(join(DIST_NEXT, 'assets'))) {
  cpSync(join(DIST_NEXT, 'assets', f), join(DIST, 'assets', f))
  added += 1
}

// 3c. index.html 与 version.json 最后落位（换装完成点）
cpSync(join(DIST_NEXT, 'index.html'), join(DIST, 'index.html'))
writeFileSync(join(DIST, 'version.json'), `${JSON.stringify({ gitSha, builtAt }, null, 2)}\n`)

// 3d. 其它顶层产物（favicon 等）并入
for (const f of readdirSync(DIST_NEXT)) {
  if (f === 'assets' || f === 'index.html' || basename(f) === '.gitkeep') continue
  if (statSync(join(DIST_NEXT, f)).isFile()) cpSync(join(DIST_NEXT, f), join(DIST, f))
}

rmSync(DIST_NEXT, { recursive: true, force: true })

// ---------- 4. 证据摘要 ----------

const total = readdirSync(join(DIST, 'assets')).length
console.log('\n✅ 部署完成（index 最后落位）')
console.log(`   gitSha : ${gitSha}`)
console.log(`   builtAt: ${builtAt}`)
console.log(`   assets : 本次并入 ${added} 个 / dist 累计 ${total} 个（hash 名增量共存，未清空）`)
console.log(`   回滚   : node scripts/rollback-dist.mjs（保留最近 ${KEEP} 份 index）`)
console.log('   清理   : node scripts/prune-assets.mjs --dry-run（先看后删；保留集含回滚备份引用）')
