# maotu 图元开发规范与约束（v1.1）

> 适用：hmi-studio（maotu 0.6.5 npm 闭源版）。本文是图元开发的**唯一权威规范**——新图元不合规不合并。
> 依据：maotu bundle 机制实证 + 本仓 21 个在库图元实践（T11-T13 九类 + 图元批量轮 12 类）+ 用户学习样例（custom-svg/vue 路线）复核。
> 陷阱细节的实证编号（F11-F23）见 `docs/plans/2026-10-25-hmi-studio-implementation-plan.md` §0。
> v1.1 修订（图元批量轮实证）：§2.1 tag 字段实证修正 / §3.2 lint 七规则 / §4.1 custom-svg SSR 串化机制 / §2.2 jT '#mt_slot' 陷阱。

## 1. 三条图元路线与选型

| 路线 | type | 本质 | 能力边界 | 适用 |
|------|------|------|---------|------|
| **svg 型** | `'svg'` | 静态 SVG 串 → `<use>` 属性注入 → dataURI `<img>` | ✅ 高性能、可缩放、bind/triggers 全支持；❌ 无 `<text>`、无计算几何、无交互反馈 | 管道工艺形体（泵/阀/罐/电机…） |
| **custom-svg 型** | `'custom-svg'` | 全局注册 Vue 组件渲染 SVG（`tag`=组件名），外裹 fit 容器 | ✅ props 响应式、`<text>`/计算几何/`v-for` 全可用、v-model 回写 | 带读数/动态形变的仪表形体 |
| **vue 型** | `'vue'` | 任意 Vue 组件（HTML/SVG/echarts 均可），机制同上 | 同上 + 自由 DOM | 数字面板、趋势图、复杂操作面板 |

**选型决策树**：形体纯静态（状态=换色/旋转/液位）→ svg 型；需要**文字读数**或**指针/液柱等计算几何** → custom-svg 型；需要 HTML 布局或图表库 → vue 型。能用 svg 型就不用后两者（dataURI img 无 Vue 实例开销，画面数百图元时差距显著）。

**渲染机制差异（决定各自约束的根源）**：
- svg 型走 `kf→hP→TP→Gf` 管线：SVG 包 `<symbol>`、props 序列化为 `<use>` 属性、整体转 dataURI——因此 SVG 是**静态字符串模板**，任何需要运行时计算的东西都进不去。
- custom-svg/vue 型走动态组件：`jT(props)` 把描述符**平面化**（`{[name]: descriptor.val}`）后作为组件 props 传入，同时注入 `mt-item-json`（整个图元 json）与 `mt-canvas-cfg`；`onUpdate:modelValue` 把组件回写合并进 `props`。

## 2. 通用契约（三条路线共同遵守）

### 2.1 注册项形状

```ts
// src/symbols/<id>.ts 导出 ILeftAsideConfigItemPublic
{
  id: 'ah-<名称>-<变体>',        // 全局唯一，画布实例 id = `${id}-${n}`（E2E 依赖 [id^="ah-"] 前缀约定）
  title: '中文名',               // 左面板展示 + E2E 备用定位
  type: 'svg' | 'custom-svg' | 'vue',
  thumbnail: '<svg 串或 URL>',   // 统一走 kit.svgThumbnail（注入 data-ah-id，E2E 按 title 文本/锚定位）
  svg: '<svg>…</svg>',           // 仅 svg 型
  width: 64, height: 64,         // 拖入初始尺寸（px，= viewBox 比例）
  props: { /* 描述符表 */ },
  ports: [...],                  // 可选；工艺形体必须给（§2.4）
  events: [...],                 // 可选；默认事件模板（§2.5）
}
```

> **v1.1 实证修正（组件名解析链）**：`ILeftAsideConfigItemPublic` 接口**没有 tag 字段**（bundle
> store/types.d.ts），拖拽建元实证 `Vn.tag = Le.id`（bundle 1094432）——画布元素的 tag 是**注册项
> id（kebab）**，注册项即便手写 tag 也被忽略。vue/custom-svg 组件的全局注册名走 Vue
> resolveAsset 的 kebab→camelize→capitalize 归一链命中 **PascalCase 注册名**（如 id
> `ah-gauge-pressure` → 注册名 `AhGaugePressure`；镜像实现 `symbols/index.ts vueTagFor`，
> 配对有单测锁定）。注册：`main.ts` createApp 后 `registerSymbolComponents(app)`——宿主持
> app 实例处，且先于任何视图的 registerConfig（§4.1.4）。

### 2.2 props 描述符（绑定与属性面板的通用货币）

```ts
props: {
  fill:   { title: '主体色', type: 'color',  val: '#52c41a' },
  h:      { title: '液位%',  type: 'number', val: 50 },
  text:   { title: '文案',   type: 'input',  val: '标签' },
  unit:   { title: '单位',   type: 'select', val: '°C', options: [{value:'°C',label:'°C'}, …] },
  isOn:   { title: '状态',   type: 'switch', val: false },
  // options 另支持 { containerStyle: {...} }（number 控件外观，用户样例实证）
}
```

铁律：
- **bind_attr 一律写 `props.<name>.val`**（保存态是描述符表；svg 型经 TP 注入 use 属性，vue/custom-svg 型经 jT 平面化——两条管线都以 `.val` 为数据端点）。
- 描述符三键 `title/type/val` 必备（lint PROP_SHAPE 拦截）。
- 一个 prop 只承载一个语义；状态色统一叫 `fill`，动画开关统一叫 `animation`（组态员跨图元的肌肉记忆）。
- **vue/custom-svg 型 input prop 的 val 禁止空串**（v1.1：jT 实证 `val === ''` 被替换为占位串
  `'#mt_slot'` 直达组件，bundle 960697——lint VUE_EMPTY_STR 拦截；给真实默认值如 `'标签'`）。

### 2.3 绑定双通道（运行时语义，全路线一致）

`setDevicePointByID(bind_id, value)`：先把 value **直写** bind_attr（连续量：液位/温度/文本值），再顺序评估 `triggers`（离散规则，`change_attr` 覆盖直写结果）。**直写+触发并存时，最终态由最后一个命中的 trigger 决定**——泵的 fill 直写 cpu 原值是无效色，靠 `>80`/`<=80` 两条互斥触发收口，设计时就要成对给全。

### 2.4 ports

- **只支持 `leftTop | leftBottom | rightTop`**（0.6.5 bundle Cd 函数实证；`rightBottom` 静默落画布原点 {0,0}——lint PORT_POSITION 拦截）。
- 工艺形体：入口/出口各一个，偏移用 `%` 单位（随缩放稳定）。

### 2.5 事件（默认模板随注册项实例化）

`registerConfig` 的 events 字段会**深拷贝进每个拖入实例**（F6 实证：保存后 custom_code 与模板一字不差）。模板写法：

```ts
events: [{
  id: 'ev-nav', type: 'click', action: 'customCode',
  change_attr: [], event_flow_ids: [],
  custom_code: `$mtEventCallBack('nav', $item_info.id, $getItemAttrByID($item_info.id, 'props.target.val'))`,
  trigger_rule: {},
}]
```

可用全局函数（maotu 编译环境）：`$mtEventCallBack(type, id, ...args)`（→ 宿主 `onEventCallBack`）、`$getItemAttrByID(id, 'props.x.val')`、`$setItemAttrByID(id, attr, val)`、`$previewCompareVal(a, op, b)`。**宿主事件词表**：`nav/back/home/alarm`（cmd 不进词表，命令一律走 `$rsiot.send`）。

**宿主监听注意（F15）**：Vue 模板必须写 `@onEventCallBack`（驼峰）——kebab `@on-event-callback` 会编译成大小写失配的键，**静默收不到事件**。

## 3. svg 型规范（工艺形体）

### 3.1 SVG 书写规则

1. **必备骨架**：根 `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" width="W" height="H">`（无 viewBox/宽高 → lint SVG_VIEWBOX 拦截）。
2. **状态色走 fill 继承**：主体形体不写死 `fill`（或写 `fill="inherit"`），由 use 属性注入驱动子形状（像素实证）。局部固定色（高光/描边）可写死。
3. **动画走 play-state 继承链**（子件动效）：
   ```svg
   <style>
     use[animation="true"] { --ah-run: running; }
     .ah-rotor { animation: ah-spin 2s linear infinite; animation-play-state: var(--ah-run, paused); }
     @keyframes ah-spin { to { transform: rotate(360deg); } }
   </style>
   ```
   机制：`<style>` 随 use 克隆进影子树 + 自定义属性跨影子树继承 + 文档级 `use[animation]` 属性选择器。**transform-origin 需在类内写死**（如 `transform-origin: 32px 32px;` 或 `transform-box: fill-box`）。
   整件动效（泵体全转）可用 maotu `common_animations: rotate360`（其 style.css 自带关键帧），但该字段**不可经注册项预设**（bundle 实证覆写为空默认），只能组态时配或 triggers 控 `common_animations.val`。
4. **几何动态走 CSS 变量**（液位等）：`height` 是几何属性、属性注入够不着 → 用 `scaleY(var(--ah-lvl,0))` + `use[h="N"]` 枚举档位（整数档 + `h^="N."` 前缀兜浮点），消费端类 `.ah-liquid { transform-origin: …bottom; transform: scaleY(var(--ah-lvl,0)); }`。
5. **禁 `<text>`**（F16：像素实证零渲染——文本一律配内置文本图元）。
6. **SVG 注释里禁 `--`**（F18：`<!-- x--x -->` 致整个 dataURI 解析失败，图元静默空白——lint SVG_COMMENT 拦截）。
7. **无外部引用**：不引外部图片/字体/`url()`（dataURI 化后断链）；配色自包含（`var(--ah-*)` 在影子树不可达）。
8. 形状自底向上分层：底色形体 → 状态层（fill 继承）→ 高光/描边。深浅主题下都要可辨（在 800x600 深色画布自查）。

### 3.2 lint（合并硬门，`pnpm test` 内）

七规则（v1.1 五→七，且 SVG_VIEWBOX 按路线收口）：`FILL_MISSING`（缺 fill 语义）/ `PORT_POSITION`
（非法锚位）/ `SVG_VIEWBOX`（**仅 svg 型查 svg 串+viewBox；宽高数字全类型必查**）/ `SVG_COMMENT`
/ `PROP_SHAPE` / `ANIM_CLASS`（svg 型声明 animation prop 必配影子链两要素：`use[animation="true"]`
选择器 + `animation-play-state: var(--ah-run` 消费——缺任一动画静默不转）/ `VUE_EMPTY_STR`
（vue/custom-svg 型 input prop 空串默认值）。新图元全过 + 快照基线（`__snapshots__/`，改动即 diff 即审）。

## 4. custom-svg / vue 型规范（仪表与操作面）

### 4.1 组件契约

```vue
<!-- src/symbols/AhGaugePressure.vue：全局注册名 = vueTagFor(注册项 id)（PascalCase，见 §2.1 修正） -->
<script setup lang="ts">
defineProps<{
  // 属性面板每个 prop 平面化直达（jT 机制）——类型即约束
  value?: number          // 连续量（bind: props.value.val 直写）
  alarm?: boolean         // 离散量（triggers → props.alarm.val）
  unit?: string
  label?: string
}>()
</script>
<template>
  <svg …>… <text>允许真文本</text> …计算几何（指针角度/液柱高度）…</svg>
</template>
```

1. **props 与注册项描述符一一对应**（名字完全一致；组件侧 `defineProps` 给类型默认值，描述符给面板初值；配对有单测锁定——控制批 control-batch-b.test）。
2. `mt-item-json` 注入 prop 可读（id/binfo/全量 props），但**组件逻辑只依赖自己的具名 props**——保持可脱离 maotu 单测/预览。
3. 回写：v-model 型组件用 `update:modelValue`（bundle 实证回写合并进 props）——操作类图元（按钮/选择开关）可用；纯显示组件不要发 update。**仅 vue 型有效**（v1.1：custom-svg 包裹 M_ 不透传 onUpdate:modelValue）。
4. 注册链：`main.ts` createApp 后 `registerSymbolComponents(app)` 全局组件注册（**先于**任何视图的 registerConfig——拖入/渲染时 `bs(tag)` 解析全局组件，未注册渲染空白且无告警；§2.1 修正：解析名 = vueTagFor(id)）。
5. 缩略图：静态 svg 资产（kit 生成），与运行态视觉一致。
6. **成本自觉**：vue 型每实例一个活组件；custom-svg 每次props 变更一次 SSR 串化。同屏大量使用时优先 svg 型变体。

### 4.1.1 custom-svg 渲染机制（v1.1 实证，决定其约束面）

custom-svg 渲染 = 组件 vnode 经 **SSR renderToString**（bundle M_/$f，@vue/server-renderer 同构）
串成 svg 文本 → dataURI `<img>`；props 变更经 slot 深度 watch 触发**整图重串化**。因此：
- **样式必须全内联属性**（SFC `<style>` 块不进 SSR 输出——写了等于没写）；
- **无组件内交互**（DOM 事件在 img 上死掉）：按下反馈/点击循环等一律走 **vue 型**；
- **SSR 纯净**：组件不得碰 window/document/生命周期 mounted；
- `<text>` 合法（随串化保留）；props 响应式有效（重串化链）。
选型速记：显示+计算几何 → custom-svg；**交互/回写/自由 DOM → vue**。

### 4.2 何时必须用这条路线

- 有**文字读数**（数显/表盘刻度值/单位标签）——svg 型禁 text 的唯一合法绕行。
- 有**计算几何**（指针角度、非线性液柱、进度弧）。
- 需要**组件内交互状态机**（选择开关三态、按钮按下反馈）。
- 其余一律 svg 型。

## 5. 工作流 checklist（新图元全流程）

```
□ 选路线（§1 决策树）
□ 建文件 src/symbols/<id>.ts（svg 型）或 <Tag>.vue + <id>.ts（vue/custom-svg 型）
□ props 描述符对齐 §2.2 命名约定（fill/animation/text/…）
□ svg 型：§3.1 八条逐条自查；vue 型：§4.1 六条逐条自查
□ ports 给足（工艺形体），偏移用 %
□ 默认事件模板需要吗（nav-button 类）？§2.5 模板
□ registry.ts 注册（分组「HMI 图元」；vue 型同步全局组件注册）
□ lint 过 + 快照基线落库
□ 视觉走查：拖入编辑器（深色画布）+ /view 运行页各看一次
□ 有动态语义：绑一个真实点（或 SSE mock）验证直写/触发两通道
□ commit：feat(symbols): <id>——一句话能力描述
```

## 6. E2E 断言路径备查

| 类型 | DOM 形态 | 断言法 |
|------|---------|--------|
| svg 型 | `<img src="dataURI">`（保存后） | `decodeURIComponent(img.src)` 读 use 属性（fill/h/animation）|
| svg 型（拖入瞬间） | 内联 `<svg>` | 节点计数 `[id^="ah-"]` |
| vue/custom-svg 型 | 真实组件 DOM | 文本/子元素直接断言（text-vue 同款） |

## 7. 已知陷阱速查（全部实证过，勿踩）

| # | 陷阱 | 后果 | 对策 |
|---|------|------|------|
| 1 | svg 内 `<text>` | 渲染空白 | 文本走 vue 型或内置文本图元 |
| 2 | SVG 注释含 `--` | 整图解析失败静默空白 | 禁；lint 拦截 |
| 3 | `rightBottom` 锚位 | 连线落画布原点 | 只用三锚位 |
| 4 | bind_attr 写 `props.x`（漏 `.val`） | 砸掉描述符→渲染空白 | 一律 `props.x.val` |
| 5 | `@on-event-callback` kebab 监听 | 静默收不到事件 | `@onEventCallBack` |
| 6 | `var(--ah-*)` 引用宿主 CSS 变量 | dataURI 影子树不可达 | 配色自包含 |
| 7 | common_animations 注册预设 | 被覆写为空默认 | 组态配或 triggers 控 |
| 8 | fill 直写+单条触发并存 | 直写值成无效中间态 | 触发成对互斥收口 |
| 9 | vue 型组件未全局注册就拖入 | 静默空白 | 注册先于 registerConfig |
| 10 | 保存态 props 是平面值、导入态是描述符 | 混淆数据形状 | 始终以描述符表为编程面（F12） |
