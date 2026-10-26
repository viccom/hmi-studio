// 图元约定 lint（设计 §6 约定优于配置的机械化——破约定 = maotu 通路静默失效）。
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
  const fill = s.props?.fill
  if (!fill || fill.type !== 'color') errs.add('FILL_MISSING')
  for (const p of s.ports ?? []) {
    if (!PORT_POSITIONS.has(p.position)) errs.add('PORT_POSITION')
  }
  const whMissing = typeof s.width !== 'number' || typeof s.height !== 'number'
  if (s.type === 'svg') {
    const svg = s.svg ?? ''
    if (!svg || !/viewBox\s*=/.test(svg) || whMissing) errs.add('SVG_VIEWBOX')
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
