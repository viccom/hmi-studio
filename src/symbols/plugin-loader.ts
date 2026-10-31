/**
 * 图元插件加载器（P3b，设计 §6.2）——**必须放 symbols 层**（check-layers 的
 * LIB_SYMBOLS_ALLOWLIST 是空集，lib 层不得依赖符号面；lintSymbol/HmiSymbol 同层）。
 *
 * 链路：EditView/ViewView 挂载后 `loadPlugins()` → fetch `<base>widgets/index.json`
 *（404 = 无插件面，静默）→ 逐项动态 import entry（`?v=<version>` bust）→ 工厂
 * register(host) 收集 symbol/组件 → **lintSymbol 门禁**（不过 = 跳过 + 通知，不静默）
 * → registerConfig 进「扩展图元（本站）」组 + app.component 续注。
 *
 * host 注入面 v1：{ vue, echarts, registerSymbol, registerComponent }——工厂注入而非
 * importmap：单一 vue 实例（reactivity 不断链）+ 构建期裸 import 检查（D5 数据不加载
 * 代码的代码侧镜像）。`app` 实例来源 = main.ts 在 registerSymbolComponents 后调
 * `setPluginHost(app)`（设计两案取前者）。
 */
import { leftAsideStore } from 'maotu'
import * as vue from 'vue'
import * as echarts from 'echarts'
import type { App, Component } from 'vue'
import { lintSymbol } from './symbol-lint'
import type { HmiSymbol } from './types'

export const PLUGIN_GROUP = '扩展图元（本站）'

/** index.json 形状（scripts/install-plugin.mjs 维护） */
export interface PluginIndex {
  plugins: Array<{ id: string; name: string; version: string; entry: string }>
}

/** 插件工厂契约（dist.js 默认导出；禁裸 import——安装时 lint） */
export type PluginFactory = (host: PluginHost) => void
export interface PluginHost {
  vue: typeof vue
  echarts: typeof echarts
  registerSymbol: (sym: HmiSymbol) => void
  registerComponent: (name: string, comp: Component) => void
}

let appHost: App | null = null
/** main.ts 在 registerSymbolComponents 后调用一次（app.component 续注的宿主）。 */
export function setPluginHost(app: App): void {
  appHost = app
}

/** 已成功装载的插件图元：tag → props 键集（plugin-fallback 的降级判定依据——
 *  插件 tag 不在静态 registry，缺了它插件图元会被误降级成占位）。 */
const loadedPluginSymbols = new Map<string, Set<string>>()
export function pluginSymbols(): Map<string, Set<string>> {
  return loadedPluginSymbols
}

export interface PluginLoadResult {
  loaded: string[]
  failed: Array<{ id: string; reason: string }>
}

/** 单插件装载（纯编排，单测注入 fetchImpl/importImpl 断言门禁与注册序）。 */
export async function loadOne(
  plugin: PluginIndex['plugins'][number],
  opts: {
    fetchEntry?: (url: string) => Promise<{ default: PluginFactory }>
    onNotify?: (msg: string) => void
  } = {},
): Promise<boolean> {
  const importEntry = opts.fetchEntry ?? ((url: string) => import(/* @vite-ignore */ url))
  const notify = opts.onNotify ?? (() => {})
  const base = import.meta.env.BASE_URL ?? '/'
  const url = new URL(`widgets/${plugin.id}/${plugin.entry}?v=${plugin.version}`, new URL(base, location.href)).href
  const symbols: HmiSymbol[] = []
  const components: Array<[string, Component]> = []
  try {
    const mod = await importEntry(url)
    if (typeof mod.default !== 'function') throw new Error('entry 缺 default 导出工厂 register(host)')
    await mod.default({
      vue, echarts,
      registerSymbol: (s: HmiSymbol) => symbols.push(s),
      registerComponent: (name: string, comp: Component) => components.push([name, comp]),
    })
  } catch (e) {
    notify(`插件 ${plugin.id} 加载失败：${e instanceof Error ? e.message : String(e)}`)
    return false
  }
  if (!symbols.length) {
    notify(`插件 ${plugin.id} 未注册任何图元（registerSymbol 未调用），已跳过`)
    return false
  }
  // lintSymbol 门禁：不过 = 跳过该插件（不静默——lint 是插件质量唯一机械闸）
  const bad = symbols.filter((s) => {
    try { return lintSymbol(s).length > 0 } catch { return true }
  })
  if (bad.length) {
    notify(`插件 ${plugin.id} 的 ${bad.length} 个图元未过 lint（${bad.map((s) => s.id).join(', ')}），已拒载——详见 console`)
    for (const s of bad) console.error('[plugin-loader] lint 拒绝', plugin.id, s.id)
    return false
  }
  // 命名空间防线：id 不得以 ah- 开头（install 侧 lint 的运行时镜像——绕过安装器的入口挡在这）
  if (symbols.some((s) => s.id.startsWith('ah-'))) {
    notify(`插件 ${plugin.id} 试图注册 ah- 前缀图元（上游保留命名空间），已拒载`)
    return false
  }
  leftAsideStore.registerConfig(PLUGIN_GROUP, symbols)
  if (appHost) for (const [name, comp] of components) appHost.component(name, comp)
  for (const s of symbols) {
    loadedPluginSymbols.set(s.id, new Set(Object.keys((s as { props?: Record<string, unknown> }).props ?? {})))
  }
  return true
}

/** 全量装载（EditView/ViewView onMounted 调）。index 缺席（404）= 静默零插件。 */
export async function loadPlugins(
  fetchIndex: () => Promise<PluginIndex | null> = defaultFetchIndex,
  opts: Parameters<typeof loadOne>[1] = {},
): Promise<PluginLoadResult> {
  let index: PluginIndex | null
  try {
    index = await fetchIndex()
  } catch {
    return { loaded: [], failed: [] } // 网络面故障不打扰组态（编辑器可用性优先）
  }
  if (!index?.plugins?.length) return { loaded: [], failed: [] }
  const loaded: string[] = []
  const failed: Array<{ id: string; reason: string }> = []
  for (const p of index.plugins) {
    if (await loadOne(p, opts)) {
      loaded.push(p.id)
    } else {
      failed.push({ id: p.id, reason: 'lint/import 拒绝（通知已发）' })
    }
  }
  return { loaded, failed }
}

async function defaultFetchIndex(): Promise<PluginIndex | null> {
  const base = import.meta.env.BASE_URL ?? '/'
  const url = new URL('widgets/index.json', new URL(base, location.href)).href
  const res = await fetch(url)
  if (!res.ok) return null // 404 = 未部署插件面
  return (await res.json()) as PluginIndex
}
