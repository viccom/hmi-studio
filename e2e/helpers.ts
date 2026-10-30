import type { Page } from '@playwright/test'

const RSIOT = process.env.RSIOT_BASE ?? 'http://127.0.0.1:8790'

async function rsiotLogin(): Promise<{ token: string; user: unknown }> {
  const res = await fetch(`${RSIOT}/api/v1/user/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: 'admin', pass: 'admin' }),
  })
  if (!res.ok) throw new Error(`rsiotLogin: rs-iot ${res.status}`)
  const { token, user } = (await res.json()) as { token: string; user: unknown }
  return { token, user }
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { token } = await rsiotLogin()
  return fetch(`${RSIOT}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } })
}

/**
 * 以 admin 真实登录 rs-iot 拿新 token，注入统一会话态——后续 E2E 段绕过登录页：
 * - localStorage webhmi_token/webhmi_user（守卫判据 + REST Bearer；addInitScript
 *   每次导航前生效，context 生命周期内持久）。
 * - cookie `token=<jwt>`（SSE 鉴权——EventSource 只能靠同源 cookie，localStorage
 *   注入对它无效；cookie 与端口无关，domain 覆盖 webServer 任意端口）。
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  const { token, user } = await rsiotLogin()
  await page.addInitScript(([t, u]) => {
    localStorage.setItem('webhmi_token', t)
    localStorage.setItem('webhmi_user', u)
  }, [token, JSON.stringify(user)])
  await page.context().addCookies([{ name: 'token', value: token, domain: '127.0.0.1', path: '/' }])
}

/** 直接打 rs-iot 删画面（测试自洁；DELETE 幂等，不存在也 ok） */
export async function rsiotDeleteScreen(id: string): Promise<void> {
  await authedFetch(`/api/v1/screens/${id}`, { method: 'DELETE' })
}

/** 直接打 rs-iot 预置画面（PUT 全量 upsert），body 为完整 doc */
export async function rsiotPutScreen(id: string, doc: unknown): Promise<void> {
  const res = await authedFetch(`/api/v1/screens/${id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc),
  })
  if (!res.ok) throw new Error(`rsiotPutScreen: rs-iot ${res.status}`)
}

/** 直接打 rs-iot 取画面 doc（{id,doc,version}——version 为 P0 版本号） */
export async function rsiotGetScreen(id: string): Promise<{ id: string; doc: Record<string, unknown>; version: number }> {
  const res = await authedFetch(`/api/v1/screens/${id}`)
  if (!res.ok) throw new Error(`rsiotGetScreen: rs-iot ${res.status}`)
  return res.json()
}

/** 清扫匹配的残留画面（前次失败运行遗留的自洁兜底） */
export async function rsiotSweepScreens(match: RegExp): Promise<void> {
  const res = await authedFetch('/api/v1/screens')
  const { screens } = (await res.json()) as { screens: string[] }
  await Promise.all(screens.filter((s) => match.test(s)).map((s) => rsiotDeleteScreen(s)))
}
