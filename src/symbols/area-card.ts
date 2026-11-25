/**
 * 区域卡片（工业功能件 7/8，vue 型）：L1 全厂总览的核心件。
 *
 * 内容 = 区域名 + 通信质量 + 两个关键 KPI（值/单位）+ 活动报警计数（优先级色）。
 * 点击进 L2 由生成器在画布元素上挂 click 事件（`$mtEventCallBack('nav',…)`），
 * 组件本身不感知导航，保持可测试性。
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'
import { HP } from './hp-hmi'

const THUMB = `<svg viewBox="0 0 560 200" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="558" height="198" rx="6" fill="#ffffff" stroke="#8a939d"/>
  <rect x="18" y="16" width="92" height="10" rx="2" fill="#1f2328"/>
  <rect x="18" y="52" width="40" height="6" rx="2" fill="#5b6570"/>
  <rect x="18" y="66" width="90" height="26" rx="3" fill="#1f4e79"/>
  <rect x="150" y="52" width="40" height="6" rx="2" fill="#5b6570"/>
  <rect x="150" y="66" width="90" height="26" rx="3" fill="#1f4e79"/>
  <rect x="430" y="40" width="90" height="52" rx="3" fill="#fbc02d"/>
</svg>`

export const areaCard: HmiSymbol = {
  id: 'ah-area-card', title: '区域卡片', type: 'vue', thumbnail: svgThumbnail(THUMB, 'ah-area-card'),
  width: 560, height: 200,
  props: {
    fill: { title: 'KPI 数值色', type: 'color', val: HP.live },
    title: { title: '区域名', type: 'input', val: '水系统' },
    total: { title: '设备总数', type: 'number', val: 3 },
    alarms: { title: '活动报警数', type: 'number', val: 0 },
    prio: { title: '最高优先级（0 正常 / 1 P1 … 4 P4）', type: 'number', val: 0 },
    kpi1_label: { title: 'KPI1 标签', type: 'input', val: '总流量' },
    kpi1_value: { title: 'KPI1 数值', type: 'number', val: 0 },
    kpi1_unit: { title: 'KPI1 单位', type: 'input', val: 'm³/h' },
    kpi1_dec: { title: 'KPI1 小数位', type: 'number', val: 2 },
    kpi2_label: { title: 'KPI2 标签', type: 'input', val: '管网压力' },
    kpi2_value: { title: 'KPI2 数值', type: 'number', val: 0 },
    kpi2_unit: { title: 'KPI2 单位', type: 'input', val: 'MPa' },
    kpi2_dec: { title: 'KPI2 小数位', type: 'number', val: 2 },
    quality: { title: '质量（0 GOOD / 1 STALE / 2 BAD）', type: 'number', val: 0 },
  },
  ports: [],
}
