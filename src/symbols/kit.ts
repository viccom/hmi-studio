/**
 * 图元公共构件（T12 起）：多图元共用的 svg 生成逻辑。
 * 机制依据见 types.ts ①③⑥——svg 必须自包含（dataURI <img> 渲染，外部 CSS/资源不可达）。
 */

/**
 * 左面板缩略图 = 图元 svg 本体转 dataURI（旧试验期 thumbnail:'' 在 maotu 下是空白 40px 方块）。
 * 注入 data-ah-id 兼作 E2E 定位锚（左面板图元无 DOM id、title 只在 hover 弹层内——
 * img[src*="ah-xxx"] 按 id 唯一定位，不随注册顺序漂移）。
 */
export function svgThumbnail(svg: string, id: string): string {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.replace('<svg ', `<svg data-ah-id="${id}" `))
}

/**
 * 液位高度驱动规则（types.ts ⑥，罐/液位计共用）：
 * props 经 TP 只能成为 use 元素**属性**，属性值无法参与 CSS 计算（attr() 跨浏览器不可用、
 * maotu bind_mapping 是离散值映射非表达式）——故按「属性选择器枚举」把 h(0-100) 映射到
 * 自定义属性 --ah-lvl（0..1），再由 .ah-liquid 的 scaleY(var(--ah-lvl,0)) 消费（同泵叶轮
 * 的影子树样式链路：symbol 内 <style> 在 dataURI 文档内为文档级，可匹配 use 兄弟节点）。
 * - 整数：use[h="N"]（N=0..100，1% 分辨率）
 * - 浮点兜底：use[h^="N."] 前缀规则（37.5 → 0.37，即向下取整到整数档）
 * - 越界/负数无规则命中 → var 回落 0（空罐）
 */
export function levelCssRules(attr = 'h', varName = 'ah-lvl'): string {
  const rules: string[] = []
  for (let n = 0; n <= 100; n++) rules.push(`use[${attr}="${n}"]{--${varName}:${(n / 100).toFixed(2)}}`)
  for (let n = 0; n <= 100; n++) rules.push(`use[${attr}^="${n}."]{--${varName}:${(n / 100).toFixed(2)}}`)
  return rules.join('')
}

/** 液位矩形消费端样式（scaleY 自底生长；height 是几何属性非样式，继承不可达——见 types.ts ⑥） */
export const LIQUID_CLASS = 'ah-liquid'
export const LIQUID_CSS = `.${LIQUID_CLASS}{transform:scaleY(var(--ah-lvl,0));transform-box:fill-box;transform-origin:bottom;}`
