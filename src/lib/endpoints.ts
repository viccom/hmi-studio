/**
 * T18 部署寻址（gateway 形态 vs dev 形态）——build 时 env 烘入（gateway.toml hmi_dist 挂 /hmi）：
 * - REST 前缀：dev ''（vite proxy /api → rs-iot）；gateway '/api/rsiot'（gateway app.rs
 *   nest 剥前缀拼 rsiot_base——浏览器须调 /api/rsiot/api/v1/*）。
 * - 登录端点：dev rs-iot '/api/v1/user/login'；gateway '/api/gw/login'（PUBLIC 免 JWT
 *   纯转发，且透传 rs-iot 的 Set-Cookie——统一会话）。
 * - SSE 鉴权：两形态统一走同源 HttpOnly cookie（EventSource 自动携带）——gateway 层1
 *   已认 Cookie（auth.rs 三通道），dev 形态 rs-iot 本就认 Cookie。
 * token 同源：gateway 与 rs-iot 共享 jwt_secret，rs-iot 颁的 JWT 网关直认（auth.rs 文件头）。
 */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
export const LOGIN_PATH = (import.meta.env.VITE_LOGIN_PATH as string | undefined) ?? '/api/v1/user/login'
