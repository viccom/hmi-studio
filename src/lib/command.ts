/**
 * T7 命令桥纯逻辑。rs-iot 写入口（routes_command.rs）：
 *   POST /api/v1/command/send {instance, devid, cmd:'write', data:'<JSON字符串>'}
 *   → 200 {"status":"ok"[,"request_id":…,"acked":true]} / 404 "instance not running"
 *   / 422 {"status":"error","error":…} / 504 {"status":"timeout"}（F-2 写回执，最长等 12s）
 * 状态机语义移植自 agent-hmi CommandTracker（pending→confirmed|error|timeout 单向）。
 */

/** 命令等待窗口（ms）：rs-iot 写回执（F-2）在实例声明回执能力时最长等 12s 才返回，
 *  前端窗口必须留余量——小于后端会抢在后端答复前把「成功/插件明确失败」误报成超时。
 *  CommandTracker 默认值与桥层发送等待同取此值（单一事实源）。 */
export const COMMAND_TIMEOUT_MS = 15_000

/** 结果未知提示语：504 = 投递已发生但 12s 内无业务结果（写可能已生效，不能说「发送失败」） */
export const UNKNOWN_RESULT_TEXT = '结果未知（超时）'

/** 定时器注入（测试可控时钟；默认 setTimeout） */
export type SetTimer = (fn: () => void, ms: number) => () => void

export type TrackerState = 'pending' | 'confirmed' | 'error' | 'timeout'

export class CommandError extends Error {}

export interface TrackerOptions {
  /** 超时毫秒（默认 COMMAND_TIMEOUT_MS = 15s） */
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
    this.cancelTimer = setTimer(() => this.transition('timeout', '超时未确认'), opts.timeoutMs ?? COMMAND_TIMEOUT_MS)
  }

  confirm(): void { this.transition('confirmed') }
  error(msg: string): void { this.transition('error', msg) }
  /** 超时迁移（桥层发送等待命中时显式调用；与内部定时器等长，先到者生效） */
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

export interface CommandFailure {
  /** 展示文本：后端 error 原文 / UNKNOWN_RESULT_TEXT / HTTP <status> */
  text: string
  /** true = 投递可能已生效但业务结果未知（504）——调用方按 warning 提示，不报「命令失败」 */
  unknown: boolean
}

/**
 * 写命令失败面（F-2 写回执契约，入参取 ApiError 的 status/body）：
 * - 504 = 投递成功但 12s 内插件无业务结果 → UNKNOWN_RESULT_TEXT（挂起语义，不是发送失败）
 * - 422（编码拒绝/从站异常/未连接…）/ 503（回执通道关闭）→ 透传响应体 JSON `error` 原文
 * - 拿不到 `error` 字段（纯文本体如 404 "instance not running" / 无字段 / 空白）→ HTTP <status>
 */
export function classifyCommandFailure(status: number, body: unknown): CommandFailure {
  if (status === 504) return { text: UNKNOWN_RESULT_TEXT, unknown: true }
  const err = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined
  if (typeof err === 'string' && err.trim()) return { text: err.trim(), unknown: false }
  return { text: `HTTP ${status}`, unknown: false }
}
