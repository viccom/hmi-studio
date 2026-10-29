/**
 * 图元目录分组定义（纯 ts，无 .vue 依赖——e2e 可直接 import）。
 *
 * 2026-10-29 用户反馈：40 个图元平铺一组对用户不友好，按组态软件惯例**按功能分类**
 * （WinCC/组态王的库结构同款思路）：过程设备 / 阀门管件 / 仪表计量 / 电气与操作 /
 * 导航与趋势 / BI 数据图表。
 *
 * registry 保持扁平全量唯一事实源不变——本表是**展示层元数据**，
 * groups.test.ts 冻结「全覆盖无重复」不变量（漏分组 = 编辑器里找不到，重复 = 两处维护）。
 */
export interface SymbolGroupDef {
  title: string
  ids: string[]
}

export const SYMBOL_GROUP_DEFS: SymbolGroupDef[] = [
  {
    title: '过程设备',
    ids: ['ah-pump', 'ah-fan', 'ah-agitator', 'ah-motor', 'ah-tank', 'ah-level-gauge'],
  },
  {
    title: '阀门管件',
    ids: [
      'ah-gate-valve', 'ah-butterfly-valve', 'ah-check-valve', 'ah-ball-valve',
      'ah-safety-valve', 'ah-solenoid-valve', 'ah-flow-meter',
    ],
  },
  {
    title: '仪表计量',
    ids: ['ah-gauge-pressure', 'ah-thermometer', 'ah-water-meter', 'ah-gas-meter', 'ah-power-gauge'],
  },
  {
    title: '电气与操作',
    ids: [
      'ah-digital-display', 'ah-meter-panel', 'ah-dis-switch',
      'ah-push-button', 'ah-selector-switch', 'ah-stack-light',
    ],
  },
  {
    title: '导航与趋势',
    ids: ['ah-nav-button', 'ah-dev-selector', 'ah-trend-chart'],
  },
  {
    title: 'BI 数据图表',
    ids: [
      'ah-bi-kpi', 'ah-bi-trend', 'ah-bi-rank', 'ah-bi-pie', 'ah-bi-stack', 'ah-bi-heat',
      'ah-bi-table', 'ah-bi-matrix', 'ah-bi-stack-area', 'ah-bi-bars', 'ah-bi-spike',
      'ah-bi-alarms', 'ah-bi-window',
    ],
  },
]
