/**
 * 列表页数据源：GET ids → 并发分批 GET doc → 卡片（{id,name,group}）。
 * 并发上限保护 rs-iot（画面多时避免 N+1 全并发打满）。
 */
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

export interface ScreenCard { id: string; name?: string; group?: string }

/** 某 id 404（列表与详情之间被并发删除）跳过该卡，不整体失败；其他错误上抛 */
export async function loadScreenCards(
  client: ReturnType<typeof screensApi> = screensApi(),
  cap = 6,
): Promise<ScreenCard[]> {
  const ids = await client.list()
  const cards = await batched(ids, cap, async (id) => {
    try {
      const { doc } = await client.get(id)
      const { meta } = unwrapDoc(doc)
      return { id, ...meta }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  })
  return cards.filter((c): c is ScreenCard => c !== null)
}
