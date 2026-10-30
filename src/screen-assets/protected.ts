/**
 * 长期资产画面 slug 单一权威源（P1 前置，设计 §4.2）。
 *
 * 各画面生成器文件里的 slug 常量在此聚合 re-export——消费方（hmi-mcp 删除拒绝闸、
 * e2e 清扫守卫）只 import 本文件，不散落硬编码。**新增画面生成器必须在此登记**。
 * 任何测试不得删除这些画面（demo-screen/home-screens 等文件头同款约定）。
 */
import { DEMO_A, DEMO_B, DEMO_CATALOG } from './demo-screen'
import { HOME_E, HOME_W, HOME_G } from './home-screens'
import { HOME_E_TABS, HOME_W_TABS, HOME_G_TABS } from './home-tab-screens'
import { HOME_E_FACEPLATE } from './home-faceplate-screen'
import { BI_STATION } from './bi-screen'

export const PROTECTED_SLUGS = [
  DEMO_A, DEMO_B, DEMO_CATALOG,
  HOME_E, HOME_W, HOME_G,
  HOME_E_TABS, HOME_W_TABS, HOME_G_TABS,
  HOME_E_FACEPLATE, BI_STATION,
] as const

export type ProtectedSlug = (typeof PROTECTED_SLUGS)[number]

export function isProtectedSlug(slug: string): boolean {
  return (PROTECTED_SLUGS as readonly string[]).includes(slug)
}
