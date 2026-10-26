import { describe, it, expect } from 'vitest'
import { buildDeviceTree, buildDeviceTreeRich } from './device-tree'

// F2 实测形状：GET /api/v1/devices → {rsiot:{children:[{label,type,value}]}}
describe('buildDeviceTree', () => {
  it('多设备多点位 → maotu IDeviceInfo 级联，叶子 value=完整 field（bind_id）', () => {
    const devices = {
      rsiot: { children: [{ label: 'cpu_percent', type: 'float', value: 'cpu_percent' }] },
      pump1: {
        children: [
          { label: 'spd', type: 'int', value: 'spd' },
          { label: 'run', type: 'bool', value: 'run' },
        ],
      },
    }
    expect(buildDeviceTree(devices as any)).toEqual([
      { label: 'rsiot', value: 'rsiot', children: [{ label: 'cpu_percent', value: 'rsiot.cpu_percent' }] },
      {
        label: 'pump1', value: 'pump1', children: [
          { label: 'spd', value: 'pump1.spd' },
          { label: 'run', value: 'pump1.run' },
        ],
      },
    ])
  })

  it('单设备无 children 容错 → 设备节点保留，无点位叶子', () => {
    expect(buildDeviceTree({ lonely: {} } as any)).toEqual([{ label: 'lonely', value: 'lonely' }])
  })

  it('空对象 → 空数组', () => {
    expect(buildDeviceTree({} as any)).toEqual([])
  })

  it('点位 children 非法（null/非数组）跳过；多余字段（type 等）不透传', () => {
    const tree = buildDeviceTree({ d1: { children: null }, d2: { children: 'bad' }, d3: { children: [{ label: 't', value: 't', type: 'int' }] } } as any)
    expect(tree).toEqual([
      { label: 'd1', value: 'd1' },
      { label: 'd2', value: 'd2' },
      { label: 'd3', value: 'd3', children: [{ label: 't', value: 'd3.t' }] },
    ])
  })

  it('点位缺 value 时以 label 兜底成 field', () => {
    expect(buildDeviceTree({ d: { children: [{ label: 'only_label' }] } } as any))
      .toEqual([{ label: 'd', value: 'd', children: [{ label: 'only_label', value: 'd.only_label' }] }])
  })
})

// W8 devreg 实测形状（2026-10-26 curl /api/v1/devreg）：
// {rsiot:{desc:null|str, devid:'rsiot', effective:{uptime_s:{desc:'运行时长秒',unit:null,...}}}}
// ——富设备树（BindPanel 用）：设备带描述、点位带描述+单位，叶子 id = 完整 field（bind_id）。
describe('buildDeviceTreeRich', () => {
  it('设备 desc + 点位 desc/unit → 富节点，叶子 id=<devid>.<tag>', () => {
    expect(buildDeviceTreeRich({
      rsiot: {
        desc: '系统自监测', devid: 'rsiot',
        effective: {
          uptime_s: { desc: '运行时长秒', unit: null },
          cpu_percent: { desc: '进程 CPU %', unit: '%' },
        },
      },
    } as any)).toEqual([
      {
        id: 'rsiot', label: 'rsiot', desc: '系统自监测',
        children: [
          { id: 'rsiot.uptime_s', label: 'uptime_s', desc: '运行时长秒', unit: '' },
          { id: 'rsiot.cpu_percent', label: 'cpu_percent', desc: '进程 CPU %', unit: '%' },
        ],
      },
    ])
  })

  it('系统设备 desc=null 与点位 unit 缺失 → 空串容错（UI 侧不再判空）', () => {
    expect(buildDeviceTreeRich({ rsiot: { desc: null, devid: 'rsiot', effective: { healthy: { desc: '自身健康' } } } } as any))
      .toEqual([{ id: 'rsiot', label: 'rsiot', desc: '', children: [{ id: 'rsiot.healthy', label: 'healthy', desc: '自身健康', unit: '' }] }])
  })

  it('effective 缺失/空 → 设备节点保留无叶子；空对象 → 空数组', () => {
    expect(buildDeviceTreeRich({ lone: { desc: 'x' }, empty: { desc: '', effective: {} } } as any)).toEqual([
      { id: 'lone', label: 'lone', desc: 'x', children: [] },
      { id: 'empty', label: 'empty', desc: '', children: [] },
    ])
    expect(buildDeviceTreeRich({} as any)).toEqual([])
  })
})
