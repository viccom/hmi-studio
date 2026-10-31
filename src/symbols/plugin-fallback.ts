/**
 * 插件缺席/故障的降级渲染（P3b，设计 §6.2「插件级故障隔离在单图元」）。
 *
 * 两处把「整画面拒载」收敛为「单图元降级」：
 *  1. 未知 tag（插件未装/已卸载）→ 替换为 `ah-plugin-missing` 占位图元（灰框 + tag 名
 *     标注，保留原 id/binds/尺寸——绑定关系与保存往返不丢）；
 *  2. 已知 tag 的未知 props 键（插件升级后 props 形状变了，types.ts ⑤ 归一化抛错）
 *     → 剔除未知键 + console.warn。
 *
 * 编辑侧数据不丢：EditView 保存时把存档的原项按 id 合并回 payload（占位不入库）。
 * 运行侧（ViewView）只渲染不保存，替换即终态。
 */
import { allSymbols } from './registry'
import { BUILTIN_TAGS } from './builtin-tags'
import { pluginSymbols } from './plugin-loader'

/** 占位图元 tag（AhPluginMissing.vue 全局注册名 = vueTagFor('ah-plugin-missing')） */
export const MISSING_TAG = 'ah-plugin-missing'

export interface FallbackResult {
  /** 替换/清洗后的 done（可直接 setImportJson） */
  done: Record<string, unknown>
  /** 被替换的原项（id → 原项），EditView 保存时按 id 合并回 payload */
  stashed: Map<string, Record<string, unknown>>
  /** 降级发生的图元描述（通知/日志用） */
  degraded: Array<{ id: string; tag: string; reason: 'unknown_tag' | 'unknown_props' }>
}

type Rec = Record<string, unknown>

function asRec(v: unknown): Rec | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : undefined
}

/** 已知 tag 集 = 编译期 registry + 内置白名单 + **已装载插件 tag**（plugin-loader
 *  模块态——装载成功的插件图元不降级；未装载/卸载的插件 tag 天然落到 unknown 分支）。 */
export function knownTags(): Set<string> {
  return new Set([...allSymbols().map((s) => s.id), ...BUILTIN_TAGS, ...pluginSymbols().keys(), MISSING_TAG])
}

/** 已知图元的合法 props 键集（registry 描述符）；未知 tag 返回 undefined。 */
function propKeysOf(tag: string, known: Map<string, Set<string>>): Set<string> | undefined {
  return known.get(tag)
}

/** 画布 doc 降级变换（纯函数）。done = IExportJson；递归进 group children。 */
export function applyFallback(done: Rec): FallbackResult {
  const stashed = new Map<string, Rec>()
  const degraded: FallbackResult['degraded'] = []
  const tags = knownTags()
  // tag → props 键集（惰性建表；props 为描述符形 {k:{title,type,val}}）
  const propKeys = new Map<string, Set<string>>()
  for (const s of allSymbols()) {
    propKeys.set(s.id, new Set(Object.keys((s as { props?: Rec }).props ?? {})))
  }
  for (const [tag, keys] of pluginSymbols()) propKeys.set(tag, keys)

  const fixItem = (item: Rec): Rec => {
    const tag = typeof item.tag === 'string' ? item.tag : ''
    if (tag && !tags.has(tag)) {
      // 未知 tag → 占位（保留 id/binds/binfo 尺寸；原项存档）
      stashed.set(String(item.id), item)
      degraded.push({ id: String(item.id), tag, reason: 'unknown_tag' })
      return {
        ...item,
        tag: MISSING_TAG,
        title: typeof item.title === 'string' ? item.title : '缺失图元',
        type: 'vue',
        // 占位组件读 props.missing_tag.val 显示原 tag 名（描述符形态——画布内存形）
        props: { missing_tag: { title: '原 tag', type: 'input', val: tag } },
      }
    }
    // 已知 tag：剔除未知 props 键（归一化抛错面）——平面值形态与描述符形态都兼容。
    // 注意：清洗后**继续走 children 递归**（审查修复：旧实现此处提前 return，
    // 有 children 的插件图元升级后，其子树里的未知 tag 不再降级）
    let out: Rec = item
    const allowed = tag ? propKeysOf(tag, propKeys) : undefined
    const props = asRec(item.props)
    if (allowed && props) {
      const unknown = Object.keys(props).filter((k) => !allowed.has(k))
      if (unknown.length) {
        degraded.push({ id: String(item.id), tag, reason: 'unknown_props' })
        for (const k of unknown) console.warn('[plugin-fallback] 剔除未知 props 键', item.id, tag, k)
        const cleaned: Rec = {}
        for (const [k, v] of Object.entries(props)) if (allowed.has(k)) cleaned[k] = v
        out = { ...item, props: cleaned }
      }
    }
    if (Array.isArray(out.children)) {
      return { ...out, children: (out.children as unknown[]).map((c) => (asRec(c) ? fixItem(c as Rec) : c)) }
    }
    return out
  }

  const json = Array.isArray(done.json) ? (done.json as unknown[]).map((c) => (asRec(c) ? fixItem(c as Rec) : c)) : done.json
  return { done: { ...done, json }, stashed, degraded }
}

/** 保存前还原：把 applyFallback 存档的原项按 id 合并回 payload（占位不入库）。
 *  几何（binfo）取**当前 payload**——用户在占位框上的移动/缩放是有效编辑；
 *  身份/数据字段（tag/type/props/binds/symbol/children）以存档为准（审查修复）。 */
export function restoreStashed(payload: Rec, stashed: Map<string, Rec>): Rec {
  if (stashed.size === 0) return payload
  const restore = (item: Rec): Rec => {
    const orig = stashed.get(String(item.id))
    if (orig && item.tag === MISSING_TAG) {
      const restored = JSON.parse(JSON.stringify(orig)) as Rec
      if (item.binfo !== undefined) restored.binfo = item.binfo
      return restored
    }
    if (Array.isArray(item.children)) {
      return { ...item, children: (item.children as unknown[]).map((c) => (asRec(c) ? restore(c as Rec) : c)) }
    }
    return item
  }
  const json = Array.isArray(payload.json) ? (payload.json as unknown[]).map((c) => (asRec(c) ? restore(c as Rec) : c)) : payload.json
  return { ...payload, json }
}
