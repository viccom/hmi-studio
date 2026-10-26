import { describe, expect, it } from 'vitest'
import { computeFitScale } from './fit-scale'

// W10 自适应缩放：contain 数学——视口/设计分辨率取 min 比，画布完整可见（大屏 letterbox 居中）。
describe('computeFitScale', () => {
  it('视口宽高比更宽 → 受高约束', () => {
    // 1280x768 视口 vs 800x600 设计：min(1.6, 1.28) = 1.28
    expect(computeFitScale(800, 600, 1280, 768)).toBeCloseTo(1.28)
  })

  it('视口宽高比更窄 → 受宽约束', () => {
    // 640x480 视口 vs 800x600 设计：min(0.8, 0.8) = 0.8
    expect(computeFitScale(800, 600, 640, 480)).toBeCloseTo(0.8)
    // 500x768：min(0.625, 1.28) = 0.625
    expect(computeFitScale(800, 600, 500, 768)).toBeCloseTo(0.625)
  })

  it('视口大于设计 → 允许放大（大屏 4K 铺满）', () => {
    // 3840x2160 vs 1920x1080 → 2
    expect(computeFitScale(1920, 1080, 3840, 2160)).toBeCloseTo(2)
  })

  it('任意输入含 0/负数 → 回落 1（不缩放，防御 ResizeObserver 瞬时 0 尺寸）', () => {
    expect(computeFitScale(0, 600, 1280, 768)).toBe(1)
    expect(computeFitScale(800, 600, 0, 768)).toBe(1)
    expect(computeFitScale(800, -1, 1280, 768)).toBe(1)
  })
})
