// 图元约定 lint（设计 §6 约定优于配置的机械化——破约定 = maotu 通路静默失效）。
// 位置：symbols 层（2026-10-29 自 lib 迁入）——被测对象（图元注册表）在 symbols，
// lint 与被测对象同层，故不再需要 lib→symbols 反向豁免（architecture §2/§4.2 结清）。
// 规则与实证依据（maotu@0.6.5 bundle）：
// - FILL_MISSING：状态图元统一暴露 fill(color)——绑 props.fill.val + triggers 变色的前提
// - PORT_POSITION：ports 仅 leftTop/leftBottom/rightTop 三锚位（bundle Cd 函数只处理三者，
//   其余位置如设计原稿的 rightBottom 静默落画布原点 {0,0}——不可用）
// - SVG_VIEWBOX：**仅 svg 型**——registerConfig 的 kf() 据 viewBox 建 <symbol> 并取宽高；
//   宽高数字（拖入 binfo 初值）对所有类型有意义，svg 串只对 svg 型存在（vue/custom-svg
//   型渲染走动态组件，无 symbol 化——批 B 路线扩展时规则按类型收口）
// - SVG_COMMENT：svg 内 XML 注释含 "--"（如写 var(--ah-lvl) 释例）→ dataURI 按 XML 解析直接
//   parsererror，整图元静默空白（T12 罐实测）；<style> 文本里的 "--x" 合法不受此限
// - PROP_SHAPE：props 描述符缺 title/type/val 或 type 不在 maotu 九种内 → 右面板静默无控件
// - ANIM_CLASS（批 A 扩）：svg 型声明了 animation(switch) prop → 必须带影子链配对
//   （use[animation="true"] 文档级选择器 + animation-play-state: var(--ah-run 消费）——
//   缺任一半则动画静默不转（types.ts ③ 机制缺一环）
// - VUE_EMPTY_STR（批 B 扩）：vue/custom-svg 型 input prop 默认值禁止空串——jT 平面化实证
//   val === '' 被替换为 '#mt_slot' 占位串直达组件（bundle 960697）
import type { ILeftAsideConfigItemPublic } from 'maotu'

const PROP_TYPES = new Set(['input', 'color', 'select', 'switch', 'number', 'jsonEdit', 'textArea', 'animationEffects', 'animationSpeed'])
const PORT_POSITIONS = new Set(['leftTop', 'leftBottom', 'rightTop'])

export function lintSymbol(s: ILeftAsideConfigItemPublic): string[] {
  const errs = new Set<string>()
  // ID_MISSING（2026-10-31 审查修复）：id 是 loader 命名空间检查与拖入建元的唯一键——
  // 缺 id 曾让 `s.id.startsWith` 抛 TypeError，击穿单图元隔离（编辑器整页拒载）。
  if (typeof s?.id !== 'string' || !s.id) errs.add('ID_MISSING')
  const fill = s.props?.fill
  if (!fill || fill.type !== 'color') errs.add('FILL_MISSING')
  for (const p of s.ports ?? []) {
    if (!PORT_POSITIONS.has(p.position)) errs.add('PORT_POSITION')
  }
  const whMissing = typeof s.width !== 'number' || typeof s.height !== 'number'
  if (s.type === 'svg') {
    const svg = s.svg ?? ''
    if (!svg || !/viewBox\s*=/.test(svg) || whMissing) errs.add('SVG_VIEWBOX')
    // VIEWBOX_DIMS：viewBox 数值须与注册宽高一致（kf 取 viewBox 建 symbol——不一致 = 拖入几何错位）
    const vb = svg.match(/viewBox\s*=\s*"([^"]*)"/)
    if (vb && typeof s.width === 'number' && typeof s.height === 'number') {
      const n = vb[1].trim().split(/[\s,]+/).map(Number)
      if (n.length === 4 && n.slice(2).every(Number.isFinite) && (n[2] !== s.width || n[3] !== s.height)) errs.add('VIEWBOX_DIMS')
    }
    // SVG_XMLNS：dataURI 按 XML 解析，缺命名空间不保证跨浏览器渲染
    if (svg && !/xmlns\s*=/.test(svg)) errs.add('SVG_XMLNS')
    for (const c of svg.match(/<!--[\s\S]*?-->/g) ?? []) {
      // XML 注释体内不允许 "--"（定界符 <!-- 与 --> 除外）
      if (c.slice(4, -3).includes('--')) errs.add('SVG_COMMENT')
    }
    if (s.props?.animation && (!svg.includes('use[animation="true"]') || !svg.includes('animation-play-state: var(--ah-run'))) {
      errs.add('ANIM_CLASS')
    }
  } else if (whMissing) {
    errs.add('SVG_VIEWBOX') // 宽高数字（拖入初值）对全类型必要，沿用同码保持断言面稳定
  }
  // THUMB_ANCHOR：缩略图 dataURI 内 data-ah-id 与 id 同步（svgThumbnail 第二参手抄易漏——
  // E2E 定位锚 img[src*="ah-xxx"] 的前提）；非 dataURI/空 thumbnail 不覆盖
  if (typeof s.thumbnail === 'string' && s.thumbnail.startsWith('data:image/svg+xml')) {
    try {
      if (!decodeURIComponent(s.thumbnail).includes(`data-ah-id="${s.id}"`)) errs.add('THUMB_ANCHOR')
    } catch { errs.add('THUMB_ANCHOR') }
  }
  if (s.type === 'vue' || s.type === 'custom-svg') {
    for (const d of Object.values(s.props ?? {})) {
      if (d?.type === 'input' && d?.val === '') errs.add('VUE_EMPTY_STR')
    }
  }
  for (const d of Object.values(s.props ?? {})) {
    if (!d?.title || !PROP_TYPES.has(d?.type) || d?.val === undefined) errs.add('PROP_SHAPE')
  }
  return [...errs]
}
