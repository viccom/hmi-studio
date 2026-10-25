/** T7 设备归属注册表：GET /api/v1/devices（2026-10-25 curl 实测）→ Map<devid, inst_id> */
import { describe, expect, it } from 'vitest'
import { buildRegistry } from './device-registry'

// 实测形状：{rsiot:{label,value,model:"_sys_rsiot",owner_inst:"self",params,children:[...]}}
// owner_inst 为归属实例（多宿主时逗号串，routes_device.rs aggregate D-OWN-3）
describe('buildRegistry', () => {
  it('owner_inst → Map<devid,inst>；rsiot 系统设备归属 self', () => {
    const reg = buildRegistry({
      rsiot: { label: 'rsiot', value: 'rsiot', model: '_sys_rsiot', owner_inst: 'self', params: {}, children: [] },
    })
    expect(reg.get('rsiot')).toBe('self')
  })

  it('多宿主逗号串取首段；无 owner_inst 的条目跳过', () => {
    const reg = buildRegistry({
      pump1: { label: '泵', value: 'pump1', model: 'm', owner_inst: 'modbus-1,modbus-2', params: {}, children: [] },
      ghost: { label: 'g', value: 'ghost', model: 'm', params: {}, children: [] },
    })
    expect(reg.get('pump1')).toBe('modbus-1')
    expect(reg.has('ghost')).toBe(false)
  })

  it('空对象 → 空表', () => {
    expect(buildRegistry({}).size).toBe(0)
  })
})
