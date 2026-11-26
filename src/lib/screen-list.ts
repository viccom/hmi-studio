/**
 * 列表页数据源：GET ids → 并发分批 GET doc → 卡片（{id,name,group,done}）。
 * 并发上限保护 rs-iot（画面多时避免 N+1 全并发打满）——T17 既定 6→4。
 * done（IExportJson）随卡返回：列表缩略图渲染源（T17）。
 *
 * 2D/3D 分流（2026-11-26）：画面管理页顶部导航把「2D 画面」与「3D 画面」拆成两个
 * 独立列表页（/ 与 /screens3d），各自只显示自己那一类——本模块提供按类型加载的
 * 公共实现，判定依据是 doc 的 $schema（isScene3D），分类逻辑与页面无关。
 */
import type { IExportJson } from 'maotu'
import { ApiError } from './api'
import { screensApi, unwrapDoc } from './screens'
import { isScene3D, type SceneDoc } from './scene3d'

/** 并发分批：批内并发 ≤ cap、批间串行（顺序稳定），返回顺序 = 输入顺序 */
export async function batched<T, R>(
  items: readonly T[],
  cap: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += cap) {
    const part = await Promise.all(items.slice(i, i + cap).map((it, j) => run(it, i + j)))
    out.push(...part)
  }
  return out
}

export interface ScreenCard {
  id: string
  name?: string
  group?: string
  /** 画面完整 done_json（缩略图源；体积小直接随卡持有） */
  done?: IExportJson
  /** 3D 空间层场景（$schema=agent-hmi.scene3d/1）——导航到 /view3d/，缩略图不出 WebGL */
  is3d?: boolean
}

/** 列表页要显示的画面类型：2D（maotu done_json）/ 3D（空间层场景文档） */
export type ScreenKind = '2d' | '3d'

/** 某 id 404（列表与详情之间被并发删除）跳过该卡，不整体失败；其他错误上抛 */
export async function loadScreenCards(
  client: ReturnType<typeof screensApi> = screensApi(),
  cap = 4,
): Promise<ScreenCard[]> {
  const ids = await client.list()
  const cards = await batched(ids, cap, async (id): Promise<ScreenCard | null> => {
    try {
      // 一次 GET 拿到 doc（后端不校验 schema，故同一端点两种文档都能取到），
      // 按 $schema 分流：3D 走 SceneDoc 分支，其余走 maotu 的 unwrapDoc。
      const { doc } = await client.get(id)
      if (isScene3D(doc)) {
        // 3D 场景：不交给 maotu 的 unwrapDoc（它没有 canvasCfg/json）。
        // name/group 在 3D 文档的 meta 内（scene3d.ts 的 SceneDoc），不在顶层——
        // 读顶层会永远拿到 undefined（列表页显示 slug 而非场景名）。
        const m = doc as unknown as SceneDoc
        return { id, name: m.meta?.name, group: m.meta?.group, is3d: true }
      }
      const { done, meta } = unwrapDoc(doc)
      return { id, ...meta, done }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  })
  return cards.filter((c): c is ScreenCard => c !== null)
}

/**
 * 按类型加载卡片（2D/3D 两个列表页共用）。
 *
 * 与 loadScreenCards 的差别只在**筛选**：doc 全部 GET 回来后按 $schema 分流，
 * 不属于目标类型的不出现在结果里。判定与页面无关（isScene3D 单一事实源），
 * 页面不再各自做分流判断——避免两页判法漂移。
 */
export async function loadScreenCardsByKind(
  kind: ScreenKind,
  client: ReturnType<typeof screensApi> = screensApi(),
  cap = 4,
): Promise<ScreenCard[]> {
  const all = await loadScreenCards(client, cap)
  return all.filter((c) => (kind === '3d') === !!c.is3d)
}

// ---- W8 画面分组：列表分区与编辑器切换器两层下拉共用同一分区器（单一排序语义）----

export interface ScreenSection { name: string; cards: ScreenCard[] }

/** 分组分区：组名 zh 拼音序排序；未分组归 '' 区（UI 显示「未分组」）排最后；组内按名称（name ?? id）拼音序 */
export function groupSections(cards: ScreenCard[]): ScreenSection[] {
  const byGroup = new Map<string, ScreenCard[]>()
  for (const c of cards) {
    const g = c.group ?? ''
    const arr = byGroup.get(g)
    if (arr) arr.push(c)
    else byGroup.set(g, [c])
  }
  const zh = (a: string, b: string) => a.localeCompare(b, 'zh')
  const named = [...byGroup.entries()].filter(([g]) => g !== '').sort(([a], [b]) => zh(a, b))
  const ungrouped = byGroup.get('')
  const sortCards = (cs: ScreenCard[]) => [...cs].sort((a, b) => zh(a.name ?? a.id, b.name ?? b.id))
  return [
    ...named.map(([name, cs]) => ({ name, cards: sortCards(cs) })),
    ...(ungrouped ? [{ name: '', cards: sortCards(ungrouped) }] : []),
  ]
}
