/**
 * 跳转按钮（T13 批 2，F6 落锤载体）：工业按钮造型（SVG 手绘斜面 bezel + 面板 + 右向箭头）。
 * - fill(color)：按钮面板色，靠 <use fill> 继承（types.ts ①），绑 props.fill.val 可做状态色
 * - target(input)：目标画面 slug
 * - **默认 click 事件模板**（types.ts ⑦ 实证：registerConfig 展开保留 events，拖拽建元
 *   `events: Le.events ?? []` 且 Le 为深拷贝——每实例独立携带）：运行页点击即容器内跳转。
 *   custom_code 用 window 级 $mtEventCallBack/$getItemAttrByID（maotu 空后缀实例的全局名，
 *   bundle 3854321 处 window 赋值实证；yi 为点路径解析器，'props.target.val' 可达）
 * - **无 text prop**（F16 约束）：svg 内文本注入不可行（prop 对 <text> 像素零影响）——
 *   按钮文案用旁置内置文本图元（值牌同款约定）
 * - ports：[]（导航件不接工艺线）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const SVG = `<svg viewBox="0 0 48 32" xmlns="http://www.w3.org/2000/svg">
  <!-- 外 bezel（定色）+ 按钮面板（不写 fill 靠 use 属性继承状态色） -->
  <rect x="1.5" y="1.5" width="45" height="29" rx="5" fill="none" stroke="rgba(0,0,0,0.7)" stroke-width="3"/>
  <rect x="6" y="6" width="36" height="20" rx="3"/>
  <!-- 右向箭头（跳转语义，定色） -->
  <path d="M14 16 H31 M25 9.5 L33 16 L25 22.5" fill="none" stroke="rgba(0,0,0,0.65)" stroke-width="2.5"/>
</svg>`

export const NAV_EVENT_CODE =
  "$mtEventCallBack('nav', $item_info.id, $getItemAttrByID($item_info.id, 'props.target.val'));"

export const navButton: HmiSymbol = {
  id: 'ah-nav-button', title: '跳转按钮', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-nav-button'),
  svg: SVG, width: 48, height: 32,
  props: {
    fill: { title: '面板色', type: 'color', val: '#1677ff' },
    target: { title: '目标画面 slug', type: 'input', val: '' },
  },
  ports: [],
  events: [{
    id: 'ev-nav',
    type: 'click',
    action: 'customCode',
    change_attr: [],
    custom_code: NAV_EVENT_CODE,
    event_flow_ids: [],
    trigger_rule: {},
  }],
}
