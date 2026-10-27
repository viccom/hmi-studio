import { describe, it, expect, vi, beforeEach } from 'vitest'
import { login, logout, isAuthed, getAuthedUser } from './auth'
import { tokenStore } from './api'

const okLogin = () =>
  new Response(JSON.stringify({ status: 'ok', token: 'tk', user: { user_id: 'admin' } }), {
    headers: { 'content-type': 'application/json' },
  })

describe('auth', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

  it('login 成功：POST F1 形状，存 token+user，返回 ok', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => okLogin())
    vi.stubGlobal('fetch', fetchMock)
    const res = await login('admin', 'admin')
    expect(res).toMatchObject({ ok: true })
    expect(tokenStore.get()).toBe('tk')
    expect(JSON.parse(localStorage.getItem('webhmi_user')!)).toEqual({ user_id: 'admin' })
    expect(getAuthedUser()).toEqual({ user_id: 'admin' })
    expect(isAuthed()).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/user/login')
    expect(fetchMock.mock.calls[0][1]?.body).toEqual(JSON.stringify({ user_id: 'admin', pass: 'admin' }))
  })

  it('login 失败（401）：返回 ok:false+message，token/user 均不写入', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid user or password', { status: 401 })))
    const res = await login('admin', 'wrong')
    expect(res).toEqual({ ok: false, message: 'invalid user or password' })
    expect(tokenStore.get()).toBeNull()
    expect(localStorage.getItem('webhmi_user')).toBeNull()
    expect(isAuthed()).toBe(false)
  })

  it('logout：清 token 与 user，isAuthed 变 false', () => {
    tokenStore.set('tk')
    localStorage.setItem('webhmi_user', JSON.stringify({ user_id: 'admin' }))
    expect(isAuthed()).toBe(true)
    // 服务端登出是尽力而为的异步裸 fetch——测试桩掉网络面，只验本地清理语义。
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"status":"ok"}')))
    logout()
    expect(tokenStore.get()).toBeNull()
    expect(localStorage.getItem('webhmi_user')).toBeNull()
    expect(getAuthedUser()).toBeNull()
    expect(isAuthed()).toBe(false)
  })
})
