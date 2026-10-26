/**
 * 登录态（F1 形状）：token 存 hmi_token（tokenStore），user 存 hmi_user。
 * login 失败不抛——返回 {ok:false,message} 交给登录页展示。
 */
import { api, ApiError, tokenStore } from './api'
import { LOGIN_PATH } from './endpoints'

const USER_KEY = 'hmi_user'

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
  tokenStore.clear()
  localStorage.removeItem(USER_KEY)
}

export const isAuthed = () => tokenStore.get() !== null

export function getAuthedUser(): AuthedUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as AuthedUser } catch { return null }
}
