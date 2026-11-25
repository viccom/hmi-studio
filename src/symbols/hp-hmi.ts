/**
 * 工业功能件调色板（HP-HMI / ISA-101）**单一事实源**。
 *
 * 约束（docs/hmi-style-guide.md §2/§3）：
 * - 正常态灰阶；饱和色只用于报警/异常/操作提示（P1-P4）。
 * - 活动数据用暗蓝（非饱和），第二通道用暗绿；静态设备/管线用中性深灰。
 * - 图元默认值与画面生成器都引用本文件，不允许散落硬编码色值。
 *
 * 层级：本文件属于 symbols 层（symbols 只依赖 symbols）；screen-assets 可 import
 * 本文件（分层规则允许 assets → symbols），symbols 内部相互引用亦合法。
 */

export const HP = {
  /** 画布底色：L1 总览 / L2 单元 / L3 设备（越深越亮，突出内容） */
  bgL1: '#F0F0F0',
  bgL2: '#DCDCDC',
  bgL3: '#F5F5F5',
  /** 面板/值块/faceplate 内部底色 */
  panel: '#FFFFFF',
  /** 正文与次要文字 */
  ink: '#1F2328',
  inkDim: '#5B6570',
  /** 静态线条/边框（设备形体、管线、卡片描边） */
  line: '#8A939D',
  /** 静态设备填充（正常态中性灰） */
  static: '#5B6570',
  /** 活动数据（实时值、趋势线） */
  live: '#1F4E79',
  /** 第二数据通道 */
  liveAlt: '#2E6B52',
  /** 限值带底色与正常区间 */
  band: '#E3E6E8',
  bandOk: '#C9D2D8',
  /** 状态色（文字/徽标，不做大面积填充） */
  ok: '#2E7D32',
  off: '#9E9E9E',
  stale: '#B8860B',
  /** 报警优先级色（P1 最高） */
  alarmP1: '#D32F2F',
  alarmP2: '#F57C00',
  alarmP3: '#FBC02D',
  alarmP4: '#1976D2',
} as const

/** 报警优先级（0=正常；1=P1 … 4=P4）。宿主合成点 `__prio` 使用同一编号。 */
export function prioColor(prio: unknown): string {
  switch (Number(prio)) {
    case 1: return HP.alarmP1
    case 2: return HP.alarmP2
    case 3: return HP.alarmP3
    case 4: return HP.alarmP4
    default: return HP.off
  }
}

/** 优先级文字（三重冗余中的"文字"通道） */
export function prioLabel(prio: unknown): string {
  const p = Number(prio)
  return p >= 1 && p <= 4 ? `P${p}` : '正常'
}

/** 质量码：0=GOOD / 1=STALE / 2=BAD（宿主 `__sys.quality` 与图元 props 同编号） */
export function qualityColor(q: unknown): string {
  switch (Number(q)) {
    case 1: return HP.stale
    case 2: return HP.alarmP1
    default: return HP.inkDim
  }
}

export function qualityLabel(q: unknown): string {
  switch (Number(q)) {
    case 1: return 'STALE'
    case 2: return 'BAD'
    default: return 'GOOD'
  }
}

/** 数值字体（tabular 数字，ISA-101 数值列对齐要求） */
export const NUM_FONT = 'Consolas, Menlo, "DejaVu Sans Mono", monospace'
/** 标签字体（无衬线；不写死单一平台字体） */
export const UI_FONT = 'system-ui, "Noto Sans SC", "Microsoft YaHei", sans-serif'

/** 未设置限值的哨兵：maotu 的 props 必须带默认值（val 不能是 undefined），
 *  用 -99999 表示"该档未组态"，图元跳过刻线/文字（0 是合法限值，不能当缺省）。 */
export const LIMIT_UNSET = -99999

/** 限值档位：未设置返回 undefined（图元据此跳过刻线） */
export interface Limits { ll?: number; l?: number; h?: number; hh?: number }

/** 限值有效性：数值且有限才参与绘制（组态期允许缺省） */
export function limitOf(v: unknown): number | undefined {
  const n = Number(v)
  if (!Number.isFinite(n) || n === LIMIT_UNSET || n <= -9999) return undefined
  return n
}
