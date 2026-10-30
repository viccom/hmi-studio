import { describe, expect, it } from 'vitest'
import { PROTECTED_SLUGS, isProtectedSlug } from './protected'
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
