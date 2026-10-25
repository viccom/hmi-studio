/** T7 命令桥纯逻辑：状态机（agent-hmi CommandTracker 语义）/ 请求体构造 / inst 解析 */
import { describe, expect, it } from 'vitest'
import { buildCommandReq, CommandError, CommandTracker, resolveInstance } from './command'

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

  it('默认 5s 超时时长（默认 setTimer 收到 5000ms）', () => {
    let got = 0
    new CommandTracker('c5', { setTimer: (_fn, ms) => { got = ms; return () => {} } })
    expect(got).toBe(5000)
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
