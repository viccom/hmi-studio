// 趋势缓冲纯函数单测（规则 7：验证意图——缓冲是 bind 直写→曲线的落点，
// 容量淘汰/时间窗裁剪/脏数据防御任一失守 = 趋势图内存膨胀或画出鬼点）。
import { describe, it, expect } from 'vitest'
import {
  estimateMaxN, pushPoint, trimWindow, parsePoints, toPointValue,
  TREND_MAX_SERIES, TREND_PALETTE,
} from './trend-buffer'

describe('estimateMaxN 容量估算（窗口/采样 + 余量）', () => {
  it('600s × 2s = 310（300 + 10 余量）', () => {
    expect(estimateMaxN(600)).toBe(310)
    expect(estimateMaxN(600, 2)).toBe(310)
  })
  it('其他窗口线性缩放（余量 +10 恒在，故极小窗口也 ≥11）', () => {
    expect(estimateMaxN(60)).toBe(40)
    expect(estimateMaxN(1)).toBe(11)
    expect(estimateMaxN(1, 0.1)).toBe(20)
  })
  it('脏入参回落 600/2s（描述符可能被绑成串）', () => {
    expect(estimateMaxN(NaN)).toBe(310)
    expect(estimateMaxN(-5)).toBe(310)
    expect(estimateMaxN(600, 0)).toBe(310)
  })
})

describe('pushPoint 环形缓冲（入队 + 上限淘汰最旧）', () => {
  it('未满容量追加，原数组不被改（纯函数）', () => {
    const buf = [{ t: 1, v: 10 }, { t: 2, v: 20 }]
    const next = pushPoint(buf, 3, 30, 10)
    expect(next).toHaveLength(3)
    expect(next[2]).toEqual({ t: 3, v: 30 })
    expect(buf).toHaveLength(2) // 入参不被副作用污染
  })
  it('满容量丢最旧（600s 窗口下缓冲不随运行时长膨胀）', () => {
    let buf: { t: number; v: number }[] = []
    for (let i = 0; i < 12; i++) buf = pushPoint(buf, i, i, 10)
    expect(buf).toHaveLength(10)
    expect(buf[0].t).toBe(2) // 0/1 被淘汰
    expect(buf[buf.length - 1].t).toBe(11)
  })
  it('maxN 非法（0/负数/NaN）不崩，按 1 容量保底', () => {
    expect(pushPoint([{ t: 1, v: 1 }], 2, 2, 0)).toEqual([{ t: 2, v: 2 }])
    expect(pushPoint([{ t: 1, v: 1 }], 2, 2, NaN)).toEqual([{ t: 2, v: 2 }])
  })
})

describe('trimWindow 时间窗裁剪（滚动窗口只留 windowMs 内的点）', () => {
  it('窗口外的旧点被裁掉，窗内全保留', () => {
    const buf = [{ t: 0, v: 1 }, { t: 500, v: 2 }, { t: 1500, v: 3 }]
    expect(trimWindow(buf, 2000, 1000)).toEqual([{ t: 1500, v: 3 }])
    expect(trimWindow(buf, 2000, 10_000)).toEqual(buf)
  })
  it('全部过期 → 空缓冲（长时间无数据后窗口重清）', () => {
    expect(trimWindow([{ t: 1, v: 1 }], 10_000, 1000)).toEqual([])
  })
})

describe('parsePoints 曲线配置解析（textArea JSON 串容错）', () => {
  it('JSON 串 → 规范序列：label 缺省回落 field，color 缺省轮转调色板', () => {
    const ss = parsePoints('[{"field":"e1.power","label":"有功功率","unit":"kW"},{"field":"e1.voltage"}]')
    expect(ss).toHaveLength(2)
    expect(ss[0]).toEqual({ field: 'e1.power', label: '有功功率', unit: 'kW', color: '#f5a623' })
    expect(ss[1].label).toBe('e1.voltage')
    expect(ss[1].unit).toBe('')
    expect(ss[1].color).toBe(TREND_PALETTE[1])
  })
  it('已解析数组直接接受（jsonEdit 迁移面），非对象项丢弃', () => {
    const ss = parsePoints([{ field: 'w1.flow' }, null, 'junk', { nofield: 1 }])
    expect(ss).toHaveLength(1)
    expect(ss[0].field).toBe('w1.flow')
  })
  it('超过 3 条截断（数据通道只有 tick0-2）', () => {
    const four = Array.from({ length: 4 }, (_, i) => ({ field: `f${i}` }))
    expect(parsePoints(four)).toHaveLength(TREND_MAX_SERIES)
  })
  it('脏配置静默降级为空（组态中途态不炸）', () => {
    expect(parsePoints('not json')).toEqual([])
    expect(parsePoints('{"field":"x"}')).toEqual([]) // 对象非数组
    expect(parsePoints(undefined)).toEqual([])
    expect(parsePoints('[{"label":"无 field"}]')).toEqual([])
  })
})

describe('toPointValue 数值归一（bind 直写 number / 触发器串 / 脏数据）', () => {
  it.each([
    [42.5, 42.5],
    ['88', 88],
    [0, 0],
    ['RUN', null],
    [NaN, null],
    [undefined, null],
    [true, null],
  ])('%p → %p', (raw, want) => {
    expect(toPointValue(raw)).toBe(want)
  })
})
