# 设备面板（Faceplate）与工业组态体系设计（2026-11-24）

> 状态：**研究结论 + 已实施（2026-11-24，见 `2026-11-24-iot-scada-screens-plan.md`）**。
> 实施取舍：P1 功能件 8 个已落地；L3 因每台表计限值不同改为"一机一面板"（10 张）而非参数化 5 张；
> 报警引擎选方案 A（Lua transform，见 `rs-iot/docs/ops/iot-demo-limit-alarms.md`）。
> 本文回答"模拟现实现场的设备仪表与工业组态应该怎么搭"。
> 依据：ISA-101.01-2015 / ISA-18.2 / ISA-5.1 / ISO 10628 / ISO 14617 公开条款摘要 + WinCC Unified /
> Ignition Perspective / FactoryTalk 的 faceplate 实现模式 + 本仓 maotu 0.6.5 实证（`docs/maotu-symbol-development-guide.md`）
> + 现网资产盘点（47 编译期图元 / 5 内建 tag / 6 画面资产 / 154 模拟点位）。
> 结论先行：**现有 47 图元是"设备形体 + 单表控件"，不是"设备面板 + 工艺画面"；缺的不是精细度，是体系**
> ——缺 ISA-101 四级层级、缺 faceplate（PV/SP/OP/模式/限值/偏差/质量）、缺灰度配色纪律、缺设备模型驱动的自动实例化、
> 缺点位限值报警引擎。补齐需要三层资产模型 + 一套功能件图元 + 设备类型模板 + 生成器，分 5 个阶段落地。

---

## 一、现状诊断（带证据）

### 1.1 已有资产盘点

| 层 | 资产 | 证据 |
|---|---|---|
| 图元 | 编译期 47（svg 15 / custom-svg 6 / vue 26），分 6 组 | `src/symbols/groups.ts`、`registry.ts` |
| 内建 | maotu 5 tag（text-vue/group/sys-button-vue/sys-line/sys-line-vertical） | `src/symbols/builtin-tags.ts` |
| 画面资产 | `demo-screen`（97 图元/22 绑定）、`home-screens`（94/19）、`home-tab-screens`、`home-faceplate-screen`（W11）、`bi-screen` | `src/screen-assets/*.ts` |
| 参数化 | `@dev.*` 前缀重写 + `@meta.dev` 回显 + 设备选择器 + 深链 `?dev=` | `src/lib/dev-context.ts`、`home-faceplate-screen.ts` |
| 数据 | SSE rtdata 直写 + triggers 离散链 + BI 通道 B（history/batch）+ 命令桥 `$rsiot.send` | `src/lib/{sse,binds,bi-collector,bridge}.ts` |
| 报警 | 服务端 `alarms` 表（key/level/source/message/ts/count）+ 前端 AlarmStore 双源合并 | `rs-iot/src/db/alarms.rs`、`src/lib/alarms.ts` |
| 模拟源 | 10 设备 / 154 点：水表×3、电表×3、燃气表×2、温湿度、压力变送器 | `simulator/configs/iot-demo-*.yaml` |

### 1.2 六项差距（为什么"不过关"）

| # | 差距 | 现状证据 | 业界要求 |
|---|---|---|---|
| **D1 无显示层级** | 画面 = 画面列表 + 单张平铺画布；没有 L1 总览 / L2 单元 / L3 设备 / L4 面板的分层结构，无跨层导航语义 | `src/router.ts` 只有 list/edit/view；`demo-screen.ts` 单张 97 图元平铺 | ISA-101 四级层级，L2 单屏 50~60 控制点，L3 按操作员心智模型组织 |
| **D2 无 faceplate** | 设备参数靠手工拖 6~20 个独立符号 + 手工绑 6~20 个点（`home-faceplate-screen.ts` 已是最好的一版，仍只是"表盘+六行值牌+趋势"） | `home-faceplate-screen.ts:4-14` | faceplate 必须有：PV+单位、SP、OP、模式（A/M/CAS）、HH/H/L/LL 限值、偏差条、相邻趋势、状态/联锁、报警页签、跨设备一致布局 |
| **D3 无报警限值/优先级** | 图元只有 `alarm` 布尔（`AhGaugePressure.vue` 变红）或无；无 P1/P2/P3/P4、无 HH/H/L/LL、无确认态；rs-iot **无按点位限值的规则引擎**（只有 Lua `ctx:fire_event` 与内建系统告警） | `src/symbols/AhGaugePressure.vue:11`；`rs-iot/src/plugin/lua_core/api/alarm.rs:221`；`rs-iot/src/history/alarm.rs` | ISA-18.2：限值/优先级/确认/搁置；图形上"颜色=状态"，P1 红/P2 橙/P3 黄/P4 蓝 + 形状徽标冗余编码 |
| **D4 配色违反 HP-HMI 纪律** | 深色科技风 + 高饱和蓝/绿/红到处都是（`#58a6ff` 强调、`#52c41a` 正常绿、`#f5222d` 报警红混用） | `home-screens.ts`、各图元 fill 默认值 | 灰阶底（L1 `#F0F0F0` / L2 `#D3D3D3` / L3 `#C0C0C0`），静态件深灰，活动数据暗蓝绿，**饱和色只给异常与操作**；禁 3D/渐变/装饰色/常亮闪烁 |
| **D5 无工艺画面** | 符号是孤立图标，无工艺管线、无就地值、无设备位号/描述；`ports` 能力存在但 demo 未用 | `demo-screen.ts` 平铺布局；`ports: []`（water-meter 等） | P&ID 语言（ISA-5.1/ISO 10628）：泵/阀/罐/换热器规范形状、管线类型（工艺/信号/电气）、仪表气泡（PT/TT/FT + 回路号）、就地显示值 |
| **D6 无模型驱动实例化** | 新增一台设备 = 手工拖一套符号 + 手工绑一遍点；10 台设备已是 97 图元调用/22 绑定 | `screen-assets` 全部手写生成器 | 一个设备类型（devmodel）→ 一张 L3 画面 + 一个 faceplate 模板；实例化只给 devid 前缀（WinCC faceplate type / Ignition tagPath / FactoryTalk #1 占位同款） |

补充：**47 图元里的 20 个 BI 图表属于分析层（趋势/统计），不是操作层（L1-L4）**；操作层主战场是 27 个设备/工艺/操作图元。

---

## 二、业界研究结论（可直接落成规范的条款）

### 2.1 ISA-101 四级显示层级

| 层 | 目的 | 内容 | 本仓对应 |
|---|---|---|---|
| **L1 总览** | 全厂态势感知，防"隧道效应" | 区域状态、关键 KPI、**按区域报警计数**、P1 报警指示；大屏 | `/overview` 需改造为 L1 |
| **L2 单元** | 日常操作主界面 | 工艺画面 + 控制回路 + 报警横幅 + 趋势；**≤50~60 控制点** | 新建"水表单元/电表单元/…"画面 |
| **L3 设备详情** | 问题诊断 | P&ID 风格的单设备/回路全参数、状态、报警、联锁 | 新建 per-device-type 详情画面 |
| **L4 面板** | 最细诊断/操作 | 设备 faceplate、维护信息、历史趋势、设定值 | 新建 faceplate（画布内浮层或独立画面） |

### 2.2 HP-HMI 配色与视觉纪律（ISA-101 + High Performance HMI Handbook）

- 背景灰阶分级（L1 `#F0F0F0` / L2 `#D3D3D3` / L3 `#C0C0C0` / L4 `#F5F5F5`）；静态管线深灰；活动数据暗蓝/暗绿；**饱和色只用于异常与操作**。
- 报警优先级色（业界两套常见取值，取其一成规范）：P1 红 `#D32F2F` / P2 橙 `#F57C00` / P3 黄 `#FBC02D` / P4 蓝 `#1976D2`；正常/停机 `绿色 `#2E7D32` / 灰 `#9E9E9E`（hmilibrary 12 色版）。
- **冗余编码**：颜色必须配形状/文字（P1 三角、P2 六边…），照顾红绿色盲（约 8% 男性）；对比度目标 WCAG AA 4.5:1。
- **闪烁只表示"新到未确认"**；确认后转常亮。
- 禁：3D、渐变、光泽按钮、投影、装饰性着色、常亮动画、照片级设备图。
- **偏差优先**：面板第一眼是"偏离多少、往哪个方向"，其次才是数值；限值带（tolerance band）+ 相邻趋势。

### 2.3 设备 faceplate 标准内容（ISA-101 / WinCC / Ignition 共同项）

| 区 | 内容 | 强制 |
|---|---|---|
| 标题区 | 设备位号（ISA-5.1 风格 `TT-101`）、描述、区域 | ✅ |
| 主体 | PV 大数字 + 单位 + **限值带** + SP 标记 + **偏差条** + 相邻 sparkline 趋势 | ✅ |
| 控制区 | 模式（AUTO/MAN/CAS）、SP 输入（带上下限与步长）、OP 输出条 | ✅ |
| 报警区 | HH/H/L/LL 设定值与延时、当前报警（P1-P4 + 确认状态）、搁置按钮 | ✅ |
| 状态区 | 运行/停止/故障/维护/离线、联锁/许可（permissive）、通信质量（GOOD/BAD/STALE） | ✅ |
| 页签 | 概览 / 详情（限值+延时） / 趋势（历史） / 报警 / 维护 | 推荐 |
| 一致性 | 启停、模式、限值、命令在**所有 faceplate 的同一位置** | ✅ |

### 2.4 平台实现模式（决定本仓架构）

| 平台 | 复用单元 | 绑设备方式 | 关键约束 |
|---|---|---|---|
| WinCC Unified | Faceplate **Type**（库内版本化对象） | 类型化 tag 接口（UDT/结构）+ property 接口 | 改 type 需显式"更新类型"；继承时子面板可能继承父 tag 接口 |
| Ignition Perspective | Embedded View + 参数 | **tagPath 字符串** + 间接绑定（无 UDT 类型参数） | 参数只在打开时读一次；用 Private 属性降会话负载 |
| FactoryTalk | 参数化画面 | `#1` 占位符 | — |

**共同本质**：一半在 PLC/设备模型（UDT/点表），一半在 HMI（参数化面板）；**一个设计 × N 实例**，实例只传设备标识。

### 2.5 P&ID 图形语言（L2/L3 的"工艺画面"依据）

- 泵：圆形 + 出口方向（离心/容积/压缩机变体）；成对 A/B = 一用一备。
- 阀："领结"双三角；中心标记区分闸/球/止回/蝶；控制阀加执行机构圆顶。
- 罐/容器：立式圆角矩形 / 卧式筒 / 拱顶罐 / 塔（塔板/填料）。
- 换热器：圆+折线 / 管壳轮廓 / 板式平行线 / 空冷带风扇。
- 仪表气泡：`PT-102`（首字母=变量、次字母=修饰、第三=指示/记录、第四=主动功能）；气泡横线区分现场/盘面/DCS/PLC。
- 管线类型：工艺（粗实线）/ 信号（细实线/虚线）/ 电气（点线）/ 毛细管。

---

## 三、目标体系（本仓要建成的样子）

### 3.1 三层资产模型

```
① 图元库 symbols/         "零件"：形体 + 功能件（本仓现有 47 的演进）
        ↓ 组合
② 面板/画面模板 assets/    "总成"：faceplate 模板、L1/L2/L3 模板（per 设备类型）
        ↓ 实例化
③ 画面 screens/（rs-iot）  "现场"：具体 devid 前缀 + 布局微调，存 /api/v1/screens
```

- **图元库**只提供"原子能力"，无业务语义（现状已是）。
- **面板/画面模板**按**设备类型**（水表/电表/燃气表/温湿度/压力变送器）定义，绑定全部用 `@dev.<tag>`。
- **画面**是模板的实例 + 微调；新增设备只加 devid 清单行（设备选择器/组），不改画面结构。

### 3.2 图元库改造（保留 + 新增）

**保留（P&ID 形体，改造配色/状态语义）**：泵、风机、搅拌器、电机、罐、液位计、六类阀、流量计——作为 L2/L3 的"设备外观"，正常态中性灰、状态色只表异常。

**新增功能件（操作层缺的就是这些）**：

| 图元 | 说明 | 路线 |
|---|---|---|
| `ah-value-block` | 值块：label + PV 大数字 + 单位 + 限值带 + SP 标记（**限值就地**） | vue |
| `ah-deviation-bar` | 偏差条：PV 相对 SP 的偏离与方向 | custom-svg |
| `ah-limit-band` | 限值带：HH/H/L/LL 四档色块（灰底 + 报警色） | svg |
| `ah-mode-indicator` | 模式徽标：AUTO/MAN/CAS + 颜色 | vue |
| `ah-status-badge` | 状态徽标：运行/停止/故障/维护/离线 + 形状冗余编码 | vue |
| `ah-alarm-badge` | 报警徽标：P1-P4 + 形状 + 未确认闪烁 | vue |
| `ah-quality-badge` | 质量徽标：GOOD/BAD/STALE（SSE 断链、点过期） | vue |
| `ah-sparkline` | 迷你趋势：相邻窗口 + SP 线 + 限值带 | vue |
| `ah-process-line` | 工艺管线：水平/垂直/弯头 + 流向动画（仅运行时） | svg |
| `ah-faceplate-<type>` | **设备面板总成**：标题/主体/控制/报警/状态/页签（见 §3.3） | vue |
| `ah-nav-level` | 层级导航条：L1/L2/L3 面包屑 + 报警计数 | vue |

**路线选择原则**（沿用 `maotu-symbol-development-guide.md` §1）：能用 svg 就不用另两条；**交互件必须 vue**（custom-svg 是 SSR→img，事件死）；**带文字/计算几何用 custom-svg**；同屏大量实例优先 svg 型（性能）。

### 3.3 faceplate 规格（本仓可实现的版本）

maotu 0.6.5 **无弹窗/无嵌入画面能力**（`MtPreview` 只有 `setImportJson/setDevicePointByID/setItemAttrByID`，d.ts 实证），所以 faceplate 只能二选一：

- **方案 F1（推荐）**：`ah-faceplate-<type>` 作为 **vue 型图元**放在 L3 画面右上（画布内固定面板），随设备上下文（`@dev`）切换；"弹出"= 该图元 `hide` 由按钮 changeAttr 切换。
- 方案 F2：faceplate 独立画面 `/view/<slug>?dev=<devid>`，用 nav 跳转；优点是空间大，缺点是切换要重载画面（maotu 重挂）。

**props（全部走 `props.<name>.val`，与现有绑定纪律一致）**：

```ts
{
  title:      input   // 设备位号/描述（绑 @dev.__title 或 @meta.dev）
  dev:        input   // 当前设备 id（@meta.dev 直推）
  pv:         number  // 主测点值（bind 直写）
  sp:         number  // 设定值
  op:         number  // 输出
  unit:       input
  mode:       number  // 0=MAN/1=AUTO/2=CAS（直写 + 触发器映射徽标）
  hh/h/l/ll:  number  // 四限值（组态期填，或运行期由设备模型注入）
  alarm_prio: number  // 0=正常 1=P4 … 4=P1（合成点位，见 §4.2）
  quality:    number  // 0=GOOD 1=STALE 2=BAD（合成点位）
  running:    switch  // 运行状态
  trend0..2:  number  // 迷你趋势通道（沿用 AhTrendChart 模式）
}
```

**页签**：概览（PV/SP/偏差/趋势）/ 详情（四限值+延时）/ 趋势（历史，BI 通道 B）/ 报警（该设备活跃报警）。

### 3.4 画面模板体系（L1-L4）

| 画面 | 内容 | 依赖 |
|---|---|---|
| `L1-plant-overview` | 区域卡片（水/电/气/环境）+ 每区域设备数/运行数/**报警计数** + P1 汇总 + 关键 KPI | 合成点位（报警计数）+ 导航 |
| `L2-unit-water` 等 | 工艺画面（水表管路/电表配电/燃气调压），设备形体 + **就地值块** + 报警徽标；≤50 设备 | 形体图元 + value-block + process-line |
| `L3-device-<type>` | 单设备详情：全参数表 + 限值 + 趋势 + 状态机 | faceplate（F1 内嵌） |
| `L4-faceplate` | 可并入 L3（F1）或独立（F2） | — |

现有 `home-faceplate-screen.ts` 是 L3/L4 的雏形，保留并升级为 per-type 模板。

### 3.5 配色与字体规范（落到 token 与 lint）

- 新增主题 `hp-hmi`（灰阶）：`--hmi-bg-L1/L2/L3`、`--hmi-static`（#555）、`--hmi-live`（#1f4e79）、`--hmi-alarm-{p1..p4}`、`--hmi-ok`、`--hmi-off`。
- 图元 `fill` 语义收敛：**正常态 = 中性**，状态色只由 triggers/alarm 覆盖（现有"绿色=正常"的默认值要改）。
- 扩展 `symbol-lint`：`HP_COLOR`（图元默认 fill 不得为饱和报警色）、`FACE_PROPS`（faceplate 必备 props）、`LIMIT_ORDER`（hh>h>l>ll）。
- 字体：数值等宽（Consolas/Menlo），单位小一号；禁用纯装饰字重。

---

## 四、数据与报警方案

### 4.1 数据通道（沿用现有，不新增协议）

| 通道 | 用途 | 现状 |
|---|---|---|
| A：SSE 直写 `bind_attr=props.<n>.val` | PV/SP/OP/模式/状态 | ✅ 已有 |
| triggers（operator/value→changeAttr） | 阈值变色/显隐/徽标映射 | ✅ 已有（注意成对互斥收口） |
| B：BI 聚合 `/history/batch` | 趋势/统计/历史 | ✅ 已有 |
| 命令桥 `$rsiot.send` | SP 下发/启停/模式切换 | ✅ 已有（二次确认） |
| 合成点位（新增宿主侧） | 报警优先级、质量、区域计数 | **需新增**（见 4.2） |

### 4.2 合成点位（宿主注入，解决"图形拿不到报警/质量"）

ViewView 已有的 `onPoint→setDevicePointByID` 通道之外，新增宿主计算并注入：

| 合成 field | 来源 | 消费 |
|---|---|---|
| `<devid>.__prio` | AlarmStore 中该设备活跃报警的最高优先级 | faceplate `alarm_prio` / 形体 fill / 徽标 |
| `<devid>.__quality` | SSE 断链 / 点位最后更新时间超阈值 / 采集实例非 running | `ah-quality-badge` |
| `__area.<区域>.alarm_count` | 按区域聚合 AlarmStore | L1 卡片 |
| `__plant.p1_count` | 全厂 P1 计数 | L1 顶部 |

实现位置：`src/lib/sse.ts` 的 dispatcher 层（纯函数可测），不新增网络请求；`binds.ts` 的订阅面自动包含。

### 4.3 报警限值引擎缺口（**必须决策**）

现状：rs-iot 只能在 Lua 脚本里 `ctx:fire_event(key,level,msg)` 或由内建系统告警 fire，**没有按点位 HH/H/L/LL 自动判定的规则引擎**。

| 方案 | 做法 | 优点 | 成本 |
|---|---|---|---|
| **A（推荐，短期）** | 写一个 `limit-alarm` Lua transform 脚本：读配置表（devid.tag→hh/h/l/ll+优先级+延时），在 pipeline 出口求值并 fire/clear | 零 rs-iot 代码改动；配置与设备模型同源；可热加载 | 需处理去抖/延时/迟滞（脚本内状态机） |
| B（中期） | rs-iot 增加内建 limit-rule 引擎（读 devreg overrides 的 limit props，写 alarms 表） | 一台设备一套规则，MCP/HMI 都能读 | 改后端（新增模块+测试） |
| C（不推荐） | HMI 前端本地判定变色，不走服务端 alarms | 最快 | 报警清单/历史/审计缺失，违反"报警卫生" |

**建议**：P2 先走 A 打通闭环（图形 + 清单 + 确认），P4 再评估 B。

---

## 五、分阶段实施计划

| 阶段 | 交付 | 验收 |
|---|---|---|
| **P0 规范与 token**（0.5~1 天） | `docs/hmi-style-guide.md`（ISA-101 条款落地：层级/配色/布局/字体/图标/报警色）；`src/styles/hp-hmi.css` token；`symbol-lint` 三条新规则 | 规范评审通过；lint 单测绿 |
| **P1 功能件图元**（2~3 天） | §3.2 的 10 个功能件（value-block / deviation-bar / limit-band / mode / status / alarm-badge / quality / sparkline / process-line / nav-level）；形体图元默认色改中性 | 图元面板可见；快照基线；单测（几何/映射）绿 |
| **P2 电表 faceplate 端到端**（3~4 天） | `ah-faceplate-power`（F1 内嵌）+ L3 画面 + 合成点位（prio/quality）+ `limit-alarm` Lua 脚本 + 报警清单联动 | 浏览器：切设备 → PV/SP/限值/偏差/趋势/报警全对；报警触发→图形变色→确认→常亮；e2e |
| **P3 其余设备类型 + L2/L1**（4~5 天） | 水表/燃气表/温湿度/压力 faceplate；三张 L2 工艺画面；L1 总览（区域报警计数） | 10 台设备全覆盖；L1→L2→L3→faceplate 导航闭环；ISA-101 自检表 10/10 |
| **P4 生成器与回归**（2~3 天） | devmodel→faceplate 配置生成（标签/限值/单位）；画面模板批量生成；`just fe-quality` + e2e 全绿 | 新增一类设备 = 改配置 + 一条命令出画面；回归无退化 |

**总工期约 2 周**（单人）。P2 是关键验证点：它证明"模型→faceplate→报警→图形"整链可行，之后 P3 是复制扩展。

---

## 六、与现有 47 图元的关系

- **保留**：27 个设备/操作图元（形体 + 表计 + 按钮）——它们是正确的"零件"，只需把"正常态饱和色"改成中性 + 报警色由 trigger 覆盖。
- **降级/隔离**：20 个 BI 图表归"分析层"（趋势/统计页），不参与 L1-L4 操作画面；保留现状。
- **新增**：§3.2 的 10 个功能件 + 5 个 faceplate 总成。
- **不动**：maotu 内核 5 tag；`@dev/@meta` 机制；SSE/命令桥/BI 通道。

> 一句话：**47 图元是"设备长什么样"，faceplate 是"设备怎么操作和诊断"，L1-L4 是"现场怎么逛"。三层齐了，工业组态才算过关。**

---

## 七、风险与边界

| 风险 | 影响 | 对策 |
|---|---|---|
| maotu 无弹窗/无嵌入 | faceplate 只能画布内浮层（F1）或独立画面（F2） | P2 选 F1 验证；空间不足再评估 F2 |
| custom-svg 是 SSR→img | 交互件不能做 custom-svg | 交互一律 vue 型（已有规范） |
| group children 不绑定 | 面板不能靠"组合"组织带数据件 | 平铺 + hide 切换（§7 页签配方） |
| 每画面 vue 实例成本 | 50+ 设备面板卡顿 | L2 用 svg 形体 + 少量 value-block；faceplate 一次只挂 1 个 |
| 报警引擎缺失 | 图形报警态无来源 | P2 先上 Lua 限值脚本（方案 A） |
| 灰阶主题与现有深色主题冲突 | 双主题维护成本 | hp-hmi 为默认，深色保留为夜间模式；token 化，图元不写死色 |
| 设备模型字段不足（限值/单位/位号） | faceplate 无数据可填 | 用 rs-iot `devmodel` 的 `x_` 扩展键承载 limits/unit/位号（已有扩展槽），或 `TagProps.unit/desc` |
| maotu 闭源演进 | 依赖行为可能变 | 现有 13 条陷阱清单已固化；新增行为先探针再落文档 |

---

## 八、验收清单（ISA-101 自检，10 项）

1. 任一面板 5 秒内可读出：偏差多少、往哪偏、该做什么。
2. 正常态为灰阶；屏幕上饱和色只出现在异常与操作件。
3. 每个关键值旁有单位、SP 标记、HH/H/L/LL 限值带。
4. 关键值旁有相邻趋势（含 SP 线与限值带）。
5. 报警 P1-P4 有色 + 形状 + 文字三冗余；未确认闪烁、确认后常亮。
6. 同一类操作（启停/模式/限值/命令）在所有 faceplate 的同一位置。
7. L1/L2/L3/L4 导航一致，面包屑可回退；L2 单屏 ≤60 控制点。
8. 工艺画面有管线、流向、设备位号，符合 ISA-5.1/ISO 10628 基本形状。
9. 质量态（GOOD/BAD/STALE）与离线态可见，不把"没数据"画成"正常"。
10. 无 3D/渐变/投影/装饰色/常亮动画。

---

## 九、下一步（待你定）

1. 批准本文档 → 开始 P0（风格指南 + token + lint）。
2. 先做哪个设备类型的 faceplate 试点（建议电表：参数最多、最能验证完整度）。
3. 报警限值引擎选 A（Lua 脚本，零后端改动）还是 B（rs-iot 内建模块）。
