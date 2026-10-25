/**
 * bind 收集（T6）：done_json（含嵌套 group children）→ 订阅面。
 * field 格式 = <devid>.<tag>（AGENTS 约定 = maotu bind_id = SSE 订阅键）；无点分隔的非法 bind_id 丢弃。
 */
export interface BindInfo { fields: string[]; devs: string[] }

type Pel = { binds?: Array<{ bind_id?: unknown }>; children?: unknown[] }

export function collectBinds(done: { json?: unknown[] } | unknown[]): BindInfo {
  const fields = new Set<string>()
  const walk = (pels: unknown[]): void => {
    for (const p of pels) {
      if (!p || typeof p !== 'object') continue
      const pel = p as Pel
      for (const b of pel.binds ?? []) {
        if (typeof b?.bind_id === 'string' && b.bind_id.includes('.')) fields.add(b.bind_id)
      }
      if (Array.isArray(pel.children)) walk(pel.children)
    }
  }
  walk(Array.isArray(done) ? done : done.json ?? [])
  const devs = new Set([...fields].map((f) => f.slice(0, f.indexOf('.'))))
  return { fields: [...fields].sort(), devs: [...devs].sort() }
}
