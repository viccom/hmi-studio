/**
 * 图元注册管道（T11 起正式化）：正式图元经 registry.ts 汇总注入左面板，
 * T12/T13 逐批扩充（新增只改 registry，不碰此文件）。
 * registerSymbols() 幂等：maotu registerConfig 同名标题为覆盖语义（覆盖 + info 提示，
 * F9），编辑器多次挂载不重复注册、不弹提示——已注册直接跳过。
 */
import { leftAsideStore } from 'maotu'
import { allSymbols } from './registry'

export const SYMBOL_GROUP = 'HMI 图元'

export function registerSymbols(): void {
  if (leftAsideStore.config.has(SYMBOL_GROUP)) return
  leftAsideStore.registerConfig(SYMBOL_GROUP, allSymbols())
}
