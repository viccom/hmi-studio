// 正式图元注册表（T11 起）：allSymbols() 是左面板注册与 lint 全量检查的唯一事实源。
// 新图元 = 一个 ts 文件 export HmiSymbol + 在此追加，lint 全绿（symbol-lint.test 全量循环）即可注册。
//
// 图元目录（22 类，2026-10-25 图元批量轮 + P2 表计轮；id——能力）：
//   ah-pump            离心泵——叶轮旋转动画 + fill 状态色
//   ah-gate-valve      闸阀——领结阀体 + 手轮，fill 状态色
//   ah-butterfly-valve 蝶阀——蝶板 + 阀杆，fill 状态色
//   ah-tank            立式罐——液位 h(0-100) 连续驱动（scaleY 影子链）
//   ah-level-gauge     液位计——窄管液位 h 连续驱动 + 刻度
//   ah-flow-meter      流量计——管线流量计，fill 状态色
//   ah-motor           电机——整件旋转 common_animations rotate360
//   ah-dis-switch      隔离开关——合/分闸二值 fill 状态色
//   ah-nav-button      跳转按钮——默认 click 事件模板 $mtEventCallBack('nav')
//   ah-check-valve     止回阀——单向导通箭头（静态语义），fill 状态色
//   ah-ball-valve      球阀——open(switch) 驱动翼柄 90° 旋转 + fill 状态色
//   ah-safety-valve    安全阀——斜置弹簧角式阀体，fill 状态色
//   ah-solenoid-valve  电磁阀——线圈方块电气标识，fill 状态色
//   ah-fan             风机——四叶叶轮旋转动画 + fill 状态色
//   ah-agitator        搅拌器——十字桨叶旋转动画 + fill 状态色
//   ah-digital-display 数显面板（vue）——label+大号读数+unit，value 直写
//   ah-gauge-pressure  压力表盘（custom-svg）——指针角=f(value,min,max)+刻度弧，alarm 变红
//   ah-thermometer     温度计（custom-svg）——液柱计算几何+刻度文本
//   ah-stack-light     三色警示灯（custom-svg）——red/yellow/green 独立 bool 触发链
//   ah-push-button     操作按钮（vue）——按下视觉反馈 + 默认事件模板 $rsiot.send(devid,tag,value)
//   ah-selector-switch 选择开关（vue）——三态旋钮 value 0/1/2 + update:modelValue 回写
//   ah-trend-chart     趋势图表（vue，P2）——echarts 折线×3；bind 直写 tick0-2 → 环形缓冲 → 节流重绘
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
import { checkValve } from './check-valve'
import { ballValve } from './ball-valve'
import { safetyValve } from './safety-valve'
import { solenoidValve } from './solenoid-valve'
import { fan } from './fan'
import { agitator } from './agitator'
import { digitalDisplay } from './digital-display'
import { gaugePressure } from './gauge-pressure'
import { thermometer } from './thermometer'
import { stackLight } from './stack-light'
import { pushButton } from './push-button'
import { selectorSwitch } from './selector-switch'
import { trendChart } from './trend-chart'

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
  checkValve,
  ballValve,
  safetyValve,
  solenoidValve,
  fan,
  agitator,
  digitalDisplay,
  gaugePressure,
  thermometer,
  stackLight,
  pushButton,
  selectorSwitch,
  trendChart,
]

export function allSymbols(): HmiSymbol[] {
  return SYMBOLS
}
