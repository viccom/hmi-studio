/**
 * sceneService 适配桩（本地替换上游 `services/sceneService.js`）。
 *
 * 上游服务层打 Meteor 自带后端（`/api/scene/...`，Express+MongoDB）。本项目文档走
 * rs-iot 的 `scenes` 资源族，故这里只实现被面板用到、且语义可映射的两个函数：
 *   - saveInitialView(sceneId, view)      → 写 doc.scene.initialView（读-改-写，带 if_version）
 *   - uploadSceneThumbnail(...)           → P0 不支持（rs-iot 无缩略图端点），返回 null
 * 其余上游函数（列表/新建/删除/精选）由 hmi-studio 的列表页承担，不在 vendor 内实现。
 */
import { sceneStore } from '../../../../store.ts'

/** 保存初始视角（上游 PATCH /scene/:id/initial-view 的等价实现） */
export async function saveInitialView(sceneId, view) {
  const store = sceneStore()
  const { doc, version } = await store.get(sceneId)
  const scene = { ...(doc.scene ?? {}) }
  scene.initialView = {
    position: { x: view.position.x, y: view.position.y, z: view.position.z },
    target: { x: view.target.x, y: view.target.y, z: view.target.z },
  }
  const next = { ...doc, scene }
  await store.put(sceneId, next, version)
  return scene.initialView
}

/** P0 不支持场景封面（rs-iot 无对应端点）——返回 null，面板会提示"封面保存失败"但不阻塞 */
export async function uploadSceneThumbnail() {
  return null
}

/** 上游列表页用，本模块不用（保留导出避免任何残留引用报错） */
export async function getScenes() { return { scenes: [] } }
export async function createScene() { throw new Error('not supported in hmi-studio') }
export async function deleteScene() { throw new Error('not supported in hmi-studio') }
export async function getSceneData() { throw new Error('not supported in hmi-studio') }
export async function updateSceneFeaturedStatus() { throw new Error('not supported in hmi-studio') }
