/**
 * agent 面板 API 通道（对标控制台 api/client.ts 的 api()，适配本仓会话形态）：
 * `/api/agent/*` 走 **同源**（hmi 挂在 gateway origin 下，dev 走 vite proxy）——
 * 不带 API_BASE 前缀（rs-iot 端点才有 /api/rsiot 前缀）。鉴权 = 同源 HttpOnly
 * cookie（fetch 自动携带）+ Bearer（webhmi_token 镜像，与控制台 apiFetch 同款双通道）。
 * 401 处理交给调用方（store 内 toast/errorMsg），不在此跳登录（面板的启动恢复
 * 各端点本来就容错）。
 */
import { tokenStore } from '../../lib/api'

export async function agentApi(path: string, opts: RequestInit = {}): Promise<Response> {
  const token = tokenStore.get()
  return fetch(path, {
    ...opts,
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  })
}
