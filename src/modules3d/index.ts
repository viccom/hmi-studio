/**
 * 3D 组态模块入口（可选模块）——被 `src/modules/registry.ts` 动态发现。
 *
 * 模块边界（2026-11-26）：
 *   允许依赖：`lib/*`（api/screens 契约/sse/nav）、`components/*`、`symbols/*`、`screen-assets/*`
 *   禁止：任何非模块代码 import 本目录（registry 的 glob 除外）——由 check-layers.mjs 强制
 *
 * 剔除方式：删除 `src/modules3d/` 整个目录 + 下面列出的外部引用点（已全部收口）：
 *   - `src/lib/screens.ts`        （无 3D 引用，已迁出）
 *   - `src/lib/screen-list.ts`    （无 3D 引用，已迁出）
 *   - `src/lib/screen-create.ts`  （无 3D 引用，已迁出）
 *   - `src/router.ts`             （经 modules/registry 动态发现，无 3D 路径）
 *   - `src/views/ScreenListView.vue`（经 modules/registry 渲染导航，无 3D 路径）
 *   - package.json 的 `three`/`@types/three` 可一并移除（仅本模块使用）
 * 验证：`node scripts/verify-module-removal.mjs`（真实删除副本 + typecheck + build）。
 */
import type { HmiOptionalModule } from '../modules/types'

const module3d: HmiOptionalModule = {
  id: '3d',
  nav: [{ label: '3D 画面', to: '/screens3d', order: 10 }],
  routes: [
    { path: '/screens3d', component: () => import('./views/ScreenList3DView.vue') },
    { path: '/view3d/:id', component: () => import('./views/Scene3DView.vue') },
    { path: '/edit3d/:id', component: () => import('./views/Scene3DEditView.vue') },
  ],
}

export default module3d
