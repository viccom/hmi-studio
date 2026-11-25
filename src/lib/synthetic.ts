/**
 * 宿主合成点位（工业功能件的数据来源）：把 rs-iot 的**活动告警清单**翻译成画布可绑定的
 * 点位字段，经 `preview.setDevicePointByID` 注入（与 SSE 数据同一条直写通道，不新增网络请求）。
 *
 * 为什么需要：maotu 的 bind 只能从"点位字段"取值；告警清单在 `AlarmStore` 里，画布拿不到。
 * 合成字段（约定 `__` 前缀 = 宿主生成、非 rs-iot 点位，binds.ts 不把它们放进 SSE 订阅面）：
 *   `<devid>.__prio`        该设备活动告警最高优先级（0=正常，1=P1 … 4=P4）
 *   `<devid>.__alarms`      该设备活动告警条数（distinct key）
 *   `__area.<area>.alarm_count` / `__area.<area>.prio`   区域聚合（water/power/gas/env）
 *   `__sys.quality`         SSE 链路质量（0 GOOD / 1 STALE / 2 BAD）
 *   `__sys.prio` / `__sys.alarms` / `__sys.p1`   全厂最高优先级 / 活动告警数 / P1 数
 *
 * 优先级映射（rs-iot 只有 info/warn/error 三档，见 docs/hmi-style-guide.md §3）：
 *   error → P1，warn → P3，info → P4；P2 预留给联锁，本期不使用。
 */

export type Area = 'water' | 'power' | 'gas' | 'env'

const AREAS: Area[] = ['water', 'power', 'gas', 'env']

/** alarm level → 优先级（未知级别按 P3 处理，宁可见不可藏） */
export function prioOfLevel(level: string): number {
  if (level === 'error') return 1
  if (level === 'info') return 4
  return 3
}

/** 告警 key 的 devid = 第一个 '.' 之前（`dev_wm1.flow_rate.hh` → `dev_wm1`） */
export function devidOfKey(key: string): string {
  const i = key.indexOf('.')
  return i > 0 ? key.slice(0, i) : key
}

/** devid → 区域（按位号前缀；未知设备返回 undefined，只计入全厂统计） */
export function classifyDevid(devid: string): Area | undefined {
  if (devid.startsWith('dev_wm')) return 'water'
  if (devid.startsWith('dev_em')) return 'power'
  if (devid.startsWith('dev_gm')) return 'gas'
  if (devid.startsWith('dev_env') || devid.startsWith('dev_pt')) return 'env'
  return undefined
}

export interface AreaAgg { prio: number; count: number }
export interface AlarmAgg {
  byDev: Map<string, AreaAgg>
  /** 点级聚合：`<devid>.<tag>` → 最高优先级/条数（value-block 逐点报警色） */
  byField: Map<string, AreaAgg>
  byArea: Record<Area, AreaAgg>
  total: number
  /** 全厂最高优先级（0 正常 / 1 P1 … 4 P4） */
  prio: number
  /** P1 条数（可用于"P1 汇总"文本；不要当 prio 用——prio 是 0-4 的档位） */
  p1: number
}

/** 优先级"更严重"取小（1=P1 最高，0=无）；聚合时不能直接用 Math.max */
export function worsePrio(a: number, b: number): number {
  if (a === 0) return b
  if (b === 0) return a
  return Math.min(a, b)
}

/** 活动告警 → 设备/区域/全厂聚合（纯函数；同 key 只计一次，重复 fire 的 count 不放大条数） */
export function aggregateAlarms(alarms: readonly { key: string; level: string }[]): AlarmAgg {
  const byDev = new Map<string, AreaAgg>()
  const byField = new Map<string, AreaAgg>()
  const byArea: Record<Area, AreaAgg> = {
    water: { prio: 0, count: 0 },
    power: { prio: 0, count: 0 },
    gas: { prio: 0, count: 0 },
    env: { prio: 0, count: 0 },
  }
  const seen = new Set<string>()
  let p1 = 0
  let prio = 0
  for (const a of alarms) {
    if (!a || typeof a.key !== 'string' || !a.key || seen.has(a.key)) continue
    seen.add(a.key)
    const p = prioOfLevel(String(a.level))
    prio = worsePrio(prio, p)
    const devid = devidOfKey(a.key)
    // key = <devid>.<tag>.<kind> → 点字段 = 去掉最后一段（未知格式不参与点级聚合）
    const parts = a.key.split('.')
    const field = parts.length >= 3 ? `${parts[0]}.${parts[1]}` : ''
    if (field) {
      const f = byField.get(field) ?? { prio: 0, count: 0 }
      f.count += 1
      f.prio = worsePrio(f.prio, p)
      byField.set(field, f)
    }
    const dev = byDev.get(devid) ?? { prio: 0, count: 0 }
    dev.count += 1
    dev.prio = worsePrio(dev.prio, p)
    byDev.set(devid, dev)
    const area = classifyDevid(devid)
    if (area) {
      byArea[area].count += 1
      byArea[area].prio = worsePrio(byArea[area].prio, p)
    }
    if (p === 1) p1 += 1
  }
  return { byDev, byField, byArea, total: seen.size, prio, p1 }
}

/** SSE 状态 → 质量码（online=GOOD，offline=STALE，认证失败=BAD） */
export function qualityOfStream(state: string): number {
  if (state === 'online') return 0
  if (state === 'auth-failed') return 2
  return 1
}

export interface SyntheticField { field: string; value: number }

/**
 * 生成待注入字段：已知设备（画面订阅面里的 devid）即使无告警也要写 0，
 * 否则告警清除后画布会保留最后一次的颜色（直写通道没有"取消"语义）。
 */
export function syntheticFields(
  agg: AlarmAgg,
  devids: readonly string[],
  quality: number,
  fields: readonly string[] = [],
): SyntheticField[] {
  const out: SyntheticField[] = []
  const seen = new Set<string>()
  for (const d of [...devids, ...agg.byDev.keys()]) {
    if (!d || d.startsWith('__') || seen.has(d)) continue
    seen.add(d)
    const a = agg.byDev.get(d)
    out.push({ field: `${d}.__prio`, value: a?.prio ?? 0 })
    out.push({ field: `${d}.__alarms`, value: a?.count ?? 0 })
  }
  // 点级优先级：画面订阅面里的每个真实点位都写一遍（无报警写 0，清除后不残留颜色）
  const seenField = new Set<string>()
  for (const f of fields) {
    if (!f || f.startsWith('__') || f.split('.').some((seg, i) => i > 0 && seg.startsWith('__'))) continue
    if (seenField.has(f)) continue
    seenField.add(f)
    out.push({ field: `${f}.__prio`, value: agg.byField.get(f)?.prio ?? 0 })
  }
  for (const area of AREAS) {
    out.push({ field: `__area.${area}.alarm_count`, value: agg.byArea[area].count })
    out.push({ field: `__area.${area}.prio`, value: agg.byArea[area].prio })
  }
  out.push({ field: '__sys.quality', value: Math.max(0, Math.min(2, Math.round(quality))) })
  out.push({ field: '__sys.alarms', value: agg.total })
  out.push({ field: '__sys.prio', value: agg.prio })
  out.push({ field: '__sys.p1', value: agg.p1 })
  return out
}
