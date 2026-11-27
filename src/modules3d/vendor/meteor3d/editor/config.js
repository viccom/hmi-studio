/**
 * 模块级配置（本地替换上游 config.js）。
 *
 * 上游从 `VITE_API_BASE_URL` 拼 `http://localhost:3001/api`，那是 Meteor 自带后端的地址。
 * 本项目文档走 rs-iot（`/api/rsiot` 经 gateway 或 dev 直连），且 DBManager 已被适配层
 * 替换（见 src/modules3d/adapter/store-adapter.ts），故这里只保留资源基址：
 * GLTF/贴图等静态资源若由 rs-iot 托管，走同一 API 前缀即可。
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE || ''
export const ASSET_BASE_URL = import.meta.env.VITE_API_BASE || ''
