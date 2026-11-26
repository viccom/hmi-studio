/**
 * assetService 适配桩（本地替换上游 `services/assetService.js`）。
 *
 * 上游资产库打 Meteor 自带后端（`/api/assets`，含 KTX2/Meshopt 压缩管线）。
 * 本项目 P0 不带资产库（方案 §6.2 三档裁剪；工业图元库在 P3 用我们的 assets 清单替换），
 * 故这里返回空列表让 UI 显示"暂无模型"，而不是 404 报错。
 */
export async function getAssets() { return [] }
export async function getAssetUrl(asset) { return asset?.url ?? '' }
export async function getCompressedAssetUrl(asset) { return asset?.url ?? '' }
export async function getCloudAssetUrl(asset) { return asset?.url ?? '' }
export async function uploadAsset() { throw new Error('资产上传未在本项目启用（P3 接工业图元库）') }
export async function deleteAsset() { throw new Error('资产删除未在本项目启用') }
export async function getAssetStatus() { return 'ready' }
