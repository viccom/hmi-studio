/**
 * 新建 3D 场景（模块内）——从 2D 的 `lib/screen-create.ts` 抽出，语义与 `createScreen` 对齐：
 * 探测防覆盖（命中即 exists）+ 全量 upsert。
 */
import { ApiError } from '../lib/api'
import { SLUG_PATTERN } from '../lib/screen-create'
import type { SceneMeta } from './list'
import { blankScene3D, sceneStore } from './store'

export { SLUG_PATTERN }

export type CreateSceneResult = 'ok' | 'exists' | 'failed'

export async function createScene3D(
  client: ReturnType<typeof sceneStore> = sceneStore(),
  id: string,
  meta: SceneMeta,
): Promise<CreateSceneResult> {
  try {
    await client.getRaw(id)
    return 'exists' // 命中 = 已存在，阻止覆盖
  } catch (e) {
    // 仅 404 视为可用；网关 502/超时等失败不得放行 upsert（防误覆盖既有场景）
    if (!(e instanceof ApiError) || e.status !== 404) return 'failed'
  }
  const doc = blankScene3D(id)
  if (meta.name !== undefined) doc.meta.name = meta.name
  if (meta.group !== undefined) doc.meta.group = meta.group
  try {
    await client.put(id, doc)
    return 'ok'
  } catch {
    return 'failed'
  }
}
