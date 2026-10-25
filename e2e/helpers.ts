import type { Page } from '@playwright/test'

const RSIOT = process.env.RSIOT_BASE ?? 'http://127.0.0.1:8790'

/**
 * 以 admin 真实登录 rs-iot 拿新 token，经 addInitScript 注入 localStorage——
 * 后续 E2E 段绕过登录页（每次导航前生效，context 生命周期内持久）。
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  const res = await fetch(`${RSIOT}/api/v1/user/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: 'admin', pass: 'admin' }),
  })
  if (!res.ok) throw new Error(`loginAsAdmin: rs-iot ${res.status}`)
  const { token, user } = (await res.json()) as { token: string; user: unknown }
  await page.addInitScript(([t, u]) => {
    localStorage.setItem('hmi_token', t)
    localStorage.setItem('hmi_user', u)
  }, [token, JSON.stringify(user)])
}
