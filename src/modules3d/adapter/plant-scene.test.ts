import { describe, it, expect } from 'vitest'
import { buildPlantScene, SUPPORTED_GEOMETRIES } from './plant-scene'
import { DEVICE_BY_ID, faceplateSlug, tagOf } from '../../screen-assets/iot-catalog'
import type { SceneBinding, SceneEventRule } from '../scene3d'

/**
 * 厂区 DEMO 生成器（iot-plant-3d）契约门禁。
 *
 * 这个场景是**数据**（落进 rs-iot 的 scenes 族），生成器一旦漂移，线上场景就会
 * 与仓库里的规格脱节——而数据漂移没有编译器兜着。故这里把「场景必须满足的
 * 结构不变量」钉死：bid 唯一、几何类型上游认得、绑定/事件指向真实对象、
 * 单位与 iot-catalog 一致（同一台设备的单位在 2D 画面与 3D 场景里不能各写一份）。
 */
const doc = buildPlantScene()
const objects = doc.objects as Array<{ id: string; bid: string; type: string; name: string; geometry: { type: string } }>
const bindings = doc.bindings as SceneBinding[]
const events = doc.events as SceneEventRule[]
const bids = new Set(objects.map((o) => o.bid))

describe('厂区 DEMO 场景生成器（v2）', () => {
  it('文档形态是 v2：$schema + objects + scene + 语义层', () => {
    expect(doc.$schema).toBe('agent-hmi.scene3d/1')
    expect(Array.isArray(doc.objects)).toBe(true)
    expect(doc.scene).toBeTruthy()
    expect(doc.scene?.lightingConfig).toBeTruthy()
    expect(doc.scene?.initialView).toBeTruthy()
    // v1 语义字段留空（运行页按 objects 是否存在分派 v1/v2）
    expect(doc.nodes).toHaveLength(0)
    expect(doc.links).toHaveLength(0)
  })

  it('对象数量合理且 bid 全局唯一（上游按 bid 建索引，重复会互相覆盖）', () => {
    expect(objects.length).toBeGreaterThan(50)
    expect(bids.size).toBe(objects.length)
    for (const o of objects) {
      expect(o.id).toBe(o.bid)
      expect(o.bid).toMatch(/^[a-z0-9_]+$/)
    }
  })

  it('只用上游 deserializeObject 认识的基础几何（否则该对象加载失败被丢弃）', () => {
    for (const o of objects) {
      expect(SUPPORTED_GEOMETRIES as readonly string[]).toContain(o.geometry.type)
      expect(o.type).toBe(o.geometry.type)
    }
  })

  it('10 台设备都在场景里，且各带多个独立子件（子件独立才能单独绑点位）', () => {
    for (const dev of Object.values(DEVICE_BY_ID)) {
      // 子件对象名 = 「位号 名称/子件名」，位号取自设备目录（WM-101 等）
      const owned = objects.filter((o) => o.name.startsWith(dev.pos))
      expect(owned.length, `设备 ${dev.devid}（${dev.pos}）应有子件对象`).toBeGreaterThanOrEqual(4)
    }
  })

  it('每条绑定都指向存在的对象（悬空绑定 = 实时值到不了设备）', () => {
    expect(bindings.length).toBeGreaterThanOrEqual(20)
    for (const b of bindings) {
      expect(bids.has(b.targetBid), `绑定 ${b.id} 指向不存在的 bid ${b.targetBid}`).toBe(true)
      expect(b.field).toContain('.')
      expect(b.devId).toBe(b.field.split('.')[0])
    }
  })

  it('每条事件的点击目标都存在，且都是「跳 2D 设备面板」', () => {
    expect(events.length).toBeGreaterThanOrEqual(Object.keys(DEVICE_BY_ID).length)
    for (const e of events) {
      const target = e.on.targetBid
      expect(target && bids.has(target), `事件 ${e.id} 目标不存在`).toBe(true)
      expect(e.do.type).toBe('navigate')
      if (e.do.type === 'navigate') {
        expect(e.do.slug).toMatch(/^iot-faceplate-/)
        expect(e.do.dev).toBeTruthy()
      }
    }
  })

  it('每台设备至少两个子件挂跳转规则（射线命中兄弟子件也能跳，不只主体件）', () => {
    for (const dev of Object.values(DEVICE_BY_ID)) {
      const short = dev.devid.replace(/^dev_/, '')
      const own = events.filter((e) => e.id.includes(short))
      expect(own.length, `设备 ${dev.devid} 的跳转规则太少`).toBeGreaterThanOrEqual(2)
    }
  })

  it('数值标签绑定的单位/精度与 iot-catalog 一致（2D 与 3D 不各写一份）', () => {
    for (const b of bindings.filter((x) => x.kind === 'label')) {
      const [devid, tag] = b.field.split('.')
      const meta = tagOf(devid, tag)
      const cfg = b.config as { unit?: string; precision?: number }
      expect(cfg.unit).toBe(meta.unit)
      expect(cfg.precision).toBe(meta.dec)
    }
  })

  it('点击事件的 2D 目标 slug 与 faceplateSlug 一致', () => {
    for (const e of events) {
      if (e.do.type !== 'navigate') continue
      expect(e.do.slug).toBe(faceplateSlug(e.do.dev as string))
    }
  })
})
