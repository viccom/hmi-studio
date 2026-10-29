// BI 图表底座单测（bi-chart-kit）：信封解析 / 数值格式化 / 面板状态判定。
//
// 底座是 7 个 BI 图元共享的纯逻辑层——解析容错与格式化口径收在一处，
// 避免各图元各写一份而漂移（symbols 层纯模块，无 DOM 依赖）。
import { describe, it, expect } from 'vitest'
import {
  BI_PALETTE,
  firstError,
  formatClock,
  formatShort,
  formatValue,
  panelHint,
  panelState,
  parseEnvelope,
  seriesColor,
} from './bi-chart-kit'

describe('BI 底座：信封解析（容错）', () => {
  it('JSON 串 → 信封，series 完整归一', () => {
    const env = parseEnvelope(JSON.stringify({
      v: 1,
      window: { start: 100, end: 200 },
      generatedAt: 150,
      series: [{
        key: 'd1.power', label: 'P1', unit: 'kW', color: '#f5a623',
        mode: 'instant', metric: 'avg', value: 1.5,
        points: [{ ts: 100, value: 1.2 }], error: null,
      }],
    }))
    expect(env).not.toBeNull()
    expect(env!.v).toBe(1)
    expect(env!.window).toEqual({ start: 100, end: 200 })
    expect(env!.series[0].key).toBe('d1.power')
    expect(env!.series[0].value).toBe(1.5)
    expect(env!.series[0].points).toHaveLength(1)
  })

  it('已解析对象形态直接受理', () => {
    const env = parseEnvelope({ v: 1, series: [{ key: 'k', value: 2 }] })
    expect(env!.series[0].value).toBe(2)
  })

  it('坏 JSON / 空串 / 非对象 / 缺 series → null（调用方显示空态）', () => {
    expect(parseEnvelope('{oops')).toBeNull()
    expect(parseEnvelope('')).toBeNull()
    expect(parseEnvelope('   ')).toBeNull()
    expect(parseEnvelope('[1,2]')).toBeNull()
    expect(parseEnvelope('{}')).toBeNull()
    expect(parseEnvelope(undefined)).toBeNull()
  })

  it('points 内的非数值点被丢弃（坏点不入图）', () => {
    const env = parseEnvelope(JSON.stringify({
      v: 1,
      series: [{ key: 'k', points: [{ ts: 1, value: 2 }, { ts: 2, value: 'x' }, { ts: 'y', value: 3 }] }],
    }))
    expect(env!.series[0].points).toEqual([{ ts: 1, value: 2 }])
  })

  it('value 非有限数 → null（不是 NaN 泄漏到渲染层）', () => {
    const env = parseEnvelope(JSON.stringify({ v: 1, series: [{ key: 'k', value: null }] }))
    expect(env!.series[0].value).toBeNull()
  })

  it('error 空串归一为 null（避免图元把空串当错误展示）', () => {
    const env = parseEnvelope(JSON.stringify({ v: 1, series: [{ key: 'k', error: '' }] }))
    expect(env!.series[0].error).toBeNull()
  })
})

describe('BI 底座：数值格式化', () => {
  it('null → --（无数据不是 0）', () => {
    expect(formatValue(null)).toBe('--')
    expect(formatValue(undefined)).toBe('--')
    expect(formatValue(NaN)).toBe('--')
  })

  it('0 → "0"；普通小数去尾零', () => {
    expect(formatValue(0)).toBe('0')
    expect(formatValue(1.5)).toBe('1.5')
    expect(formatValue(1.23456)).toBe('1.235')
  })

  it('≥1000 走千分位', () => {
    expect(formatValue(12580.09)).toBe('12,580.09')
  })

  it('绝对值 <0.01 的非零数走科学计数（不显示成 0.00）', () => {
    expect(formatValue(0.0008)).toBe('8.00e-4')
  })

  it('时间格式化：时钟与短标签', () => {
    const ts = Math.floor(new Date('2026-10-29T15:08:57').getTime() / 1000)
    expect(formatClock(ts)).toBe('15:08:57')
    expect(formatShort(ts)).toBe('10-29 15:08')
  })
})

describe('BI 底座：面板状态判定', () => {
  const env = (series: Array<Record<string, unknown>>) => parseEnvelope(JSON.stringify({ v: 1, series }))

  it('null 信封 → empty', () => {
    expect(panelState(null)).toBe('empty')
  })

  it('有值或有�� → ok', () => {
    expect(panelState(env([{ key: 'k', value: 1 }]))).toBe('ok')
    expect(panelState(env([{ key: 'k', points: [{ ts: 1, value: 2 }] }]))).toBe('ok')
  })

  it('全空值 → empty（不是 error）', () => {
    expect(panelState(env([{ key: 'k', value: null }]))).toBe('empty')
  })

  it('局部失败不升级：一条报错 + 一条有值 → ok（单图失败不拖全屏）', () => {
    expect(panelState(env([{ key: 'k', value: 1 }, { key: 'k2', error: 'boom' }]))).toBe('ok')
  })

  it('全无数据且存在错误 → error（整面板无可用数据且能说明原因）', () => {
    expect(panelState(env([{ key: 'k', value: null }, { key: 'k2', error: 'boom' }]))).toBe('error')
  })

  it('提示文案：error 给错误原文，empty 给暂无历史数据', () => {
    expect(panelHint('error', env([{ key: 'k', error: 'bad request' }]))).toBe('bad request')
    expect(panelHint('empty', null)).toBe('暂无历史数据')
    expect(panelHint('ok', env([{ key: 'k', value: 1 }]))).toBe('')
    expect(firstError(env([{ key: 'k', error: 'x' }]))).toBe('x')
  })
})

describe('BI 底座：配色', () => {
  it('显式 color 优先', () => {
    expect(seriesColor({ color: '#123456' }, 0)).toBe('#123456')
  })

  it('缺省按序号轮转调色板', () => {
    expect(seriesColor({}, 0)).toBe(BI_PALETTE[0])
    expect(seriesColor({}, 1)).toBe(BI_PALETTE[1])
    expect(seriesColor({}, BI_PALETTE.length)).toBe(BI_PALETTE[0])
  })
})
