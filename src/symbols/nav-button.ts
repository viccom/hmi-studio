/**
 * 跳转按钮（T13 批 2，F6 落锤载体）：工业按钮造型（SVG 手绘斜面 bezel + 面板 + 右向箭头）。
 * - fill(color)：按钮面板色，靠 <use fill> 继承（types.ts ①），绑 props.fill.val 可做状态色
 * - target(select)：目标画面——options=画面列表（W9 反馈：slug 手输→面板下拉），
 *   EditView 加载画面后 setNavTargetOptions 注入 + upgradeNavTargets 升级存量实例
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

/** 目标画面下拉项（W9 反馈：slug 手输不友好 → 属性面板 select 型，options=画面列表） */
export interface ScreenOpt { value: string; label: string }

/** 组头哨兵前缀：maotu select 分支为扁平 el-option（bundle 实证，无 option-group），
 *  树形分组用「组头条目 + 子项缩进」视觉实现；哨兵值若被误选，运行时 nav 忽略 + 加载期清洗 */
export const NAV_GROUP_PREFIX = '__group__:'

/** 分区（group=undefined 即未分组，殿后）→ 扁平 options：组头 ▼ + 全角缩进子项 */
export function flattenNavSections(sections: { group?: string; cards: ScreenOpt[] }[]): ScreenOpt[] {
  const out: ScreenOpt[] = []
  for (const sec of sections) {
    const g = sec.group ?? '未分组'
    out.push({ value: `${NAV_GROUP_PREFIX}${g}`, label: `▼ ${g}` })
    for (const c of sec.cards) out.push({ value: c.value, label: `　　${c.label}` })
  }
  return out
}

/** 编辑器加载画面分区后注入（symbols/index.ts 委托）；空数组=面板显示空但 val 保留 */
let targetOptions: ScreenOpt[] = []
export function setNavTargetOptions(o: ScreenOpt[]): void {
  targetOptions = o
  navButton.props.target = { title: '目标画面', type: 'select', val: navButton.props.target?.val ?? '', options: o }
}

/**
 * 存量实例升级：拖入建元是注册项深拷贝（F6 实证），旧实例 target 仍是 input 型描述符——
 * 编辑器加载画面后对 done_json 内全部 nav-button 实例就地升级（val 保留，其余图元不动）。
 * 哨兵值（误选组头）清洗为空串。
 */
export function upgradeNavTargets(done: { json: Iterable<{ id?: unknown; props?: Record<string, unknown> }> }): void {
  for (const n of done.json) {
    if (typeof n.id !== 'string' || !n.id.startsWith('ah-nav-button')) continue
    const props = n.props
    if (!props || typeof props.target !== 'object' || props.target === null) continue
    const t = props.target as { title?: string; type?: string; val?: unknown }
    const val = typeof t.val === 'string' && t.val.startsWith(NAV_GROUP_PREFIX) ? '' : t.val
    props.target = { title: t.title ?? '目标画面', type: 'select', val: val ?? '', options: targetOptions }
  }
}

export const navButton: HmiSymbol = {
  id: 'ah-nav-button', title: '跳转按钮', type: 'svg', thumbnail: svgThumbnail(SVG, 'ah-nav-button'),
  svg: SVG, width: 48, height: 32,
  props: {
    fill: { title: '面板色', type: 'color', val: '#1677ff' },
    target: { title: '目标画面', type: 'select', val: '', options: [] },
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
