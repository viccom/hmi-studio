/**
 * 新建画面核（W8）：探测+创建从 EditView/ScreenListView 两处对话框上抽共用
 * （W7 曾内联复制，分组字段加入后重复超限）。PUT 是全量 upsert，先探测防误覆盖。
 * 结果态收敛（ok/exists/failed），ElMessage 提示留在视图层。
 */
import { blankScreen, screensApi, wrapDoc, type ScreenMeta } from './screens'

/** slug 规则：小写字母/数字开头，仅含小写字母、数字、中划线（与两处对话框校验一致） */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export type CreateResult = 'ok' | 'exists' | 'failed'

type ScreensClient = ReturnType<typeof screensApi>

export async function createScreen(
  client: ScreensClient = screensApi(),
  id: string,
  meta: ScreenMeta,
): Promise<CreateResult> {
  try {
    await client.get(id)
    return 'exists' // 命中 = 已存在，阻止覆盖
  } catch { /* 404 = 可用 */ }
  try {
    await client.put(id, wrapDoc(blankScreen(id), meta))
    return 'ok'
  } catch {
    return 'failed'
  }
}
