/**
 * 图元注册管道（T4 从 SpikeEdit 抽出；T11 起逐批扩充正式图元）。
 * registerSymbols() 幂等：maotu registerConfig 同名标题为覆盖语义（覆盖时弹 info 提示），
 * 编辑器多次挂载不重复注册、不弹提示——已注册直接跳过。
 */
import { leftAsideStore } from 'maotu'
import type { ILeftAsideConfigItemPublic } from 'maotu'
import disSwitch from './assets/dis-switch.svg?raw'
import pump from './assets/pump-centrifugal.svg?raw'
import tank from './assets/tank.svg?raw'
import breaker from './assets/breaker.svg?raw'

export const SYMBOL_GROUP = 'agent-hmi 图元'

const toM = (id: string, title: string, svg: string, w: number, h: number, props: Record<string, string | number | boolean>): ILeftAsideConfigItemPublic => ({
  id, title, type: 'svg', thumbnail: '', svg, width: w, height: h,
  props: Object.fromEntries(
    Object.entries(props).map(([k, v]) => [k, { title: k, type: typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'switch' : 'string', val: v }]),
  ) as ILeftAsideConfigItemPublic['props'],
})

// 注册顺序即左面板 DOM 顺序（E2E 拖拽按 nth 定位，改动顺序需同步 e2e）
export const TRIAL_SYMBOLS: ILeftAsideConfigItemPublic[] = [
  toM('ah-dis-switch', '隔离开关', disSwitch, 60, 24, { label: '隔离开关' }),
  toM('ah-breaker', '断路器', breaker, 24, 60, { label: '断路器' }),
  toM('ah-pump', '离心泵', pump, 64, 64, { label: '离心泵' }),
  toM('ah-tank', '清水池', tank, 48, 64, { label: '清水池' }),
]

export function registerSymbols(): void {
  if (leftAsideStore.config.has(SYMBOL_GROUP)) return
  leftAsideStore.registerConfig(SYMBOL_GROUP, TRIAL_SYMBOLS)
}
