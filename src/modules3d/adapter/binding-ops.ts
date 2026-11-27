/**
 * 绑定编辑操作（P2）：纯函数 CRUD + 悬空校验。
 *
 * 全部返回**新文档**（不原地改）——便于"改前/改后"比对决定是否置脏，
 * 也避免 Vue 响应式对象被意外共享引用。
 *
 * 悬空绑定（方案 §7 R3）：bid 是绑定/事件的唯一引用键，用户在编辑器里删除对象
 * 再拖入同款会得到新 bid → 旧绑定指向不存在的对象。**必须显式暴露**给 UI 标红，
 * 不能静默丢弃（静默丢 = 用户以为还绑着，运行页却毫无反应）。
 */
import type { SceneBinding, SceneDoc } from '../scene3d'
import { devIdOfField } from './bindings'

/** 绑定可用的 kind（animationSpeed 只在对象有动画时出现，见 bindingKindsFor） */
export const ALL_BINDING_KINDS = ['color', 'emissive', 'visible', 'label', 'animationSpeed'] as const

/** 每种 kind 的默认 config：用户点一下就有合理行为，不必先懂参数 */
export const DEFAULT_CONFIG_BY_KIND: Record<SceneBinding['kind'], Record<string, unknown>> = {
  color: { color: 0x1de0ff },
  emissive: { color: 0x27c93f, scale: 0.1 },
  visible: { truthyAbove: 0.5 },
  label: { unit: '', precision: 1 },
  animationSpeed: {},
}

/** 按对象能力筛可用 kind（没动画的对象不给"动画速度"，避免无效选项） */
export function bindingKindsFor(opts: { hasAnimation: boolean }): SceneBinding['kind'][] {
  return ALL_BINDING_KINDS.filter((k) => (k === 'animationSpeed' ? opts.hasAnimation : true))
}

/** 生成稳定可读的绑定 id：bind_<bid 末 6 位>_<kind> */
export function nextBindingId(targetBid: string, kind: SceneBinding['kind']): string {
  const tail = String(targetBid).replace(/^bid_/, '').slice(-6) || 'obj'
  return `bind_${tail}_${kind}`
}

/** 取文档的绑定数组（缺省空） */
const listOf = (doc: SceneDoc): SceneBinding[] => [...(doc.bindings ?? [])]

/** 追加绑定；同一 targetBid+field+kind 视为重复（幂等，返回原文档） */
export function addBinding(
  doc: SceneDoc,
  input: { targetBid: string; field: string; kind: SceneBinding['kind']; config?: Record<string, unknown>; id?: string },
): SceneDoc {
  const dup = (doc.bindings ?? []).some(
    (b) => b.targetBid === input.targetBid && b.field === input.field && b.kind === input.kind,
  )
  if (dup) return doc
  const next: SceneBinding = {
    id: input.id ?? nextBindingId(input.targetBid, input.kind),
    targetBid: input.targetBid,
    field: input.field,
    devId: devIdOfField(input.field),
    kind: input.kind,
    config: input.config ?? { ...DEFAULT_CONFIG_BY_KIND[input.kind] },
  }
  return { ...doc, bindings: [...listOf(doc), next] }
}

/** 按 id 删除（不存在则原样返回） */
export function removeBinding(doc: SceneDoc, id: string): SceneDoc {
  const list = listOf(doc)
  const next = list.filter((b) => b.id !== id)
  return next.length === list.length ? doc : { ...doc, bindings: next }
}

/** 按 id 更新；field 变了则 devId 跟随重算（不能留旧值） */
export function updateBinding(
  doc: SceneDoc,
  id: string,
  patch: Partial<Omit<SceneBinding, 'id'>>,
): SceneDoc {
  const list = listOf(doc)
  if (!list.some((b) => b.id === id)) return doc
  const next = list.map((b) => {
    if (b.id !== id) return b
    const merged = { ...b, ...patch }
    // devId 永远由 field 派生，不接受外部传入（防不一致）
    merged.devId = devIdOfField(merged.field)
    return merged
  })
  return { ...doc, bindings: next }
}

/** 悬空绑定 id 列表：targetBid 不在 objects[].bid 里 */
export function danglingBindings(doc: SceneDoc): string[] {
  const bids = new Set(
    ((doc.objects ?? []) as Array<{ bid?: string }>).map((o) => o?.bid).filter((b): b is string => !!b),
  )
  return (doc.bindings ?? []).filter((b) => !bids.has(b.targetBid)).map((b) => b.id)
}

/** 悬空事件 id 列表（事件也引用 bid，同样会悬空） */
export function danglingEvents(doc: SceneDoc): string[] {
  const bids = new Set(
    ((doc.objects ?? []) as Array<{ bid?: string }>).map((o) => o?.bid).filter((b): b is string => !!b),
  )
  const out: string[] = []
  for (const e of doc.events ?? []) {
    const refs: string[] = []
    if (e.on?.targetBid) refs.push(e.on.targetBid)
    const act = e.do as { targetBid?: string }
    if (act?.targetBid) refs.push(act.targetBid)
    if (refs.some((r) => !bids.has(r))) out.push(e.id)
  }
  return out
}
