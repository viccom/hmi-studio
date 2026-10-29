// 图元目录分组契约（2026-10-29 用户反馈：40 个图元平铺一组对用户不友好）。
//
// 分组是**展示层元数据**（index.ts 的 SYMBOL_GROUP_DEFS），registry 保持扁平全量
// 唯一事实源不变。本测试冻结三条不变量：
// 1. 全覆盖：每个注册图元恰好归属一组（无遗漏、无重复——漏了编辑器里找不到，重复了拖出的实例两处维护）
// 2. 可解析：分组引用的 id 都在注册表（改名/删图元忘改分组即红）
// 3. 注册行为：registerSymbols 按组注入 leftAsideStore（多分组，且不再有平铺的「HMI 图元」组）
import { describe, it, expect } from 'vitest'
import { allSymbols } from './registry'
import { registerSymbols } from './index'
import { SYMBOL_GROUP_DEFS } from './groups'
import { leftAsideStore } from 'maotu'

const ALL_IDS = allSymbols().map((s) => s.id)

describe('图元目录分组（SYMBOL_GROUP_DEFS）', () => {
  it('分组引用的 id 全部可解析（不存在的 id 即红）', () => {
    for (const g of SYMBOL_GROUP_DEFS) {
      for (const id of g.ids) {
        expect(ALL_IDS, `组「${g.title}」引用了未注册图元 ${id}`).toContain(id)
      }
    }
  })

  it('全覆盖：每个注册图元恰好归入一组（无遗漏无重复）', () => {
    const seen = new Map<string, string>()
    for (const g of SYMBOL_GROUP_DEFS) {
      for (const id of g.ids) {
        expect(seen.has(id), `图元 ${id} 同时出现在「${seen.get(id)}」和「${g.title}」`).toBe(false)
        seen.set(id, g.title)
      }
    }
    const missing = ALL_IDS.filter((id) => !seen.has(id))
    expect(missing, `未分组图元：${missing.join(', ')}`).toEqual([])
  })

  it('BI 族独立成组且组内全带 ah-bi- 前缀（通道 B 图元一目了然）', () => {
    const bi = SYMBOL_GROUP_DEFS.find((g) => g.ids.every((id) => id.startsWith('ah-bi-')))
    expect(bi).toBeDefined()
    const biCount = ALL_IDS.filter((id) => id.startsWith('ah-bi-')).length
    expect(bi!.ids).toHaveLength(biCount)
  })

  it('registerSymbols 按组注册（无平铺「HMI 图元」遗留组；幂等不重复注册）', () => {
    registerSymbols()
    for (const g of SYMBOL_GROUP_DEFS) {
      expect(leftAsideStore.config.has(g.title), `缺组「${g.title}」`).toBe(true)
      expect(leftAsideStore.config.get(g.title)).toHaveLength(g.ids.length)
    }
    expect(leftAsideStore.config.has('HMI 图元')).toBe(false)
    const before = leftAsideStore.config.size
    registerSymbols() // 幂等：二次调用不新增
    expect(leftAsideStore.config.size).toBe(before)
  })
})
