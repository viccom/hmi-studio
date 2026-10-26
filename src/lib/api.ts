/**
 * rs-iot REST 客户端：JWT 头自动注入 + 非 2xx 抛 ApiError + 401 回调（登出跳转）。
 * base 传 '' 时走同源（vite proxy / gateway 部署两种形态都覆盖）；
 * 缺省 base = endpoints.API_BASE（T18 gateway 部署 build 烘入 '/api/rsiot'）。
 */
import { API_BASE } from './endpoints'

export class ApiError extends Error {
  constructor(readonly status: number, readonly body: unknown, message?: string) {
    super(message ?? `api ${status}`)
  }
}

export interface ApiOptions { base?: string; onUnauthorized?: () => void }

// 全局 401 兜底（main.ts 接线：清 token 回登录页）；api({onUnauthorized}) 显式传入者优先
let defaultOnUnauthorized: (() => void) | undefined
export function setOnUnauthorized(fn: (() => void) | undefined): void {
  defaultOnUnauthorized = fn
}

const TOKEN_KEY = 'hmi_token'
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  try { return text ? JSON.parse(text) : null } catch { return text }
}

async function request(opts: ApiOptions, method: string, path: string, body?: unknown): Promise<unknown> {
  const token = tokenStore.get()
  const res = await fetch((opts.base ?? API_BASE) + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) { (opts.onUnauthorized ?? defaultOnUnauthorized)?.(); throw new ApiError(401, await parseBody(res), 'unauthorized') }
  if (!res.ok) throw new ApiError(res.status, await parseBody(res))
  return parseBody(res)
}

export function api(opts: ApiOptions = {}) {
  return {
    get: (p: string) => request(opts, 'GET', p),
    post: (p: string, b?: unknown) => request(opts, 'POST', p, b),
    put: (p: string, b?: unknown) => request(opts, 'PUT', p, b),
    del: (p: string) => request(opts, 'DELETE', p),
  }
}
