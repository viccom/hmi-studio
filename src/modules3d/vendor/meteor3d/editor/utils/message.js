/**
 * 消息适配器（本地替换上游自建 toast）——Q8 档②「壳层统一」的一部分。
 *
 * 上游 `utils/message.js` 是自绘的 reactive toast（需配合 MessageContainer.vue 渲染）。
 * hmi-studio 的 2D 编辑器用 element-plus，两套 toast 会让 3D 编辑器"像另一个系统"。
 * 本文件保持上游导出面（message.success/warning/error/info），内部转 ElMessage，
 * 于是面板里的提示自动与 2D 同款（同一位置/同一动画/同一主题色）。
 */
import { ElMessage } from 'element-plus'

const wrap = (type) => (content, duration = 3000) =>
  ElMessage({ type, message: String(content ?? ''), duration: typeof duration === 'number' ? duration : 3000 })

export const message = {
  success: wrap('success'),
  error: wrap('error'),
  warning: wrap('warning'),
  info: wrap('info'),
  show: wrap('info'),
  close() { /* element-plus 自带自动关闭；保持接口兼容 */ },
  closeAll() { ElMessage.closeAll() },
}

/** 上游 MessageContainer.vue 读它；我们不再渲染该组件，保留空状态以兼容任何残留引用 */
export const messageState = { messages: [] }
