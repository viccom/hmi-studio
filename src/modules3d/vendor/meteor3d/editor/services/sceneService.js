/**
 * sceneService 适配桩（本地替换上游 `services/sceneService.js`）。
 *
 * 上游服务层打 Meteor 自带后端（`/api/scene/...`，Express+MongoDB）。本项目文档走
 * rs-iot 的 `scenes` 资源族，故这里只实现被面板用到、且语义可映射的两个函数：
 *   - saveInitialView(sceneId, view)      → 写 doc.scene.initialView
 *   - uploadSceneThumbnail(...)           → 不支持（rs-iot 无缩略图端点），显式报错
 * 其余上游函数（列表/新建/删除/精选）由 hmi-studio 的列表页承担，不在 vendor 内实现。
 *
 * **写路径纪律（2026-11-28 收口）**：本文件**不得自己 GET+PUT**。
 * 原实现自己读-改-写文档，绕开了适配器 → ① 服务器版本已 +1 而适配器缓存的 version 变旧
 * → 下一次保存必撞 409；② 适配器合并时用旧 `lastDoc.scene` 打底 → 刚存的视角被回退。
 * 现在只做**委派**：视角写入由 hmi-studio 壳层经 `window.__hmi3d.saveInitialView`
 * 走唯一保存链路完成（适配器 + 乐观锁 + 语义层合并）。
 */

/** 保存初始视角：委派给 hmi-studio 壳层（唯一保存链路） */
export async function saveInitialView(sceneId, view) {
  const bridge = typeof window !== 'undefined' ? window.__hmi3d : undefined
  if (!bridge?.saveInitialView) {
    // 不静默降级成「自己写」——那正是版本漂移与视角回退的来源
    throw new Error('当前环境未接入 hmi-studio 保存桥，无法保存初始视角')
  }
  return bridge.saveInitialView(view)
}

/** 不支持场景封面（rs-iot 无对应端点）——**显式抛错**，让上游面板显示
 *  「初始视角已保存，但场景封面保存失败」，而不是谎报「已保存」 */
export async function uploadSceneThumbnail() {
  throw new Error('rs-iot 暂无 3D 场景缩略图端点')
}

/** 上游列表页用，本模块不用（保留导出避免任何残留引用报错） */
export async function getScenes() { return { scenes: [] } }
export async function createScene() { throw new Error('not supported in hmi-studio') }
export async function deleteScene() { throw new Error('not supported in hmi-studio') }
export async function getSceneData() { throw new Error('not supported in hmi-studio') }
export async function updateSceneFeaturedStatus() { throw new Error('not supported in hmi-studio') }
