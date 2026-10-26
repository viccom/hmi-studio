// 批 B 几何纯函数单测：gauge-math 是 vue/custom-svg 图元计算几何的唯一事实源（规范 §4.2
// 「纯函数几何逻辑必须单测」）。用例验证意图（规则 7）：指针/液柱不得飞出量程、绑定点
// 给脏数据（非数串）时行为可预期——这是现场组态最常见的故障注入面。
import { describe, it, expect } from 'vitest'
import {
  clampNum, fracOf, gaugeAngle, gaugeArcPath, gaugeArcBetween, polarPt, thermoY, selectorAngle,
  GAUGE_START_DEG, GAUGE_SWEEP_DEG,
} from './gauge-math'

describe('clampNum 限幅（脏数据防御）', () => {
  it('数值在量程内原样、越界取边界', () => {
    expect(clampNum(50, 0, 100)).toBe(50)
    expect(clampNum(-5, 0, 100)).toBe(0)
    expect(clampNum(150, 0, 100)).toBe(100)
  })
  it('非数串/NaN → fallback（指针不得飞出盘面）', () => {
    expect(clampNum('RUN', 0, 100)).toBe(0)
    expect(clampNum(NaN, 0, 100, 42)).toBe(42)
    expect(clampNum(undefined, 0, 100)).toBe(0)
  })
  it('数字串接受（SSE 直写可能过触发器写成串）', () => {
    expect(clampNum('72.5', 0, 100)).toBe(72.5)
  })
})

describe('fracOf 比例', () => {
  it('线性内插 + 反向量程容错', () => {
    expect(fracOf(25, 0, 100)).toBe(0.25)
    expect(fracOf(-40, -40, 160)).toBe(0)
    expect(fracOf(160, -40, 160)).toBe(1)
    expect(fracOf(10, 100, 0)).toBe(0.1) // min>max 不除零
  })
})

describe('gaugeAngle 指针角（规则：min→150°、max→390°、线性单调）', () => {
  it('三锚点：min 起始角 / max 终止角 / 中点角', () => {
    expect(gaugeAngle(0, 0, 100)).toBeCloseTo(GAUGE_START_DEG)
    expect(gaugeAngle(100, 0, 100)).toBeCloseTo(GAUGE_START_DEG + GAUGE_SWEEP_DEG)
    expect(gaugeAngle(50, 0, 100)).toBeCloseTo(GAUGE_START_DEG + GAUGE_SWEEP_DEG / 2)
  })
  it('越界值收敛到量程角（钳位不越弧）', () => {
    expect(gaugeAngle(-99, 0, 100)).toBeCloseTo(GAUGE_START_DEG)
    expect(gaugeAngle('abc', 0, 100)).toBeCloseTo(GAUGE_START_DEG)
  })
})

describe('polarPt/gaugeArcPath', () => {
  it('极角转坐标：0° 在右、90° 在下（SVG y 向下）', () => {
    expect(polarPt(0, 0, 10, 0)).toEqual({ x: 10, y: 0 })
    expect(polarPt(0, 0, 10, 90).y).toBeCloseTo(10)
  })
  it('进度弧：零值只到起始角、满值走大弧标志 1', () => {
    const zero = gaugeArcPath(60, 58, 44, 0, 0, 100)
    expect(zero).toMatch(/^M [\d.]+ [\d.]+ A 44 44 0 0 1 /)
    expect(gaugeArcPath(60, 58, 44, 100, 0, 100)).toContain(' 0 1 ')
    expect(gaugeArcPath(60, 58, 44, 80, 0, 100)).toContain(' 1 1 ') // >180° 大弧
  })
})

describe('gaugeArcBetween 任意值区间弧（报警区段用，P2）', () => {
  it('区间起点 = v0 的值角（非 min 角）：4.5→5 段自 366° 到 390°，短弧标志 0', () => {
    // 起点 = gaugeAngle(4.5,0,5)=150+216=366°≡6°：cos6°·44≈43.76, sin6°·44≈4.60（锚 60,58）
    const seg = gaugeArcBetween(60, 58, 44, 4.5, 5, 0, 5)
    expect(seg).toMatch(/^M 103\.76 62\.60 A 44 44 0 0 1 /)
    // 终点 = 满量程角 390°≡30°：cos30°·44≈38.11, sin30°·44=22
    expect(seg).toMatch(/ 1 98\.11 80\.00$/)
  })
  it('跨大弧区间走 largeArc=1；整量程区间 = gaugeArcPath 满值形', () => {
    expect(gaugeArcBetween(60, 58, 44, 0, 5, 0, 5)).toContain(' 1 1 ')
    expect(gaugeArcBetween(60, 58, 44, 0, 5, 0, 5)).toBe(gaugeArcPath(60, 58, 44, 5, 0, 5))
  })
})

describe('thermoY 液面 y（规则：t=0 空→管底、t=1 满→管顶、脏数据回落管底）', () => {
  it('两端与中点', () => {
    expect(thermoY(0, 0, 100, 18, 118)).toBe(118)
    expect(thermoY(100, 0, 100, 18, 118)).toBe(18)
    expect(thermoY(50, 0, 100, 18, 118)).toBe(68)
  })
  it('越界钳位在管内', () => {
    expect(thermoY(999, 0, 100, 18, 118)).toBe(18)
    expect(thermoY('RUN', 0, 100, 18, 118)).toBe(118)
  })
})

describe('selectorAngle 三态旋钮（规则：0/1/2 → -45/0/45，非法回落 0 档）', () => {
  it.each([
    [0, -45], [1, 0], [2, 45],
    [5, 45], [-1, -45], ['x', -45], ['2', 45],
  ])('value %p → %p°', (v, deg) => {
    expect(selectorAngle(v)).toBe(deg)
  })
})
