/**
 * 燃气表盘（P2-B custom-svg 注册项 4/4）：字轮累计气量窗 + 余额数显（<20 元橙色预警）
 * + 阀门状态标（开绿/关红）+ 泄漏报警灯（leak_alarm → 红闪，SMIL <animate> 条件渲染——
 * 模板内 <style> 被 vue SFC 编译器剥除（side-effect tag），SMIL 是 custom-svg 内声明式
 * 动画的唯一通路，组件单测 + e2e 双锁定，实测裁定已回填规范 §4.1.1）。
 * 数据面 home-meter-g1/g2：gas_total(m³)/balance(元 递减)/valve(bool 余额<10 关)/
 * leak_alarm(bool 偶发)。
 * - total/balance(number)：bind 直写；valve/leak(switch)：触发链 change_attr（成对收口）
 * - fill(color)：余额常态色（<20 恒橙色覆盖）
 * - ports：[]（显示仪表不接工艺线）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const THUMB = `<svg viewBox="0 0 120 94" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="12" width="80" height="20" rx="3" fill="#111418" stroke="#30363d"/>
  <rect x="9" y="14" width="12" height="16" fill="#f5f5f5"/><rect x="24" y="14" width="12" height="16" fill="#f5f5f5"/>
  <rect x="39" y="14" width="12" height="16" fill="#f5f5f5"/><rect x="54" y="14" width="12" height="16" fill="#f5f5f5"/>
  <rect x="69" y="14" width="12" height="16" fill="#a40e0e"/>
  <text x="8" y="52" font-size="10" fill="#8b949e">余额</text>
  <text x="72" y="54" text-anchor="end" font-size="14" fill="#e6b32a" font-family="monospace">88.88</text>
  <rect x="8" y="62" width="42" height="18" rx="4" fill="rgba(245,34,45,0.12)" stroke="#f5222d"/>
  <text x="29" y="75" text-anchor="middle" font-size="10" fill="#f5222d">阀·关</text>
  <circle cx="94" cy="71" r="7" fill="#f5222d"/>
</svg>`

export const gasMeter: HmiSymbol = {
  id: 'ah-gas-meter', title: '燃气表盘', type: 'custom-svg', thumbnail: svgThumbnail(THUMB, 'ah-gas-meter'),
  width: 180, height: 140,
  props: {
    fill: { title: '余额常态色', type: 'color', val: '#e6f7ff' },
    total: { title: '累计气量（m³）', type: 'number', val: 0 },
    balance: { title: '余额（元）', type: 'number', val: 0 },
    valve: { title: '阀门开（bool）', type: 'switch', val: false },
    leak: { title: '泄漏报警（bool）', type: 'switch', val: false },
  },
  ports: [],
}
