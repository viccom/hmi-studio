/**
 * 长期资产画面 slug 单一权威源（P1 前置，设计 §4.2）。
 *
 * 常量**定义**在本文件（零依赖纯 TS），各画面生成器 re-import 使用——方向是
 * 「生成器 ← protected」，不是反向聚合：hmi-mcp（mcp/tools）import 本文件时
 * 不得拖进生成器的 lib/symbols 依赖链（K6 方向翻转，2026-10-31）。
 * 消费方（hmi-mcp 的删除拒绝闸、e2e 清扫守卫）只 import 本文件。
 * **新增画面生成器必须在此登记**；任何测试不得删除这些画面。
 */
export const DEMO_A = 'water-demo-m3'
export const DEMO_B = 'water-demo-m3-b'
export const DEMO_CATALOG = 'catalog-demo'
export const HOME_E = 'home-meter-power'
export const HOME_W = 'home-meter-water'
export const HOME_G = 'home-meter-gas'
export const HOME_E_TABS = 'home-meter-power-tabs'
export const HOME_W_TABS = 'home-meter-water-tabs'
export const HOME_G_TABS = 'home-meter-gas-tabs'
export const HOME_E_FACEPLATE = 'home-meter-power-faceplate'
export const BI_STATION = 'bi-station'

// 工业 SCADA 画面集（2026-11-24，docs/plans/2026-11-24-iot-scada-screens-plan.md）
// L1 总览 / L2 四个单元 / L3 每台设备一张面板（每台限值不同，不共用参数化面板）
export const IOT_L1 = 'iot-plant-overview'
export const IOT_WATER = 'iot-unit-water'
export const IOT_POWER = 'iot-unit-power'
export const IOT_GAS = 'iot-unit-gas'
export const IOT_ENV = 'iot-unit-env'
/** 工业历史分析大屏（BI 分析层，深色大屏） */
export const IOT_BI_STATION = 'iot-bi-station'
export const IOT_FACEPLATES = [
  'iot-faceplate-wm1', 'iot-faceplate-wm2', 'iot-faceplate-wm3',
  'iot-faceplate-gm1', 'iot-faceplate-gm2',
  'iot-faceplate-em1', 'iot-faceplate-em2', 'iot-faceplate-em3',
  'iot-faceplate-env1', 'iot-faceplate-pt1',
] as const

export const PROTECTED_SLUGS = [
  DEMO_A, DEMO_B, DEMO_CATALOG,
  HOME_E, HOME_W, HOME_G,
  HOME_E_TABS, HOME_W_TABS, HOME_G_TABS,
  HOME_E_FACEPLATE, BI_STATION,
  IOT_L1, IOT_WATER, IOT_POWER, IOT_GAS, IOT_ENV, IOT_BI_STATION,
  ...IOT_FACEPLATES,
] as const

export type ProtectedSlug = (typeof PROTECTED_SLUGS)[number]

export function isProtectedSlug(slug: string): boolean {
  return (PROTECTED_SLUGS as readonly string[]).includes(slug)
}
