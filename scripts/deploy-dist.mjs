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
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
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

/** index.html 直接引用的 assets 文件名（deploy 断言与 rollback 预检共用；base=/hmi/）。 */
const refsOf = (html) => [...html.matchAll(/assets\/([A-Za-z0-9._-]+)/g)].map((m) => m[1])
/** 入口 chunk 必须烘入的部署标记（package.json build 脚本的 env 单源）。 */
const REQUIRED_MARKERS = ['api/rsiot', 'api/gw/login']

// ---------- 1. 门禁 ----------

const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString().trim()
if (dirty) {
  fail(`工作区非干净，拒绝部署（部署必须可回答"线上跑的是什么"）：\n${dirty}\n先提交或 stash 后重试`)
}

// 门禁 = `just fe-quality` 的六道门（typecheck/lint/layers/test/e2e/build）——
// 「工具不绿不给换 index」不能只覆盖其中四道（复审 D6）。
run('pnpm', ['run', 'typecheck'])
run('pnpm', ['exec', 'eslint', '.'])
run('node', ['scripts/check-layers.mjs'])
run('pnpm', ['test'])
if (WITH_E2E) run('pnpm', ['e2e'])

// ---------- 2. 构建到 dist-next（不动线上） ----------
// **必须走 pnpm build（package.json 单源）**：它带 VITE_API_BASE=/api/rsiot +
// VITE_LOGIN_PATH=/api/gw/login——deploy 若裸调 vite build 会漏烘 API 前缀，
// 线上页面打到 gateway 不存在的 /api/v1/* → 列表全空（2026-10-30 实测事故）。
// pnpm 把尾部参数追加到 script 命令，outDir 覆盖不碰线上 dist/。
rmSync(DIST_NEXT, { recursive: true, force: true })
run('pnpm', ['build', '--outDir', 'dist-next', '--emptyOutDir'])

// 2b. 产物断言（同日事故的机械门禁；复审 D1）：**任一构建 chunk** 缺部署标记即
// 拒绝换装。扫全量 chunk（而非只扫 index 直接引用）避免将来代码分割把 env 常量
// 挪进懒加载 chunk 时误报；坏构建（裸 vite build）下全量 chunk 都不含该串。
const builtIndex = join(DIST_NEXT, 'index.html')
if (!existsSync(builtIndex)) fail('构建产物缺 dist-next/index.html')
const nextAssets = join(DIST_NEXT, 'assets')
const nested = readdirSync(nextAssets).filter((f) => statSync(join(nextAssets, f)).isDirectory())
if (nested.length) {
  fail(`vite 输出含子目录（${nested.join(', ')}）——deploy/prune 只支持平面 assets，先扩展脚本再部署`)
}
const missingRefs = refsOf(readFileSync(builtIndex, 'utf8'))
  .filter((f) => f.endsWith('.js'))
  .filter((f) => !existsSync(join(nextAssets, f)))
if (missingRefs.length) fail(`index.html 引用的 chunk 不存在（${missingRefs.join(', ')}）——构建产物不完整`)
const jsSources = readdirSync(nextAssets)
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(nextAssets, f), 'utf8'))
for (const marker of REQUIRED_MARKERS) {
  if (!jsSources.some((s) => s.includes(marker))) {
    fail(`构建产物不含 ${marker}——VITE_API_BASE/VITE_LOGIN_PATH 未烘入（列表全空事故同款），拒绝换装`)
  }
}

// ---------- 3. 原子换装 ----------

const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim()
const builtAt = new Date().toISOString()

mkdirSync(ROLLBACK_DIR, { recursive: true })
mkdirSync(join(DIST, 'assets'), { recursive: true })

// 3a. 备份旧 index + 写本次构建资产清单（回滚与 prune 的依据）。
// **清单是构建级完备集**：一次 vite build 的全部 chunk 相互引用（index → main →
// import() 的懒加载 chunk），prune 若只扫 index.html 直接引用会误删懒加载 chunk
// （2026-10-30 实测事故：EditView/ViewView 404 白屏）——清单与 index 备份同基名。
let oldSha = null
try {
  const prev = JSON.parse(readFileSync(join(DIST, 'version.json'), 'utf8'))
  oldSha = prev.gitSha ?? null
} catch { /* 首次部署无 version.json */ }
const stamp = Date.now()
try {
  const old = readFileSync(join(DIST, 'index.html'))
  writeFileSync(join(ROLLBACK_DIR, `index-${stamp}-${oldSha ?? 'unknown'}.html`), old)
} catch { /* 首次部署无旧 index */ }
writeFileSync(
  join(ROLLBACK_DIR, `build-${stamp}-${gitSha}.files`),
  `${readdirSync(join(DIST_NEXT, 'assets')).join('\n')}\n`,
)
// 只保留最近 KEEP 组备份（index-*.html 与 build-*.files 按同组时间戳滚动）
const groups = new Set(
  readdirSync(ROLLBACK_DIR)
    .filter((f) => /^(index|build)-/.test(f))
    .map((f) => f.replace(/^(index|build)-(\d+)-.*$/, '$2'))
    .sort(),
)
for (const g of [...groups].slice(0, Math.max(0, groups.size - KEEP))) {
  for (const f of readdirSync(ROLLBACK_DIR)) if (f.includes(`-${g}-`)) rmSync(join(ROLLBACK_DIR, f))
}

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
