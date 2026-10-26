import { describe, expect, it } from 'vitest'
import { applyDevContext, isDevParamScreen, META_DEV_FIELD } from './dev-context'
import type { IExportJson } from 'maotu'

// W11 设备参数化（传统 HMI tag prefix / 设备上下文模式）：bind_id 前缀 `@dev.` =
// 设备上下文相对标签——运行时按激活设备重写为 `<devid>.<tag>`，一屏服务 N 台设备。

const doc = (json: unknown[]): IExportJson =>
  ({ canvasCfg: {}, gridCfg: {}, json, eventList: [], eventFlow: [] }) as unknown as IExportJson

const bind = (id: string, attr = 'props.text.val') => ({ bind_id: id, bind_attr: attr })
const item = (id: string, binds: unknown[], children?: unknown[]) =>
  ({ id, binds, ...(children ? { children } : {}) })

describe('applyDevContext', () => {
  it('@dev. 前缀重写为激活设备，其余 bind 不动；children 同样遍历', () => {
    const d = doc([
      item('a', [bind('@dev.power'), bind('home-meter-e1.status'), bind('@meta.dev')]),
      item('grp', [], [item('b', [bind('@dev.current', 'props.v.val')])]),
    ])
    const out = applyDevContext(d, 'home-meter-e2')
    const items = out.json as unknown as Array<{ id: string; binds: Array<{ bind_id: string }>; children?: Array<{ binds: Array<{ bind_id: string }> }> }>
    expect(items[0].binds.map((b) => b.bind_id)).toEqual([
      'home-meter-e2.power', 'home-meter-e1.status', '@meta.dev',
    ])
    expect(items[1].children![0].binds[0].bind_id).toBe('home-meter-e2.current')
  })

  it('不改入参（重挂可重复切换）；中间缀不误伤（xx@dev. 不动）', () => {
    const d = doc([item('a', [bind('@dev.power'), bind('x@dev.power')])])
    const out = applyDevContext(d, 'dev9')
    expect((out.json as never[]).length).toBe(1)
    const binds = (out.json as Array<{ binds: Array<{ bind_id: string }> }>)[0].binds
    expect(binds.map((b) => b.bind_id)).toEqual(['dev9.power', 'x@dev.power'])
    // 原文档不被原地修改
    const raw = (d.json as Array<{ binds: Array<{ bind_id: string }> }>)[0].binds
    expect(raw.map((b) => b.bind_id)).toEqual(['@dev.power', 'x@dev.power'])
  })

  it('isDevParamScreen：存在 @dev. 绑定即参数化屏；@meta 不算', () => {
    expect(isDevParamScreen(doc([item('a', [bind('@dev.power')])]))).toBe(true)
    expect(isDevParamScreen(doc([item('a', [bind('@meta.dev')])]))).toBe(false)
    expect(isDevParamScreen(doc([item('a', [bind('home-meter-e1.power')])]))).toBe(false)
  })

  it('META_DEV_FIELD 约定值（宿主注入当前设备 id 的显示通道）', () => {
    expect(META_DEV_FIELD).toBe('@meta.dev')
  })
})
