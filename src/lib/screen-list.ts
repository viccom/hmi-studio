/**
 * 列表页数据源：GET ids → 并发分批 GET doc → 卡片（{id,name,group,done}）。
 * 并发上限保护 rs-iot（画面多时避免 N+1 全并发打满）——T17 既定 6→4。
 * done（IExportJson）随卡返回：列表缩略图渲染源（T17）。
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
