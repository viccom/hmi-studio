import { describe, it, expect, vi } from 'vitest'
import { uid } from './uid'

describe('uid（安全上下文兼容）', () => {
  it('常规环境返回 UUID 形态', () => {
    expect(uid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('不安全上下文（LAN IP 直连，randomUUID 不存在）不抛异常且格式合法——W8 绑定面板打回归因', () => {
    vi.stubGlobal('crypto', { randomUUID: undefined })
    const id = uid()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    vi.unstubAllGlobals()
  })

  it('连续调用不重复', () => {
    const s = new Set(Array.from({ length: 200 }, uid))
    expect(s.size).toBe(200)
  })
})
