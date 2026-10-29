/**
 * BI 时间窗口切换器注册项（ah-bi-window）。
 *
 * 图元定位：分段按钮排——操作员点选后整屏 BI 面板切换统计窗（1时/24时/7天…），
 * 无需改画面/重播种。「默认」档 = 恢复各面板自己配置的 windowSecs。
 *
 * 机制（与其它 BI 图元的方向相反——它是**上行**控制）：
 * - 点击 → `window.dispatchEvent(new CustomEvent('ah-bi-window-change', {detail:{secs}}))`
 *   （DOM 全局事件，图元不 import 宿主、不碰 maotu API）
 * - 宿主 ViewView 监听该事件 → 收集器 windowOverride 生效 → 把生效档写回
 *   props.data.val（`{"activeSecs":86400}`，0=默认）供本组件高亮回显
 * - 状态权威在宿主：画面跳转后回显不漂；点击时本地乐观置位只是消 flicker
 *
 * tag 带 ah-bi- 前缀但无 series：宿主面板扫描收不到查询（零历史开销），
 * 由契约层的 collectBiWindowControls 单独收编。
 */
import { svgThumbnail } from './kit'
import type { HmiSymbol } from './types'

const THUMB = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="118" height="78" rx="4" fill="#161b22" stroke="#21262d"/>
  <rect x="10" y="28" width="30" height="24" rx="4" fill="#1c2128" stroke="#30363d"/>
  <text x="14" y="44" font-size="10" fill="#8b949e" font-family="monospace">默认</text>
  <rect x="44" y="28" width="30" height="24" rx="4" fill="#f5a623"/>
  <text x="48" y="44" font-size="10" fill="#0b0e14" font-family="monospace">1时</text>
  <rect x="78" y="28" width="34" height="24" rx="4" fill="#1c2128" stroke="#30363d"/>
  <text x="82" y="44" font-size="10" fill="#8b949e" font-family="monospace">24时</text>
</svg>`

export const biWindow: HmiSymbol = {
  id: 'ah-bi-window',
  title: 'BI 时间窗口切换器',
  type: 'vue',
  thumbnail: svgThumbnail(THUMB, 'ah-bi-window'),
  width: 320,
  height: 48,
  props: {
    fill: { title: '强调色（选中态底色）', type: 'color', val: '#f5a623' },
    title: { title: '面板标题（可空=不显示）', type: 'input', val: '统计窗口' },
    options: {
      title: '窗口档位（JSON，secs=0 表示恢复默认）',
      type: 'textArea',
      val: '[{"label":"默认","secs":0},{"label":"1时","secs":3600},{"label":"24时","secs":86400},{"label":"7天","secs":604800}]',
    },
    data: { title: '回显通道（宿主写入）', type: 'textArea', val: '[]' },
  },
  ports: [],
}
