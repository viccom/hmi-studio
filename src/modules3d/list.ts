/**
 * 3D 场景列表数据源（模块内）——从 2D 的 `lib/screen-list.ts` 抽出分类逻辑。
 *
 * 为什么不在 2D 的 loadScreenCards 里分流：那会让 2D 核心认识 3D 契约
 * （`isScene3D`/`$schema`），删除 3D 模块时 2D 编译失败。现在 2D 只按自己的
 * 契约判定“是不是 2D 画面”（`canvasCfg` + `json[]`），3D 只按自己的 `$schema` 判定，
 * 两侧互不认识。
 */
import { ApiError } from '../lib/api'
import { batched } from '../lib/screen-list'
import { isScene3D, type SceneDoc } from './scene3d'
import { sceneStore } from './store'

export interface SceneMeta { name?: string; group?: string }
export interface SceneCard {
  id: string
  name?: string
  group?: string
}

/** 只加载 3D 场景卡片；非 3D 文档静默跳过（它属于 2D 列表页） */
export async function loadSceneCards(
  client: ReturnType<typeof sceneStore> = sceneStore(),
  cap = 4,
): Promise<SceneCard[]> {
  const ids = await client.list()
  const cards = await batched(ids, cap, async (id): Promise<SceneCard | null> => {
    try {
      const { doc } = await client.getRaw(id)
      if (!isScene3D(doc)) return null
      const m = doc as unknown as SceneDoc
      return { id, name: m.meta?.name, group: m.meta?.group }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null // 并发删除：跳过该卡
      throw e // 网络/服务端错误照常上抛，不静默吞掉
    }
  })
  return cards.filter((c): c is SceneCard => c !== null)
}
