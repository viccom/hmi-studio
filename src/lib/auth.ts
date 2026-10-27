/**
 * 登录态（F1 形状）：token 存 webhmi_token（tokenStore，与 rs-iot 控制台共享的
 * 统一会话键），user 存 webhmi_user。login 失败不抛——返回 {ok:false,message} 交登录页。
 */
import { api, ApiError, tokenStore } from './api'
import { API_BASE, LOGIN_PATH } from './endpoints'

const USER_KEY = 'webhmi_user'
// 旧键一次性迁移（hmi_* / rsiot_* → webhmi_*）：控制台登录过的用户直接互通。
;(function migrateLegacyUserKey(): void {
  if (!localStorage.getItem(USER_KEY)) {
    const legacy = localStorage.getItem('hmi_user') ?? localStorage.getItem('rsiot_user')
    if (legacy) localStorage.setItem(USER_KEY, legacy)
  }
  localStorage.removeItem('hmi_user')
  localStorage.removeItem('rsiot_user')
})()

export interface AuthedUser { user_id: string; [k: string]: unknown }
export type LoginResult = { ok: true; user: AuthedUser } | { ok: false; message: string }

export async function login(userId: string, pass: string): Promise<LoginResult> {
  try {
    // dev=rs-iot 直连；gateway 部署=/api/gw/login（gateway 自有 PUBLIC 端点——**不带
    // /api/rsiot 前缀**，base 固定同源；两形态 LOGIN_PATH 均为完整路径——endpoints.ts）
    const body = (await api({ base: '' }).post(LOGIN_PATH, { user_id: userId, pass })) as {
      status?: string; token?: string; user?: AuthedUser
    }
    if (body?.status !== 'ok' || !body.token) return { ok: false, message: '登录响应异常' }
    const user = body.user ?? { user_id: userId }
    tokenStore.set(body.token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    return { ok: true, user }
  } catch (e) {
    if (e instanceof ApiError) {
      // rs-iot 401 直接回文本 "invalid user or password"，优先透传给用户
      const text = typeof e.body === 'string' ? e.body.trim() : ''
      return { ok: false, message: text || `登录失败 (${e.status})` }
    }
    return { ok: false, message: '网络错误，请检查连接' }
  }
}

export function logout(): void {
  // 服务端登出尽力而为（清 HttpOnly cookie——统一会话的权威凭证）。用裸 fetch 不走
  // api()：凭证已失效场景（onUnauthorized 触发的登出链）避免 401 回调再递归登出。
  const t = tokenStore.get()
  if (t) {
    void fetch(`${API_BASE}/api/v1/user/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}` },
    }).catch(() => {})
  }
  tokenStore.clear()
  localStorage.removeItem(USER_KEY)
}

export const isAuthed = () => tokenStore.get() !== null

export function getAuthedUser(): AuthedUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as AuthedUser } catch { return null }
}
