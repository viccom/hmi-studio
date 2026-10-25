import { describe, it, expect } from 'vitest'
import { buildDeviceTree } from './device-tree'

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
