/**
 * 画面 meta / 组操作（2026-10-28）：组 = 画面 doc.group 字段的投影（无实体），
 * 一切组操作本质是批量改写该字段——PUT 全量 upsert 语义下唯一的改法即
 * GET → unwrap → 合并 → PUT。
 * 语义约定：patch 值 '' = 删除该 meta 字段（移出组）；键缺省 = 不动。
 * 批量操作（rename/disband）画面级隔离：单幅失败计入 fail 不整体上抛。
 */
import { screensApi, unwrapDoc, wrapDoc, type ScreenMeta, type ApiClient } from './screens'
import { batched, type ScreenCard } from './screen-list'

export type MetaPatch = { name?: string; group?: string }

/** 改单幅画面 meta：'' 删字段、缺省不动；done 与其余 meta 原样保留 */
export async function updateScreenMeta(
  client: ApiClient | ReturnType<typeof screensApi>,
  id: string,
  patch: MetaPatch,
): Promise<void> {
  const s = client as ReturnType<typeof screensApi>
  const { doc } = await s.get(id)
  const { done, meta } = unwrapDoc(doc)
  const next: ScreenMeta = { ...meta }
  // 显式两键：'' 删字段、缺省不动（索引赋值会被 name/devs 联合类型卡死）
  if (patch.name !== undefined) {
    if (patch.name === '') delete next.name
    else next.name = patch.name
  }
  if (patch.group !== undefined) {
    if (patch.group === '') delete next.group
    else next.group = patch.group
  }
  await s.put(id, wrapDoc(done, next))
}

export interface BatchResult { ok: number; fail: number }

/** 批量补丁：画面级隔离（失败计数不上抛），分批并发保护 rs-iot（同 loadScreenCards cap=4） */
async function patchGroup(
  client: ReturnType<typeof screensApi>,
  ids: string[],
  patch: MetaPatch,
  cap = 4,
): Promise<BatchResult> {
  const r = await batched(ids, cap, async (id) => {
    try { await updateScreenMeta(client, id, patch); return true } catch { return false }
  })
  return { ok: r.filter(Boolean).length, fail: r.length - r.filter(Boolean).length }
}

/** 组内画面 id（cards 为调用方已持有的列表快照，避免重复拉取） */
function idsIn(cards: ScreenCard[], group: string): string[] {
  return cards.filter((c) => c.group === group).map((c) => c.id)
}

/** 组重命名：from 组全部画面改归 to（to 已存在即合并语义） */
export function renameGroup(
  client: ReturnType<typeof screensApi>,
  cards: ScreenCard[],
  from: string,
  to: string,
  cap = 4,
): Promise<BatchResult> {
  return patchGroup(client, idsIn(cards, from), { group: to }, cap)
}

/** 解散组：组内画面 group 清除（移至未分组，画面不删除） */
export function disbandGroup(
  client: ReturnType<typeof screensApi>,
  cards: ScreenCard[],
  group: string,
  cap = 4,
): Promise<BatchResult> {
  return patchGroup(client, idsIn(cards, group), { group: '' }, cap)
}
