/**
 * maotu 内置标签白名单（bundle 全量枚举 sys 族与 text-vue）——**单一事实源**（2026-10-31
 * 审查修复：前端降级判定与 hmi-mcp 校验曾各自手抄一份并漂移——mcp 侧漏 `group`，
 * 含组合项的画面恒报 unknown_tag）。
 *
 * 消费方：
 *  - 前端：plugin-fallback.ts `knownTags()`（未知 tag → 占位降级）
 *  - hmi-mcp：tools/screens.ts `validateScreenDoc`（语义预警，不拦发布）
 *
 * 漏枚举 = 内置图元被误降级成占位——w10 页签屏 sys-button-vue 实测踩到，新增内置 tag
 * 必须在此登记。`group` = 组合项 tag（探针报告 §1），非插件面。
 */
export const BUILTIN_TAGS: ReadonlySet<string> = new Set([
  'text-vue',
  'group',
  'sys-button-vue',
  'sys-line',
  'sys-line-vertical',
])
