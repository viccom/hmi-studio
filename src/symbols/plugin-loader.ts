/**
 * 图元插件加载器（P3b，设计 §6.2）——**必须放 symbols 层**（check-layers 的
 * LIB_SYMBOLS_ALLOWLIST 是空集，lib 层不得依赖符号面；lintSymbol/HmiSymbol 同层）。
 *
 * 链路：EditView/ViewView 挂载后 `loadPlugins()` → fetch `<base>widgets/index.json`
 *（404 = 无插件面，静默）→ 逐项动态 import entry（`?v=<version>` bust）→ 工厂
 * register(host) 收集 symbol/组件 → **lintSymbol 门禁**（不过 = 跳过 + 通知，不静默）
 * → 聚合后一次 registerConfig 进「扩展图元（本站）」组 + app.component 续注。
 *
 * host 注入面 v1：{ vue, echarts, registerSymbol, registerComponent }——工厂注入而非
 * importmap：单一 vue 实例（reactivity 不断链）+ 构建期裸 import 检查（D5 数据不加载
 * 代码的代码侧镜像）。`app` 实例来源 = main.ts 在 registerSymbolComponents 后调
 * `setPluginHost(app)`（设计两案取前者）。
 *
 * 2026-10-31 审查修复三则：
 *  1. **逐插件隔离**：单个插件 import/lint/畸形注册只记 failed，绝不 reject 整条装载链
 *     （修复前缺 id 图元在 `s.id.startsWith` 处 TypeError → 编辑器整页拒载/运行页空白）；
 *  2. **聚合注册**：registerConfig 是同名覆盖语义——逐插件注册时后装插件会把先装插件的
 *     图元从组里抹掉（多插件只剩最后一个）。改为收集全部成功后一次注册；
 *  3. **签名去重**：maotu 对已存在组名必弹「已存在，已经将其配置覆盖」info——每次
 *     挂载重注册 = 每次切编辑/运行页刷屏。内容签名未变则跳过 registerConfig。
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

/** 单插件收集结果（只收集不落注册——组内容由 loadPlugins 聚合后一次写入）。 */
interface Collected {
  ok: boolean
  symbols: HmiSymbol[]
  components: Array<[string, Component]>
}

/** 上次成功注册的组内容签名（内容未变 → 跳过 registerConfig，避免 maotu 覆盖提示刷屏）。 */
let lastAppliedSignature = ''

/** 测试钩子：清空模块态（签名 + 已装图元表）。 */
export function __resetPluginLoaderState(): void {
  lastAppliedSignature = ''
  loadedPluginSymbols.clear()
}

/** 单插件装载（纯编排，单测注入 fetchEntry 断言门禁；成功只返回收集结果）。 */
async function collectOne(
  plugin: PluginIndex['plugins'][number],
  opts: {
    fetchEntry?: (url: string) => Promise<{ default: PluginFactory }>
    onNotify?: (msg: string) => void
  } = {},
): Promise<Collected> {
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
    return { ok: false, symbols, components }
  }
  if (!symbols.length) {
    notify(`插件 ${plugin.id} 未注册任何图元（registerSymbol 未调用），已跳过`)
    return { ok: false, symbols, components }
  }
  // lintSymbol 门禁：不过 = 跳过该插件（不静默——lint 是插件质量唯一机械闸）
  const bad = symbols.filter((s) => {
    try { return lintSymbol(s).length > 0 } catch { return true }
  })
  if (bad.length) {
    notify(`插件 ${plugin.id} 的 ${bad.length} 个图元未过 lint（${bad.map((s) => s?.id).join(', ')}），已拒载——详见 console`)
    for (const s of bad) console.error('[plugin-loader] lint 拒绝', plugin.id, s?.id)
    return { ok: false, symbols, components }
  }
  // 命名空间防线：id 不得以 ah- 开头（install 侧 lint 的运行时镜像——绕过安装器的入口挡在这）。
  // lint 已保证 id 非空字符串（ID_MISSING），此处 typeof 收窄是第二道锁。
  if (symbols.some((s) => typeof s.id === 'string' && s.id.startsWith('ah-'))) {
    notify(`插件 ${plugin.id} 试图注册 ah- 前缀图元（上游保留命名空间），已拒载`)
    return { ok: false, symbols, components }
  }
  return { ok: true, symbols, components }
}

/** 落注册：组内容签名未变则跳过 registerConfig（覆盖提示只在真变化时出现一次）。 */
function applySymbols(symbols: HmiSymbol[], components: Array<[string, Component]>): void {
  const signature = JSON.stringify(symbols)
  if (signature !== lastAppliedSignature) {
    leftAsideStore.registerConfig(PLUGIN_GROUP, symbols)
    lastAppliedSignature = signature
  }
  if (appHost) for (const [name, comp] of components) appHost.component(name, comp)
  for (const s of symbols) {
    loadedPluginSymbols.set(s.id, new Set(Object.keys((s as { props?: Record<string, unknown> }).props ?? {})))
  }
}

/** 单插件装载（单测/外部直用；生产路径是 loadPlugins 的聚合注册）。 */
export async function loadOne(
  plugin: PluginIndex['plugins'][number],
  opts: Parameters<typeof collectOne>[1] = {},
): Promise<boolean> {
  const r = await collectOne(plugin, opts)
  if (!r.ok) return false
  applySymbols(r.symbols, r.components)
  return true
}

/** 全量装载（EditView/ViewView onMounted 调）。index 缺席（404）= 静默零插件。 */
export async function loadPlugins(
  fetchIndex: () => Promise<PluginIndex | null> = defaultFetchIndex,
  opts: Parameters<typeof collectOne>[1] = {},
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
  const allSymbols: HmiSymbol[] = []
  const allComponents: Array<[string, Component]> = []
  for (const p of index.plugins) {
    let r: Collected
    try {
      r = await collectOne(p, opts)
    } catch (e) {
      // 最后一道隔离：任何意外异常只废掉本插件，不向上冒（否则整页组态不可用）
      opts.onNotify?.(`插件 ${p.id} 装载异常：${e instanceof Error ? e.message : String(e)}`)
      r = { ok: false, symbols: [], components: [] }
    }
    if (r.ok) {
      loaded.push(p.id)
      allSymbols.push(...r.symbols)
      allComponents.push(...r.components)
    } else {
      failed.push({ id: p.id, reason: 'lint/import 拒绝（通知已发）' })
    }
  }
  if (allSymbols.length) applySymbols(allSymbols, allComponents)
  return { loaded, failed }
}

async function defaultFetchIndex(): Promise<PluginIndex | null> {
  const base = import.meta.env.BASE_URL ?? '/'
  const url = new URL('widgets/index.json', new URL(base, location.href)).href
  const res = await fetch(url)
  if (!res.ok) return null // 404 = 未部署插件面
  return (await res.json()) as PluginIndex
}
