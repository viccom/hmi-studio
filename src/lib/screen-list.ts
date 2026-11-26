/**
 * 列表页数据源：GET ids → 并发分批 GET doc → 卡片（{id,name,group,done}）。
 * 并发上限保护 rs-iot（画面多时避免 N+1 全并发打满）——T17 既定 6→4。
 * done（IExportJson）随卡返回：列表缩略图渲染源（T17）。
 *
 * 本模块**只服务 2D 画面**：判定“是不是 2D”用 2D 自己的契约（`canvasCfg` + `json[]`），
 * 不认识 3D 场景的 `$schema`——3D 场景由 `src/modules3d/` 自行过滤（模块可整体剔除，
 * 剔除后本文件无需改动）。
 */
import type { IExportJson } from 'maotu'
import { ApiError } from './api'
import { screensApi, unwrapDoc } from './screens'

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
}

/** 某 id 404（列表与详情之间被并发删除）跳过该卡，不整体失败；其他错误上抛 */
export async function loadScreenCards(
  client: ReturnType<typeof screensApi> = screensApi(),
  cap = 4,
): Promise<ScreenCard[]> {
  const ids = await client.list()
  const cards = await batched(ids, cap, async (id): Promise<ScreenCard | null> => {
    try {
      const { doc } = await client.get(id)
      const { done, meta } = unwrapDoc(doc)
      // 2D 契约自检：没有画布配置/元素数组的文档不是 2D 画面（3D 场景即属此类，
      // 由 src/modules3d/ 自己的列表页负责）。此处只判 2D 形态，不认识 3D 契约。
      const d = done as unknown as { canvasCfg?: unknown; json?: unknown }
      if (!d.canvasCfg || !Array.isArray(d.json)) return null
      return { id, ...meta, done }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  })
  return cards.filter((c): c is ScreenCard => c !== null)
}

// ---- W8 画面分组：列表分区与编辑器切换器两层下拉共用同一分区器（单一排序语义）----

export interface ScreenSection { name: string; cards: ScreenCard[] }

/** 分组所需的最小形态（3D 模块的卡片也满足，无需转成 2D 卡） */
export interface GroupableCard { id: string; name?: string; group?: string }

/** 分组分区：组名 zh 拼音序；未分组归 '' 区（UI 显示「未分组」）排最后；组内按名称拼音序 */
export function groupSections<T extends GroupableCard>(cards: readonly T[]): Array<{ name: string; cards: T[] }> {
  const byGroup = new Map<string, T[]>()
  for (const c of cards) {
    const g = c.group ?? ''
    const arr = byGroup.get(g)
    if (arr) arr.push(c)
    else byGroup.set(g, [c])
  }
  const zh = (a: string, b: string) => a.localeCompare(b, 'zh')
  const named = [...byGroup.entries()].filter(([g]) => g !== '').sort(([a], [b]) => zh(a, b))
  const ungrouped = byGroup.get('')
  const sortCards = (cs: T[]) => [...cs].sort((a, b) => zh(a.name ?? a.id, b.name ?? b.id))
  return [
    ...named.map(([name, cs]) => ({ name, cards: sortCards(cs) })),
    ...(ungrouped ? [{ name: '', cards: sortCards(ungrouped) }] : []),
  ]
}
