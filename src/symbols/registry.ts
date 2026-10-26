// 正式图元注册表（T11 起）：allSymbols() 是左面板注册与 lint 全量检查的唯一事实源。
// 新图元 = 一个 ts 文件 export HmiSymbol + 在此追加，lint 全绿（symbol-lint.test 全量循环）即可注册。
import type { HmiSymbol } from './types'
import { pumpCentrifugal } from './pump-centrifugal'
import { gateValve } from './gate-valve'
import { butterflyValve } from './butterfly-valve'
import { tank } from './tank'
import { levelGauge } from './level-gauge'
import { flowMeter } from './flow-meter'
import { motor } from './motor'
import { disSwitch } from './dis-switch'
import { navButton } from './nav-button'

const SYMBOLS: HmiSymbol[] = [
  pumpCentrifugal,
  gateValve,
  butterflyValve,
  tank,
  levelGauge,
  flowMeter,
  motor,
  disSwitch,
  navButton,
]

export function allSymbols(): HmiSymbol[] {
  return SYMBOLS
}
