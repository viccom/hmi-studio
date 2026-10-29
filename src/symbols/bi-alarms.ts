/**
 * BI 告警统计面板注册项（ah-bi-alarms）。
 *
 * 图元定位：活动告警快照的呈现统计——总数大读数 + 分级计数条 + 来源 Top + 最新告警列表。
 * **口径边界**：后端 /api/v1/alarms 只存当前活跃集（无历史），故本面板不做趋势/发生率，
 * 只统计「此刻挂着哪些告警」。
 *
 * 与其它 BI 图元的两处不同：
 * - **无 series prop**：不吃 /history 信封；宿主在 BI 采集拍里拉 GET /api/v1/alarms
 *   组装**告警信封**写回 props.data.val（收集器 fetchAlarms 注入）。
 * - **props.data 形状不同**：BiAlarmEnvelope（total/levels/sources/latest），
 *   组件用 bi-chart-kit 的 parseAlarmEnvelope 解析（与历史信封解析互斥）。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="4" fill="#161b22" stroke="#21262d"/>
  <text x="8" y="16" font-size="9" fill="#8b949e" font-family="monospace">告警</text>
  <circle cx="24" cy="34" r="9" fill="none" stroke="#f85149" stroke-width="2"/>
  <text x="18" y="39" font-size="11" fill="#f85149" font-family="monospace">3</text>
  <rect x="44" y="26" width="52" height="6" rx="2" fill="#f85149" opacity="0.85"/>
  <rect x="44" y="38" width="30" height="6" rx="2" fill="#f5a623" opacity="0.85"/>
  <rect x="44" y="50" width="16" height="6" rx="2" fill="#58a6ff" opacity="0.85"/>
  <rect x="12" y="64" width="96" height="1" fill="#21262d"/>
</svg>`

export const biAlarms: HmiSymbol = {
  id: 'ah-bi-alarms',
  title: 'BI 告警统计',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-alarms'),
  width: 360,
  height: 220,
  props: {
    fill: { title: '强调色（标题色条）', type: 'color', val: '#f85149' },
    title: { title: '面板标题', type: 'input', val: '活动告警' },
    maxRows: { title: '最新告警行数上限', type: 'number', val: 6 },
    data: { title: '数据通道（宿主写入）', type: 'textArea', val: '[]' },
  },
  ports: [],
}
