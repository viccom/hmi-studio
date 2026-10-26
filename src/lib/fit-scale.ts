/**
 * W10 自适应缩放（宿主层）：设计分辨率画布在任意视口等比 contain 缩放并居中。
 * 纯数学——ViewView 的 ResizeObserver 消费；设计尺寸来自画面 doc 的 canvasCfg。
 * 对 maotu 零改动：缩放施加在宿主 wrapper（translate 居中 + scale），MtPreview 内部保持 scale=1。
 */
export function computeFitScale(designW: number, designH: number, viewW: number, viewH: number): number {
  if (!(designW > 0) || !(designH > 0) || !(viewW > 0) || !(viewH > 0)) return 1
  return Math.min(viewW / designW, viewH / designH)
}
