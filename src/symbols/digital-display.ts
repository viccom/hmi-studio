/**
 * 数显面板（批 B vue 型注册项）：label + 大号数字读数 + unit——真 DOM 文本（vue 型合法，
 * svg 型禁 text 的唯一绕行见规范 §4.2）。value 绑 bind 直写（props.value.val，SSE 数值经
 * parseCell 已是 number）；fill = 读数色（绑定/触发可变色）。
 * - type 'vue'：自由 DOM 布局（实时组件，无 SSR 串化）
 * - string prop 默认值一律非空（jT 实证：val === '' 会被替换为 '#mt_slot' 占位串）
 * - ports：[]（显示仪表不接工艺线）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const THUMB = `<svg viewBox="0 0 120 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="62" rx="6" fill="#0d1117" stroke="#30363d"/>
  <rect x="10" y="10" width="30" height="5" rx="2" fill="#8b949e"/>
  <rect x="10" y="24" width="98" height="24" rx="3" fill="none" stroke="#39d353" stroke-dasharray="4 2"/>
  <rect x="18" y="30" width="60" height="12" rx="2" fill="#39d353"/>
  <rect x="84" y="32" width="16" height="8" rx="2" fill="#8b949e"/>
</svg>`

export const digitalDisplay: HmiSymbol = {
  id: 'ah-digital-display', title: '数显面板', type: 'vue', thumbnail: svgThumbnail(THUMB, 'ah-digital-display'),
  width: 120, height: 64,
  props: {
    fill: { title: '读数色', type: 'color', val: '#39d353' },
    label: { title: '标签', type: 'input', val: '标签' },
    value: { title: '读数值', type: 'number', val: 0 },
    unit: { title: '单位', type: 'input', val: '℃' },
  },
  ports: [],
}
