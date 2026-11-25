/**
 * bind 收集（T6）：done_json（含嵌套 group children）→ 订阅面。
 * field 格式 = <devid>.<tag>（AGENTS 约定 = maotu bind_id = SSE 订阅键）；无点分隔的非法 bind_id 丢弃。
 * W11：`@` 开头的 bind_id 不进订阅面——`@dev.*` 是设备参数模板（运行时重写后才收集），
 * `@meta.*` 是宿主注入显示通道，两者都不是真实 SSE 点位。
 * 工业功能件：`__` 开头的 devid 是**宿主合成点位**（`__sys.quality` / `__area.*.alarm_count`，
 * 见 lib/synthetic.ts）——不是 rs-iot 点位，既不进 SSE 订阅，也不计入 deadFields
 * （否则画面底部会常驻"无数据 N 点"的假告警）。
 */
export interface BindInfo { fields: string[]; devs: string[] }

type Pel = { binds?: Array<{ bind_id?: unknown }>; children?: unknown[] }

/** 合成点位判定：`__` 前缀的 devid（`__sys.quality` / `__area.*`）或 tag 段
 *  （`dev_wm1.__prio` / `dev_wm1.__alarms`）——后者由宿主按设备聚合后注入，
 *  同样不是 rs-iot 点位。 */
export function isSyntheticField(field: string): boolean {
  const segs = field.split('.')
  return segs[0].startsWith('__') || segs.slice(1).some((s) => s.startsWith('__'))
}

export function collectBinds(done: { json?: unknown[] } | unknown[]): BindInfo {
  const fields = new Set<string>()
  const walk = (pels: unknown[]): void => {
    for (const p of pels) {
      if (!p || typeof p !== 'object') continue
      const pel = p as Pel
      for (const b of pel.binds ?? []) {
        const id = b?.bind_id
        if (typeof id === 'string' && id.includes('.') && !id.startsWith('@') && !isSyntheticField(id)) {
          fields.add(id)
        }
      }
      if (Array.isArray(pel.children)) walk(pel.children)
    }
  }
  walk(Array.isArray(done) ? done : done.json ?? [])
  const devs = new Set([...fields].map((f) => f.slice(0, f.indexOf('.'))))
  return { fields: [...fields].sort(), devs: [...devs].sort() }
}
