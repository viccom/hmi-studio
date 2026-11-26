import { describe, it, expect } from 'vitest'
import {
  INDUSTRIAL_PARTS, partById, partCategories, buildPartSpecs, isIndustrialPart,
} from './industrial-parts'

/**
 * 工业图元库（P3）：把「一台设备」表达成**一组基础几何**（而不是一个新几何类型）。
 *
 * 为什么不用 makeDevice（modules3d/geometry.ts 的 three Group 工厂）：
 * 上游编辑器的持久化只认 `BoxGeometry/SphereGeometry/CylinderGeometry/...` 这几类
 * 参数化几何（deserializeObject 逐个 if 分支重建）。自定义 three 对象存不进文档。
 * 所以工业图元 = **spec 列表**：每台设备由若干「几何 + 变换 + 材质」子件组成，
 * 落库时每个子件是一条普通 objects 记录（有独立 bid → 可单独绑定点位）。
 */

describe('INDUSTRIAL_PARTS 注册表', () => {
  it('覆盖 iot-demo 的 5 类设备（水表/燃气表/电表/环境机/压力变送器）', () => {
    const ids = INDUSTRIAL_PARTS.map((p) => p.id)
    expect(ids).toEqual(expect.arrayContaining(['water-meter', 'gas-meter', 'power-meter', 'env-sensor', 'pressure-transmitter']))
  })

  it('每个图元有 id/名称/分类/子件，且分类是已知值', () => {
    const cats = new Set(partCategories())
    for (const p of INDUSTRIAL_PARTS) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/)
      expect(p.name.length).toBeGreaterThan(0)
      expect(cats.has(p.category)).toBe(true)
      expect(p.specs.length).toBeGreaterThan(0)
    }
  })

  it('id 唯一（重复会让物料库出现两个同名项）', () => {
    const ids = INDUSTRIAL_PARTS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('partById / isIndustrialPart', () => {
    expect(partById('water-meter')?.name).toContain('水表')
    expect(partById('nope')).toBeUndefined()
    expect(isIndustrialPart('water-meter')).toBe(true)
    expect(isIndustrialPart('Box')).toBe(false) // 上游基础几何不是工业图元
  })
})

describe('buildPartSpecs（图元 → 可落库的 objects 记录）', () => {
  const base = { origin: { x: 0, y: 0, z: 0 } }

  it('生成与子件等量的记录，每个有唯一 bid 与 name 前缀', () => {
    const part = partById('water-meter')!
    const recs = buildPartSpecs(part, { ...base, namePrefix: 'WM-101' })
    expect(recs).toHaveLength(part.specs.length)
    const bids = recs.map((r) => r.bid)
    expect(new Set(bids).size).toBe(bids.length) // bid 唯一
    for (const r of recs) {
      expect(r.name).toMatch(/^WM-101\//) // 便于场景树识别归属
      expect(r.type).toBeTruthy()
      expect(r.geometry?.type).toBeTruthy()
    }
  })

  it('origin 平移到放置点（拖到哪就在哪）', () => {
    const part = partById('pressure-transmitter')!
    const recs = buildPartSpecs(part, { origin: { x: 10, y: 0, z: -5 }, namePrefix: 'PT-501' })
    // 至少一个子件被整体平移（不校验具体哪个，避免绑定实现细节）
    expect(recs.some((r) => (r.position?.x ?? 0) >= 10)).toBe(true)
  })

  it('生成的记录能通过 3D 契约的形态要求（$schema 场景里可直接放 objects）', () => {
    const recs = buildPartSpecs(partById('power-meter')!, { ...base, namePrefix: 'EM-301' })
    for (const r of recs) {
      expect(typeof r.bid).toBe('string')
      expect(r.visible).toBe(true)
      expect(r.position).toMatchObject({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) })
      expect(r.rotation).toBeDefined()
      expect(r.scale).toBeDefined()
      expect(r.material).toMatchObject({ color: expect.any(Number) })
    }
  })

  it('同一图元两次生成 → bid 不同（避免两个实例抢同一 bid）', () => {
    const part = partById('water-meter')!
    const a = buildPartSpecs(part, { ...base, namePrefix: 'A' }).map((r) => r.bid)
    const b = buildPartSpecs(part, { ...base, namePrefix: 'B' }).map((r) => r.bid)
    expect(a.some((x) => b.includes(x))).toBe(false)
  })
})
