/**
 * 设备选择器（W11 vue 型注册项）：参数化画面的设备上下文切换入口——下拉列出
 * devices JSON（[{id,label}]），选中即 `$mtEventCallBack('dev','',devid)` → ViewView
 * 重写 @dev 前缀并重挂。value prop 可接 @meta.dev 直写回显当前设备。
 * - 100 台同型设备 = 一张 faceplate + 一个本图元（传统 HMI 设备上下文模式）
 * - ports：[]（非工艺图元）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const THUMB = `<svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="88" rx="6" fill="#0d1117" stroke="#30363d"/>
  <text x="10" y="20" font-size="10" fill="#8b949e">设备</text>
  <rect x="10" y="28" width="100" height="22" rx="4" fill="#161b22" stroke="#30363d"/>
  <text x="18" y="43" font-size="11" fill="#e6f7ff">1# 表 ▾</text>
  <rect x="10" y="58" width="100" height="22" rx="4" fill="#161b22" stroke="#30363d"/>
  <text x="18" y="73" font-size="11" fill="#e6f7ff">2# 表</text>
</svg>`

export const devSelector: HmiSymbol = {
  id: 'ah-dev-selector', title: '设备选择器', type: 'vue', thumbnail: svgThumbnail(THUMB, 'ah-dev-selector'),
  width: 220, height: 40,
  props: {
    fill: { title: '主题色', type: 'color', val: '#409eff' },
    devices: { title: '设备列表（JSON [{id,label}]）', type: 'textArea', val: '[{"id":"device-1","label":"1# 设备"}]' },
    value: { title: '当前设备（可接 @meta.dev 直写回显）', type: 'input', val: 'device-1' },
  },
  ports: [],
}
