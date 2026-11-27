/**
 * 3D 场景文档的 meta 改写（2026-11-26）。
 *
 * 为什么不能复用 screen-group.ts 的 updateScreenMeta：那个走 unwrapDoc/wrapDoc，
 * 语义是「2D 画面的 done_json + 顶层 name/group/devs」——对 3D 文档会做两件坏事：
 *   ① unwrapDoc 只剥离顶层 name/group，3D 文档的 meta 整块会被当成 done 的一部分摊平；
 *   ② wrapDoc 把 meta 摊到顶层，与 SceneDoc 契约（meta 内嵌 name/group）冲突。
 * 结果是改一次分组就把场景文档结构写坏。
 *
 * 本模块按 SceneDoc 契约原地改 meta：GET → 改 meta.name/meta.group → PUT 原样回写，
 * 其余字段（nodes/links/$schema）一个字节不动。
 */
import { sceneStore } from './store'
import type { SceneDoc } from './scene3d'

type ScreensClient = ReturnType<typeof sceneStore>

/** 3D 场景的 meta 补丁：'' = 清空（移出组 / 清名），缺省 = 不动 */
export interface Scene3DMetaPatch { name?: string; group?: string }

/**
 * 改 3D 场景的 meta。doc 非 3D 时抛错（调用方须先按类型分流——3D 页只喂 3D 卡片）。
 */
export async function updateScene3DMeta(
  client: ScreensClient,
  id: string,
  patch: Scene3DMetaPatch,
): Promise<void> {
  const s = client
  const { doc } = await s.get(id)
  const next: SceneDoc = { ...doc, meta: { ...doc.meta } }
  if (patch.name !== undefined) next.meta.name = patch.name
  if (patch.group !== undefined) next.meta.group = patch.group
  await s.put(id, next)
}
