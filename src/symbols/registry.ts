// 正式图元注册表（T11 起）：allSymbols() 是左面板注册与 lint 全量检查的唯一事实源。
// 新图元 = 一个 ts 文件 export ILeftAsideConfigItemPublic + 在此追加，经 lint 全绿即可注册。
// 【占位】泵为最小合法骨架，T11-B 由手绘版 src/symbols/pump-centrifugal.ts 替换。
import type { ILeftAsideConfigItemPublic } from 'maotu'

const placeholderPump: ILeftAsideConfigItemPublic = {
  id: 'ah-pump', title: '离心泵', type: 'svg', thumbnail: '',
  svg: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="20"/></svg>',
  width: 64, height: 64,
  props: { fill: { title: '主体色', type: 'color', val: '#52c41a' } },
  ports: [],
}

export function allSymbols(): ILeftAsideConfigItemPublic[] {
  return [placeholderPump]
}
