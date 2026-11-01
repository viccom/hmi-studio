# HMI 图元与插件体系——分类与开发指南（v1.1）

> 定位：**面向 AI Agent 的自包含开发手册**——开发图元/插件/画面只需本文 + maotu 宪法，
> 不必回读 AGENTS.md。文档分工：
>
> | 主题 | 权威文档（本文不重复，只引用） |
> |---|---|
> | maotu 底层契约（三条图元路线、渲染管线、注册项逐字段、动画/SSR 陷阱） | **docs/maotu-symbol-development-guide.md**（图元开发宪法） |
> | 分层与依赖方向 | docs/architecture.md |
> | 工程规范与门禁总览 | docs/standards.md |
> | BI 大屏内容分区/数据映射/累计量口径 | docs/plans/2026-10-29-bi-monitoring-dashboard-design.md |
>
> 本文管：**分类总表、开发工作流、组合/符号/插件体系、画面数据契约**。
> 计数时点 **2026-10-31（master 040e148）**；id 权威源 = `src/symbols/groups.ts`（分组展示）
> 与 `src/symbols/registry.ts`（扁平全量）——本文表格是导览，漂移以代码为准。
> v1.1（2026-10-31）：吸收 AGENTS.md 图元域全部细节（hmi-mcp 工具面/运行配置、symbols-api、
> 保护清单登记纪律），新增 §0 快速上手——AGENTS.md 回归纯地图。

## 0. AI Agent 快速上手（先读这节）

按任务取节，改完跑门禁：

| 任务 | 读哪节 | 落点文件 |
|---|---|---|
| 加一个内置图元（`ah-*`） | §2 看邻居写法 + §3 工作流 | `src/symbols/<kebab>.ts`（+`Ah*.vue`）+ registry/groups/index 四处登记 |
| 写 / 装一个插件 | §5（契约 → 装载 → 降级 → §5.6 走查） | `widgets-example/<id>/` 源 → `scripts/install-plugin.mjs` 安装 |
| 建预组态画面 / 生成器 | §6（数据契约 + §6.4 保护纪律） | `src/screen-assets/<name>.ts` + **protected.ts 必登记** |
| 排查「图元变占位框」 | §5.4–5.5 | plugin-loader / plugin-fallback / `BUILTIN_TAGS` 漏枚举 |
| 查图元目录与绑定惯例 | §2，或运行时问 `hmi_describe_widget_kit` | 权威 = `src/symbols/groups.ts` |
| AI 改画面 | §6.1–6.2 + §6.4 保护闸 | hmi-mcp 写工具（if_version / 保护 slug 硬拒） |

**门禁速查**（e2e 需 rs-iot :8790 存活）：

```bash
just fe-quality                                  # 全套：typecheck + eslint + layers + 单测 + e2e + build
pnpm -C mcp run typecheck && pnpm -C mcp test    # 动了 mcp/ 或 src/symbols 单源引用面（mcp 相对 import 它们）
node scripts/check-layers.mjs                    # 分层方向（图元域常踩：lib 禁 import symbols）
```

**五条红线**（违反即 review 阻断，全文 docs/standards.md §5）：maotu 零改动；纯逻辑 TDD 先行；
实测不符即停（先核实回填文档再写码）；在线原则（不引入 mock 设备数据路径）；分层方向
（lib 禁 import symbols——新豁免必须登记 `scripts/check-layers.mjs` 并写明理由）。

## 1. 体系总览

### 1.1 图元的四个来源

| 来源 | id 形态 | 注册入口 | 存储 | 典型用途 |
|---|---|---|---|---|
| maotu 内核内置 | `text-vue` / `group` / `sys-button-vue` / `sys-line` / `sys-line-vertical` | maotu 包自带 | — | 文本、组合容器、按钮、管线 |
| 本仓编译期图元 | `ah-<kebab>` | `registerSymbols()` 按 6 组 `leftAsideStore.registerConfig`（`src/symbols/index.ts:111`） | 源码入库 | 常规组态（本文 §2） |
| 「我的符号」（reg-combin） | `sym-<uid>` | `registerMySymbols()`，组「我的符号」（`src/symbols/my-symbols.ts`） | rs-iot `/api/v1/symbols` | 站内复用一组**带绑定**的图元（§4） |
| 站点插件 | `<id>`（**禁 `ah-` 前缀**） | `loadPlugins()`，组「扩展图元（本站）」（`src/symbols/plugin-loader.ts`） | `widgets/`（gitignore；gateway `/hmi/widgets` 分发） | 跨仓分发**带代码**的图元（§5） |

清单唯一事实源：`src/symbols/builtin-tags.ts` `BUILTIN_TAGS`（内置 5）+ `groups.ts` `SYMBOL_GROUP_DEFS`
（编译期 47）+ 运行时登记（sym- / 插件，仅内存态）。

### 1.2 两条数据通道

- **直绑通道**：SSE rtdata（`src/lib/sse.ts`）→ `MtPreview.setDevicePointByID(field, value)` →
  命中图元 `binds[].bind_attr`（恒为 `props.<name>.val`）→ 属性写入；`triggers` 规则命中 →
  `changeAttr` 按点路径改其他图元属性（`src/lib/trigger-value.ts`）。
- **BI 通道 B**：宿主聚合收集器（`src/lib/bi-collector.ts`）扫顶层 `ah-bi-*` 图元 → 合并成少量
  `/history/batch` 往返 → 组装信封写回 `props.data.val`。**图元自身不发网络**；window/alarms
  两个特例不吃历史查询（§2.7）。

### 1.3 三条不变量（违反 = 通路静默失效）

1. `bind_id = <devid>.<tag>` 是唯一 field 格式（= maotu bind_id = SSE 订阅键）；`@dev.*` /
   `@meta.*` 前缀保留给参数化/宿主显示通道，`collectBinds` 不把它们放进订阅面（`src/lib/binds.ts:3-5`）。
2. `bind_attr` 恒为 `props.<name>.val`（BindPanel 与 hmi-mcp 校验同款正则，`mcp/src/tools/screens.ts:101`）。
3. BI 图元 `props.series` = 组态输入（JSON 串）、`props.data` = 运行态输出、**保存前复位 `'[]'`**
   （`src/lib/bi-sanitize.ts`——否则 maotu 拍平把运行态 JSON PUT 进文档，膨胀 128KiB 配额 + 陈旧首帧）。

## 2. 图元分类总表（编译期 47 + 内置 5，截至 2026-10-31）

type 分布：**svg 15 / custom-svg 6 / vue 26**。左面板分组 = `groups.ts` 顺序，`groups.test.ts`
冻结「全覆盖无重复」不变量（漏分组 = 编辑器里找不到，重复 = 两处维护）。
三条路线的选型决策树与渲染机制见 maotu 宪法 §1——一句话版：**纯静态形体 → svg 型；
要文字读数/计算几何 → custom-svg 型；要 HTML 布局/图表库 → vue 型；能用 svg 型就不用后两者**。

### 2.1 内置系统 tag（BUILTIN_TAGS，`builtin-tags.ts:13-19`）

`text-vue`（文本）/ `group`（组合容器）/ `sys-button-vue`（按钮）/ `sys-line`、`sys-line-vertical`
（管线）。语义属 maotu 内核；本仓把清单**单源化**供两处消费：前端 `plugin-fallback.ts knownTags()`
（未知 tag → 占位降级）与 hmi-mcp `validateScreenDoc`（未知 tag 语义预警）。**漏枚举 = 内置图元被
误降级成占位框**（w10 页签屏 `sys-button-vue` 实测，`builtin-tags.ts:10-11`）——新增 maotu tag
消费时先补这里。

### 2.2 过程设备（6，全 svg 型）

| id | 文件 | 说明 |
|---|---|---|
| `ah-pump` | pump-centrifugal.ts | 离心泵：叶轮旋转 + fill 状态色 |
| `ah-fan` | fan.ts | 风机：四叶叶轮旋转 |
| `ah-agitator` | agitator.ts | 搅拌器：十字桨叶旋转 |
| `ah-motor` | motor.ts | 电机：整件 rotate360 |
| `ah-tank` | tank.ts | 立式罐：液位 h(0-100) 经 `levelCssRules` scaleY 自底生长 |
| `ah-level-gauge` | level-gauge.ts | 液位计：窄管液位 + 刻度 |

### 2.3 阀门管件（7，全 svg 型）

| id | 文件 | 说明 |
|---|---|---|
| `ah-gate-valve` | gate-valve.ts | 闸阀：领结阀体 + 手轮 |
| `ah-butterfly-valve` | butterfly-valve.ts | 蝶阀：蝶板 + 阀杆 |
| `ah-check-valve` | check-valve.ts | 止回阀：单向箭头 |
| `ah-ball-valve` | ball-valve.ts | 球阀：open 驱动翼柄 90° |
| `ah-safety-valve` | safety-valve.ts | 安全阀：斜置弹簧角式 |
| `ah-solenoid-valve` | solenoid-valve.ts | 电磁阀：线圈方块电气标识 |
| `ah-flow-meter` | flow-meter.ts | 管线流量计 |

### 2.4 仪表计量（5，全 custom-svg 型；计算几何公用 `gauge-math.ts`）

| id | 文件 | 说明 |
|---|---|---|
| `ah-gauge-pressure` | gauge-pressure.ts | 压力表：指针角 = f(value,min,max) + 刻度弧 |
| `ah-thermometer` | thermometer.ts | 温度计：液柱计算几何 |
| `ah-water-meter` | water-meter.ts | 水表：机械字轮 + 瞬时小盘 + 逆流标记 |
| `ah-gas-meter` | gas-meter.ts | 气表：字轮 + 余额预警 + 阀标 + 泄漏红闪 |
| `ah-power-gauge` | power-gauge.ts | 功率盘：0~5kW 指针 + 红区 + pulse 灯 |

### 2.5 电气与操作（6：vue 4 + svg 1 + custom-svg 1）

| id | type | 文件 | 说明 |
|---|---|---|---|
| `ah-digital-display` | vue | digital-display.ts | label + 大号读数 + unit |
| `ah-meter-panel` | vue | meter-panel.ts | V/I/P/PF/Hz 五行数显面板 |
| `ah-push-button` | vue | push-button.ts | 按下反馈 + `$rsiot.send` 写命令模板 |
| `ah-selector-switch` | vue | selector-switch.ts | 三态旋钮 0/1/2（v-model 回写） |
| `ah-dis-switch` | svg | dis-switch.ts | 隔离开关：合/分闸二值 |
| `ah-stack-light` | custom-svg | stack-light.ts | 三色信号灯：三路独立 bool |

### 2.6 导航与趋势（3：svg 1 + vue 2）

| id | type | 文件 | 说明 |
|---|---|---|---|
| `ah-nav-button` | svg | nav-button.ts | 画面跳转：默认事件 `$mtEventCallBack('nav',…)`；目标下拉由 `setNavTargetOptions` 注入画面列表 |
| `ah-dev-selector` | vue | dev-selector.ts | 设备上下文切换：选中发 `('dev','',devid)`，运行页重写 `@dev` 前缀并重挂 |
| `ah-trend-chart` | vue | trend-chart.ts | echarts 折线 ×3 + 环形缓冲（`trend-buffer.ts` 纯函数） |

### 2.7 BI 数据图表（20，全 vue 型；底座 `src/symbols/bi-chart-kit.ts`）

**series 型 18**（吃通道 B 历史查询）：`ah-bi-kpi`（大数+sparkline）/ `trend`（折线/面积）/
`rank`（横向 TopN）/ `pie`（占比环）/ `stack`（百分比堆叠横条）/ `stack-area` / `bars`（分组柱）/
`heat`（星期×时段热力）/ `table`（自绘 KPI 表）/ `matrix`（设备×指标热点）/ `spike`（P90 尖峰
着色+阈值线）/ `gauge`（多 dial）/ `scatter`（X×Y 按 ts 配对）/ `radar`（<3 轴回落读数列表）/
`boxplot`（五数概括）/ `calendar`（日历热力）/ `progress`（单值进度+越限红显）/ `waterfall`
（透明基座+合计列）。

**特例 2**（不吃 series）：`ah-bi-alarms`（告警快照，走 `buildAlarmEnvelope` 告警信封）；
`ah-bi-window`（时间窗切换器，`collectBiWindowControls` + `BI_WINDOW_EVENT='ah-bi-window-change'`
DOM 事件，窗口状态权威在宿主收集器）。

组态输入契约：`props.series` 是 JSON 串 `[{dev_id,tag,label,unit,mode,color}]`，
`mode ∈ instant / daily / cumulative`（**累计量口径必须分段累加**，现场表计 24h 周期性复位——
详见 BI 设计文档 §1.4）。常量：单批 ≤32（`BI_MAX_BATCH`）、默认窗 3600s、series 兜底 ≤120 桶
（`src/lib/bi-contract.ts:28-34`）。**BI 图元必须平铺顶层，不得进组合**——组合内图元收不到
SSE 数据且 `setItemAttrByID` 只按顶层 id 定位（§4.1）。

### 2.8 横切机制（symbols 层公共件）

| 模块 | 职责 | 关键导出 |
|---|---|---|
| `kit.ts` | 缩略图/液位公共件 | `svgThumbnail`（dataURI + `data-ah-id` E2E 锚）、`levelCssRules`（`use[h=N]` 枚举 → `--ah-lvl` → scaleY）、`LIQUID_CSS` |
| `gauge-math.ts` | 仪表计算几何（240° 量程 150°→390°） | `gaugeAngle` / `gaugeArcPath` / `thermoY` / `selectorAngle` |
| `trend-buffer.ts` | AhTrendChart 数据面纯函数（环形缓冲/时间窗裁剪） | `pushPoint` / `trimWindow`（`TREND_MAX_SERIES=3`） |
| `bi-chart-kit.ts` | BI 渲染公共件（调色板/信封解析/echarts 主题/面板状态） | `BI_PALETTE` / `parseEnvelope` / `panelState` / `BI_THEME` / `niceMax` |
| `nav-button.ts` | 跳转按钮运行时 | `setNavTargetOptions` / `upgradeNavTargets`（存量实例升级 + 清 `__group__:` 哨兵） |

## 3. 新图元开发工作流

0. **选路线**：按 maotu 宪法 §1 决策树（静态 svg / custom-svg / vue）。
1. **建文件对**：`src/symbols/<kebab>.ts`（注册项定义）+ `src/symbols/Ah<Pascal>.vue`
   （仅 custom-svg/vue 型需要组件）。
2. **四处登记**（漏一处 = 面板找不到或渲染空白）：
   - `registry.ts` 扁平 `SYMBOLS` 数组（lint 与左面板的唯一事实源）；
   - `groups.ts` `SYMBOL_GROUP_DEFS` 对应组（展示层，`groups.test.ts` 会卡漏分组/重复）；
   - `index.ts` `VUE_SYMBOL_COMPONENTS`（custom-svg/vue 型：kebab id → PascalCase 组件映射，
     `vueTagFor` 是 Vue resolveAsset 归一链的镜像）；
   - 组件由 `main.ts` `registerSymbolComponents(app)` 全局注册（先于任何 registerConfig）。
3. **注册项契约**（逐字段细则 = maotu 宪法 §2）：

```ts
// src/symbols/<id>.ts —— ILeftAsideConfigItemPublic
{
  id: 'ah-<名称>-<变体>',   // 全局唯一 kebab；画布实例 id = `${id}-${n}`（E2E 依赖 [id^="ah-"]）
  title: '中文名',           // 左面板展示 + E2E 备用定位
  type: 'svg' | 'custom-svg' | 'vue',
  thumbnail: kit.svgThumbnail(svg, id),  // data-ah-id 必须与 id 同步（THUMB_ANCHOR）
  svg: '<svg xmlns=… viewBox="0 0 W H">…</svg>',  // 仅 svg 型
  width: W, height: H,       // = viewBox 数值（VIEWBOX_DIMS）
  props: { /* 描述符表：{title, type, val} */ },
  ports: [...],              // 工艺形体必须给；锚位仅 leftTop/leftBottom/rightTop
  events: [...],             // 可选默认事件模板
}
```

4. **过 lintSymbol**（`src/symbols/symbol-lint.ts`，11 个错误码——本仓图元由 vitest 全量循环
   卡门禁，插件在装载时过同款检查）：

| 码 | 查什么 | 违反后果（实证） |
|---|---|---|
| `ID_MISSING` | id 非空字符串 | 缺 id 曾让 `s.id.startsWith` TypeError 击穿单图元隔离 |
| `FILL_MISSING` | 必须暴露 `props.fill`（type=color） | 状态变色绑定的前提 |
| `PORT_POSITION` | 锚位 ∈ leftTop/leftBottom/rightTop | 其余位置静默落画布原点 |
| `SVG_VIEWBOX` | svg 型须有 viewBox+宽高；全类型须宽高数字 | symbol 化失败/拖入无初值 |
| `VIEWBOX_DIMS` | viewBox 宽高 = 注册宽高 | 拖入几何错位 |
| `SVG_XMLNS` | svg 须带 xmlns | dataURI 按 XML 解析不保证渲染 |
| `SVG_COMMENT` | XML 注释体禁 `--` | parsererror → 整图元空白（罐实测） |
| `ANIM_CLASS` | animation(switch) prop 须配影子链两半 | 动画静默不转 |
| `THUMB_ANCHOR` | 缩略图 data-ah-id = id | E2E 锚失效 |
| `VUE_EMPTY_STR` | vue/custom-svg 的 input prop 默认值禁空串 | `''` 被 maotu jT 换成 `'#mt_slot'` 占位串直达组件 |
| `PROP_SHAPE` | props 描述符须有 title、type ∈ 九种、val 非 undefined | 右面板静默无控件 |

   props `type` 九种白名单：`input / color / select / switch / number / jsonEdit / textArea /
   animationEffects / animationSpeed`。
5. **测试与 e2e**：`<kebab>.ts` 内的纯函数（几何/解析）配同名 `.test.ts`（TDD 红线）；e2e 锚
   三范式——画布实例 `#ah-pump-wdm3a-1 img`、左面板 `div[draggable="true"]:has(img[src*="ah-pump"])`
   （靠 `data-ah-id`）、内容断言 `toContainText`。
6. **验收清单**：`just fe-quality` 全绿；拖入/绑定/触发器在 e2e 有一例；id 在 groups.ts 唯一；
   BI 图元另查通道 B 契约（`props.data` 复位、平铺顶层）。

## 4. 组合与「我的符号」

### 4.1 持久组合（maotu 内置 Ctrl+G）

框选 → 组合产出 `type:'group'` 项；children 的 binfo 是**相对 group bbox 的 0-100 百分比**
（`src/dev/ProbeCombin.vue` 探针实证）。两条硬限制：

- **组合内图元收不到直绑数据**：宿主只收顶层 binds、不深查 children（`home-tab-screens.ts:10-11`
  实证注释）；`setItemAttrByID` 也只按顶层 id 定位。→ **BI 图元刻意平铺顶层**（`bi-screen.ts:39`）。
- 组合能力全赖 maotu 内置，本仓不自研 group；本仓侧只有 group → 符号模板（`buildSymbolDoc`）
  与保存时组合内 BI `props.data` 复位（`EditView.vue:142`）。

### 4.2 「我的符号」（reg-combin，P3a）

- **入口**：编辑器框选 → 组合（Ctrl+G）→ 绑定面板「存为符号」→ `buildSymbolDoc(item,name)`
  （仅接受 `type:'group'`，否则提示先组合）→ `symbols-api.put(id, doc, ifVersion)` 存
  rs-iot `/api/v1/symbols`（同名覆盖复用 id + 乐观锁）。
- **存储封装**：`src/lib/symbols-api.ts` REST 薄封装（rs-iot 第三资源族 MetaKind SYMBOLS；
  list / get / put 全量带 if_version）。
- **id 规则**：前缀 `sym-`（与编译期 `ah-` 族隔离；已带 `sym-` 不再叠加，`my-symbols.ts:65-71`）。
- **模板展开语义**：拖入画布 = children 提升为顶层**独立图元**（binds 原样保留、逐项可改），
  **不是持久组合**——组合内收不到数据的限制因此绕开。
- **刷新去重**：`registerMySymbols(docs)` 按 `` `${id}:${doc.name}:${version}` `` 签名去重
  （含 version 防同名更新漏刷）；内容未变跳过 registerConfig（防「已存在，已经将其配置覆盖」
  刷屏）；畸形文档（combin_json/name 缺失）逐条跳过不整组炸（`my-symbols.ts:82-103`）。
- BI 运行态复位在**存为符号时同步做**（`EditView.vue` onSaveSymbol → `sanitizeBiProps`）。

### 4.3 选型

| 需求 | 用什么 |
|---|---|
| 一次性布局归组 | Ctrl+G 持久组合（注意数据限制） |
| 站内复用一组带绑定的图元 | 「我的符号」（存 rs-iot，模板展开） |
| 跨仓分发、需要代码逻辑/第三方库 | 插件（§5） |
| 平台长期内置图元 | 编译期 `ah-*` 图元（§3 工作流） |

## 5. 插件体系（P3b）

### 5.1 两级扩展

| | reg-combin「我的符号」 | 插件 |
|---|---|---|
| 本质 | 数据级：组合 JSON 模板 | 代码级：ESM 工厂注册图元+组件 |
| 载体 | rs-iot `/api/v1/symbols` | `widgets/<id>/{manifest.json,dist.js}` → gateway `/hmi/widgets` |
| 能力 | 复用既有图元与绑定 | 可带 vue 组件/echarts 逻辑（宿主注入依赖） |
| 缺席后果 | 不注册（面板少一组） | 画面上已有实例 → 占位框降级，数据不丢（§5.5） |

### 5.2 工件契约

**manifest.json**（`scripts/install-plugin.mjs:39-68`）：`id` 合 `/^(?!ah-)[a-z][a-z0-9-]{0,63}$/`
（`ah-` 是上游保留命名空间——同名 registerConfig **静默覆盖**内置图元，双层拦截：安装 lint +
运行时 `plugin-loader.ts:119-124`）；`version` 合 semver `/^\d+\.\d+\.\d+$/`（参与 `?v=` bust 与
签名去重）；`entry` 默认 `dist.js`。**无签名校验**——信任边界是「进入 widgets/ 只能经安装器
显式动作」（人或 hmi-mcp，同一条命令）。

**dist.js**（`widgets-example/hello-card/dist.js` 为范本）：ESM、**默认导出工厂
`register(host)`**，`host = { vue, echarts, registerSymbol, registerComponent }`（`plugin-loader.ts:38-44`）。
- **禁裸 import、禁相对 import**：前者浏览器不解析裸说明符（依赖只能经 host 注入——同一 vue
  实例的 reactivity 不断链）；后者因为安装只复制 entry 单文件（src/ 仅留档），相对依赖装后必 404。
- 组件用 **render 函数（h）**书写——线上 vue 是 runtime-only 构建，无模板编译器。
- 图元组件可收 props + maotu 注入的 `mtItemJson`/`mtCanvasCfg`；`update:modelValue` 回写合并进
  props（v-model 通路）。

### 5.3 安装与分发

```bash
node scripts/install-plugin.mjs <source_dir>   # source_dir = manifest.json 所在目录
node scripts/install-plugin.mjs --remove <id>
node scripts/install-plugin.mjs --list         # HMI_WIDGETS_DIR 可覆盖目录
```

安装器守卫（全部实现在 `scripts/install-plugin.mjs`，纯函数有单测）：manifest/JSON 校验 →
**两次路径包含性**（读侧 entry 不能越出 source_dir、写侧不能越出 widgets/，`within` 含边界
比较）→ 静态/`export from`/动态 import 四正则扫**裸 import 与相对 import** → `parseIndex`
（**index 损坏 ≠ 空清单**：解析失败即退出，防下次写静默抹掉全部已装表项）→ `rm+mkdir` 重建
目录 → 复制 manifest + entry（`mkdirSync(dirname(destEntry))`）+ src/ 留档 →
`writeIndex` **tmp+rename 原子写**（id 去重覆盖、升序）。

分发：prod 由 gateway `hmi_widgets_dir` 挂 `/hmi/widgets`（**全量 no-cache**——插件非哈希名，
靠 entry URL 的 `?v=<version>` bust）；dev 由 vite 中间件把 `/widgets/*` 重写到仓库 `widgets/`，
安装器与 dev server 同目录（`vite.config.ts:11-18`）。`widgets/index.json` 形状：
`{ plugins: [{id,name,version,entry}] }`。`widgets/` 是 **gitignore 的运行时目录**——安装产物
不入库，入库的是 `widgets-example/` 下的 scaffold（兼 e2e fixture）。

### 5.4 运行时装载（`src/symbols/plugin-loader.ts`）

1. `loadPlugins()` fetch `<base>widgets/index.json`——404/网络故障 = 静默零插件（不打扰组态）。
2. 逐插件 `collectOne`：动态 `import(/* @vite-ignore */ widgets/<id>/<entry>?v=<version>)` →
   要求 `mod.default` 工厂 → 收集 `registerSymbol` 的图元 + `registerComponent` 的组件。
3. **lintSymbol 门禁**：不过 = 拒载 + 用户通知（`ElNotification`/`ElMessage`）+ console.error。
4. **`ah-` 命名空间防线**：任一 symbol id 以 `ah-` 开头 → 拒载。
5. 全部成功后**一次性** `registerConfig('扩展图元（本站）', symbols)` + `appHost.component`
   续注——聚合注册防同名覆盖把先装插件抹掉；内容签名未变则跳过（防 maotu「已覆盖」刷屏）。

**失败隔离**：collectOne 与 loadPlugins 双层 try/catch——任何插件异常只废掉本插件，不向上冒。
`knownTags()` = registry + `BUILTIN_TAGS` + 已装插件 tag/props 键 + 占位 tag（降级判定口径）。

**汇合点**：EditView `onMounted` 发起并传 `pluginsReady` 给 `loadScreen`（**降级判定前 await**，
未知 tag 判定必须含已装插件）；ViewView 不 await 发起（SSE 先行），仅在 `mountScreen` 前
await——插件缺席不得阻断画面渲染。

### 5.5 降级与恢复（`src/symbols/plugin-fallback.ts`）

- `applyFallback(done)`：未知 tag → `ah-plugin-missing` 占位（`AhPluginMissing.vue`：灰虚线框 +
  「插件缺席」徽标 + 原 tag 名），**保留原 id/binds/binfo 尺寸**，原项存入 `stashed`；已知 tag 的
  未知 props 键剔除并 warn（清洗后继续递归 children）。
- `restoreStashed(payload, stashed)`：保存前按 id 还原原项（**占位不入库**）；几何 binfo 取当前
  payload（用户对占位框的移动/缩放有效），身份/数据字段以存档为准。
- 语义：**插件卸载后既有画面出占位框不崩、重新保存不丢原数据**（`e2e/plugin-dir.spec.ts` 固化）。

### 5.6 开发一个插件（hello-card 走一遍）

1. 复制 `widgets-example/hello-card/`（manifest + dist.js + src/ 留档，兼 e2e fixture）。
2. 改 `manifest.json`（id/version/name），`dist.js` 里用 `host.vue.h()` 写 render 组件，
   `host.registerSymbol({ id: '<你的>-…', … })` 注册图元（契约同 §3.3，过 §3.4 lint）。
3. `node scripts/install-plugin.mjs widgets-example/hello-card` → 编辑器刷新 →
   「扩展图元（本站）」组可见。
4. 验收（对标 `e2e/plugin-dir.spec.ts` 三态）：装后可拖可渲染；卸载后既有画面占位框 + 保存
   不丢原数据；lint 不过的插件装得上但**装载被拒且通知可见**。

### 5.7 AI 通路（hmi-mcp，独立 npm 包）

- **包边界**：`mcp/` 是独立 npm 包，**不转 monorepo**——根 tsconfig/vitest 不含它，门禁单独跑
  （`pnpm -C mcp run typecheck` / `pnpm -C mcp test`）。
- **工具面 16 个**——读 9：`hmi_list_screens / hmi_get_screen / hmi_validate_screen /
  hmi_describe_widget_kit / hmi_list_devices / hmi_list_points / hmi_query_history /
  hmi_list_alarms / hmi_screenshot`；写 7：`hmi_create_screen / hmi_put_screen /
  hmi_put_protected_screen / hmi_rename_group / hmi_rollback_screen / hmi_delete_screen /
  hmi_install_plugin`。写链纪律：`hmi_put_screen` 必带 if_version（409 = 他人/AI 已先写）、
  `hmi_validate_screen` error 级前置（id 词法 / 128KiB / JSON 语法——后端将拒）、保护 slug
  硬拒且无 force、落库前 BI 运行态复位（与编辑器保存链同款 sanitize）。
- **单源引用**：mcp 相对 import `src/symbols`（registry/groups/lint）+ `src/lib/bi-contract` +
  `src/screen-assets/protected`——**校验器所见 = 编辑器所认**（两处永不漂移；这也是
  protected.ts 必须保持零依赖的原因）。
- **运行配置全走环境变量**：`HMI_BASE_URL`（默认 `127.0.0.1:8790`）/ `HMI_JWT`（sub=hmi-mcp）/
  `HMI_VIEW_ORIGIN`（截图 origin）。
- **构建**：esbuild bundle（`pnpm -C mcp run build` → dist/index.js）——bundle 摊平模块层级，
  `import.meta.url` 相对推导（repoRoot 探测）须**双候选**（源码/束布局，`mcp/src/tools/writes.ts`）。
- `hmi_install_plugin {source_dir}`：spawn 安装器（与人类同款命令，60s 超时），**CriticalWrite
  审批档**（destructiveHint=true）；失败返回 `{ok:false, code:'install_failed', stdout/stderr 尾 2000 字}`。
- `hmi_describe_widget_kit`：registry+groups 单源投影 → `{count, groups, widgets[...],
  builtin_tags, bind_convention}`——AI 看到的目录 = 编辑器真实目录。
- 全工具经 `withToolLogging` 审计（`mcp/src/logging.ts`：`{ts, tool, tier, ok, ms, err?}` 结构化
  stderr 日志）。

## 6. 画面体系与数据契约

### 6.1 ScreenDoc 与版本（`src/lib/screens.ts`）

- `ScreenDoc = IExportJson & ScreenMeta{name?, group?, devs?}`——meta 与 maotu done_json
  **同体存储**，真相在 rs-iot `/api/v1/screens`（hmi-studio 只是编辑器）。
- `GET /:id → {id, doc, version}`；`PUT /:id` 全量 + 可选 `?if_version=` 乐观锁，409 = 他人/AI
  已先写（`PutResult{status, version}`）；判重命中 version 不变。
- 版本三端点：`versions`（seq 降序，`{seq,ts,author,size,sha,expired}`；expired = 正文过 TTL
  取回 410）/ 单版取回 / `rollback {to_version}`（回滚前 head 自动存档，可再回滚回来）。
- 文档上限 128KiB（超限后端拒）；`blankScreen(slug)` = 800×600 深色画布。

### 6.2 绑定与触发器

- 绑定存在**每个图元元素**的 `binds[]` 里（随 done_json 同体入库，无独立键）；条目形状
  `{id, pel_id, bind_id, bind_name, bind_attr, bind_mapping:[], triggers[]}`。
- BindPanel 用户流：搜点位树 → 选点 → 选目标属性（枚举 `props.<k>.val`）→「模板绑定」勾选后
  bind_id 写 `@dev.<tag>` → 触发器表单（operator ∈ `> < >= <= = !=`）。
- 触发器：`rule{operator,value}` 命中 → `change_attr[{target_id,target_attr,target_value}]` 点路径
  写入；`normalizeTriggerValue` 按目标 prop 的 type 归一（switch→boolean 等，防布尔被写 `'false'`
  串恒真）。

### 6.3 参数化画面（W11 faceplate）

`@dev.<tag>` = 设备相对标签；`meta.devs` = 设备清单权威源（首项 = 默认激活）；`@meta.dev` =
宿主直推当前设备 id 的显示通道。运行页 `?dev=<devid>` 深链覆盖默认并写回 URL；`applyDevContext`
把 binds 前缀重写为 `<devid>.<tag>` 后重挂；画面内 `ah-dev-selector` 切换设备
（`src/lib/dev-context.ts`）。

### 6.4 画面生成器与保护清单（`src/screen-assets/`）

五个生成器（纯函数、零随机，图元 id 稳定兼作 E2E 锚）：`demo-screen`（water-demo-m3 / -b /
catalog-demo 陈列室）、`home-screens`（三表三屏）、`home-tab-screens`（三页签屏，click→
changeAttr(hide) 纯组态切换）、`home-faceplate-screen`（参数化 faceplate）、`bi-screen`
（bi-station，1920×1080，BI 平铺零 SSE 绑定）。

**保护清单 11 个 slug**（`protected.ts` 常量单源，生成器 re-import；hmi-mcp 删除拒绝闸、
AI 页面上下文保护标注、e2e 清扫守卫唯一 import 面）：`water-demo-m3`、`water-demo-m3-b`、
`catalog-demo`、`home-meter-power|water|gas`、`home-meter-power-tabs|water-tabs|gas-tabs`、
`home-meter-power-faceplate`、`bi-station`。**禁止删除**；AI 修改只能走 `hmi_put_protected_screen`
（最高档审批）。

登记纪律：**新增画面生成器必须把产出的长期资产 slug 登记进 protected.ts**；protected.ts 保持
**零依赖**（hmi-mcp 与 AI 上下文单源引用它——拖进生成器的 lib/symbols 依赖链会污染 mcp 侧）。

e2e 种子：`global-setup.ts` 全量 PUT 幂等播种；临时画面用 `e2e-t3-*` 前缀 afterAll 正则清扫，
长期资产无清扫。

### 6.5 桥与事件词表

- `window.$rsiot = { send, nav, back, home }`（`src/lib/bridge.ts`）：`send` → POST
  `/api/v1/command/send` + 15s 超时（覆盖 rs-iot 写回执 12s 窗口；504/中止提示「结果未知（超时）」，
  422 透传后端 `error` 原文）+ 环形 20 条历史；nav/back/home 经 ViewView 注入。
- 图元事件 custom_code 白名单：`$rsiot / $mtEventCallBack / $getItemAttrByID / $item_info / $args`
  （`mcp/src/tools/screens.ts:40`——hmi-mcp 校验同表）。

## 7. 门禁与 AI 上下文（图元相关）

- **symbol-lint**：vitest 内置全量循环（本仓图元）+ 插件装载门禁（§3.4 表）。
- **check-layers**：loader 必须 symbols 层（lib 不依赖符号面）；豁免清单三处——
  `SYMBOLS_LIB_ALLOWLIST`（bi-contract 单点）、`LIB_ASSETS_ALLOWLIST`（protected.ts 单点，
  AI 上下文保护标注用）、e2e/测试放宽。
- **AI 页面上下文**：提交对话附 `[页面上下文]`（模式/画面 slug/名称/组/版本/保护标注/路径，
  `src/lib/agent-context.ts`——保护状态由 slug 单源判定），AI 据此知道该用哪档写工具。
- 新图元/插件的回归位：`e2e/symbols.spec.ts`（陈列室渲染）、`e2e/plugin-dir.spec.ts`（插件三态）、
  `e2e/bi-dashboard.spec.ts`（BI 通道 B）。

## 8. 文档地图

| 要做什么 | 看哪里 |
|---|---|
| maotu 路线/管线/陷阱逐条依据 | docs/maotu-symbol-development-guide.md |
| 分层规则与豁免登记 | docs/architecture.md |
| 编码/测试/提交规范 | docs/standards.md |
| BI 内容分区与数据口径 | docs/plans/2026-10-29-bi-monitoring-dashboard-design.md |
| reg-combin 语义实证 | docs/plans/2026-10-31-reg-combin-probe.md |
| AI/扩展体系总体设计 | docs/plans/2026-10-30-ai-assistant-and-extension-system-design.md |
| 图元 id/分组权威源 | src/symbols/groups.ts + registry.ts |
| 插件契约权威源 | scripts/install-plugin.mjs + src/symbols/plugin-loader.ts + widgets-example/ |
