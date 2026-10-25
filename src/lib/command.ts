/**
 * T7 命令桥纯逻辑。rs-iot 写入口（routes_command.rs 2026-10-25 实测）：
 *   POST /api/v1/command/send {instance, devid, cmd:'write', data:'<JSON字符串>'}
 *   → 200 {"status":"ok"} / 404 "instance not running"
 * 状态机语义移植自 agent-hmi CommandTracker（pending→confirmed|error|timeout 单向）。
 */

/** 定时器注入（测试可控时钟；默认 setTimeout） */
export type SetTimer = (fn: () => void, ms: number) => () => void

export type TrackerState = 'pending' | 'confirmed' | 'error' | 'timeout'

export class CommandError extends Error {}

export interface TrackerOptions {
  /** 超时毫秒（默认 5000） */
  timeoutMs?: number
  /** 注入时钟（默认 setTimeout） */
  setTimer?: SetTimer
}

/** 单条命令生命周期：pending 起步，三种终态单向迁移，终态再迁抛 CommandError */
export class CommandTracker {
  state: TrackerState = 'pending'
  /** error/timeout 附带说明 */
  message = ''
  private cancelTimer: () => void

  constructor(readonly id: string, opts: TrackerOptions = {}) {
    const setTimer: SetTimer = opts.setTimer ?? ((fn, ms) => { const h = setTimeout(fn, ms); return () => clearTimeout(h) })
    this.cancelTimer = setTimer(() => this.transition('timeout', '超时未确认'), opts.timeoutMs ?? 5000)
  }

  confirm(): void { this.transition('confirmed') }
  error(msg: string): void { this.transition('error', msg) }
  /** 超时迁移（桥层 5s race 命中时显式调用；内部定时器同语义，先到者生效） */
  timeout(): void { this.transition('timeout', '超时未确认') }

  private transition(next: TrackerState, msg = ''): void {
    if (this.state !== 'pending') throw new CommandError(`命令 ${this.id} 已是终态 ${this.state}，不可迁移为 ${next}`)
    this.cancelTimer()
    this.state = next
    this.message = msg
  }
}

/** {inst,devid,tag,value} → rs-iot CommandReq（data 为插件自解析的 JSON 文本） */
export function buildCommandReq(o: { inst: string; devid: string; tag: string; value: unknown }): {
  instance: string
  devid: string
  cmd: 'write'
  data: string
} {
  return { instance: o.inst, devid: o.devid, cmd: 'write', data: JSON.stringify({ tag: o.tag, value: o.value }) }
}

/** 设备注册表查归属：命中返回 inst_id；缺表/未登记抛 CommandError（未知设备） */
export function resolveInstance(registry: ReadonlyMap<string, string>, devid: string): string {
  const inst = registry.get(devid)
  if (!inst) throw new CommandError(`未知设备 ${devid}（无归属实例，无法下发）`)
  return inst
}
