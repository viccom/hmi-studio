/**
 * 绑定层（P1）：把 rs-iot 实时点位映射到 3D 场景对象。
 *
 * 与 2D 的分工（对齐 `lib/binds.ts` 的语义，不另立规则）：
 *   - 2D：`setDevicePointByID(field, value)` 直写图元 bind_attr
 *   - 3D：点位 → `SceneBinding{targetBid, field, kind}` → 改 three 对象的材质/可见性/标签/动画速度
 *
 * 三条纪律（都是本仓踩过的坑）：
 *   1. **订阅面只含被绑定的字段**，不是"场景内全部设备"——否则 200 台设备的真实厂区会
 *      线性拖慢主线程（v1 运行页曾因每点强制渲染打满主线程，见 Scene3DView 注释）。
 *   2. **`__` 合成点不进 SSE 订阅面**（`__prio`/`__area`/`__sys` 由宿主聚合后注入，
 *      见 `lib/synthetic.ts`）——告警走 `applyAlarms`，不走这里。
 *   3. **不在 per-point 回调里强制 render**：渲染由上游 rAF 循环驱动。
 */
import { isSyntheticField } from '../../lib/binds'
import type { SceneBinding, SceneDoc } from '../scene3d'

/** 告警优先级 → 颜色（与 2D 的 PRIO 色板一致，见 modules3d/geometry.ts 的 PRIO_COLOR） */
const PRIO_COLORS = [0x6b8299, 0xff3b4e, 0xff8c2a, 0xffd23f, 0x3d9dff] as const

export function prioToColor(prio: number): number {
  const i = Math.max(0, Math.min(PRIO_COLORS.length - 1, Math.round(Number.isFinite(prio) ? prio : 0)))
  return PRIO_COLORS[i]
}

/** 字段 → devid（点号前段）；无点号返回空串 */
export function devIdOfField(field: string): string {
  const i = field.indexOf('.')
  return i < 0 ? '' : field.slice(0, i)
}

/** 参与 SSE 订阅的字段集（被绑定字段，去重排序；排除 `__` 合成点） */
export function boundFieldsOf(doc: SceneDoc): string[] {
  const out = new Set<string>()
  for (const b of doc.bindings ?? []) {
    if (!b?.field || !b.field.includes('.')) continue
    if (isSyntheticField(b.field)) continue
    out.add(b.field)
  }
  return [...out].sort()
}

/** 参与 SSE 订阅的设备集（由字段推导，与 2D `collectBinds` 同口径） */
export function boundDevsOf(doc: SceneDoc): string[] {
  const devs = new Set<string>()
  for (const f of boundFieldsOf(doc)) {
    const d = devIdOfField(f)
    if (d) devs.add(d)
  }
  return [...devs].sort()
}

/** 按字段查绑定（同一点位可能绑到多个对象，返回全部） */
export function bindingFor(doc: SceneDoc, field: string): SceneBinding[] {
  return (doc.bindings ?? []).filter((b) => b?.field === field)
}

// ---------------- 以下需要 three 对象（薄封装，页面注入 sceneManager） ----------------

/** 最小可用的上游 SceneManager 面（避免 import vendor 的 JS 类型） */
export interface RuntimeSceneManager {
  findObjectByBid(bid: string): unknown
  highlightManager?: { enable(obj: unknown, opts?: Record<string, unknown>): boolean; disable(obj: unknown): boolean }
  labelManager?: { createLabel(opts: Record<string, unknown>): string; updateLabel(id: string, cfg: Record<string, unknown>): void; removeLabel(id: string): void }
  animationManager?: { setAnimationSpeed(obj: unknown, speed: number): boolean }
}

type AnyObj = { material?: AnyMat | AnyMat[]; visible?: boolean }
type AnyMat = { color?: { setHex(n: number): void }; emissive?: { setHex(n: number): void }; emissiveIntensity?: number }

/** 取对象的全部材质（含数组材质与子网格） */
function materialsOf(obj: AnyObj): AnyMat[] {
  const out: AnyMat[] = []
  const push = (m: unknown) => { if (m) out.push(m as AnyMat) }
  const mat = obj?.material
  if (Array.isArray(mat)) mat.forEach(push)
  else push(mat)
  const kids = (obj as unknown as { children?: AnyObj[] })?.children
  if (Array.isArray(kids)) for (const k of kids) out.push(...materialsOf(k))
  return out
}

/**
 * 应用一条实时值。按 `kind` 落到上游运行时能力。
 * 注意：**不调用 render()**（上游 rAF 循环负责），也不改对象位置（那是编辑态的事）。
 */
export function applyBinding(sm: RuntimeSceneManager, b: SceneBinding, value: number): boolean {
  const obj = sm.findObjectByBid(b.targetBid) as AnyObj | null
  if (!obj) return false

  switch (b.kind) {
    case 'color': {
      const hex = Number((b.config as { color?: unknown })?.color ?? value)
      for (const m of materialsOf(obj)) m.color?.setHex(hex)
      return true
    }
    case 'emissive': {
      // 用实时值驱动自发光强度（如状态灯亮度随负载），颜色取 config.color
      const hex = Number((b.config as { color?: unknown })?.color ?? 0x1de0ff)
      const scale = Number((b.config as { scale?: unknown })?.scale ?? 1)
      for (const m of materialsOf(obj)) {
        m.emissive?.setHex(hex)
        if (typeof m.emissiveIntensity === 'number') m.emissiveIntensity = Math.max(0, value * scale)
      }
      return true
    }
    case 'visible': {
      const truthy = Number((b.config as { truthyAbove?: unknown })?.truthyAbove ?? 0.5)
      obj.visible = value > truthy
      return true
    }
    case 'label': {
      const cfg = b.config as {
        unit?: unknown
        precision?: unknown
        position?: { x: number; y: number; z: number }
        offset?: { x: number; y: number }
        color?: unknown
      }
      const unit = String(cfg.unit ?? '')
      const precision = Number(cfg.precision ?? 1)
      const text = `${value.toFixed(precision)}${unit}`
      const labelId = `lbl_${b.id}`
      const pos = cfg.position
      if (pos && sm.labelManager) {
        // 首次创建（已存在则 update 由调用方决定；这里幂等：createLabel 对重复 id 会告警并返回原 id）
        sm.labelManager.createLabel({
          id: labelId,
          position: pos,
          content: text,
          // 屏幕像素偏移（vendor 机制已有，此前没传）：多块牌挂在同一区域时靠它错开，
          // 避免数值牌互相压住（scada-hmi-builder 的 dx/dy 做法）
          offset: cfg.offset,
          // pointerEvents:'none'：标签是**只读覆盖层**，不能吃掉设备的点击
          // （vendor LabelManager 默认给标签元素 pointerEvents:'auto'，标签正好浮在
          //  设备上方 → 点设备会点到标签，点不动设备——2026-11-27 实测踩到）
          style: {
            color: typeof cfg.color === 'string' ? cfg.color : '#1de0ff',
            fontSize: '12px', background: 'rgba(8,18,28,.86)', padding: '2px 6px', borderRadius: '3px',
            pointerEvents: 'none',
          },
        })
        sm.labelManager.updateLabel(labelId, { content: text })
      }
      return true
    }
    case 'animationSpeed': {
      return sm.animationManager?.setAnimationSpeed(obj, Math.max(0.1, Math.min(3, value))) ?? false
    }
    default:
      return false
  }
}

/** 应用一批点位（SSE onPoint 调用；按字段找绑定，逐条 apply） */
export function applyPointToBindings(
  sm: RuntimeSceneManager, doc: SceneDoc, field: string, value: number,
): number {
  const bs = bindingFor(doc, field)
  let n = 0
  for (const b of bs) if (applyBinding(sm, b, value)) n++
  return n
}

/**
 * 应用告警优先级（`__prio` 合成点 → 对象高亮）。
 * 与 2D 的等价关系：2D 把 `dev_wm1.__prio` 写进图元 bind_attr；3D 改为按 devId
 * 找该设备所有绑定对象，用 HighlightManager 上色（0 = 关高亮）。
 */
export function applyAlarms(
  sm: RuntimeSceneManager, doc: SceneDoc, prioByDev: ReadonlyMap<string, number>,
): number {
  let n = 0
  for (const b of doc.bindings ?? []) {
    const prio = prioByDev.get(b.devId) ?? 0
    const obj = sm.findObjectByBid(b.targetBid)
    if (!obj) continue
    if (prio > 0) {
      if (sm.highlightManager?.enable(obj, { color: prioToColor(prio), intensity: 0.55 })) n++
    } else {
      sm.highlightManager?.disable(obj)
    }
  }
  return n
}
