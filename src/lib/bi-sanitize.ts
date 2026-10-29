/**
 * BI 保存态 sanitize——把 BI 图元 props 里的运行态聚合数据复位，防止污染画面文档。
 *
 * 为何需要（maotu bundle ud 实证）：保存时 maotu 把 props 拍平
 * （`r[a] = l.props[a].val`），故通道 B 写进 props.data.val 的那份聚合 JSON
 * 会被原样 PUT 进 rs-iot：
 * - 文档膨胀（rs-iot 单文档 ≤128 KiB，一屏 12 张 BI 图元的信封可达数十 KB）
 * - 下次加载读到的是**陈旧**的运行态数据（图元首帧显示上次刷新时的旧值）
 *
 * 对策：保存前把 BI 图元的 props.data 复位为 '[]'。纯函数、不改入参。
 */
import { BI_TAG_PREFIX } from './bi-contract'

type Rec = Record<string, unknown>

function asRecord(v: unknown): Rec | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : undefined
}

/** 复位后的空信封载荷（与图元侧的解析容错一致：空数组 → 空序列）。 */
const EMPTY_DATA = '[]'

/** 判断一个元素是否为 BI 图元（tag 前缀约定，与契约层同源）。 */
function isBiElement(el: Rec): boolean {
  const tag = typeof el.tag === 'string' ? el.tag : ''
  return tag.startsWith(BI_TAG_PREFIX)
}

/**
 * 画面文档 sanitize：BI 图元的 props.data → '[]'。
 *
 * 递归进 group children（保存态拍平后 group children 同样入库）。
 * 非 BI 元素、非 props 元素、畸形输入一律原样保留。
 */
export function sanitizeBiProps(doc: unknown): unknown {
  const walk = (el: Rec): Rec => {
    const out: Rec = { ...el }
    if (isBiElement(el)) {
      const props = asRecord(el.props)
      if (props && 'data' in props) out.props = { ...props, data: EMPTY_DATA }
    }
    if (Array.isArray(el.children)) {
      out.children = (el.children as unknown[]).map((c) => {
        const r = asRecord(c)
        return r ? walk(r) : c
      })
    }
    return out
  }
  const root = asRecord(doc)
  if (!root) return doc
  if (Array.isArray(root.json)) {
    return { ...root, json: (root.json as unknown[]).map((c) => {
      const r = asRecord(c)
      return r ? walk(r) : c
    }) }
  }
  return { ...root }
}
