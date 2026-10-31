// widgets-example/hello-card/dist.js —— 插件工件契约 v1（设计 §6.2）：
// - ESM、**无裸 import**（构建期检查）：依赖一律经宿主注入（host.vue / host.echarts）
// - 默认导出工厂 register(host)：host.registerSymbol(HmiSymbol) + host.registerComponent(name, comp)
// - 组件用 render 函数（h）书写——线上 vue 是 runtime-only 构建，无模板编译器
// - id 不得以 ah- 开头（上游内置图元命名空间，冲突 = registerConfig 静默覆盖）
export default function register(host) {
  const h = host.vue.h
  const defineComponent = host.vue.defineComponent

  // kebab id → PascalCase 全局组件名（宿主 resolveAsset 归一链的镜像，见 src/symbols/index.ts）
  const id = 'hello-card'
  const name = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase())

  const HelloCard = defineComponent({
    name,
    props: {
      text: { type: String, default: '' },
      // maotu vue 型图元会注入选中项与画布配置（本例不用，声明以避免落在 attrs）
      mtItemJson: { type: Object, default: null },
      mtCanvasCfg: { type: Object, default: null },
    },
    setup(props) {
      return () =>
        h('div', {
          class: 'hello-card', // 测试/定位锚点（e2e 与 plugin-loader 排障用）
          style: {
            width: '100%', height: '100%', boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px',
            background: 'linear-gradient(135deg, #1f3a5f 0%, #2b527a 100%)',
            border: '1px solid #3d6a99', borderRadius: '6px',
            color: '#e6f1ff', fontSize: '14px', fontFamily: 'inherit', overflow: 'hidden',
          },
        }, [
          h('span', {
            style: {
              flexShrink: 0, padding: '1px 6px', borderRadius: '4px',
              background: '#3d6a99', fontSize: '11px', lineHeight: '16px',
            },
          }, '插件'),
          h('span', { style: { whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' } }, props.text),
        ])
    },
  })

  host.registerSymbol({
    id,
    title: 'Hello 卡片',
    type: 'vue',
    thumbnail: '',
    props: {
      // fill(color) 是本仓图元约定（symbol-lint FILL_MISSING——绑 props.fill.val 的前提）
      fill: { title: '主题色', type: 'color', val: '#1f3a5f' },
      text: { title: '文本', type: 'input', val: 'Hello 插件' },
    },
    width: 160,
    height: 48,
  })
  host.registerComponent(name, HelloCard)
}
