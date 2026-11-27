#!/usr/bin/env node
/**
 * 3D 模块可剔除性验证（2026-11-26 用户要求）。
 *
 * 命题：剔除 3D 组态/浏览模块，原有 2D 功能不受影响（能 typecheck、能构建）。
 *
 * 做法（真实删除，不是静态推断）：
 *   1. 复制工作副本到临时目录（排除 node_modules/dist/.git）
 *   2. 物理删除 `src/modules3d/`，并从 package.json 去掉 three/@types/three
 *   3. 在该副本里跑 `vue-tsc --noEmit`（--full 时再加 vite build）
 *   4. 报告结果；非 0 退出 = 可剔除性被破坏
 *
 * 用法：node scripts/verify-module-removal.mjs [--full]
 * 依赖：本机 node_modules（副本用符号链接回原仓，避免重复安装）
 */
import { cpSync, mkdtempSync, rmSync, symlinkSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const full = process.argv.includes('--full')
const SKIP = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report', 'coverage'])

const tmp = mkdtempSync(join(tmpdir(), 'hmi-no3d-'))
const step = (msg) => console.log(`· ${msg}`)

try {
  step(`复制工作副本 → ${tmp}`)
  cpSync(ROOT, tmp, {
    recursive: true,
    filter: (src) => !SKIP.has(src.slice(ROOT.length + 1).split('/')[0]),
  })

  step('删除 src/modules3d/（含全部 3D 视图、契约、存储、渲染器）')
  rmSync(join(tmp, 'src/modules3d'), { recursive: true, force: true })

  step('从 package.json 移除 three / @types/three')
  const pkgPath = join(tmp, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  delete pkg.dependencies?.three
  delete pkg.devDependencies?.['@types/three']
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  // 复用原仓 node_modules（符号链接）：副本只验证“源码能否编译”，不需要独立安装
  const nm = join(tmp, 'node_modules')
  if (!existsSync(nm)) symlinkSync(join(ROOT, 'node_modules'), nm, 'dir')

  step('typecheck（副本内 vue-tsc --noEmit）')
  execFileSync(join(ROOT, 'node_modules/.bin/vue-tsc'), ['--noEmit'], { cwd: tmp, stdio: 'inherit' })

  if (full) {
    step('构建（副本内 vite build，带部署 env）')
    execFileSync(join(ROOT, 'node_modules/.bin/vite'), ['build'], {
      cwd: tmp,
      stdio: 'inherit',
      env: { ...process.env, VITE_API_BASE: '/api/rsiot', VITE_LOGIN_PATH: '/api/gw/login' },
    })
  }

  console.log(`\n✓ 可剔除性验证通过：删除 src/modules3d 后，剩余代码${full ? ' typecheck + build' : ' typecheck'} 通过`)
} catch {
  console.error('\n✗ 可剔除性验证失败：2D 代码仍依赖 3D 模块，或删除后编译不过')
  console.error('  排查：grep -rn "modules3d" src/ | grep -v "^src/modules3d"')
  process.exitCode = 1
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
