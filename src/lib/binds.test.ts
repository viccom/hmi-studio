import { describe, it, expect } from 'vitest'
import { collectBinds } from './binds'

// T6 collectBinds：done_json（含嵌套 group children）→ {fields, devs}（dev = field 首段前缀）。
// bind 形状来自 src/dev/Probe.vue 实证（binds[].bind_id / pel_id / bind_attr / triggers）。

const pel = (id: string, bindIds: string[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, binds: bindIds.map((b, i) => ({ id: `bd-${id}-${i}`, pel_id: id, bind_id: b, bind_attr: 'props.fill.val', triggers: [] })),
  ...extra,
})

describe('collectBinds：递归收集 + 去重', () => {
  it('多图元 binds[].bind_id 去重 → fields；dev = field 首段去重', () => {
    const done = { json: [pel('p1', ['rsiot.uptime_s', 'rsiot.cpu_percent']), pel('p2', ['rsiot.uptime_s', 'plc1.sp'])] }
    expect(collectBinds(done)).toEqual({
      fields: ['plc1.sp', 'rsiot.cpu_percent', 'rsiot.uptime_s'],
      devs: ['plc1', 'rsiot'],
    })
  })

  it('嵌套 group：children 递归收集（group 本体无 binds）', () => {
    const done = { json: [{ id: 'g1', type: 'group', children: [pel('c1', ['rsiot.uptime_s']), { id: 'g2', children: [pel('c2', ['plc2.temp'])] }] }] }
    expect(collectBinds(done)).toEqual({ fields: ['plc2.temp', 'rsiot.uptime_s'], devs: ['plc2', 'rsiot'] })
  })

  it('无 binds（空画面/纯静态图元）→ 空集', () => {
    expect(collectBinds({ json: [] })).toEqual({ fields: [], devs: [] })
    expect(collectBinds({ json: [{ id: 'x' }, { id: 'g', children: [{ id: 'y' }] }] })).toEqual({ fields: [], devs: [] })
  })

  it('非法 bind_id（无点分隔，违反 <devid>.<tag> 唯一格式）跳过不进 fields/devs', () => {
    expect(collectBinds({ json: [pel('p1', ['裸tag'])] })).toEqual({ fields: [], devs: [] })
  })
})
