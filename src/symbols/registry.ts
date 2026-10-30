// 正式图元注册表（T11 起）：allSymbols() 是左面板注册与 lint 全量检查的唯一事实源。
// 新图元 = 一个 ts 文件 export HmiSymbol + 在此追加，lint 全绿（symbol-lint.test 全量循环）即可注册。
//
// 图元目录（47 类 = 过程/操作 27 + BI 图表 20，截至 2026-10-29 P3；id——能力）。
// **本目录是导览快照而非权威清单**：权威 id 集合 = `groups.ts` SYMBOL_GROUP_DEFS
// （分组结构 + 全量 id 的机器事实源，测试覆盖）；新增/删改图元后须手工同步本注释
// （symbol-lint 不校验注释，腐化只能靠人工发现——嫌麻烦就只维护分组指针）。
//   ah-dev-selector    设备选择器（vue，W11）——参数化画面设备上下文切换（@dev 前缀）
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
//   ah-power-gauge     电表功率盘（custom-svg，P2）——0~5kW 指针盘 + >4.5kW 红区 + pulse 指示灯
//   ah-meter-panel     电表面板（vue，P2）——V/I/P/PF/Hz 五行数显 + 脉冲灯 + status 告警
//   ah-water-meter     水表盘（custom-svg，P2）——机械字轮累计 + 瞬时小盘 + 逆向流标记
//   ah-gas-meter       燃气表盘（custom-svg，P2）——字轮累计 + 余额预警 + 阀标 + 泄漏红闪
// BI 图表族（vue 型，通道 B——宿主聚合收集器写 props.data.val，图元自身不发请求；
// 数据契约见 lib/bi-contract.ts，设计见 docs/plans/2026-10-29-bi-monitoring-dashboard-design.md）：
//   ah-bi-kpi        KPI 数字卡——大数字 + 单位 + 内联 SVG sparkline
//   ah-bi-trend      多序列趋势——折线/面积（echarts）
//   ah-bi-rank       排名条形——横向条形 TopN
//   ah-bi-pie        占比环——环形占比
//   ah-bi-stack      状态时长条——百分比堆叠横条
//   ah-bi-heat       时段热力——星期×时段热力矩阵
//   ah-bi-table      明细表格——序列 KPI 表格（自绘，无 echarts）
//   ah-bi-matrix     设备×指标热点矩阵
//   ah-bi-stack-area 堆叠面积——多序列堆叠趋势
//   ah-bi-bars       分组柱图——多序列分组柱
//   ah-bi-spike      尖峰柱图——P90/均值倍数/固定三档尖峰着色 + 阈值虚线
//   ah-bi-alarms     告警统计——活动告警快照（无 series，宿主 fetchAlarms 通道）
//   ah-bi-window     时间窗口切换器——上行控制切宿主统计窗（无 series）
//   ah-bi-gauge      仪表盘——多 dial 数值盘（echarts）
//   ah-bi-scatter    相关性散点——两序列 X×Y 按 ts 配对
//   ah-bi-radar      多指标雷达——≥3 轴（不足回落读数列表）
//   ah-bi-boxplot    分布箱线——整窗五数概括
//   ah-bi-calendar   日历热力——按日聚合热力格
//   ah-bi-progress   容量利用率条——单值进度 + 越限红显
//   ah-bi-waterfall  增量瀑布——透明基座 + 增量段 + 合计列
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
import { powerGauge } from './power-gauge'
import { meterPanel } from './meter-panel'
import { waterMeter } from './water-meter'
import { gasMeter } from './gas-meter'
import { devSelector } from './dev-selector'
import { biKpi } from './bi-kpi'
import { biRank } from './bi-rank'
import { biPie } from './bi-pie'
import { biStack } from './bi-stack'
import { biTrend } from './bi-trend'
import { biHeat } from './bi-heat'
import { biTable } from './bi-table'
import { biMatrix } from './bi-matrix'
import { biStackArea } from './bi-stack-area'
import { biBars } from './bi-bars'
import { biSpike } from './bi-spike'
import { biAlarms } from './bi-alarms'
import { biWindow } from './bi-window'
import { biGauge } from './bi-gauge'
import { biScatter } from './bi-scatter'
import { biRadar } from './bi-radar'
import { biBoxplot } from './bi-boxplot'
import { biCalendar } from './bi-calendar'
import { biProgress } from './bi-progress'
import { biWaterfall } from './bi-waterfall'

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
  powerGauge,
  meterPanel,
  waterMeter,
  gasMeter,
  devSelector,
  biKpi,
  biRank,
  biPie,
  biStack,
  biTrend,
  biHeat,
  biTable,
  biMatrix,
  biStackArea,
  biBars,
  biSpike,
  biAlarms,
  biWindow,
  biGauge,
  biScatter,
  biRadar,
  biBoxplot,
  biCalendar,
  biProgress,
  biWaterfall,
]

export function allSymbols(): HmiSymbol[] {
  return SYMBOLS
}
