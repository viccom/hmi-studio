/**
 * 事件层（P1）：3D 对象点击 → 动作求值。
 *
 * 分工：本文件只做**纯求值**（"该做什么"），执行在页面（导航用 router、命令走 bridge、
 * 相机操作走 sceneManager）。这样规则可单测，也不会把 router/bridge 拖进模块深层。
 *
 * 与 2D 对齐：`navigate` 的 `slug?dev=` 语义**复用** `lib/nav.ts` 的 `parseNavTarget`，
 * 不另写一套解析（两处解析必然漂移——这是本仓既有教训）。
 */
import { parseNavTarget } from '../../lib/nav'
import type { SceneEventRule } from '../scene3d'

/** navigate 目标串的安全解析（非法输入降级为空 slug，不抛） */
export function parseNavTargetSafe(target: string | undefined | null): { slug: string; dev: string } {
  try {
    return parseNavTarget(String(target ?? ''))
  } catch {
    return { slug: '', dev: '' }
  }
}

/**
 * 求值：给定被点击对象的 bid，返回该执行的动作。
 * 优先级：**精确 targetBid 匹配 > 无 targetBid 的兜底规则**（兜底不能抢精确规则的活）。
 */
export function resolveEventAction(
  rules: readonly SceneEventRule[] | undefined,
  bid: string,
): SceneEventRule['do'] | null {
  if (!bid || !rules?.length) return null
  const exact = rules.find((r) => r?.on?.type === 'click' && r.on.targetBid === bid)
  if (exact) return exact.do
  const wildcard = rules.find((r) => r?.on?.type === 'click' && !r.on.targetBid)
  return wildcard ? wildcard.do : null
}
