// 图元约定 lint（设计 §6 约定优于配置的机械化——破约定 = maotu 通路静默失效）。
// 规则与实证依据（maotu@0.6.5 bundle）：
// - FILL_MISSING：状态图元统一暴露 fill(color)——绑 props.fill.val + triggers 变色的前提
// - PORT_POSITION：ports 仅 leftTop/leftBottom/rightTop 三锚位（bundle Cd 函数只处理三者，
//   其余位置如设计原稿的 rightBottom 静默落画布原点 {0,0}——不可用）
// - SVG_VIEWBOX：registerConfig 的 kf() 据 viewBox 建 <symbol> 并取宽高；图元 width/height 是
//   拖入 binfo 初值，二者缺一即渲染/布局失真
// - SVG_COMMENT：svg 内 XML 注释含 "--"（如写 var(--ah-lvl) 释例）→ dataURI 按 XML 解析直接
//   parsererror，整图元静默空白（T12 罐实测）；<style> 文本里的 "--x" 合法不受此限
// - PROP_SHAPE：props 描述符缺 title/type/val 或 type 不在 maotu 九种内 → 右面板静默无控件
import type { ILeftAsideConfigItemPublic } from 'maotu'

const PROP_TYPES = new Set(['input', 'color', 'select', 'switch', 'number', 'jsonEdit', 'textArea', 'animationEffects', 'animationSpeed'])
const PORT_POSITIONS = new Set(['leftTop', 'leftBottom', 'rightTop'])

export function lintSymbol(s: ILeftAsideConfigItemPublic): string[] {
  const errs = new Set<string>()
  const fill = s.props?.fill
  if (!fill || fill.type !== 'color') errs.add('FILL_MISSING')
  for (const p of s.ports ?? []) {
    if (!PORT_POSITIONS.has(p.position)) errs.add('PORT_POSITION')
  }
  if (!s.svg || !/viewBox\s*=/.test(s.svg) || typeof s.width !== 'number' || typeof s.height !== 'number') {
    errs.add('SVG_VIEWBOX')
  }
  for (const c of s.svg?.match(/<!--[\s\S]*?-->/g) ?? []) {
    // XML 注释体内不允许 "--"（定界符 <!-- 与 --> 除外）
    if (c.slice(4, -3).includes('--')) errs.add('SVG_COMMENT')
  }
  for (const d of Object.values(s.props ?? {})) {
    if (!d?.title || !PROP_TYPES.has(d?.type) || d?.val === undefined) errs.add('PROP_SHAPE')
  }
  return [...errs]
}
