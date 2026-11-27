import { describe, it, expect } from 'vitest'
import { blankScene3D, sceneStore } from './store'
import { updateScene3DMeta } from './meta'

/**
 * 3D 场景 meta 改写（2026-11-26）。
 *
 * 关键防线：**不得**把 3D 文档的 meta 摊平到顶层（那是 2D 的 unwrapDoc/wrapDoc 语义，
 * 摊平会写坏 SceneDoc 契约——运行页按 meta.name/meta.group 读，摊平后场景名与分组全丢）。
 */
describe('updateScene3DMeta', () => {
  const fake = (initial: ReturnType<typeof blankScene3D>) => {
    const state = { doc: initial, putArgs: [] as Array<[string, unknown]> }
    const client = {
      list: async () => [state.doc.$schema],
      getRaw: async (id: string) => ({ id, doc: state.doc, version: 1 }),
      get: async (id: string) => ({ id, doc: state.doc, version: 1 }),
      put: async (id: string, doc: unknown) => { state.putArgs.push([id, doc]); return { status: 'ok', version: 2 } },
      del: async () => undefined,
    }
    return { client, state }
  }

  it('改 name/group 只动 meta 内的字段，文档结构与 nodes/links 原样保留', async () => {
    const doc = blankScene3D('sc1')
    doc.meta.name = '旧名'
    doc.meta.group = '旧组'
    doc.nodes.push({
      id: 'dev_wm1', kind: 'flowmeter', devId: 'dev_wm1',
      pos: [1, 0, 2], points: { value: 'dev_wm1.flow_rate' },
    })
    const { client, state } = fake(doc)

    await updateScene3DMeta(client as unknown as ReturnType<typeof sceneStore>, 'sc1', { name: '新名', group: '新组' })

    const written = state.putArgs[0][1] as typeof doc
    expect(written.meta.name).toBe('新名')
    expect(written.meta.group).toBe('新组')
    // 结构未被摊平：meta 仍是对象、顶层没有 name/group
    expect(typeof written.meta).toBe('object')
    expect((written as unknown as { name?: string }).name).toBeUndefined()
    // nodes 原样保留（未被清空）
    expect(written.nodes).toHaveLength(1)
    expect(written.nodes[0].id).toBe('dev_wm1')
    expect(written.$schema).toBe('agent-hmi.scene3d/1')
  })

  it('缺省键不动（只改 name 时 group 保持原值）', async () => {
    const doc = blankScene3D('sc1')
    doc.meta.group = '保留组'
    const { client, state } = fake(doc)

    await updateScene3DMeta(client as unknown as ReturnType<typeof sceneStore>, 'sc1', { name: '只改名' })

    const written = state.putArgs[0][1] as typeof doc
    expect(written.meta.name).toBe('只改名')
    expect(written.meta.group).toBe('保留组')
  })

  it('group 传空串 = 移出组（写空串而非删键）', async () => {
    const doc = blankScene3D('sc1')
    doc.meta.group = '某组'
    const { client, state } = fake(doc)

    await updateScene3DMeta(client as unknown as ReturnType<typeof sceneStore>, 'sc1', { group: '' })

    const written = state.putArgs[0][1] as typeof doc
    expect(written.meta.group).toBe('')
  })
})
