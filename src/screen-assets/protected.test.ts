import { describe, expect, it } from 'vitest'
import { PROTECTED_SLUGS, isProtectedSlug, IOT_L1, IOT_WATER, IOT_POWER, IOT_GAS, IOT_ENV, IOT_BI_STATION, IOT_FACEPLATES, IOT_PLANT_3D, IOT_WORKSHOP_3D, IOT_ROBOT_HALL_3D, PROTECTED_SCENE_SLUGS, isProtectedSceneSlug } from './protected'
import { DEMO_A, DEMO_B, DEMO_CATALOG } from './demo-screen'
import { HOME_E, HOME_W, HOME_G } from './home-screens'
import { HOME_E_TABS, HOME_W_TABS, HOME_G_TABS } from './home-tab-screens'
import { HOME_E_FACEPLATE } from './home-faceplate-screen'
import { BI_STATION } from './bi-screen'

/** 长期资产 slug 权威源的防漂移锁定：条目 = 各生成器导出常量的恒等聚合，且无重复。 */
describe('PROTECTED_SLUGS', () => {
  it('covers all long-lived asset slugs by identity', () => {
    expect([...PROTECTED_SLUGS]).toEqual([
      DEMO_A, DEMO_B, DEMO_CATALOG,
      HOME_E, HOME_W, HOME_G,
      HOME_E_TABS, HOME_W_TABS, HOME_G_TABS,
      HOME_E_FACEPLATE, BI_STATION,
      IOT_L1, IOT_WATER, IOT_POWER, IOT_GAS, IOT_ENV, IOT_BI_STATION,
      ...IOT_FACEPLATES,
      IOT_PLANT_3D, IOT_WORKSHOP_3D, IOT_ROBOT_HALL_3D,
    ])
  })

  it('has no duplicates', () => {
    expect(new Set(PROTECTED_SLUGS).size).toBe(PROTECTED_SLUGS.length)
  })

  it('is non-empty and slug-shaped', () => {
    expect(PROTECTED_SLUGS.length).toBeGreaterThan(0)
    for (const s of PROTECTED_SLUGS) {
      expect(s).toMatch(/^[a-z0-9][a-z0-9-]*$/)
    }
  })

  it('isProtectedSlug matches members only', () => {
    expect(isProtectedSlug(DEMO_A)).toBe(true)
    expect(isProtectedSlug(BI_STATION)).toBe(true)
    expect(isProtectedSlug('e2e-t6-x')).toBe(false)
    expect(isProtectedSlug('')).toBe(false)
  })
})

/**
 * 3D 场景的资产保护（P0.5，2026-11-26）。
 *
 * 为什么单独一组：3D 场景存在**独立的 `scenes` 资源族**（不是 screens），
 * 删除闸按族校验——`isProtectedSlug` 只看 screens，拿它判 3D 会漏。
 * 既有缺陷：`iot-plant-3d` 此前根本没进任何保护清单，一次 e2e 清扫就能误删。
 */
describe('3D 场景资产保护', () => {
  it('长期 3D 场景在册（含既有 iot-plant-3d）', () => {
    expect(PROTECTED_SCENE_SLUGS).toContain(IOT_WORKSHOP_3D)
    expect(PROTECTED_SCENE_SLUGS).toContain(IOT_ROBOT_HALL_3D)
    expect(PROTECTED_SCENE_SLUGS).toContain('iot-plant-3d')
  })

  it('isProtectedSceneSlug 只匹配 3D 清单，不误伤 2D', () => {
    expect(isProtectedSceneSlug(IOT_WORKSHOP_3D)).toBe(true)
    expect(isProtectedSceneSlug('iot-plant-3d')).toBe(true)
    expect(isProtectedSceneSlug(IOT_L1)).toBe(false)   // 2D 画面不在 3D 清单
    expect(isProtectedSceneSlug('p0-edit-test')).toBe(false)
  })

  it('总表包含全部 3D 场景（删除闸只需问 slug，不必先判族）', () => {
    for (const s of PROTECTED_SCENE_SLUGS) {
      expect(isProtectedSlug(s)).toBe(true)
    }
    // 反向：3D 族是真子集（不能把 2D 画面混进 3D 清单）
    expect(PROTECTED_SCENE_SLUGS.length).toBeLessThan(PROTECTED_SLUGS.length)
  })
})
