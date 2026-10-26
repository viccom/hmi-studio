/**
 * 图元注册管道（T11 起正式化）：正式图元经 registry.ts 汇总注入左面板，
 * T12/T13 逐批扩充（新增只改 registry，不碰此文件）。
 * registerSymbols() 幂等：maotu registerConfig 同名标题为覆盖语义（覆盖 + info 提示，
 * F9），编辑器多次挂载不重复注册、不弹提示——已注册直接跳过。
 *
 * vue/custom-svg 型组件注册（批 B 起）：maotu 渲染经 bs(item.tag) 解析全局组件，而拖入
 * 建元实证 Vn.tag = 注册项 **id**（kebab，bundle 1094432）——Vue resolveAsset 的
 * kebab→camelize→capitalize 归一链使 PascalCase 全局注册名可被 kebab id 命中
 * （vueTagFor 即该归一的镜像实现，单测锁定 id↔名一一对应）。
 * 注册时机：main.ts createApp 后立即 registerSymbolComponents(app)——先于任何视图的
 * registerSymbols()（registerConfig 在 View/Edit onMounted 才跑），§4.1.4「先于 registerConfig」
 * 天然满足；宿主持有 app 实例（main.ts createApp），故由 main.ts 传入。
 */
import type { App, Component } from 'vue'
import { leftAsideStore } from 'maotu'
import { allSymbols } from './registry'
import AhDigitalDisplay from './AhDigitalDisplay.vue'
import AhGaugePressure from './AhGaugePressure.vue'
import AhThermometer from './AhThermometer.vue'
import AhStackLight from './AhStackLight.vue'
import AhPushButton from './AhPushButton.vue'
import AhSelectorSwitch from './AhSelectorSwitch.vue'
import AhTrendChart from './AhTrendChart.vue'
import AhPowerGauge from './AhPowerGauge.vue'
import AhMeterPanel from './AhMeterPanel.vue'
import AhWaterMeter from './AhWaterMeter.vue'
import AhGasMeter from './AhGasMeter.vue'
import AhDevSelector from './AhDevSelector.vue'

export const SYMBOL_GROUP = 'HMI 图元'

/** kebab id → PascalCase 组件名（Vue 全局解析归一的镜像，测试锁定 id↔名配对） */
export function vueTagFor(id: string): string {
  const camel = id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

/** vue/custom-svg 型图元组件表（键 = PascalCase 注册名 = vueTagFor(注册项 id)） */
export const VUE_SYMBOL_COMPONENTS: Record<string, Component> = {
  [vueTagFor('ah-digital-display')]: AhDigitalDisplay,
  [vueTagFor('ah-gauge-pressure')]: AhGaugePressure,
  [vueTagFor('ah-thermometer')]: AhThermometer,
  [vueTagFor('ah-stack-light')]: AhStackLight,
  [vueTagFor('ah-push-button')]: AhPushButton,
  [vueTagFor('ah-selector-switch')]: AhSelectorSwitch,
  [vueTagFor('ah-trend-chart')]: AhTrendChart,
  [vueTagFor('ah-power-gauge')]: AhPowerGauge,
  [vueTagFor('ah-meter-panel')]: AhMeterPanel,
  [vueTagFor('ah-water-meter')]: AhWaterMeter,
  [vueTagFor('ah-gas-meter')]: AhGasMeter,
  [vueTagFor('ah-dev-selector')]: AhDevSelector,
}

/** 全局组件注册（main.ts createApp 后调用一次；app.component 幂等覆盖） */
export function registerSymbolComponents(app: App): void {
  for (const [name, comp] of Object.entries(VUE_SYMBOL_COMPONENTS)) {
    app.component(name, comp)
  }
}

export function registerSymbols(): void {
  if (leftAsideStore.config.has(SYMBOL_GROUP)) return
  leftAsideStore.registerConfig(SYMBOL_GROUP, allSymbols())
}

// W9：跳转按钮目标画面下拉。options 存活于 nav-button.ts 模块态（注册项描述符引用同一数组），
// EditView 加载画面卡片后注入（flattenNavSections 分组树形视觉）；已注册场景由
// registerConfig 同名覆盖语义刷新（F9）。
export { setNavTargetOptions, upgradeNavTargets, flattenNavSections } from './nav-button'
export type { ScreenOpt } from './nav-button'
