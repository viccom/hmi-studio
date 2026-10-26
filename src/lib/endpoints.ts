/**
 * T18 部署寻址（gateway 形态 vs dev 形态）——build 时 env 烘入（gateway.toml hmi_dist 挂 /hmi）：
 * - REST 前缀：dev ''（vite proxy /api → rs-iot）；gateway '/api/rsiot'（gateway app.rs
 *   nest 剥前缀拼 rsiot_base——浏览器须调 /api/rsiot/api/v1/*）。
 * - 登录端点：dev rs-iot '/api/v1/user/login'；gateway '/api/gw/login'（PUBLIC 免 JWT
 *   纯转发——/api/rsiot/* 受层1 JWT 保护，登录前不可用，鸡生蛋）。
 * - SSE 鉴权：gateway 层1 只认 Bearer/?token= **不认 Cookie**（auth.rs 实读）——EventSource
 *   无 header，token 进 query（forward 注入 Authorization 且摘掉 token= 防泄漏，proxy.rs）；
 *   dev 仍走同源 Cookie（rs-iot 不认 ?token=，F11）。
 * token 同源：gateway 与 rs-iot 共享 jwt_secret，rs-iot 颁的 JWT 网关直认（auth.rs 文件头）。
 */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
export const LOGIN_PATH = (import.meta.env.VITE_LOGIN_PATH as string | undefined) ?? '/api/v1/user/login'
/** SSE token 形态：gateway 部署（有 API 前缀）= query；dev = Cookie */
export const SSE_TOKEN_IN_QUERY = API_BASE !== ''
