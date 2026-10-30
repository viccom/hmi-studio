/**
 * REST 客户端（设计 §4.1/§4.3）：rs-iot REST 直连——HMI_BASE_URL（默认
 * http://127.0.0.1:8790）+ HMI_JWT（预签发，sub=hmi-mcp）注入 Bearer。
 * 凭据只走环境变量，公共仓零密钥。fetchImpl 可注入（单测用）。
 *
 * 日志：stderr 结构化 JSON（tool/tier/ok/ms）——reasonix 经 stdio 捕获，
 * 无独立日志面（设计 §4.3）。
 */

export class HmiApiError extends Error {
  constructor(readonly status: number, readonly body: string, message?: string) {
    super(message ?? `rs-iot ${status}: ${body.slice(0, 200)}`)
  }
}

export interface BackendOptions {
  baseUrl?: string
  jwt?: string
  fetchImpl?: typeof fetch
}

export class HmiBackend {
  readonly baseUrl: string
  private readonly jwt: string
  private readonly fetchImpl: typeof fetch

  constructor(opts: BackendOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.HMI_BASE_URL ?? 'http://127.0.0.1:8790').replace(/\/$/, '')
    this.jwt = opts.jwt ?? process.env.HMI_JWT ?? ''
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  /** JSON 请求：非 2xx → HmiApiError（带响应体截断）；2xx 解析 JSON（空体 → null）。 */
  async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await this.fetchImpl(this.baseUrl + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.jwt ? { authorization: `Bearer ${this.jwt}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) throw new HmiApiError(res.status, text)
    try {
      return text ? JSON.parse(text) : null
    } catch {
      throw new HmiApiError(res.status, text, `rs-iot 响应非 JSON：${text.slice(0, 120)}`)
    }
  }

  get(path: string): Promise<unknown> {
    return this.request('GET', path)
  }

  post(path: string, body: unknown): Promise<unknown> {
    return this.request('POST', path, body)
  }
}

/** stderr 工具调用日志（设计 §4.3：tool/tier/ok/ms）。永不抛（日志面故障不影响工具）。 */
export function logTool(fields: { tool: string; tier: string; ok: boolean; ms: number; err?: string }): void {
  try {
    process.stderr.write(
      JSON.stringify({ ts: new Date().toISOString(), ...fields }) + '\n',
    )
  } catch {
    /* 日志写失败静默 */
  }
}
