import { describe, expect, it, vi } from 'vitest'
import { loadPlugins, loadOne, PLUGIN_GROUP, type PluginFactory, type PluginHost } from './plugin-loader'
import { leftAsideStore } from 'maotu'
import type { HmiSymbol } from './types'

/** 合法 vue 型 symbol（过 lintSymbol：fill(color) 必备 + props 描述符齐备） */
function goodSymbol(id: string): HmiSymbol {
  return {
    id, title: `插件 ${id}`, type: 'vue', thumbnail: '',
    props: {
      fill: { title: '主体色', type: 'color', val: '#2b527a' },
      text: { title: '文本', type: 'input', val: 'hi' },
    },
    width: 120, height: 40,
  } as HmiSymbol
}

type Entry = { default: PluginFactory }
function entryOf(host0: (h: PluginHost) => void): Entry {
  return { default: (h) => host0(h) }
}

describe('loadOne（门禁与注册）', () => {
  it('loads a good plugin: registerConfig 进「扩展图元（本站）」组', async () => {
    const reg = vi.fn()
    const orig = leftAsideStore.registerConfig
    leftAsideStore.registerConfig = reg as unknown as typeof leftAsideStore.registerConfig
    try {
      const ok = await loadOne(
        { id: 'p-ok', name: 'P', version: '0.1.0', entry: 'dist.js' },
        { fetchEntry: async () => entryOf((h) => h.registerSymbol(goodSymbol('p-ok'))) },
      )
      expect(ok).toBe(true)
      expect(reg).toHaveBeenCalledOnce()
      const [group, items] = reg.mock.calls[0] as [string, HmiSymbol[]]
      expect(group).toBe(PLUGIN_GROUP)
      expect(items[0].id).toBe('p-ok')
    } finally {
      leftAsideStore.registerConfig = orig
    }
  })

  it('rejects lint-failing symbol（不过 = 跳过 + 通知，不静默）', async () => {
    const notify = vi.fn()
    const reg = vi.fn()
    const orig = leftAsideStore.registerConfig
    leftAsideStore.registerConfig = reg as unknown as typeof leftAsideStore.registerConfig
    try {
      const bad = { ...goodSymbol('p-bad'), props: {} } // 缺 props → lint 拒
      const ok = await loadOne(
        { id: 'p-bad', name: 'P', version: '0.1.0', entry: 'dist.js' },
        { fetchEntry: async () => entryOf((h) => h.registerSymbol(bad as HmiSymbol)), onNotify: notify },
      )
      expect(ok).toBe(false)
      expect(reg).not.toHaveBeenCalled()
      expect(notify.mock.calls[0][0]).toMatch(/lint/)
    } finally {
      leftAsideStore.registerConfig = orig
    }
  })

  it('rejects ah- namespace hijack（运行时镜像安装器 lint）', async () => {
    const notify = vi.fn()
    const ok = await loadOne(
      { id: 'p-hijack', name: 'P', version: '0.1.0', entry: 'dist.js' },
      { fetchEntry: async () => entryOf((h) => h.registerSymbol(goodSymbol('ah-tank'))), onNotify: notify },
    )
    expect(ok).toBe(false)
    expect(notify.mock.calls[0][0]).toMatch(/ah-/)
  })

  it('rejects module without default factory', async () => {
    const notify = vi.fn()
    const ok = await loadOne(
      { id: 'p-nofac', name: 'P', version: '0.1.0', entry: 'dist.js' },
      { fetchEntry: async () => ({}) as Entry, onNotify: notify },
    )
    expect(ok).toBe(false)
    expect(notify.mock.calls[0][0]).toMatch(/default/)
  })
})

describe('loadPlugins（index 面）', () => {
  it('missing index (null) = 静默零插件', async () => {
    const r = await loadPlugins(async () => null)
    expect(r).toEqual({ loaded: [], failed: [] })
  })

  it('fetch failure 不打扰组态（编辑器可用性优先）', async () => {
    const r = await loadPlugins(async () => { throw new Error('network down') })
    expect(r).toEqual({ loaded: [], failed: [] })
  })

  it('mixed plugins: loaded + failed 分账', async () => {
    const r = await loadPlugins(
      async () => ({ plugins: [
        { id: 'p-ok2', name: 'A', version: '1.0.0', entry: 'dist.js' },
        { id: 'p-bad2', name: 'B', version: '1.0.0', entry: 'dist.js' },
      ] }),
      {
        fetchEntry: async (url: string) =>
          url.includes('p-ok2')
            ? entryOf((h) => h.registerSymbol(goodSymbol('p-ok2')))
            : Promise.reject(new Error('404')),
      },
    )
    expect(r.loaded).toEqual(['p-ok2'])
    expect(r.failed.map((f) => f.id)).toEqual(['p-bad2'])
  })
})
