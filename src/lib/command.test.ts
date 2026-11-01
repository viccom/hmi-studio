/** T7 命令桥纯逻辑：状态机（agent-hmi CommandTracker 语义）/ 请求体构造 / inst 解析 /
 *  F-2 写回执失败面 */
import { describe, expect, it } from 'vitest'
import {
  buildCommandReq, classifyCommandFailure, CommandError, CommandTracker, COMMAND_TIMEOUT_MS,
  resolveInstance, UNKNOWN_RESULT_TEXT,
} from './command'

describe('CommandTracker', () => {
  it('pending→confirmed；终态不可再迁（throw /终态/）', () => {
    const t = new CommandTracker('c1')
    expect(t.state).toBe('pending')
    t.confirm()
    expect(t.state).toBe('confirmed')
    expect(() => t.error('x')).toThrow(/终态/)
    expect(() => t.confirm()).toThrow(/终态/)
  })

  it('pending→error(msg)；error 是终态', () => {
    const t = new CommandTracker('c2')
    t.error('instance not running')
    expect(t.state).toBe('error')
    expect(t.message).toBe('instance not running')
    expect(() => t.confirm()).toThrow(/终态/)
  })

  it('超时（注入时钟）：定时器触发 → timeout 终态', () => {
    let fire: (() => void) | undefined
    const t = new CommandTracker('c3', {
      setTimer: (fn) => {
        fire = fn
        return () => { fire = undefined }
      },
    })
    expect(t.state).toBe('pending')
    fire!()
    expect(t.state).toBe('timeout')
    expect(() => t.confirm()).toThrow(/终态/)
  })

  it('终态先到则取消定时器——时钟不再触发迁移', () => {
    let fire: (() => void) | undefined
    let cancelled = false
    const t = new CommandTracker('c4', {
      setTimer: (fn) => {
        fire = fn
        return () => { cancelled = true; fire = undefined }
      },
    })
    t.confirm()
    expect(cancelled).toBe(true)
    expect(fire).toBeUndefined()
    expect(t.state).toBe('confirmed')
  })

  // 有意变更（2026-11-01，F-2 写回执对齐）：默认 5s → 15s。rs-iot `POST /command/send`
  // 在实例声明回执能力时最长等 12s 才返回，前端窗口小于后端会把「成功/插件明确失败」
  // 误报成超时。
  it('默认 15s 超时时长（默认 setTimer 收到 15000ms）', () => {
    let got = 0
    new CommandTracker('c5', { setTimer: (_fn, ms) => { got = ms; return () => {} } })
    expect(got).toBe(15000)
    expect(COMMAND_TIMEOUT_MS).toBe(15_000)
  })
})

describe('buildCommandReq', () => {
  it('{inst,devid,tag,value} → rs-iot CommandReq（data 为 JSON 字符串）', () => {
    expect(buildCommandReq({ inst: 'modbus-1', devid: 'pump1', tag: 'spd', value: 800 }))
      .toEqual({ instance: 'modbus-1', devid: 'pump1', cmd: 'write', data: '{"tag":"spd","value":800}' })
  })

  it('字符串值保留引号（JSON 序列化语义）', () => {
    expect(buildCommandReq({ inst: 'self', devid: 'rsiot', tag: 'note', value: 'on' }).data)
      .toBe('{"tag":"note","value":"on"}')
  })
})

describe('resolveInstance', () => {
  it('注册表命中 → inst_id', () => {
    expect(resolveInstance(new Map([['pump1', 'modbus-1']]), 'pump1')).toBe('modbus-1')
  })

  it('缺表抛 CommandError("未知设备 xxx")', () => {
    expect(() => resolveInstance(new Map(), 'ghost')).toThrow(CommandError)
    expect(() => resolveInstance(new Map(), 'ghost')).toThrow(/未知设备 ghost/)
  })
})

describe('classifyCommandFailure（F-2 写回执失败面）', () => {
  it('422 插件明确失败（编码拒绝/从站异常/未连接）→ 透传后端 error 原文', () => {
    expect(classifyCommandFailure(422, { status: 'error', request_id: 'modbus-1-7', error: '插件未连接' }))
      .toEqual({ text: '插件未连接', unknown: false })
  })

  it('504 投递成功但 12s 内无业务结果 → 「结果未知（超时）」而非发送失败', () => {
    expect(classifyCommandFailure(504, { status: 'timeout', error: 'no write result within 12s' }))
      .toEqual({ text: UNKNOWN_RESULT_TEXT, unknown: true })
    expect(UNKNOWN_RESULT_TEXT).toBe('结果未知（超时）')
  })

  it('503 回执通道关闭（实例退出）→ 透传后端 error 原文（结果未知但非超时）', () => {
    expect(classifyCommandFailure(503, { status: 'unavailable', error: 'write ack channel closed (instance stopped?)' }))
      .toEqual({ text: 'write ack channel closed (instance stopped?)', unknown: false })
  })

  it('拿不到 JSON error 字段（无字段/空白/纯文本/空体）→ 退回 HTTP <status>', () => {
    expect(classifyCommandFailure(502, { err: 'x' })).toEqual({ text: 'HTTP 502', unknown: false })
    expect(classifyCommandFailure(422, { error: '   ' }).text).toBe('HTTP 422')
    // rs-iot 404 是纯文本 "instance not running"——非 JSON error 字段，按契约退回状态码
    expect(classifyCommandFailure(404, 'instance not running').text).toBe('HTTP 404')
    expect(classifyCommandFailure(404, null).text).toBe('HTTP 404')
    expect(classifyCommandFailure(500, [1, 2]).text).toBe('HTTP 500')
  })
})
