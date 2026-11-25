// 宿主合成点位：level→prio 映射、key→devid、区域聚合、清除后写 0 的完整性。
import { describe, it, expect } from 'vitest'
import {
  aggregateAlarms, classifyDevid, devidOfKey, prioOfLevel, qualityOfStream, syntheticFields,
} from './synthetic'

describe('prioOfLevel / devidOfKey / classifyDevid', () => {
  it('三档 level → P1/P3/P4；未知按 P3（宁可见不可藏）', () => {
    expect(prioOfLevel('error')).toBe(1)
    expect(prioOfLevel('warn')).toBe(3)
    expect(prioOfLevel('info')).toBe(4)
    expect(prioOfLevel('whatever')).toBe(3)
  })

  it('key 的 devid = 首段；无点号时整串', () => {
    expect(devidOfKey('dev_wm1.flow_rate.hh')).toBe('dev_wm1')
    expect(devidOfKey('dev_gm2.leak_alarm.alarm')).toBe('dev_gm2')
    expect(devidOfKey('freekey')).toBe('freekey')
  })

  it('位号前缀 → 区域；未知设备不归区', () => {
    expect(classifyDevid('dev_wm3')).toBe('water')
    expect(classifyDevid('dev_em1')).toBe('power')
    expect(classifyDevid('dev_gm2')).toBe('gas')
    expect(classifyDevid('dev_env1')).toBe('env')
    expect(classifyDevid('dev_pt1')).toBe('env')
    expect(classifyDevid('rsiot')).toBeUndefined()
  })
})

describe('aggregateAlarms', () => {
  it('同 key 只计一次；设备取最高优先级；区域与全厂 P1 计数正确', () => {
    const agg = aggregateAlarms([
      { key: 'dev_wm1.flow_rate.hh', level: 'error' },
      { key: 'dev_wm1.flow_rate.hh', level: 'error' }, // 重复 fire
      { key: 'dev_wm1.pressure.hi', level: 'warn' },
      { key: 'dev_gm1.leak_alarm.alarm', level: 'error' },
      { key: 'dev_env1.co2.hi', level: 'warn' },
      { key: 'rsiot.cpu_alarm', level: 'info' },
    ])
    expect(agg.total).toBe(5)
    expect(agg.prio).toBe(1)
    expect(agg.p1).toBe(2)
    expect(agg.byDev.get('dev_wm1')).toEqual({ prio: 1, count: 2 })
    expect(agg.byArea.water).toEqual({ prio: 1, count: 2 })
    expect(agg.byArea.gas).toEqual({ prio: 1, count: 1 })
    expect(agg.byArea.env).toEqual({ prio: 3, count: 1 })
    expect(agg.byArea.power).toEqual({ prio: 0, count: 0 })
    // 点级：dev_wm1.flow_rate 两条（hh+warn 同 tag）合并为最高 P1；pressure 单条 P3
    expect(agg.byField.get('dev_wm1.flow_rate')).toEqual({ prio: 1, count: 1 })
    expect(agg.byField.get('dev_wm1.pressure')).toEqual({ prio: 3, count: 1 })
    expect(agg.byField.get('rsiot.cpu_alarm')).toBeUndefined() // 两段 key 不参与点级聚合
  })
})

describe('qualityOfStream', () => {
  it('online=0 / offline=1(STALE) / auth-failed=2(BAD)', () => {
    expect(qualityOfStream('online')).toBe(0)
    expect(qualityOfStream('offline')).toBe(1)
    expect(qualityOfStream('auth-failed')).toBe(2)
  })
})

describe('syntheticFields', () => {
  it('已知设备无告警也写 0（清除后不残留颜色）；__ 设备不进设备字段', () => {
    const agg = aggregateAlarms([{ key: 'dev_wm2.flow_rate.hh', level: 'error' }])
    const fields = syntheticFields(agg, ['dev_wm1', 'dev_wm2', '__area', '__sys'], 0, ['dev_wm1.flow_rate', 'dev_wm2.flow_rate', 'dev_wm1.pressure'])
    const get = (f: string) => fields.find((x) => x.field === f)?.value
    expect(get('dev_wm1.__prio')).toBe(0)
    expect(get('dev_wm1.__alarms')).toBe(0)
    expect(get('dev_wm2.__prio')).toBe(1)
    expect(get('dev_wm2.__alarms')).toBe(1)
    expect(get('__area.water.alarm_count')).toBe(1)
    expect(get('__area.water.prio')).toBe(1)
    expect(get('__area.power.alarm_count')).toBe(0)
    expect(get('__sys.alarms')).toBe(1)
    expect(get('__sys.prio')).toBe(1)
    expect(get('__sys.p1')).toBe(1)
    expect(get('__sys.quality')).toBe(0)
    // 点级优先级：命中点位 P1，未命中写 0（清除不残留）
    expect(get('dev_wm2.flow_rate.__prio')).toBe(1)
    expect(get('dev_wm1.flow_rate.__prio')).toBe(0)
    expect(get('dev_wm1.pressure.__prio')).toBe(0)
    expect(fields.some((x) => x.field.startsWith('__area.__'))).toBe(false)
  })

  it('告警设备不在订阅面也会补写（L1 区域卡与跨画面告警可见）', () => {
    const agg = aggregateAlarms([{ key: 'dev_gm1.pressure.hi', level: 'warn' }])
    const fields = syntheticFields(agg, ['dev_wm1'], 2)
    expect(fields).toContainEqual({ field: 'dev_gm1.__prio', value: 3 })
    expect(fields).toContainEqual({ field: '__sys.quality', value: 2 })
  })
})
