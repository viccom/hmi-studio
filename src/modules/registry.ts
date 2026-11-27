/**
 * 可选模块注册表（中性层）。
 *
 * 用 `import.meta.glob` 静态发现 `src/modules*\/index.ts`：Vite 在构建期展开 glob，
 * **目录不存在时结果为空对象**——因此删除某个模块目录后，本文件无需修改，
 * 应用照常启动（只是少了该模块的路由与导航项）。这是"剔除模块不影响原有功能"的机制保证。
 *
 * 约束（由 scripts/check-layers.mjs 强制）：除本文件外，任何非模块代码不得
 * 静态 import 具体模块目录；模块只能向下依赖 lib/components/symbols/assets。
 */
import type { HmiOptionalModule, ModuleNavItem } from './types'

const discovered = import.meta.glob<{ default: HmiOptionalModule }>('../modules*/index.ts', { eager: true })

export const optionalModules: HmiOptionalModule[] = Object.values(discovered)
  .map((m) => m?.default)
  .filter((m): m is HmiOptionalModule => !!m && typeof m.id === 'string')

/** 模块贡献的路由（追加到核心路由之后） */
export const optionalRoutes = optionalModules.flatMap((m) => m.routes ?? [])

/** 模块贡献的导航项（画面管理页顶部导航） */
export const optionalNav: ModuleNavItem[] = optionalModules
  .flatMap((m) => m.nav ?? [])
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
