/**
 * 运行时唯一 ID：crypto.randomUUID 仅安全上下文（HTTPS/localhost）可用——
 * 局域网 IP 直连（如 http://172.27.199.30:18080/hmi/）是不安全上下文，该 API
 * 为 undefined（W8 绑定面板打回归因）。此处特性检测兜底，格式兼容 UUID 形态。
 */
export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC4122 v4 形态的兜底实现（非密码学安全，仅作标识符）
  const hex = (n: number) => [...Array(n)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`
}
