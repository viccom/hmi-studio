/**
 * Playwright globalSetup（P2：长期资产播种的隐式顺序依赖修复）。
 * 此前只有 m3/w9/symbols/home-meters/w10/w11 各自 beforeAll 播种自家资产，而
 * lan/m4/w7/w8 直接消费 water-demo-m3*——文件并行无顺序保证，全新 rs-iot 上
 * 首轮必连锁红（开发机常驻残留掩盖了这一点）。globalSetup 在所有 worker 启动前
 * 完成全部长期资产播种（PUT 幂等，组态源=纯函数基线），冷启动与顺序问题一并消除。
 */
import {
  seedDemoScreens, seedCatalogDemo, seedHomeScreens, seedHomeTabScreens, seedFaceplateScreen,
  seedBiStationScreen,
} from './fixtures'

export default async function globalSetup(): Promise<void> {
  await seedDemoScreens()
  await seedCatalogDemo()
  await seedHomeScreens()
  await seedHomeTabScreens()
  await seedFaceplateScreen()
  await seedBiStationScreen()
}
