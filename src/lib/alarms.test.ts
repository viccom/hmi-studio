/**
 * T8 告警骨架纯逻辑——双源合并（agent-hmi subscribeAlarms 语义移植，按 rs-iot 实测形状适配）。
 * 实测形状（2026-10-25，routes_alarm.rs / event_bus.rs + curl）：
 *   REST GET /api/v1/alarms → [{key, level:'info'|'warn'|'error', source, message, ts(ISO8601), count}]（ts 倒序）
 *   SSE  /api/v1/events?types=alarm → 命名事件 alarm，data {kind:'alarm', action:'fire'|'clear', key, level, source, message, ts}
 * 注意：rs-iot 无 confirm 语义——人工清除是 DELETE /api/v1/alarms?key=（发 Clear 事件收敛），
 * 故 store 的「确认」= clear(key)（本地剔除+入历史），SSE Clear 再到时幂等。
 */
import { describe, expect, it } from 'vitest'
import { AlarmStore, parseAlarmEvent } from './alarms'

const item = (key: string, ts: string, level = 'warn'): { key: string; level: string; source: string; message: string; ts: string; count: number } =>
  ({ key, level, source: 'self', message: `msg-${key}`, ts, count: 1 })

describe('AlarmStore 双源合并', () => {
  it('初始快照 + SSE fire 增量：同 key 去重（后到覆盖），按时间倒序', () => {
    const s = new AlarmStore()
    s.applySnapshot([item('a1', '2026-10-25T01:00:00Z')])
    s.applyEvent({ action: 'fire', key: 'a1', level: 'warn', source: 'self', message: '覆盖', ts: '2026-10-25T01:00:05Z' })
    s.applyEvent({ action: 'fire', key: 'a2', level: 'error', source: 'self', message: 'y', ts: '2026-10-25T01:00:06Z' })
    expect(s.active().map((a) => a.key)).toEqual(['a2', 'a1'])
    expect(s.active().find((a) => a.key === 'a1')?.message).toBe('覆盖')
  })

  it('SSE clear → 从 active 剔除入历史；未知 key 的 clear 幂等忽略（不产生历史重复）', () => {
    const s = new AlarmStore()
    s.applySnapshot([item('a1', '2026-10-25T01:00:00Z'), item('a2', '2026-10-25T01:00:01Z')])
    s.applyEvent({ action: 'clear', key: 'a1', level: 'warn', source: 'self', message: '', ts: '2026-10-25T01:00:02Z' })
    expect(s.active().map((a) => a.key)).toEqual(['a2'])
    expect(s.history().map((a) => a.key)).toEqual(['a1'])
    // 本地 clear 先行 + SSE Clear 再到 → 不重复入历史
    s.applyEvent({ action: 'clear', key: 'a1', level: 'warn', source: 'self', message: '', ts: '2026-10-25T01:00:03Z' })
    expect(s.history().map((a) => a.key)).toEqual(['a1'])
  })

  it('clear(key)（人工清除=确认）：剔除 active 入历史；轮播索引越界收敛', () => {
    const s = new AlarmStore()
    s.applySnapshot([
      item('old', '2026-10-25T01:00:00Z'),
      item('mid', '2026-10-25T01:00:01Z'),
      item('new', '2026-10-25T01:00:02Z'),
    ]) // 倒序 new,mid,old → index 0
    s.next(); s.next() // index=2（指向 old）
    s.clear('old') // active 剩 2 → index 收敛到 length-1
    expect(s.active().map((a) => a.key)).toEqual(['new', 'mid'])
    expect(s.history().map((a) => a.key)).toEqual(['old'])
    expect(s.index).toBe(1)
    // 清到空 → index 收敛 0
    s.clear('new'); s.clear('mid')
    expect(s.active()).toEqual([])
    expect(s.index).toBe(0)
  })

  it('轮播 next 循环推进；空表安全', () => {
    const s = new AlarmStore()
    s.next() // 空表 no-op
    expect(s.index).toBe(0)
    s.applySnapshot([item('a1', '2026-10-25T01:00:00Z'), item('a2', '2026-10-25T01:00:01Z')])
    s.next(); expect(s.index).toBe(1)
    s.next(); expect(s.index).toBe(0) // 回绕
    expect(s.current()?.key).toBe('a2') // 倒序 [a2,a1]，index0=a2
  })

  it('applySnapshot 全量重同步（REST 权威）：旧 active 不在快照中则剔除', () => {
    const s = new AlarmStore()
    s.applySnapshot([item('a1', '2026-10-25T01:00:00Z')])
    s.applySnapshot([item('b1', '2026-10-25T01:00:01Z')])
    expect(s.active().map((a) => a.key)).toEqual(['b1'])
  })
})

describe('parseAlarmEvent（SSE data 帧 → 事件）', () => {
  it('合法帧：action/key 必备，其余宽松', () => {
    expect(parseAlarmEvent('{"kind":"alarm","action":"fire","key":"dev1.temp_high","level":"error","source":"self","message":"过温","ts":"2026-10-25T01:00:00Z"}'))
      .toMatchObject({ action: 'fire', key: 'dev1.temp_high' })
  })
  it('坏 JSON / 缺 key / 未知 action → undefined（静默丢帧）', () => {
    expect(parseAlarmEvent('not-json')).toBeUndefined()
    expect(parseAlarmEvent('{"action":"fire"}')).toBeUndefined()
    expect(parseAlarmEvent('{"action":"ack","key":"x"}')).toBeUndefined()
  })
})
