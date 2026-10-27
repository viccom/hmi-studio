#!/usr/bin/env node
/**
 * 分层依赖方向检查（docs/architecture.md §2 的机械化）。
 * 规则：只许向下依赖；lib/symbols/components/views 各自的封闭性见下 ALLOWED 表；
 * 豁免清单 = 画面资产模块（architecture §4.2 技术债登记），不是认可。
 * 用法：node scripts/check-layers.mjs（just layers）；退出码非 0 = 有违规。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')

// 豁免：lib 中 import symbols 的画面资产及其测试（迁移目标 src/screen-assets/，architecture §4.2）
const LIB_SYMBOLS_ALLOWLIST = new Set([
  'src/lib/demo-screen.ts', 'src/lib/home-screens.ts', 'src/lib/home-tab-screens.ts',
  'src/lib/home-faceplate-screen.ts', 'src/lib/demo-screen.test.ts', 'src/lib/home-screens.test.ts',
  'src/lib/home-tab-screens.test.ts', 'src/lib/home-faceplate-screen.test.ts',
  'src/lib/symbol-lint.test.ts', // 图元 lint 的全量被测对象在 symbols——lint 本体不 import
])

function layerOf(rel) {
  if (rel.startsWith('src/lib/')) return 'lib'
  if (rel.startsWith('src/symbols/')) return 'symbols'
  if (rel.startsWith('src/views/')) return 'views'
  if (rel.startsWith('src/components/')) return 'components'
  if (rel.startsWith('src/dev/')) return 'dev'
  if (['src/main.ts', 'src/router.ts', 'src/App.vue', 'src/env.d.ts'].includes(rel)) return 'app'
  return null
}

/** importer 层 → 允许的 target 层集合（dev 研究资产不限；app 壳不限） */
const ALLOWED = {
  lib: ['lib'],
  symbols: ['symbols'], // symbols 源文件不依赖 lib（kit 自包含）；测试文件放宽见下
  components: ['lib', 'components'],
  views: ['lib', 'components', 'symbols'], // 互不依赖另行特判
  app: ['lib', 'components', 'symbols', 'views', 'dev'],
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(name)) out.push(p)
  }
  return out
}

function resolveImport(fromRel, spec) {
  const base = resolve(ROOT, dirname(fromRel), spec)
  for (const cand of [base, base + '.ts', base + '.vue', join(base, 'index.ts')]) {
    let rel
    try { rel = cand.slice(ROOT.length + 1) } catch { continue }
    try { if (statSync(cand).isFile()) return rel } catch { /* 试下一个 */ }
  }
  return null // 解析不到（非文件目标）——调用方跳过
}

const violations = []
for (const file of walk(SRC)) {
  const rel = file.slice(ROOT.length + 1).replaceAll('\\', '/')
  const layer = layerOf(rel)
  if (!layer || layer === 'dev') continue
  const isTest = /\.test\.ts$/.test(rel)
  const src = readFileSync(file, 'utf8')
  const specs = [...src.matchAll(/(?:from\s+|import\(\s*|import\s+['"])(\.{1,2}\/[^'"]+)['"]/g)].map((m) => m[1])
  for (const spec of specs) {
    const target = resolveImport(rel, spec)
    if (!target) continue
    const tLayer = layerOf(target)
    if (!tLayer || tLayer === layer) {
      if (tLayer === 'views' && target !== rel && layer === 'views') {
        violations.push(`${rel} → ${target}：views 互不依赖（共用逻辑下沉 lib/components）`)
      }
      continue
    }
    if (tLayer === 'app') { violations.push(`${rel} → ${target}：禁止依赖应用壳`); continue }
    let ok = ALLOWED[layer].includes(tLayer)
    // 测试放宽：测试可 import 更低层（lib 测试 → symbols 仅豁免清单）
    if (!ok && isTest && layer === 'symbols' && tLayer === 'lib') ok = true
    if (!ok && isTest && layer === 'lib' && tLayer === 'symbols' && LIB_SYMBOLS_ALLOWLIST.has(rel)) ok = true
    // lib → symbols 豁免清单
    if (!ok && layer === 'lib' && tLayer === 'symbols' && LIB_SYMBOLS_ALLOWLIST.has(rel)) ok = true
    if (!ok) violations.push(`${rel} → ${target}：${layer} 禁止依赖 ${tLayer}（architecture §2）`)
  }
}

if (violations.length) {
  console.error(`✗ 分层违规 ${violations.length} 处：`)
  for (const v of violations) console.error('  ' + v)
  process.exit(1)
}
console.log('✓ 分层检查通过（规则见 docs/architecture.md §2；豁免清单 §4.2）')
