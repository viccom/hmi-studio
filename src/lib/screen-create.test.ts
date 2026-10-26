import { describe, it, expect, vi } from 'vitest'
import { blankScreen, wrapDoc } from './screens'
import { createScreen } from './screen-create'

// W8：两处新建对话框（EditView/ScreenListView）共用的探测+创建核——
// PUT 是全量 upsert，先探测防误覆盖既有画面（原 W7 内联逻辑上抽，行为不变）
describe('createScreen', () => {
  const client = (get: unknown, put: unknown) =>
    ({ get, put, del: async () => undefined, list: async () => [] }) as ReturnType<typeof import('./screens').screensApi>

  it('探测 404 → PUT blankScreen+meta 全量 doc，返回 ok', async () => {
    const put = vi.fn(async () => undefined)
    const get = vi.fn(async () => { throw new Error('404') })
    const r = await createScreen(client(get, put), 's1', { name: 'N', group: 'G' })
    expect(r).toBe('ok')
    expect(put).toHaveBeenCalledOnce()
    expect(put).toHaveBeenCalledWith('s1', wrapDoc(blankScreen('s1'), { name: 'N', group: 'G' }))
  })

  it('探测命中（已存在）→ 返回 exists 且绝不 PUT（防覆盖）', async () => {
    const put = vi.fn(async () => undefined)
    const get = vi.fn(async () => ({ id: 's1', doc: {} }))
    const r = await createScreen(client(get, put), 's1', { name: 'N' })
    expect(r).toBe('exists')
    expect(put).not.toHaveBeenCalled()
  })

  it('PUT 失败 → 返回 failed（上抛留给调用方 or 不——统一收敛为结果态）', async () => {
    const put = vi.fn(async () => { throw new Error('500') })
    const get = vi.fn(async () => { throw new Error('404') })
    const r = await createScreen(client(get, put), 's1', { name: 'N' })
    expect(r).toBe('failed')
  })
})
