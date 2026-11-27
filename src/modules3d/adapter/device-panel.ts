/**
 * 设备详情面板的**设备解析**（纯逻辑，可单测）。
 *
 * 为什么需要它：v2 场景里一台设备是**若干独立对象**（子件各一个 bid），没有 v1 那种
 * 「一个设备一个 group、userData.devid 挂在 group 上」的父子结构。点中的是哪个子件，
 * 取决于射线命中——要把它还原成「哪台设备」，只能靠场景文档本身的信息：
 *   - `bindings`：子件 → rs-iot 点位（带 devId 与单位）——设备身份与实时值的来源
 *   - `events`：子件 → 跳转 2D 面板规则——面板按钮的目标
 *   - 对象名 `<设备标签>/<子件名>`：把同一台设备的多个子件归到一组（点中底座等
 *     **没有绑定**的子件时，靠它找到同设备里带绑定的那个子件）
 *
 * 与 v1 的对应：v1 靠 `node.userData.devid` + `node.points.value` 直接拿到设备与测点；
 * v2 没有 userData 承载位（上游只持久化 objects 的既有字段），故走文档反查。
 */
import { faceplateSlug } from '../../screen-assets/iot-catalog'
import type { SceneBinding, SceneEventRule } from '../scene3d'

/** 面板需要的最小设备信息 */
export interface PanelDevice {
  /** rs-iot 设备 id（如 dev_wm1） */
  devId: string
  /** 主测点字段（devid.tag） */
  field: string
  /** 单位与精度（取自绑定的 config——label 绑定带单位） */
  unit: string
  precision: number
  /** 「进入 2D 设备面板」的目标：优先场景的 navigate 规则，其次 2D 目录的 faceplate */
  target: { slug: string; dev?: string }
}

/** 场景对象的最小区信息（bid + 名字） */
export interface PanelObject {
  bid: string
  name: string
}

/** 对象名里的设备分组前缀（`<设备标签>/<子件名>` → 设备标签） */
export function deviceKeyOf(name: string): string {
  const i = name.indexOf('/')
  return i < 0 ? name : name.slice(0, i)
}

/**
 * 命中子件 → 设备。
 *
 * @param bid        点中的对象 bid
 * @param objects    场景对象清单（bid + name），用于按设备分组回查
 * @param bindings   场景绑定（子件 → 点位；带 devId 与单位）
 * @param events     场景事件（子件 → 跳转规则）
 */
export function resolvePanelDevice(
  bid: string,
  objects: readonly PanelObject[],
  bindings: readonly SceneBinding[],
  events: readonly SceneEventRule[],
): PanelDevice | null {
  // ① 命中子件自带绑定 → 直接取设备身份
  let binding = bindings.find((b) => b.targetBid === bid)

  // ② 命中的是无绑定的子件（底座/铭牌…）→ 按设备名分组找同设备里带绑定的子件
  if (!binding) {
    const hit = objects.find((o) => o.bid === bid)
    if (!hit) return null
    const key = deviceKeyOf(hit.name)
    const sibling = objects.find(
      (o) => o.bid !== bid && deviceKeyOf(o.name) === key && bindings.some((b) => b.targetBid === o.bid),
    )
    if (!sibling) return null
    binding = bindings.find((b) => b.targetBid === sibling.bid)
  }
  if (!binding) return null

  const devId = binding.devId
  const field = binding.field

  // ③ 单位/精度：label 绑定带 config.unit/precision（发光绑定没有）
  const labelBinding = bindings.find(
    (b) => b.devId === devId && b.field === field && typeof (b.config as { unit?: unknown }).unit === 'string',
  )
  const cfg = (labelBinding ?? binding).config as { unit?: unknown; precision?: unknown }
  const unit = typeof cfg.unit === 'string' ? cfg.unit : ''
  const precision = typeof cfg.precision === 'number' ? cfg.precision : 2

  // ④ 2D 目标：场景的 navigate 规则优先（场景作者说了算），否则回退 2D 目录的 faceplate
  const rule =
    events.find((e) => e.on.targetBid === bid && e.do.type === 'navigate') ??
    events.find((e) => e.do.type === 'navigate' && e.do.dev === devId)
  const target = rule && rule.do.type === 'navigate'
    ? { slug: rule.do.slug, dev: rule.do.dev }
    : { slug: faceplateSlug(devId), dev: devId }

  return { devId, field, unit, precision, target }
}
