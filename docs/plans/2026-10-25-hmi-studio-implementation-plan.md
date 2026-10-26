# hmi-studio 实施方案（M1-M4）Implementation Plan

> **执行者注意**：本方案按任务逐条执行（配合 executing-plans 技能）。每任务 = 失败测试 → 最小实现 → 通过 → 提交。禁止跳过测试直接报"完成"。

**Goal**：基于 maotu 0.6.5 内核为 rs-iot 建成单 SPA 组态系统（编辑器 + 运行浏览器 + 数据/命令/告警三桥），以真实 rs-iot 实例验收。

**Architecture**：单 Vue SPA 由 gateway 挂 `/hmi` 与 rs-iot 同源；画面真相 = rs-iot `/api/v1/screens`（doc = `{name,group?,...IExportJson}`）；编辑器 `MtEdit`（deviceInfo 在线设备树），运行页 `MtPreview` + 页面骨架层；三桥（SSE 数据桥/命令桥/告警骨架）+ `$mtEventCallBack` 事件分发器实现容器内画面互跳。设计依据 `docs/plans/2026-10-25-hmi-studio-design.md`（v0.3，六决策锁定）。

**Tech Stack**：Vue3 + vue-router + element-plus + maotu@0.6.5 + @vueuse/core；vitest（纯逻辑单测）；@playwright/test（E2E，打真实 rs-iot）；vite。

---

## 0. 可行性基线（2026-10-25 全部实测核实）

| # | 事实 | 核实方式 |
|---|------|---------|
| F1 | 登录 `POST /api/v1/user/login` `{user_id,pass}` → `{status,token,user}`；admin/admin 有效；JWT 墙覆盖 `/api/v1/*` | curl 实测 |
| F2 | `GET /api/v1/devices` → 设备树（`{dev:{children:[{label,value(tag名),type}]}}`）；`GET /api/v1/tags` → 平铺 `{"rsiot.cpu_percent":{desc,...}}`；`GET /api/v1/rtdatas` → 嵌套 `{dev:{field:[ts,localTime,"value"]}}`，value 恒为字符串 | curl 实测 |
| F3 | SSE `GET /api/v1/rtdatas/subscribe?dev_id=a,b&interval=N&token=`；cell 同 F2 形态；ts 秒 | agent-hmi adapter + rs-iot 源码 |
| F4 | screens CRUD：`GET /screens`（`{screens:[id...]}` 包裹，T2 curl 实测修正）、`GET /screens/:id`→`{id,doc}`、`PUT /screens/:id`（全量，创建=PUT 新 id）、`DELETE` 幂等 | routes_meta.rs 实读 + T2 curl |
| F5 | maotu 绑定：`setDevicePointByID(bind_id,val)` 直写 bind_attr + 评估 triggers；`$mtEventCallBack(type,id,...args)`→`onEventCallBack` 透传；custom_code 有 window 访问 | hmi-studio probe 六项全过 |
| F6 | maotu 无原生画面跳转；事件动作 `changeAttr/customCode/eventFlow`；`ILeftAsideConfigItemPublic.events` 支持默认事件模板 | 0.6.5 bundle 全量 grep |
| F7 | 活数据可用：`rsiot.uptime_s`（单调增）、`rsiot.cpu_percent`、`rsiot.alarm_active`；命令 `POST /api/v1/command/send {instance,devid,cmd,data}` 需 `devid→inst_id` 解析 | curl + CommandReq 源码 |
| F8 | 环境：rs-iot 0.0.0.0:8790（pid 在跑）、gateway 0.0.0.0:18080、hmi-studio dev 5273 | ss 实测 |
| F9 | maotu registerConfig 同名标题为**覆盖语义**（覆盖 + info 提示）——重复挂载需自行防重（symbols/index.ts has() 守卫）；`IDeviceInfo` 未从包主入口导出（"./*" exports 映射 TS bundler 下命不中无扩展名 .d.ts），按 d.ts 结构本地定义 | T4 bundle 实读 + tsc 实测 |
| F10 | maotu 拖拽 = HTML5 DnD：左面板 `div[draggable=true]` dragstart 设 store intention → 画布 `#mtCanvasArea` dragover(preventDefault)/drop 建元；Playwright `dragTo()` 原生走通；保存按钮 `button .el-icon[title="保存"]`；图元节点 id=`{symbol_id}-{随机}`（重载后 img 渲染、拖入时内联 svg，断言以节点 id 为准） | T4 Playwright 实测（e2e m1 段3 路径资产） |
| F11 | SSE 实测（vs 任务书假设两处修正）：① 消息是**命名事件** `event: snapshot`（data=`{dev,points:{"dev.tag":[ts,localTime,"值串"]}}`）/ `event: datachange`（data=`{changes:{...},removed,ts}`）——`onmessage` 收不到，须 addEventListener；值一律字符串化 JSON（"0"/"true"），客户端 parseCell 归一化；`rsiot.uptime_s` 采集周期 ~5s（datachange 节奏）；② rs-iot 鉴权只认 Authorization/Cookie `token=`/X-Access-Key，**不认 `?token=` 查询参**（那是 agent-hmi gateway 约定）——EventSource 设不了 header → 走同源 Cookie（连接前 `document.cookie` 同步，vite proxy 转发即通） | T5 curl + routes_rtdata_subscribe.rs/auth.rs 源读 + m2 E2E 实证 |
| F12 | maotu 内置「系统组件·文字」图元：tag `text-vue`、type `vue`、保存态 props 为**平面值**（text/fill/fontFamily/fontSize/vertical）但**导入运行时归一化为描述符形 `props.text.val`**（bundle Jr 函数：注册表默认描述符 + `i[r].val = n.props[r]`）——bind_attr 必须指 `props.text.val`（指 `props.text` 会砸掉描述符 → 渲染空白）；bind triggers 为空时 `setDevicePointByID` 直写 bind_attr（vP 语义）；vue 图元渲染为**真实 DOM 文本**（`[id^="text-vue-"] .break-words`，非 img dataURI）——E2E 断言直接读 textContent；其余系统组件：sys-line×2/card-vue/now-time-vue/kv-vue/sys-button-vue（T7 命令按钮可复用 sys-button-vue） | T6 Playwright 拖拽实测 + bundle vP/Jr/Nl 实读 + BindProbe 直写验证 |
| F13 | devid→inst 解析源（T7 实测）：`GET /api/v1/devices` 每设备条目含 `owner_inst`（宿主实例 ID；多宿主逗号串取首段；无归属则缺字段）——rsiot 系统设备 `owner_inst:"self"`，`self` 实例在 `/api/v1/inst/roster` 中 running；命令实测 `POST /api/v1/command/send {instance:"self",devid:"rsiot",cmd:"write",data:'{"tag":"uptime_s","value":1}'}` → `{"status":"ok"}`（实例未跑是 **404** "instance not running"，非任务书假设的 500） | T7 curl 实测 + routes_device.rs/routes_command.rs 源读 |
| F14 | 告警三接口实测（T8）：① `GET /api/v1/alarms` → `[{key,level:'info'\|'warn'\|'error',source,message,ts(ISO8601),count}]` 按 ts 倒序、空表 `[]`、**无 query 参数**（无 status 过滤）；② SSE `GET /api/v1/events?types=alarm` → **命名事件** `alarm`（addEventListener），data `{kind:'alarm',action:'fire'\|'clear',key,level,source,message,ts}`——fire/clear 同变体靠 action 区分，keepalive 为 `:` 注释帧，Bearer/Cookie 均可鉴权；③ **无 confirm 路由**——人工清除是 `DELETE /api/v1/alarms?key=`（幂等 + 后端发 Clear 事件收敛多客户端）；④ 告警事件流与数据流**无法复用同一连接**：`/api/v1/rtdatas/subscribe` 仅 dev_id/tag/interval 参数（SubQuery 源读），是独立于 `/api/v1/events` 的另一端点——告警走第二条 EventSource | T8 curl 实测 + routes_alarm.rs/event_bus.rs/routes_events.rs/routes_rtdata_subscribe.rs 源读 |
| F15 | 事件回调监听拼写（T9 Vue 3.5 实测）：maotu `emit('onEventCallBack')` 按属性名 `onOnEventCallBack` **精确大小写**查找处理器——模板必须写 `@onEventCallBack`（编译为该键）；kebab 写法 `@on-event-callback` 编译为 `onOnEventCallback`（Back 的 b 小写），大小写失配**静默收不到事件**（src/dev/Probe.vue 旧监听即此失效写法，未改——研究资产）。另：custom_code 经 `new Function('$item_info','$args',code)` 编译并以图元信息实参调用（bundle L30329/L30333），`$item_info.id` 运行时可用，E2E 实证透传链路全通 | T9 编译产物对照 + jsdom 双键实证 + m2 段4 E2E |
| F16 | SVG 复合图元**文本注入不可行**（T11 实证，设计 §6 ❓ 关闭）：svg 图元渲染管线（bundle kf→hP→TP→Gf）为纯字符串拼接——kf 取 viewBox 把 config svg 子元素包成 `<symbol id>`，hP 拼 `<svg><symbol/><use xlink:href="#id" props…></svg>`，TP 把 props 序列化为 **use 元素属性**（` k="val"`），Gf 转 dataURI 后由 `<img>` 渲染——`{{text}}` 无任何展开时机，prop 值对 svg 内 `<text>` 像素零影响（Playwright 双值对照实证）→ **数值显示一律用内置文本图元**（props.text.val，F12）。附带：fill 写在 use 上靠 SVG 继承驱动子形状（像素实证）；自注册 svg 图元**保存态 props 同为平面值**、导入经 Jr 归一化回描述符（F12 语义推广到自绘图元）——bind_attr 一律指 `props.<name>.val` | T11 bundle kf/hP/TP/Gf 实读 + dataURI 双值像素对照 + 编辑器拖入实证 |
| F17 | 动画双路径（T11 实证）：① **子件旋转**（泵采用）= svg 内嵌 `<style>` 随 use 克隆进影子树生效（浏览器行为，Playwright 像素实证）+ 控制链 `use[animation="true"]{--ah-run:running}`（文档级样式可匹配 use 本身）→ 自定义属性**跨影子树继承** → 子件 `animation-play-state:var(--ah-run,paused)`；由 `animation`(switch) prop 驱动，绑 `props.animation.val` 直写启停（与 fill 同款通路，编辑器开关实测启停）；② **整件旋转** = maotu `common_animations {val:'rotate360', delay:'delay-0s', speed:'slow', repeat:'infinite'}`——`rotate360` 为 maotu 在 dist/style.css **自增的关键帧**（stock animate.css 无此类，style.css 已随 main.ts 引入），类拼在图元**包裹 div** 上（管口随整体转，泵弃用）；右面板「动画配置」抽屉（基础动画 tab→强调组）配置或 triggers changeAttr `common_animations.val` 运行时控（Nl 通用点路径 setter + 该 attr 在绑定可选列表内）；③ ports 仅 **leftTop/leftBottom/rightTop** 三锚位（bundle Cd 函数只处理三者）——设计原稿的 rightBottom **不存在**，静默落画布原点 {0,0}（lint PORT_POSITION 拦截，出口统一 rightTop） | T11 Playwright 编辑器/抽屉/done_json 保存实证 + bundle Cd/Nl/FP/Td 实读 |
| F18 | 液位连续值驱动路径（T12 实证）：use 元素属性**无法参与 CSS 计算**（attr() 跨浏览器不可用；maotu bind_mapping 是离散值映射非表达式，vP 无映射行匹配还会跳过写入）→ 可行链 = svg 内嵌 style「属性选择器枚举」`use[h="N"]{--ah-lvl:N/100}`（0..100 整数档）+ `use[h^="N."]` 前缀规则兜浮点（37.5→0.37 向下取整）→ 自定义属性**继承**进影子树 → `.ah-liquid{transform:scaleY(var(--ah-lvl,0));transform-box:fill-box;transform-origin:bottom}` 自底生长（height 是几何属性非样式，继承不可达——scaleY 而非 height 的原因）；越界/负数无规则命中回落 0（空罐）。/view 像素实证：罐 h=0/25/50/100 → 液色占比 0/11.7/22.5/44.9% 线性。**三个静默失败陷阱**（均已机械化拦/修）：① svg 内 XML 注释含 `--` → dataURI 按 XML 解析整图 parsererror 空白（lint 第五规则 SVG_COMMENT）；② 消费端必须是**类选择器** `.ah-liquid{}`（裸 `ah-liquid{` 是元素名选择器永不命中）；③ /view（MtPreview）渲染自绘图元同样查注册表——ViewView 漏调 registerSymbols() 则自绘图元静默空白（已修，与 EditView 同款幂等注册） | T12 Playwright /view 像素采样 + dataURI 解码对照 + 隔离文档二分定位 |
| F19 | 注册项默认值边界（T13 实证，**F6 落锤**）：① `events` **可以**随注册项带默认模板——registerConfig 展开保留 events 字段，拖拽建元 `events: Le.events ?? []` 且 `Le = vt(注册项)` 为 JSON 深拷贝（每实例独立、不污染注册默认），保存(ud)/导入(Jr) 原样保留——nav-button 默认跳转事件即此（拖入→保存→读 done_json 一字不差实证；/view 点击容器内跳转 __navCount=1、编辑画布点击仅选中）；② `common_animations` **不能**预设——registerConfig 对注册项无条件覆写为空默认 `{val:'',delay:'delay-0s',speed:'slow',repeat:'infinite'}`，电机整件旋转启用路径 = 右面板动画抽屉或 triggers changeAttr `common_animations.val`；③ 事件模板可用的 window 级全局：`$mtEventCallBack`/`$getItemAttrByID`/`$setItemAttrByID` 为 maotu 挂的**空后缀实例名**（`window["$getItemAttrByID"+suffix]`，suffix 默认 ""——多实例同页才加后缀）；`$getItemAttrByID(id,'props.x.val')` 经 yi 点路径解析器取实例属性 | T13 Playwright 拖入→保存→done_json 直读 + /view 跳转实证 + bundle registerConfig/vt/yi/3854321 window 赋值实读 |
| F20 | SSE 代理 mock **可行**（T15 实证，段2 选型落锤=路 A）：`page.route('**/rtdatas/subscribe*')` + `route.fulfill({contentType:'text/event-stream', body:'event: snapshot\ndata: {…}\n\n'})`——Chromium EventSource 对 fulfill 的**完整响应体照常逐帧解析派发**（open→snapshot→error 同毫秒，流完即断）；断流后 sse.ts 退避重连 ~1s 周期 → route 闭包内服务变量可切（95→20 双相验证）。断言链 = dataURI `<img>` src decode 读 use 属性（TP 序列化 `fill="…"`/`h="…"`，无需截图比色）。**陷阱**：snapshot 的 cell 必须是**真数组** `[ts,localTime,"值串"]`（F11 形状）——手拼 JSON 时把 cell 写成字符串会被 `JSON.stringify` 二次编码，`toPoint` 的 `Array.isArray` 拒收 → **静默无数据**（无 warn、无报错，onPoint 根本不触发——仅值牌/图元不动可察）；对照判别法：`window.$setItemAttrByID` 手写可见 + `__vue_app__` 树调 `setDevicePointByID` 可见 → 锁定解析层 | T15 段2 全绿 + 五轮 probe 实证（页内 ES 对照/EventSource 包装计时/vue 树手动调用/window 全局写入） |
| F21 | MtPreview 缩略图成本与兼容边界（T17 实证）：① `exportJson` prop **挂载即导入**（bundle Pe()：`n.exportJson ? v(n.exportJson) : w()`）——静态缩略免 setImportJson 命令式；② 多实例成本实测（CDP Performance.getMetrics，performance.memory 默认冻结不可用）：6 MtPreview 实例堆 28.6→39.6MB（**+11.0MB ≈1.8MB/例**），10 卡全列表懒挂载 ~2.3s——6 画面量级**直接真渲染**（降级方案仅留兼容守卫）；③ **兼容陷阱**：rs-iot 存量 agent-hmi 旧格式画面（`$schema: agent-hmi.screen/1`，无 json/canvasCfg）→ MtPreview mounted hook 抛 `TypeError (reading 'map')` 且**中断同批兄弟组件挂载**（实测 10 卡仅挂 1-3）——缩略图必须按 `{json:数组, canvasCfg}` 形状守卫，非 maotu 降级占位块+计数徽章；④ IO 贴边相切可能判不相交 → rootMargin 120px 预挂载缓冲 | T17 CDP 探针 + debug 三轮（vueuse IO 回调全到而 v-if 未渲染 → 锁定兄弟挂载中断） |
| F22 | gateway 部署契约（T18 gateway crate 实读 + curl/LAN e2e 实证）：三类路由——`/hmi` 静态（文件系统 serve + SPA fallback，**免 JWT**）、`/api/gw/login`（PUBLIC 纯转发 rs-iot 登录，**响应形状同体** {status,token,user}）、`/api/rsiot/*`（nest 剥前缀拼 rsiot_base——浏览器须调 `/api/rsiot/api/v1/*`）；层1 auth_middleware **只认 Bearer/?token= 不认 Cookie**——SSE 走 query token（forward 注入 Authorization 上游 + 从 URL 摘 token= 防日志泄漏，C1）；rs-iot 颁 JWT 网关直认（共享 jwt_secret）；**登录端点是 gateway 自有路径不进 /api/rsiot 前缀**（/api/rsiot/* 受层1 保护，登录前无 JWT——首版拼前缀 401 'missing or malformed token' 实证，auth 走 base='' 同源全路径）；token 进 query 前需 encodeURIComponent（JWT 点号安全但保持通用转义） | routes_gw.rs/auth.rs/proxy.rs/app.rs 源读 + curl 三链验证 + lan.spec 全绿 |
| F23 | maotu 深色主题语义（T16 实证）：style.css 深色规则全为**祖先选择器**（`.dark .el-button`、tailwind `.dark .dark\:bg-myDarkBgColor`）——`html.dark` 即可驱动 MtEdit/MtPreview 全量深色，无需各自接线；maotu 自带夜间按钮 = `useDark({selector:'#mt-edit'})` 只切编辑器自身 class（独立于 html），与全局双源分叉 → 传 `:use-theme-toggle="false"` 隐藏，主题单源 = html.dark（element-plus dark css-vars 同选择器） | bundle Hd/useDark + header-panel setup 实读 + e2e 编辑器无自带按钮/切换持久化 |

**风险与对策**：① ~~maotu SVG 复合图元内文本注入未验~~ **已关闭（F16：不可行，文本一律走内置文本图元）**；② SSE token 过期 → T5 重连时重登录换 token；③ ~~默认事件模板拖拽实例化未验~~ **已关闭（F19①：events 随注册项实例化，nav-button 实证）**；④ 画面规模 N+1 列表 → T17 并发上限 + 后续 rs-iot 轻端点。
| F24 | maotu 页签切换纯组态能力（W10 实证）：changeAttr 是通用深路径 setter（Nl：target_attr 按 `.` 分割），事件编辑器目标属性下拉原生含「隐藏(hide)/switch」+ 全部 props；渲染层 hide=true 整元素 v-if（编辑/预览同路径）；click 事件 change_attr 数组一次收口多目标；target_value 布尔走 JS 字面量、其余字符串包裹（bundle Md 实证）。**限制**：group children 的 binds 收不到 SSE 数据（Jr/G 只收顶层 + Nl 缺省不深查）——带数据面板页签切换必须平铺逐元素 hide（组合仅静态装饰）；changeAttr 可写 props.type.val 移动按钮激活色 | bundle Nl/Md/G/Jr 实读 + home-tab-screens 三屏 + w10 e2e（切换互斥/激活色/隐藏面板持续喂数） |
| F25 | ViewView 自适应缩放（W10）：MtPreview 无视口自适应（固定设计分辨率 + canvasCfg.scale + Ctrl 滚轮），宿主层补——wrapper `translate(-50%,-50%) scale(min(vw/dw, vh/dh))` + ResizeObserver，fit-scale.ts 纯函数；对 maotu 零改动，画面跳转自动跟随；data-fit 属性为 e2e 断言锚点（4K 放大铺满/640 缩小全可见） | fit-scale 4 用例 + w10 段2 三档视口实测 |
| F26 | 设备参数化（W11，传统 HMI faceplate 模式）：bind_id 前缀 `@dev.` 运行页重写为 `<devid>.<tag>`（一屏服务 N 台设备）；`@meta.dev` 宿主直推回显；`@` 前缀不进订阅面；切换 = 重映射 + setImportJson 重挂（趋势缓冲随重挂重置）+ resubscribe。词表新增 dev；深链 ?dev= 可寻址；**默认激活**（W11.1 用户反馈修正）：首次进入无 ?dev 即激活清单首台（meta.devs 权威源 → 回退画布首个选择器 JSON），默认设备写回 URL——不存在"显示了选择却没数据"的待选态。**坑**：ref 存取的 doc 是 reactive 代理，structuredClone 抛 DataCloneError → JSON 克隆；vue 型注册项 input prop 空串初值触发 jT #mt_slot 占位（运行态空串同样显现） | dev-context 4 用例 + w11 e2e（深链/按钮/选择器切换 + URL 同步 + 订阅收敛）+ 截图走查 |

## 1. 可验证目标（Definition of Done）

| 门 | 判据（全部可执行验证） |
|----|----------------------|
| **G-M1** | `npx playwright test e2e/m1.spec.ts` 绿：登录 → 新建 `e2e-m1` → 拖入图元保存 → 刷新后图元仍在（done_json 等价）；`curl GET /screens/e2e-m1` doc.json 非空含 name。单测：screens wrap/unwrap round-trip、deviceTree value=`<devid>.<tag>` |
| **G-M2** | `npx playwright test e2e/m2.spec.ts` 绿：运行页绑 `rsiot.uptime_s` 的文本 3s 内数值变化（读 DOM 文本两次不等）；命令按钮弹确认 → 下发 → rs-iot 返回 ok（route 拦截断言 payload `{instance,devid,cmd:'write'}`）；nav 图元点击 → URL 变 `/view/<目标>` 且 `window.__navCount` 递增（无整页刷新）；SSE 断链（route abort）→ 状态灯 offline → 恢复后 online。单测：parseCell/collectBinds/命令状态机/告警合并/事件词表全绿 |
| **G-M3** | `e2e/m3.spec.ts` 绿：演示画面 ≥12 图元渲染（DOM 计数）；`cpu_percent` 阈值触发变色（对比两次截图色值或 attr）；告警横幅随 active 告警存在性显隐；图元 lint 单测 100% 通过 |
| **G-M4** | `npm run build` 零错误；dist 交 gateway `/hmi` 后 `http://172.27.199.30:18080/hmi/` LAN 可达且登录可用（Playwright 对 gateway origin 跑 m1 冒烟）；断线重连 UX + 命令历史 + 缩略图在位 |

## 2. TDD 策略

- **纯逻辑单测（vitest，先行）**：所有可函数化的契约——doc 包装、设备树构建、bind 收集、cell 解析/归一化、SSE 重连序列、命令状态机、inst 解析、告警合并、事件词表/历史栈、图元约定 lint。这些是 TDD 的主战场：**测试先于实现**，每个纯函数模块 `src/lib/*.ts` 与 `src/lib/*.test.ts` 同目录。
- **组件装配（typecheck + 少量断言）**：Vue 页面不搞 jsdom 深测（maotu 渲染依赖真浏览器 SVG→img），靠 `vue-tsc --noEmit` + E2E 覆盖。
- **E2E（Playwright，里程碑门禁）**：chromium 打真实 rs-iot（`RSIOT_BASE` env，默认 `http://127.0.0.1:8790`）；数据用 F7 活点；命令用 route 拦截断言 payload；SSE 断链用 `page.route` abort。
- **提交纪律**：红→绿→commit 一循环；E2E 门绿才允许合入下一里程碑任务。

## 3. 任务跟踪清单（执行时勾选并填 commit）

| ID | 任务 | 里程碑 | 验证 | 状态 | commit |
|----|------|--------|------|------|--------|
| T0 | 工程基建：目录/路由壳/API client/测试基座 | M1 | `npm test` 基线绿 | ☑ | ce6ba1b..05c9e90 |
| T1 | auth composable + 登录页 + 路由守卫 | M1 | 单测 + E2E 登录段 | ☑ | 744d7d8..8128a5c |
| T2 | screens API 模块（wrap/unwrap/CRUD） | M1 | 单测 round-trip | ☑ | 14118a6 |
| T3 | 画面列表页（卡片墙+新建+删除） | M1 | E2E m1 列表段 | ☑ | 93b49b0 |
| T4 | 编辑页（MtEdit+deviceInfo+存取 round-trip） | M1 | G-M1 全绿 | ☑ | bb7d6d6..fc66435 |
| T5 | SSE 客户端（解析/归一化/重连/换 token） | M2 | 单测 | ☑ | 03d4a5c |
| T6 | collectBinds + 运行页分发桥 | M2 | 单测 + E2E 数据段 | ☑ | 30387f1..cae9e86 |
| T7 | 命令桥（状态机/inst 解析/编辑态守卫） | M2 | 单测 + E2E 命令段 | ☑ | a4bba48 |
| T8 | 告警骨架（双源合并/横幅/抽屉） | M2 | 单测 + E2E 显隐段 | ☑ | 12657e7 |
| T9 | 事件分发器（词表/历史栈/容器内跳转） | M2 | 单测 + G-M2 全绿 | ☑ | 596dc2d |
| T10 | M2 E2E 汇总门 | M2 | G-M2 | ☑ | d781928 |
| T11 | 图元基建：注册管道 + 约定 lint + 首个图元（泵）验证文本注入边界 | M3 | lint 单测 | ☑ | 3272be8..f11b125 |
| T12 | 图元批 1：阀×2/罐/液位计/流量计（fill 约定） | M3 | lint + 快照 | ☑ | 6d9e748 |
| T13 | 图元批 2：电机/隔离开关/nav-button（默认事件）/值牌 | M3 | 默认事件实证 | ☑ | fca500c |
| T14 | 水处理演示画面组态入库 | M3 | G-M3 | ☑ | 9402fd8 |
| T15 | M3 E2E 汇总门 | M3 | G-M3 | ☑ | 8a09876 |
| T16 | 主题(dark 默认)/状态栏/命令历史/断线 UX | M4 | E2E 断线段 | ☑ | d1d885d..376bfcc |
| T17 | 缩略图 + 列表性能（并发上限） | M4 | 画面列表 E2E | ☑ | 5f9eccb |
| T18 | build + gateway 部署 + LAN 验证 | M4 | G-M4 | ☑ | 4b6db13 |
| SY-A/B/C | 图元批量轮：svg 工艺 6（止回阀/球阀/安全阀/电磁阀/风机/搅拌器）+ vue/custom-svg 仪表操作 6（数显/压力表盘/温度计/三色灯/操作按钮/选择开关）+ 图元陈列室 catalog-demo + e2e/symbols.spec（21 类全渲染/SSE 读数/触发链） | W8 | lint 七规则 + 单测 82 + e2e symbols 3 段 | ☑ | 19ca106..（批C） |

**G-M2 达成 2026-10-25 · e2e 15/15**（数据段 uptime 双采样变化 / 命令段 payload 契约 {instance:'self',devid,cmd:'write'} / 跳转段 URL+`__navCount` 防刷新 / 断链段 offline→online；单测 65/65 含事件词表）

**G-M3 达成 2026-10-26 · 单测 122/122 + e2e 21/21**（m3 段1 计数 18 图元 = 10 自绘全覆盖 9 类 + 8 文本 ≥12 / 段2 阈值变色走 **SSE mock 路线成功**：route.fulfill 自制 text/event-stream → snapshot 真实派发 → cpu=95 泵 `fill="#f5222d"` + 罐 `h="95"` + 值牌，cpu=20 回绿收口（F20）/ 段3 横幅随 alarms 快照显隐 / 段4 互跳闭环 `__navCount`=2 + `$rsiot.back()` 弹栈 / 段5 rs-iot doc 保真 18 图元 + 触发链三元组入库；演示画面 water-demo-m3/-b 为长期资产不清扫）

**G-M4 达成 2026-10-26 · 单测 129/129 + e2e 32/32（含 lan 1）**（判据对照：`pnpm build` 零错误 ✓ 产物 dist 4.5MB 交 gateway `hmi_dist=/root/myprojects/webhmi/hmi-studio/dist` → `http://127.0.0.1:18080/hmi/` LAN 可达且登录可用 ✓（lan.spec：/hmi/ 守卫→/api/gw/login 真实登录→列表缩略真渲染→运行页 12+ 图元+状态灯 online 同源 ?token= SSE→互跳）/ 断线重连 UX ✓（m4：offline 状态条整条警示+恢复）+ 命令历史 ✓（m4：下发→计数→popover 四态）+ 缩略图 ✓（m4：真渲染+兼容守卫）；主题 dark 默认 + SSE 凭证失效探测登出链同批交付）

**T16-T18 执行回填**：① 主题单源 html.dark（F23：maotu 深色=祖先选择器即跟随；自带 toggle 传 use-theme-toggle=false 防双源）；② relogin 选型落地=**不存凭据**——sse.ts 连续 3 次失败 fetch 探测订阅 URL 401（EventSource error 无状态码）→ onState('auth-failed') 停止重连 → ViewView 走全局同款登出回 /login；③ 状态栏订阅点数 = collectBinds **去重 field 数**（demo A 8 bind 收敛 3——任务书「8 绑定点数=8」按 bind 条目数理解，实展示去重点数，e2e 断言 3）；④ 缩略图选型 = **MtPreview 真渲染**（F21② 成本实测可接受），降级占位仅针对 agent-hmi 旧格式兼容守卫（F21③：一卡抛错中断同批挂载的实测陷阱）；⑤ 并发 cap 6→4（screen-list 默认值 + 单测固化）；⑥ base '/hmi/' 仅 production mode（dev/test 维持 '/'——21 条既有 e2e 零改动全绿），部署寻址单源 endpoints.ts（F22：登录端点不进 /api/rsiot 前缀是首版 401 实测修正点）；⑦ gateway.toml 只改运行配置不入 git（.bak 备份留原地），dist 部署到主仓 /root/myprojects/webhmi/hmi-studio/dist（master 合并后以同脚本重建）

**W7 用户反馈轮（2026-10-26，编辑器可用性三项）**：

| 项 | 内容 | 验证 | commit |
|----|------|------|--------|
| W7-A | 编辑器顶部条功能化：画面切换器（loadScreenCards 复用，route watch + MtEdit `:key=slug` 重挂）+「+ 新建画面」/ 预览新窗（onPreviewClick 接线，router.resolve 保 base）/ 用户+登出 /「‹ 画面列表」 | e2e w7 段1-3 | c479a1f |
| W7-B | 右面板 tab 头常驻：**根因=maotu 内置 element-plus 把 el-tabs 渲染成 [content, header]**（tab 头在 DOM 底部）；flex+order:-1 重排到顶 + sticky top（滚动容器=el-aside 本体，实测） | e2e w7 段4（sticky + 滚到底钉顶 + 途中切 tab） | 6e31110 |
| W7-C | e2e/w7.spec.ts 4 例 + 全门（单测 129 / e2e 36 全绿）+ 部署重建（gateway /hmi/ 200，index 指纹 C3zWZb2D→DSpH7jGO，EditView css 含新规则） | 全门 + gateway 资产指纹 | aefd800 |

**W8 用户反馈轮（2026-10-26，绑定面板重做 + 画面分组）**：

| 项 | 内容 | 验证 | commit |
|----|------|------|--------|
| W8-A | 绑定面板重做（deviceBind 官方插槽整面板替换，d.ts 拼写为准）：BindPanel.vue（可搜索点位树=**fetchDeviceTreeRich 走 GET /api/v1/devreg** 设备 desc+点位 desc/unit 单点齐活 / 属性下拉 label=描述符 title+路径副文本（默认智能猜 fill→text）/ 绑定列表+删除 / 简易触发器（rule+changeAttr+change_attr 形状照抄 demo-screen trig()；custom_code 高级折叠直编））；**最大技术假设 E2E 落锤：插槽 item=store done_json[n] 响应式对象，直改 item.binds 即驱动 maotu onSaveClick 全量 PUT**（代价已交代：无 bind_mapping、不进 undo，面板底部小字注明） | e2e w8 段1（面板替换→搜索→绑 uptime_s→保存→GET doc binds 落库→/view 数值驱动）+ 段3（触发器 >50→fill=#ff4d4f 结构入库）；探针先行验证 | d7f30a0 |
| W8-B | 画面分组：ScreenListView 分区卡片墙（组头=组名+数量徽章，未分组区排最后，**组内/组名 zh 拼音序 localeCompare(x,'zh')**——root 码点序对中文不直觉，实测修正）；EditView 新建对话框补分组输入；切换器 el-option-group 两层（组名小字灰、popper 挂 body 须非 scoped 块）；两处新建核上抽 lib/screen-create.ts（探测+创建，结果态 ok/exists/failed）+ groupSections 分区器单源（screen-list.ts） | e2e w8 段2（新建带组→列表区头+徽章→切换器组内选项）；单测 groupSections 3 例 + createScreen 3 例 | 84a8db8 |
| W8-C | e2e/w8.spec.ts 3 段 + 全门（单测 225 / e2e 43 全绿）+ 部署（gateway /hmi/ 200，index 指纹 CmXtrtRF→CK1cSzNG，EditView chunk 含 BindPanel）；实证修正二则：element-plus `el-select-group__title` 与选项 `ul.el-select-group` 为 **兄弟节点**（子定位器取不到 title）；water-demo-m3 段1 **备份→变更→断言→原样回写**（长期资产不留痕） | 全门 + gateway 资产指纹 + rs-iot 清扫复查 | （本 commit） |

## 4. 任务详情

### T0 工程基建

**Files**: Create `src/lib/api.ts`、`src/router.ts`、`src/views/{LoginView,ScreenListView,EditView,ViewView}.vue`（空壳）、`src/pages/.gitkeep`；Modify `package.json`（+vitest,@playwright/test）、`src/main.ts`（挂 router + element-plus）；Create `playwright.config.ts`、`AGENTS.md`（仓库地图 ~30 行）；Move `src/probe.vue`→`src/dev/probe.vue`（研究资产归档位）。

**Step 1 失败测试** `src/lib/api.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, ApiError } from './api'

describe('api client', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })
  it('带 token 请求；401 抛 ApiError 并触发 onUnauthorized', async () => {
    localStorage.setItem('hmi_token', 'tok123')
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url.includes('/ok') ? new Response('{"a":1}')
        : new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const onUnauthorized = vi.fn()
    const client = api({ base: 'http://x', onUnauthorized })
    expect(await client.get('/ok')).toEqual({ a: 1 })
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer tok123' })
    await expect(client.get('/bad')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })
})
```

**Step 2** `npm test` → FAIL（api.ts 不存在）。**Step 3 最小实现** `src/lib/api.ts`：fetch 封装（base+JWT 头+非 2xx 抛 `ApiError{status,body}`+401 回调）、`npx vitest run` PASS。**Step 4** 路由壳四页 + main.ts 接线，`npm run dev` 手查 4 路由 200。**Step 5** `npm i -D vitest @playwright/test && npx playwright install chromium`；commit `feat: T0 工程基建——路由壳/api client/测试基座`。

### T1 auth + 登录页

**Files**: Create `src/lib/auth.ts`(+`.test.ts`)、`src/views/LoginView.vue`；Modify `src/router.ts`（守卫）。

测试先行（auth.ts）：`login()` 真形状 F1——POST `/api/v1/user/login` `{user_id,pass}` 存 token+user 到 localStorage；`logout()` 清空；`isAuthed()`。守卫：未登录访问非 /login → redirect /login。E2E（并入 m1.spec.ts 首段）：错误密码 401 提示；admin/admin 跳列表。commit `feat: T1 登录与路由守卫`。

### T2 screens API 模块

**Files**: Create `src/lib/screens.ts`(+`.test.ts`)。

**测试先行**（关键契约，全量代码）：

```ts
import { describe, it, expect } from 'vitest'
import { wrapDoc, unwrapDoc, blankScreen } from './screens'

it('wrap/unwrap round-trip：meta 与 done_json 同体，多余字段保留', () => {
  const done = { canvasCfg: { width: 800, height: 600 } } as any
  const doc = wrapDoc(done, { name: '取水1', group: '水处理' })
  expect(doc.name).toBe('取水1')
  const back = unwrapDoc(doc)
  expect(back.done.canvasCfg.width).toBe(800)
  expect(back.meta.name).toBe('取水1')
})
it('unwrap 容错：无 meta 的裸 done_json（历史/probe 数据）不炸', () => {
  expect(unwrapDoc({ canvasCfg: { width: 1 } } as any).meta.name).toBeUndefined()
})
it('blankScreen：800x600 深色画布 + 空 json 数组', () => {
  const d = blankScreen('test-1')
  expect(d.json).toEqual([])
  expect(d.canvasCfg.width).toBe(800)
})
```

实现 ≤40 行：`wrapDoc(done,meta)=>({...done,...meta})`、`unwrapDoc(doc)=>{done:剔除meta键, meta:{name,group}}`、`blankScreen(slug)`。再加 CRUD 薄封装（list/get/put/del 走 api client）。commit `feat: T2 screens 契约与 CRUD`。

### T3 画面列表页

**Files**: Create `src/views/ScreenListView.vue`、`src/lib/screen-list.ts`(+`.test.ts`)。

`loadScreenCards()`：GET ids → 并发上限 6（`Promise.all` 分批）GET 各 doc → `{id,name,group}`[]（并发分批器做成纯函数并单测批大小/顺序）。UI：el-card 网格；新建对话框（slug 校验 `^[a-z0-9-]+$` + 名称）→ PUT blankScreen；删除 el-popconfirm → DELETE → 刷新。E2E 断言：新建后卡片出现、删除后消失。commit `feat: T3 画面列表`。

### T4 编辑页（G-M1 主战场）

**Files**: Create `src/views/EditView.vue`、`src/lib/device-tree.ts`(+`.test.ts`)；Modify `src/App.vue`（改造为编辑容器或由 EditView 承载 MtEdit）。

**测试先行** `device-tree.test.ts`（F2 实测形状）：

```ts
it('devices+tags → maotu IDeviceInfo 级联，叶子 value=完整 field', () => {
  const devices = { rsiot: { children: [{ label: 'cpu_percent', type: 'float', value: 'cpu_percent' }] } }
  const tree = buildDeviceTree(devices as any)
  expect(tree).toEqual([{ label: 'rsiot', value: 'rsiot', children: [
    { label: 'cpu_percent', value: 'rsiot.cpu_percent' } ] }])
})
it('点位无 children（叶即点）与多余字段过滤', () => { /* ... */ })
```

EditView 装配：mount 时 `buildDeviceTree`（在线拉 devices，F5 在线原则）→ `MtEdit :deviceInfo` ；`onSaveClick` → `PUT /screens/:id`（wrapDoc）；进入时 GET → `setImportJson`。图元注册从 `App.vue` 现有 registerConfig 迁入 `src/symbols/index.ts`（先 4 个试验图元）。**G-M1 验收**：跑 `e2e/m1.spec.ts`（新建→拖图元→保存→reload→断言 done_json 等价，对比 `GET /screens/e2e-m1` 两次 doc.json 深等）。commit ×2（device-tree / EditView+G-M1 绿）。

### T5 SSE 客户端

**Files**: Create `src/lib/sse.ts`(+`.test.ts`)。

**测试先行**（全契约）：

```ts
it('parseCell：字符串值归一化——数字串→number，JSON 串→对象，状态串保持', () => {
  expect(parseCell('12.5')).toBe(12.5)
  expect(parseCell('"RUN"')).toBe('RUN')
  expect(parseCell('true')).toBe(true)
  expect(parseCell('{"a":1}')).toEqual({ a: 1 })
})
it('cell 行 [ts,localTime,value] → {field,value:归一化}', () => {
  expect(toPoint('rsiot.cpu_percent', [1792941675, '2026-10-25 23:21:15', '0'])).toEqual(
    { field: 'rsiot.cpu_percent', value: 0 })
})
it('backoff：1s,2s,4s...封顶 30s；成功后复位', () => {
  const b = backoff(); expect(b.next()).toBe(1000); expect(b.next()).toBe(2000)
  expect(b.next()).toBe(4000); b.reset(); expect(b.next()).toBe(1000)
})
```

实现：`createRtdataStream({base,token,getDevs,onPoint,onState})`——EventSource（`?dev_id=&interval=1000&token=`）、onmessage 逐行 JSON → `{dev:{field:cell}}` 展开 → toPoint → onPoint；onerror → backoff 重连，第 3 次起调 `relogin()` 换 token（F1）再试；onState('online'/'offline')。commit `feat: T5 SSE 客户端`。

### T6 collectBinds + 运行页分发桥

**Files**: Create `src/lib/binds.ts`(+`.test.ts`)、`src/views/ViewView.vue`。

`collectBinds(doneJson)`：递归 children，收集 `binds[].bind_id` 去重 → `{fields:string[], devs:string[]}`（dev=field 前段去重）。测试：多图元/嵌套 group/空。ViewView：`<MtPreview ref>` + mounted 订阅（devs）→ onPoint → `preview.setDevicePointByID(field, value)`；未命中字段（bind 集内有、流里长期无）计入 `deadFields` 供状态栏。E2E 数据段：绑 `rsiot.uptime_s` 文本图元，读 DOM 文本两次断言变化。commit ×2。

### T7 命令桥

**Files**: Create `src/lib/command.ts`(+`.test.ts`)、`src/lib/device-registry.ts`(+`.test.ts`)；Modify ViewView/EditView。

**测试先行**（状态机——agent-hmi CommandTracker 语义）：

```ts
it('pending→confirmed / →error / →timeout(5s) 单向迁移；终态不可再迁', () => {
  const t = new CommandTracker('c1'); expect(t.state).toBe('pending')
  t.confirm(); expect(t.state).toBe('confirmed')
  expect(() => t.error('x')).toThrow(/终态/)
})
it('resolveInstance：设备注册表 devid→inst_id；缺表抛 CommandError("未知设备")', () => { /* mock 表 */ })
it('buildCommandReq：{instance,devid,cmd:"write",data:JSON.stringify({tag,value})}', () => {
  expect(buildCommandReq({ inst: 'modbus-1', devid: 'pump1', tag: 'spd', value: 800 }))
    .toEqual({ instance: 'modbus-1', devid: 'pump1', cmd: 'write', data: '{"tag":"spd","value":800}' })
})
```

`window.$rsiot.send(devid,tag,value)`：ElMessageBox 确认（含 D6 编辑态双按钮「取消/真实下发」）→ POST → Tracker 更新 → ElMessage 结果 → 命令历史（环形 20 条）。E2E：route 拦截 `/command/send` 断言 payload。commit ×2。

### T8 告警骨架

**Files**: Create `src/lib/alarms.ts`(+`.test.ts`)、`src/components/AlarmBanner.vue`、`AlarmDrawer.vue`；Modify ViewView。

**测试先行**（双源合并——agent-hmi subscribeAlarms 语义移植）：

```ts
it('初始快照 + SSE 增量：同 id 去重（后到覆盖），按时间倒序，active 优先', () => {
  const s = new AlarmStore()
  s.applySnapshot([{ id: 'a1', level: 'warn', ts: 100, state: 'active' }])
  s.applyEvent({ id: 'a1', level: 'warn', ts: 105, state: 'active', text: 'x' })  // 覆盖
  s.applyEvent({ id: 'a2', level: 'crit', ts: 106, state: 'active' })
  expect(s.active().map(a => a.id)).toEqual(['a2', 'a1'])
})
it('confirm(id) 后从 active 剔除、入历史；轮播索引在 confirm 后收敛', () => { /* ... */ })
```

数据源：`GET /api/v1/alarms?status=active` + `/api/v1/events?types=alarm` SSE；横幅轮播 5s（`useIntervalFn`）；抽屉确认 ~~`POST /api/v1/alarms/.../confirm`~~ **T8 实测回填（F14）**：GET 无 query 参数；**无 confirm 路由**，抽屉「确认清除」= `DELETE /api/v1/alarms?key=`（后端发 Clear 事件收敛）；events SSE 为命名事件 `alarm`（action=fire/clear）；与数据流（`/rtdatas/subscribe`，无 types 参数）**无法复用连接**——第二条 EventSource。E2E：active>0 横幅可见 / =0 隐藏（route 拦截假数据，merge 逻辑单测覆盖）。

### T9 事件分发器 + 容器内跳转

**Files**: Create `src/lib/nav.ts`(+`.test.ts`)；Modify ViewView。

**测试先行**：

```ts
it('词表分发：nav(target)/back/home 命中；未知 type 落 onUnknown 并计数', () => {
  const h = vi.fn(); const d = createDispatcher({ onNav: h, onBack: vi.fn(), onHome: vi.fn() })
  d.dispatch(['nav', 'item-1', 'water-2']); expect(h).toHaveBeenCalledWith('water-2', 'item-1')
  expect(() => d.dispatch(['fly', 'x'])).not.toThrow()
})
it('历史栈：nav 压栈；back 弹栈返回；空栈 back 回 home；重复画面不压栈', () => { /* ... */ })
```

ViewView：`@onEventCallBack="(type,id,...rest)=>d.dispatch([type,id,...rest])"`；onNav → GET doc → `setImportJson` + `router.replace` + **SSE 重订**（先 close 旧流再按新 collectBinds 订阅）+ `window.__navCount++`（E2E 钩子）。`window.$rsiot.nav/back/home` 同源走 dispatcher。**G-M2 验收**：`e2e/m2.spec.ts` 全绿。commit ×2。

### T10 M2 E2E 汇总门

`e2e/m2.spec.ts` 整合 T6-T9 断言 + SSE 断链重连段（`page.route('**/rtdatas/subscribe*', route=>route.abort())` → 状态灯 offline → unroute → online）。跑绿后勾 G-M2。commit `test: T10 M2 门禁全绿`。

### T11 图元基建 + 首图元（泵）

**Files**: Create `src/symbols/{index.ts,types.ts,pump-centrifugal.ts}`、`src/lib/symbol-lint.ts`(+`.test.ts`)；Modify EditView/ViewView（注册管道接入）。

`symbol-lint`（约定优于配置的机械化——F 系约定）：

```ts
it('状态图元必含 fill 色属性；动画图元必含 animation；ports 仅 leftBottom/rightBottom；svg 含 viewBox 与宽高', () => {
  for (const s of allSymbols()) expect(lintSymbol(s)).toEqual([])
  expect(lintSymbol(brokenSymbol)).toContain('FILL_MISSING')  // 反例
})
```

泵图元：SVG 根属性 `fill` 驱动 + `animation`（CSS 类旋转，由 maotu common_animations 或 props 控制——T11 实证并固化写法）；**文本注入边界验证**：临时在 SVG 内放 `<text>{{text}}</text>` 型 prop，确认 maotu 是否展开——不展开则确认"数值一律用内置文本图元"约定并删除该 text prop。每图元 vitest 快照（ILeftAsideConfigItemPublic 结构 hash）。commit `feat: T11 图元基建+离心泵`。

**T11 执行回填**：lint 四规则落地为 FILL_MISSING/PORT_POSITION/SVG_VIEWBOX/PROP_SHAPE（PORT_POSITION 按 F17③ 修正为 maotu 三锚位——设计原稿 rightBottom 不存在）；registry.ts `allSymbols()` 为唯一事实源，registerSymbols 改注分组「HMI 图元」（4 试验图元退役）；两边界实证结论固化 **F16（文本注入不可行→内置文本图元）/F17（动画双路径：泵=子件 play-state 继承链 + animation(switch) prop；common_animations rotate360 可控但整件转）**，选型与机制注释固化 `src/symbols/types.ts`；泵快照基线 `src/symbols/__snapshots__/`。e2e m1 段3 随 registry 顺序同步（泵 nth(0)/组内 1 项）。

### T12-T13 图元批 1/2

T12（fill 约定族）：闸阀/蝶阀/罐/液位计/流量计——罐与液位计的"液位高度"用 `props.h.val` 绑连续值（probe 同款 bind_attr 直写路径，T11 固化的写法）。T13：电机（animation）/隔离开关（fill 二值）/**nav-button**（`target` prop + 默认 click 事件模板 `$mtEventCallBack('nav', $item_info.id, target)`——**F6 退路**：若拖拽不带事件，则注册后用 maotu setItemAttrByID 补挂，或文档指引手写一行）/值牌（内置文本图元包装预设）。每图元：lint + 快照 + 编辑器手查一次拖入。commit 各一批。

**T12 执行回填**：fill 族五图元入库（闸阀/蝶阀/罐/液位计/流量计）+ kit.ts 公共件（svgThumbnail data-ah-id 注入=E2E 定位锚 / levelCssRules / LIQUID_CSS）；lint 增第五规则 **SVG_COMMENT**（F18①）；ViewView 补 registerSymbols（F18③）；e2e m1 段3 改按 `img[src*="ah-xxx"]` + allSymbols 数断言（注册顺序不再耦合）；液位链路 /view 像素实证固化 **F18**。

**T13 执行回填**：电机（整件旋转 common_animations，F17② 首用）/隔离开关（fill 二值）/跳转按钮（target + 默认事件，**F6 落锤=F19①**，退路 (a) 生效无需文档兜底）入库，registry 9 图元；值牌按设计 §6 约定**不注册图元**——e2e/fixtures.ts 增 `valueTagItem`/`seedValueTag` 预设模板（内置文本 + props.text.val 直写 bind，T14 直接拼装）；nav-button **无 text prop**（F16：prop 对 svg `<text>` 像素零影响，按钮文案旁置内置文本图元——任务书 text prop 项按此偏离执行）；common_animations 注册默认值结论 **F19②**。

### T14-T15 演示画面 + M3 门

手工组态"水处理-取水泵房"画面入 rs-iot（≥12 图元、≥3 绑定、≥1 nav、≥1 命令按钮）；`e2e/m3.spec.ts`：图元计数、`cpu_percent` 阈值变色（断言 SVG 属性色值变化）、横幅显隐、容器内跳转。G-M3 勾选。commit ×2。

**T14/T15 执行回填**：组态源 = `src/lib/demo-screen.ts` `buildDemoScreen()` 纯函数（任务书原定放 e2e/fixtures——**偏离**：vitest include 仅 src/**，且演示画面是长期资产应收正式层；fixtures.ts 仅留 `seedDemoScreens()` PUT 播种）。A 画面 18 图元（9 类自绘 10 件 + 文本 8 件），无重叠/出界有单测防漂移 + 全量快照；阈值链 = bind 直写 fill + 双触发互斥收口（>80 红/<=80 绿——直写原值是无效色但同 tick 被触发覆盖）；B 画面 4 图元互跳闭环。段2 选型**路 A（SSE mock）成功**，降级判据（结构层三元组冻结于 demo-screen.test.ts + 段5 doc 保真）作双保险保留；命令按钮不在演示画面（m2 段2 已验证命令桥，演示复用其机制）——G-M3 原文未含命令按钮判据，不为此加图元。

### T16-T18 M4 打磨与部署

T16：dark 默认（`useThemeToggle` 初始 dark + element-plus dark CSS 变量对齐骨架层）、状态栏（在线灯/订阅点数/deadFields/命令历史抽屉）。T17：缩略图（列表卡片内 MtPreview 小尺寸 scale 渲染，懒加载 IntersectionObserver）+ 并发上限降到 4。T18：`npm run build` → dist 拷 gateway `hmi_dist` → 重启 gateway → LAN `http://172.27.199.30:18080/hmi/` 跑 m1 冒烟（Playwright 对 gateway origin）→ G-M4 勾选。commit ×3。

## 5. 执行纪律

1. **顺序**：T0→T18 串行（T12/T13 内部可并行批）；每个里程碑门（G-M1/M2/M3/M4）是硬闸门，绿了才进下一里程碑。
2. **跟踪**：每任务完成即更新 §3 表格（勾选 + 填 commit hash），与代码同 commit——本文件就是任务跟踪记录清单。
3. **TDD 红线**：纯逻辑模块测试必须先行（红→绿留痕）；E2E 是里程碑验收不是日常开发循环；`vue-tsc --noEmit` 每任务跑一次。
4. **不确定即停**：F 系事实若与实测不符（如 alarms confirm 路由），先 curl 核实、回填本方案对应行，再继续。
5. **worktree**：执行阶段开 `hmi-studio-w` worktree（≥3 commit/≥5 文件长任务），日常小修在 master。
