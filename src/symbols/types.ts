/**
 * 图元层类型与 T11 实证固化结论（证据见方案 F16/F17）：
 *
 * ① 渲染管线（bundle kf/hP/TP/Gf 实读）：registerConfig 对 svg 图元取 viewBox 建
 *    `<symbol id viewBox>`；运行时拼 `<svg><symbol/><use xlink:href="#id" props…/></svg>`
 *    转 dataURI `<img>`。props 经 TP 变为 **use 元素属性**（` k="val"`）——非 svg 根属性。
 *
 * ② 文本注入不可行（F16）：整条管线是纯字符串拼接，`{{text}}` 无任何展开时机；prop 值
 *    对 svg 内 <text> 无影响（像素实证）。→ 数值显示一律用内置文本图元（props.text.val，F12）。
 *
 * ③ 动画双路径（F17）：
 *    - 子件旋转（泵叶轮采用）：svg 内嵌 <style> 随 use 克隆进影子树生效（Playwright 像素实证）；
 *      控制链 = 文档级样式 `use[animation="true"]{--ah-run:running}`（可匹配 use 元素本身）
 *      → 自定义属性跨影子树**继承** → 子件 `animation-play-state:var(--ah-run,paused)`。
 *      由 animation(switch) prop 驱动：绑 props.animation.val 直写启停，与 fill 同款通路。
 *    - 整件旋转（备用，泵不用——管口随整体转）：maotu common_animations
 *      {val:'rotate360', delay:'delay-0s', speed:'slow', repeat:'infinite'}（maotu dist/style.css
 *      自带关键帧，已随 main.ts 引入）；右面板「动画配置」抽屉配置或 triggers changeAttr
 *      target common_animations.val 运行时控制（Nl 通用点路径）。
 *
 * ④ ports 仅 leftTop/leftBottom/rightTop 三锚位（bundle Cd 函数只处理三者）；
 *    设计原稿的 rightBottom 会静默落画布原点 {0,0}——禁止（lint PORT_POSITION 拦截）。
 *
 * ⑤ 保存态 props 为平面值（如 {"fill":"#52c41a"}），导入经 Jr 归一化回描述符形 props.fill.val
 *   （同 F12 内置文本图元）——bind_attr 一律指 `props.<name>.val`。
 *
 * ⑥ 连续值几何（T12 液位实证，罐/液位计采用）：props 只能成为 use **属性**，属性值无法参与
 *    CSS 计算（attr() 跨浏览器不可用；maotu bind_mapping 是离散值映射非表达式，vP 无映射行
 *    匹配还会**跳过写入**）→ 液位 h 用「属性选择器枚举」：svg 内嵌 style 生成
 *    use[h="N"]{--ah-lvl:N/100}（0..100）+ use[h^="N."] 前缀规则兜浮点（37.5→0.37 向下取整），
 *    液位矩形 transform:scaleY(var(--ah-lvl,0)) + transform-box:fill-box + origin:bottom
 *    （机制同 ③ 影子链；height 是几何属性非样式，不能靠 use 继承——scaleY 而非 height 的原因）。
 *    生成器见 kit.ts levelCssRules。
 *
 * ⑦ 注册项默认值边界（T13 实证，F6 落锤）：
 *    - events **可以**随注册项带默认模板：registerConfig 展开保留 events 字段，拖拽建元
 *      `events: Le.events ?? []` 且 Le 为 JSON 深拷贝（vt）——每实例独立、不污染注册默认；
 *      保存(ud)/导入(Jr) 均原样保留。nav-button 默认跳转事件即此。
 *    - common_animations **不能**预设：registerConfig 对注册项无条件覆写 common_animations 为
 *      空默认 {val:'',delay:'delay-0s',speed:'slow',repeat:'infinite'}——注册项带了也被砸。
 *      整件动画（如电机 rotate360）启用路径 = 右面板「动画配置」抽屉，或 triggers changeAttr
 *      target common_animations.val（运行时控制，F17②）。
 */
export type { ILeftAsideConfigItemPublic, IDoneJsonPort } from 'maotu'

/** 本仓图元定义（ILeftAsideConfigItemPublic 别名——注册表/管道统一引用） */
export type HmiSymbol = import('maotu').ILeftAsideConfigItemPublic
