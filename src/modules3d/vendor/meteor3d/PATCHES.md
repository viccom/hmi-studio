# vendor 补丁清单（Meteor3DEditor）

上游：`nikonikoCW/Meteor3DEditor` @ commit **`5ca4b84`**（2026-11-11，MIT，见同目录 LICENSE）

vendor 范围（相对上游）：
- `core/` = 上游 `packages/core/src/` **全量**（37 个 .js）。core 与 GIS/tiles 是静态 import
  耦合（`SceneManager.js` 顶层 import `GeoCoordinateSystem`/`TileMapManager`；
  `PersistenceManager.js` 顶层 import `3d-tiles-renderer`），删文件会破坏 core，故整体带入。
- `editor/` = 上游 `packages/scene-editor/src/` 的**子集**：components 9 个（Viewport/Toolbar/
  SceneTree/TreeNode/PropertiesPanel/MaterialPanel/AnimationPanel/SceneSettingsPanel/LibraryPanel）、
  core 7 个（CommandFactory/HistoryManager/InputManager/TransformManager/PersistenceManager/
  SceneManager/VisualPreviewManager）、stores/editorStore.js、assets/sidebar-controls.css。
- **不带入**：GIS/地图/天气/相机速度面板、MapSelectorDialog、views/、services/、utils/onboarding
  （连带省掉 `leaflet`、`driver.js` 依赖）；`meteor3d-server` 与 `asset-manager` 包。

## 补丁（共 6 处，均为集成必需）

| # | 文件 | 改动 | 原因 |
|---|---|---|---|
| PATCH-01 | `editor/components/Viewport.vue` | `dbManager = window.__hmi3d?.createDbManager?.() ?? new DBManager(...)` | 存储后端注入点：默认用上游 DBManager（打 Meteor 自带后端），hmi-studio 注入 rs-iot `scenes` 适配器（`../../adapter/store-adapter.ts`）。**唯一**需要改上游逻辑的地方 |
| PATCH-02 | `editor/components/Viewport.vue` | `route.params.sceneId \|\| route.params.id` | 上游路由用 `:sceneId`，hmi-studio 统一用 `:id` |
| PATCH-03 | `editor/components/Toolbar.vue` | 自动保存间隔从 `window.__hmi3d?.autoSaveMs` 读，`0` = 关闭 | 上游硬编码 10s 无条件保存，与 rs-iot `if_version` 乐观锁冲突（多标签静默互相覆盖，实测过）。P2 改为「脏标记 + 409 即停」 |
| PATCH-05 | `editor/components/Viewport.vue` | 新增 `Industrial:<id>` 拖放分支：调 `window.__hmi3d.buildIndustrialPart` 生成**独立 Mesh 数组**（不包 Group——上游按对象序列化，Group 会吞掉子件 bid/几何），用 `CompositeCommand` 统一撤销 | 工业图元库（P3）：一台设备 = 多个基础几何子件，每个子件独立 bid 可单独绑定点位 |
| PATCH-06 | `editor/components/LibraryPanel.vue` | 物料库顶部加「工业设备」分组（数据源 `adapter/industrial-parts`，站点可增删） | 让工业图元可拖放；同时把"未启用的模型/3D Tiles/泼溅"区留在下方不干扰 |
| PATCH-04 | `core/PersistenceManager.js` | **撤销**曾经的 `stripBindings` 开关，恢复完整保存 `nodeGraph`/`nodeBindings` | 该开关源于对「多 GLTF 实例骨骼重挂缺陷」的误判（真因是 scale 设错）；且 3D 文档已迁到 1 MiB 的 `scenes` 族，放得下（实测 217 KiB / 43 对象）。保留会导致**保存一次丢 nodeGraph**（展厅 292 条，实测 nodeGraph 292→0） |

## 本地替换（非上游文件，替代其同名模块）

| 文件 | 替代上游 | 原因 |
|---|---|---|
| `editor/utils/message.js` | `scene-editor/src/utils/message.js` | 上游自绘 reactive toast（需 MessageContainer 渲染）；改用 element-plus `ElMessage`，与 2D 编辑器同款（Q8 档②壳层统一） |
| `editor/config.js` | `scene-editor/src/config.js` | 上游指向 Meteor 自带后端 `localhost:3001/api`；本项目走 rs-iot（网关 `/api/rsiot`） |
| `editor/services/sceneService.js` | `scene-editor/src/services/sceneService.js` | 上游打 `/api/scene/*`（Express+MongoDB）；此处只实现面板用到的 `saveInitialView`（读写 `scenes` 族的 `doc.scene.initialView`）与 `uploadSceneThumbnail`（P0 不支持，返回 null） |

## import 重写（机械改动，无行为变化）

- `from '@meteor3d/core'` → `'../../core/index.js'`（3 处：editor/core/{SceneManager,PersistenceManager}.js、editor/components/Viewport.vue）
- `from '@meteor3d/core/src/LightingManager.js'` → `'../../core/LightingManager.js'`（SceneSettingsPanel.vue）
- 原因是 vendor/core 直接是 `core/src` 的扁平副本，没有 `src/` 子层。

## 升级流程（P0 出口演练，方案 §13.4 T3）

1. 取上游新 commit，比对本清单 3 处 PATCH 的上下文是否仍在
2. 重新拷贝 core/ 与新子集 editor/（覆盖），重放 PATCH-01~03 与两处本地替换
3. `pnpm typecheck` + core 单测 + 两个 DEMO 场景回归（加载/编辑/保存/刷新一致）
4. 通过则更新本文件的 commit 号；不通过则停在旧 commit（vendor 是锁定的，不追 HEAD）

## 不带的已知缺陷（记录以便将来需要时取用）

上游 `meteor3d-server`（本项目不引入）的 5 项问题：schema 丢 emissive、`findOneAndUpdate`
无 `$set`、load 无 `Cache-Control`、`allowBuilds` 无效占位、meshopt 压缩缩模型 24 倍无提示。
本项目文档走 rs-iot、资产不经其管线，全部规避；教训已由 `adapter/compact` 的往返保真单测承接。
