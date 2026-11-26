# 3D 组态编辑器实施方案 · 系统级审查

> 日期：2026-11-26 · 审查对象：`2026-11-26-3d-editor-meteor-implementation-plan.md`（提交 `9cd898a`）
> 审查视角：**rs-iot 整体系统**，把 2D 组态与 3D 组态当**两条平行功能线**逐层对照
> 方法：不读方案自述，直接读 2D 线的真实实现（15 个层位的 file:line）与 rs-iot 服务端机制，逐层判定"平行/偏离/缺失"
> 本文结论已回写进方案（§13 修订）；本文件保留审查证据与推理。

---

## 0. 结论摘要

方案骨架**可行**（选型、契约分层、适配层边界成立），但存在：

| 类别 | 数量 | 一句话 |
|---|---|---|
| **系统级错位** | 1 | 把 3D 场景塞进 2D 的 `screens` 资源族，导致尺寸上限、列表过滤、AI 校验三处被迫打补丁 |
| **平行线缺口** | 7（5 缺失 + 2 关键偏离） | 缺失：告警合成 / 命令通道 / 资产保护 / AI 工具 / e2e 播种；偏离：订阅面 / 图元扩展 |
| **被低估的技术风险** | 3 | 串行恢复、bundle 与首屏回归、vendor 可持续性 |

**核心判断**：方案的"数据面自研"清单**不完整**。它只列了 bindings/runtime-drive/events，
但 2D 线的运行页实际有 **5 条并行数据通路**（SSE 实时值、告警流、合成点位、命令桥、AI 页面上下文），
3D 若只接第 1 条，就不是"平行线"，而是"残缺的支线"。这是本轮审查最重要的修正。

---

## 1. 平行线对照矩阵（15 层）

判定口径：**平行** = 结构对称、可复用同一套机制；**偏离** = 形似而机制不同，会产生分叉维护；**缺失** = 3D 侧完全没有。

| # | 层位 | 2D 线实现（证据） | 方案中的 3D | 判定 |
|---|---|---|---|---|
| 1 | 存储资源族 | `screen` MetaKind（`routes_meta.rs:47`），全局 `MAX_DOC_BYTES=128KiB`（`:40`） | 复用 `screens` + compact 压到 ≤128KiB | **偏离**（见 §2） |
| 2 | 列表与分流 | `/`（2D）+ `/screens3d`（3D），靠 `is3d` 逐 doc 读 `$schema` 过滤（`screen-list.ts` `loadScreenCardsByKind`） | 沿用同机制 | **偏离**（过滤是补偿性设计；资源族分开则天然平行） |
| 3 | 新建 | `createScreen` + `blankScreen` + 探测防覆盖（`screen-create.ts`） | `createScene3D` + `blankScene3D`，同探测语义（已落地） | 平行 ✓ |
| 4 | 编辑器基座 | `MtEdit`（maotu 库）+ element-plus 顶栏/对话框（`EditView.vue`） | vendor Meteor 面板（原生 `<input>`，无 element-plus） | **偏离**（UI 基座两套；方案把主题统一推到 P3，太晚） |
| 5 | 保存/版本/乐观锁 | `screensApi.put(if_version)` + `VersionPanel.vue`（仅依赖 screensApi:8） | `putScene` + 复用 VersionPanel | 平行（需把 VersionPanel 的 `screensApi` 泛化成 client 参数） |
| 6 | 绑定契约 | `<devid>.<tag>` 字符串；`@` 前缀排除、`__` 合成点排除（`binds.ts` `isSyntheticField`/`collectBinds`） | `SceneBinding{targetBid, field, kind, config}` | **偏离**（新契约未声明复用 `isSyntheticField` 规则；两套 field 判定会漂移） |
| 7 | 运行数据面 | `createRtdataStream({devs})` → `setDevicePointByID(field,val)`（`ViewView.vue:182`） | `createRtdataStream` → `bindings.apply` | 平行，**但订阅面不同**：2D 只订阅**绑定字段所属设备**（`collectBinds`），方案 `bindFieldsOf` 订阅**场景内全部设备** | **偏离**（见 §3.3） |
| 8 | 告警驱动 | `createAlarmStream` → `AlarmStore` → `aggregateAlarms` → `syntheticFields(__prio/__area/__sys)` → 逐点注入（`ViewView.vue:126-128`，`synthetic.ts:64,118`） | 仅提 `HighlightManager` 用于告警高亮 | **缺失**（见 §3.1） |
| 9 | 命令通道 | `installBridge({mode:'view'})`（`ViewView.vue:419`）→ `$rsiot.send` 走网关 → rs-iot 命令帧 | 无 | **缺失**（见 §3.2） |
| 10 | 事件/导航 | `parseNavTarget('slug?dev=x')` + `navStack`（`nav.ts`） | `events.do: {type:'navigate', slug, dev}` | 平行（须直接复用 `parseNavTarget`，别另写解析） |
| 11 | 资产保护 | `PROTECTED_SLUGS`（`protected.ts`）→ hmi-mcp 删除闸 + e2e 清扫守卫 | **未提及**；且现有 `iot-plant-3d` **不在册**（既有缺陷） | **缺失**（见 §3.4） |
| 12 | AI / Agent | hmi-mcp 9 读 + 7 写工具（`mcp/src/index.ts:4-8`，含 `hmi_validate_screen`/`hmi_put_screen`）+ 页面上下文 `setAgentPageScreenInfo` | 无 | **缺失**（且 3D 在 screens 内会被 2D 校验误判；见 §2.2） |
| 13 | e2e 播种 | `seedIotScreens()`（`e2e/fixtures.ts:180`，`global-setup.ts:20`） | 无 | **缺失**（3D 场景无法纳入回归） |
| 14 | 图元扩展 | `src/symbols/` registry + 插件装载器（`widgets/index.json`，`plugin-loader.ts`） | `assets.ts` 清单，无插件/自建模型 | **偏离**（需明确：3D 图元是否允许站点自建与插件装载） |
| 15 | 观测 | `rs_iot_meta_versions_created{kind=...}` 等 4 组指标（`process_metrics.rs:70`，`render.rs:267`） | 无（靠复用 screens 蹭到 `kind=screen`） | **偏离**（3D 写竞争会污染 2D 的 screen 指标，无法区分） |

**小结**：15 层中 **3 层平行、7 层偏离、5 层缺失**。方案自述的"交互壳达标、缺口在数据面"成立，
但**数据面的缺口被低估了一半**（只识别了 1 条通路，实际有 5 条）。

---

## 2. 系统级决策：3D 场景该不该放进 `screens`

### 2.1 现方案的问题

方案 §4 把 `scene3d/2` 塞进 `screen:*` 键族，靠 `$schema` 区分，并为此付出三项代价：

1. **尺寸上限**：全局 `MAX_DOC_BYTES = 131_072`（`routes_meta.rs:40`）。实测 172 对象原样 139 KiB 超限；compact 后 68.4 KiB，上限约 311 对象。方案为此写了四级超限策略（模型外置/图元组合/分片/保存前校验）——**其中"分片"是纯粹的补偿性复杂度**。
2. **列表与 AI 被迫过滤**：2D 列表要逐 doc 读 `$schema`（已在 `loadScreenCardsByKind` 实现）；更严重的是 **hmi-mcp 的 `hmi_validate_screen` 按 2D 结构校验**（`mcp/src/tools/screens.ts:66` 读 `doc.json` 数组）：对 3D 文档会报 `no_json_array` 误导性 warning，`hmi_get_screen` 也会把 3D 当作 2D 画面返回（§3.5）。
3. **观测混淆**：3D 的写冲突计入 `kind="screen"`，2D/3D 的并发压力无法分开看。

### 2.2 rs-iot 侧新增资源族的成本（实测，非估计）

`MetaKind` 已是完全参数化的机制（`routes_meta.rs:47`）：

```rust
struct MetaKind { key_prefix, list_field, kind, sv_prefix, metric_idx }
const SCREENS: MetaKind = { "screen", "screens", "screen", "sv:screen", 0 };
const THEMES : MetaKind = { "theme",  "themes",  "theme",  "sv:theme",  1 };
const SYMBOLS: MetaKind = { "symbol", "symbols", "symbol", "sv:symbol", 2 };
```

新增 `SCENES` 需要动的点（逐项核实过）：

| 文件 | 改动 | 规模 |
|---|---|---|
| `src/api/routes_meta.rs` | +1 个 `MetaKind` 常量；+7 个薄 handler（list/get/put/delete/versions/version_get/rollback，均一行转调泛型实现）；`validate_put` 增加 cap 参数（1 处调用点 + 2 处测试） | ~120 行 |
| `src/api/mod.rs` | +4 条路由（`/api/v1/scenes` 及子路径） | ~12 行 |
| `src/process_metrics.rs` | 4 个 `[AtomicU64; 3]` → `[4]`，`init_meta_array` 改尺寸，注释更新 | ~10 行 |
| `src/api/routes_metrics/render.rs` | kind 标签数组 `["screen","theme","symbol"]` → `+ "scene"` | ~3 行 |
| 已有测试 | `three_meta_kinds_are_fully_isolated`（`:1134`）把新 kind 加入数组即自动覆盖 | ~1 行 |
| **合计** | | **~150 行 Rust + 测试** |

- **版本/乐观锁/回滚/级联删除/判重**：随 `MetaKind` 机制**免费继承**（方案最看重的 P0 能力）。
- **gateway**：`/api/rsiot/*` 是通配透传，**零改动**。
- **lux key 前缀**：现有 `screen`/`theme`/`symbol`，新增 `scene` 不撞（`routes_meta.rs:57,64,75`）。

### 2.3 建议

**采用独立 `scenes` 资源族，cap 提议 1 MiB**（≈ 2600 个 primitive 对象，覆盖任何现实厂区）。

理由（按重要性）：
1. **平行线在存储层就物理分开**——这正是用户强调的"两条平行功能线"的最底层表达。2D 的契约变更（如 `IExportJson` 演进）不再波及 3D，反之亦然。
2. **消除三项补偿性设计**：128 KiB 四级策略、列表 `$schema` 过滤、AI 校验误判。补偿性设计是技术债的高发区。
3. **观测可分**：`rs_iot_meta_*{kind="scene"}` 独立可见。
4. **成本可控**：~150 行 Rust，机制已验证（第三族 `symbol` 就是这么加的）。

**保留 compact 序列化**：它与资源族选择正交——文档更小意味着列表更快、SSE 更轻、版本快照更省。但**不再承担"必须 ≤128KiB"的架构责任**，退化为优化项（可选、可回退）。

**迁移**：现有 `iot-plant-3d`（在 `screen:*`）迁到 `scene:*`，`screens` 里删除；列表页两处改用 `/api/v1/scenes`，`is3d` 过滤删除。

**备选（若不愿动 rs-iot）**：保持 `screens` + compact，但必须**显式登记触发条件**：当任一 3D 场景对象数 > 250 或保存体积 > 110 KiB 时，启动 `scenes` 资源族改造。不能让 128 KiB 静默变成产品天花板。

---

## 3. 七项平行线缺口

### 3.1 告警驱动（最严重）

**2D 现状**（`ViewView.vue:126-128`）：

```ts
const agg = aggregateAlarms(alarmStore.active())                       // synthetic.ts:64
const fields = syntheticFields(agg, subscribedDevs.value, qualityOfStream(state.value), bindFields.value)
for (const f of fields) pv.setDevicePointByID(f.field, f.value)        // __prio / __area.* / __sys.*
```

即：2D 画面里设备变红，走的是**告警流 → 聚合 → 合成点位 → 注入**这条链，而不是"某个真实点位变成 1"。

**3D 方案缺口**：只写了"告警态额外调 `HighlightManager.enable`"，**没有接入这条链**。后果：
- 同一台设备在 2D L1 显示 P1 红，3D 场景里可能毫无反应 → 两条线**状态不一致**，这是用户视角最刺眼的分叉。
- `__area.*.alarm_count` 这类区域级聚合在 3D 里无法呈现。

**补法**：`modules3d-meteor/alarms.ts` 复用 `createAlarmStream` + `aggregateAlarms` + `syntheticFields`，
把 `dev_wm1.__prio` 映射到"该 devid 对应对象集合的 Highlight 颜色 + 材质 emissive"，`__area.*` 映射到区域高亮/标签。
**落在 P0.5（新增），不是 P3。**

### 3.2 命令通道

**2D 现状**：`installBridge({mode:'view'})`（`ViewView.vue:419`）→ 画面里按钮可下发命令到 rs-iot（`lib/bridge.ts`）。

**3D 方案缺口**：`events.do` 只有 `navigate/focus/setCamera`，**没有 command**。工业 3D 场景里"点击泵 → 启停"是刚需，
且 2D 的 L2 单元画面已有此能力。缺了它，3D 只能"看"，不能"操作" → 不构成平行线。

**补法**：`events.do` 增 `{type:'command', targetBid, cmd, params}`；运行页 `installBridge({mode:'view'})`；
命令目标由 `bindings` 的 `targetBid → devId` 反查得到（因此 bindings 必须记录 devId，见 §3.3）。
**落在 P2。**

### 3.3 订阅面（性能与语义）

**2D 现状**：`collectBinds` 只收**被绑定的字段**（`binds.ts`），`devs` 也据此推导 → SSE 只订阅用到的设备。

**3D 方案**：`bindFieldsOf(doc)`（现有 `scene3d.ts:108`）把**场景内所有设备的 value/status/__prio** 都塞进订阅面。
172 对象的厂区是 10 台设备、154 点/秒，尚可；但真实厂区 200 台设备时会订阅全量 → 带宽与主线程压力线性上升
（本仓已因"每点强制渲染"踩过 1722 次/秒的坑，见 `Scene3DView.vue` 的 `applyPoint` 注释）。

**补法**：3D 的订阅面 = `bindings[].field` ∪ `events` 引用点 ∪ 告警设备集，与 2D 同口径；
`bindFieldsOf` 语义改为"绑定面"而非"场景面"。**落在 P0.5。**

### 3.4 资产保护

**2D 现状**：`PROTECTED_SLUGS`（`protected.ts`）→ hmi-mcp 拒删 + e2e 清扫守卫。

**3D 缺口**：方案未提；且**现有 `iot-plant-3d` 根本不在 `PROTECTED_SLUGS` 里**（既有缺陷，我在做 3D 分列时没登记）。
→ 一次误删或 e2e 清扫就能抹掉唯一 3D 场景。

**补法**：`protected.ts` 增 `IOT_PLANT_3D` 与后续 3D 长期资产；hmi-mcp 的删除闸按资源族分别校验。**落在 P0.5（低成本、高价值）。**

### 3.5 AI / MCP

**2D 现状**：hmi-mcp 9 读 + 7 写工具（`mcp/src/index.ts:4-8`），含 `hmi_validate_screen`、`hmi_put_screen`、
`hmi_put_protected_screen`、`hmi_rollback_screen`、`hmi_delete_screen`；另有页面上下文 `setAgentPageScreenInfo`。

**3D 缺口**：无。且在 `screens` 混存的前提下，AI 的读写都**走 2D 语义**：`hmi_validate_screen` 对 3D 文档产出 `no_json_array` 误导性 warning（`mcp/src/tools/screens.ts:66` 只认 `doc.json`），`hmi_get_screen` 把它当 2D 画面返回，`hmi_put_screen` 不做 3D 结构校验即可写入——**是"用错工具"，不是"不支持"**。

**补法（分两步）**：
- P0.5：`hmi-mcp` 的工具按资源族分派（若采纳 §2.3 的 `scenes` 族，天然分离）；
- P2：新增 3D 读工具（`hmi_get_scene`：对象树/绑定/体积）+ 写工具（`hmi_put_scene`，带 schema 校验 + 保护闸）。

**决策点**：3D 是否纳入 AI 可写范围？建议**纳入读、暂缓写**（3D 文档结构比 2D 复杂，AI 生成易产生悬空绑定）。

### 3.6 e2e 播种

**2D 现状**：`seedIotScreens()`（`e2e/fixtures.ts:180`）+ `global-setup.ts:20`。
**3D 缺口**：无播种 → 3D 场景无法进入回归（我这两个 DEMO 场景是手工建的，不在任何门禁里）。

**补法**：`seed3DScenes()`（工厂 172 + 展厅 43 两个基准场景），纳入 global-setup；`protected.ts` 登记防清扫。**落在 P0.5。**

### 3.7 图元扩展模型

**2D 现状**：`src/symbols/` registry + 插件装载（`widgets/index.json`）+ 站点自建组合图元（`symbol` 资源族）。
**3D 缺口**：`assets.ts` 是一份静态清单，无插件、无站点自建。

**需明确**（不必立刻实现）：3D 图元是否支持 a) 站点自建或 b) 插件装载。若不支持，要在文档里写清"3D 图元仅随版本发布"，
避免形成"2D 可扩展、3D 不可扩展"的隐性认知落差。**决策落在 P3 前。**

---

## 4. 被低估的三个技术风险

### T1 场景恢复是串行 await（性能）

**证据**：`PersistenceManager.restoreScene` 的对象循环是 `for (...) { const object = await this.deserializeObject(data); ... }`
（源码实证，`@5ca4b84`）。172 个 primitive 每个都很轻，实感不明显；但**一个场景里 20 台 GLTF 模型时是 20 次串行网络+解析**，
首屏时间会线性劣化。

**补法**：`modules3d-meteor/loader.ts` 复用本仓 `batched(items, 4, ...)`（`screen-list.ts` 已有）并行恢复，
随后统一 `applyGlobalNodeGraph`；需保持 `addObject` 的父子/顺序语义（先建父后建子，或恢复后再 reparent）。

### T2 bundle 与首屏回归

**证据**：core 顶层静态 import `3d-tiles-renderer`（`PersistenceManager.js` 顶部）+ `three/examples` 的
postprocessing/DRACO/KTX2/MeshOpt/Stats + `three-mesh-bvh` + `@tweenjs/tween.js`。叠加 14k 行 vendor 代码，
预估 +1.5~2.5 MB。当前 dist 已有 `index` 2.1 MB + `maotu` 2.9 MB。

**补法**：
- `/edit3d` 与 `/view3d-v2` 必须**路由级动态 import**（现有 router 已是懒加载，沿用）；
- `manualChunks` 把 `3d-tiles-renderer`、`three/examples`、`vendor/meteor3d` 各切独立 chunk；
- **验收加一条**：2D 首屏（`/hmi/`）的 bundle 体积与 LCP **不回归**（对比改动前后）。

### T3 vendor 可持续性

**证据**：vendor 14k 行 + 仅 1 处补丁（D4）。风险不在"现在能不能跑"，而在"半年后上游变了/我们要升级怎么办"。

**补法**：P0 末做一次**升级演练**并记录：改上游一处无关代码 → 重放补丁 → 跑 core 单测 + 两个 DEMO 场景回归。
演练通过 = vendor 策略可持续；不通过则改 fork + submodule。

---

## 5. 对方案的修订（已回写）

| 方案章节 | 修订 |
|---|---|
| §4 契约 | 存储目标由 `screen:*` 改为 `scene:*`（待 Q1 决策）；`SceneBinding` 增 `devId`（命令反查用），field 规则明确复用 `isSyntheticField` |
| §5.1 存储适配 | compact 从"必做（保 128KiB）"降级为"优化（可选）"；新增 `scenesApi`（若采纳新资源族） |
| §5.5 运行页 | 补齐 5 条数据通路：SSE 实时值 / 告警合成 / 命令桥 / 会话上下文 / 事件 |
| §6.3 超限策略 | 若采纳 `scenes`（1 MiB）则整节降为"备选路径"，仅保留"保存前体积校验" |
| §8 上游问题 | 不变（D6 更正已生效） |
| §9 分期 | 新增 **P0.5 数据面与治理对齐**；P2 扩为"事件 + 命令 + 版本面板泛化"；P0 增加 rs-iot 侧改动（若采纳） |
| §10 验收 | +6 条：告警一致性 / 命令下发 / 订阅面等价 / 首屏不回归 / 升级演练 / 3D 纳入 e2e |
| §11 待决 | +4 项（资源族、UI 基座、AI 边界、命令范围） |

---

## 6. 修订后的分期与工作量

| 期 | 内容 | 原估 | 修订 |
|---|---|---|---|
| **P0** vendor + 存储决策落地 | vendor core/面板（三档裁剪）、适配层骨架、重建 `/edit3d`、**（若采纳）rs-iot `scenes` 资源族 + 迁移 `iot-plant-3d`** | 4~6 d | **6~9 d** |
| **P0.5 数据面与治理对齐**（新增） | 订阅面等价、告警合成接入、资产保护登记、e2e 播种、MCP 资源族分派 | — | **4~6 d** |
| **P1** 运行页 | loadScene/restoreScene + 初始视角 + 并行恢复 + dispose 纪律 | 5~7 d | 5~7 d |
| **P2** 绑定编辑 + 事件 + 命令 | 绑定面板、事件求值（复用 parseNavTarget）、**命令下发（installBridge）**、VersionPanel 泛化、自动保存×乐观锁 | 6~8 d | **8~11 d** |
| **P3** 工业图元 + 体验对齐 | 首批工业图元、UI 主题统一、3D 图元扩展模型决策、运维文档 | 5~8 d | **6~9 d** |
| **合计** | | 20~29 d | **29~42 d** |

> 增量主要来自"补齐 2D 已有的 5 条数据通路"与"rs-iot 资源族"。这不是范围膨胀，而是原方案漏算了平行线的另一半。

---

## 7. 待决（含建议）

| # | 待决 | 建议 | 影响 |
|---|---|---|---|
| Q1 | 3D 场景存储：`screens` + compact vs 新增 `scenes` 资源族 | **`scenes`（1 MiB）**：~150 行 Rust，换来平行线在存储层物理分开、消除三项补偿设计 | P0 工期 +2~3 d |
| Q2 | 3D 编辑器 UI 基座：vendor 原生 vs 重写为 element-plus | **不动 vendor 面板**，只做主题变量映射；若要求像素级一致，则需重写面板（+10~15 d） | P1/P3 |
| Q3 | 3D 是否支持命令下发 | **支持**（与 2D 对齐，工业场景刚需） | P2 +2 d |
| Q4 | 3D 是否纳入 AI 读写 | **读纳入、写暂缓** | P0.5/P2 |
| Q5 | 3D 图元是否允许站点自建/插件 | 建议**仅随版本发布**，并在文档写明 | P3 |
| Q6 | three 版本（0.187 兼容） | P0 首日实测 | P0 |
| Q7 | vendor 升级演练是否作为 P0 出口条件 | **是** | P0 |

---

## 附：本轮审查新增证据（file:line）

| 事实 | 位置 |
|---|---|
| 2D 订阅面只含绑定字段；`@`/`__` 排除规则 | `hmi-studio/src/lib/binds.ts:1-50` |
| 告警聚合与合成点位生成 | `hmi-studio/src/lib/synthetic.ts:64,106,118` |
| 2D 运行页 5 条通路接线（SSE/告警/合成/命令） | `hmi-studio/src/views/ViewView.vue:126-128,182,419` |
| VersionPanel 仅依赖 screensApi（可泛化） | `hmi-studio/src/components/VersionPanel.vue:8` |
| 资产保护清单（`iot-plant-3d` 不在册） | `hmi-studio/src/screen-assets/protected.ts` |
| hmi-mcp 9 读 + 7 写工具 | `hmi-studio/mcp/src/index.ts:4-8` |
| 2D e2e 播种 | `hmi-studio/e2e/fixtures.ts:180`、`global-setup.ts:20` |
| rs-iot 128 KiB 全局上限 | `rs-iot/src/api/routes_meta.rs:40` |
| `MetaKind` 参数化（三族同构） | `rs-iot/src/api/routes_meta.rs:47-79` |
| 三族隔离断言测试（加 kind 即自动覆盖） | `rs-iot/src/api/routes_meta.rs:1125-1142` |
| 指标数组硬编码 3 槽 | `rs-iot/src/process_metrics.rs:70,80` |
| 指标 kind 标签 | `rs-iot/src/api/routes_metrics/render.rs:267` |
| 场景恢复串行 await | Meteor `packages/core/src/PersistenceManager.js` `restoreScene` 对象循环（@5ca4b84） |
| core 顶层静态依赖 tiles | Meteor `packages/core/src/PersistenceManager.js` 顶部 import |
