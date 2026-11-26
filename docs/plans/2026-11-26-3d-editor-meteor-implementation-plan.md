# 3D 组态编辑器实施方案（Meteor3DEditor 内核接入 hmi-studio）

> 日期：2026-11-26 · 状态：**方案待批准**（未实施）
> 取代：`2026-11-26-3d-hmi-editor-design.md`（该文档的选型结论已被本文档取代；其 §12 的实测评估仍是本文档的证据来源，正文 §3~§11 基于 three-editor-cores，**不再有效**）
> **系统级审查**：`2026-11-26-3d-editor-plan-review.md`（15 层平行线对照矩阵、存储资源族决策、7 项缺口）→ 修订结论见本文 **§13（生效）**
> 关联：`2026-11-26-3d-hmi-design.md`（3D 空间层总设计）、`docs/hmi-style-guide.md` §0/§2
> 上游基线：`nikonikoCW/Meteor3DEditor` @ commit **`5ca4b84`**（2026-11-11，MIT）

---

## 1. 目标与结论

### 1.1 目标

在 hmi-studio 内提供与 2D 组态编辑器（maotu `MtEdit`）**同级别的低代码 3D 组态能力**：
拖放搭建 → 属性编辑 → 绑定 rs-iot 点位 → 保存 → 运行页实时驱动。

### 1.2 一句话结论

**采用 Meteor3DEditor 作为 3D 编辑器内核**（MIT、Vue 3.5 + Pinia + three ^0.184、与 hmi-studio 同栈）。
其**交互壳已达标**（物料/属性/材质/动画/场景树/命令式撤销重做/视角管理），
**缺口集中在数据面**——点位绑定、SSE 运行驱动、事件联动三块必须自研（任何候选都如此，非 Meteor 欠账）。

### 1.3 三条必须先说清的硬约束（均有实测数字）

| # | 约束 | 实测 | 方案处置 |
|---|---|---|---|
| C1 | rs-iot 单文档上限 **128 KiB** | ① 172 对象场景**原样存储 139 KiB，超限**；② 上游的 `nodeGraph`+`nodeBindings` 更重：**仅 3 台 GLTF 就 189 KiB**（105+84），全量存 217 KiB | 适配层**必须**做两件事：(a) 精简序列化（去 Mongo 键/材质默认值/重复 id）→ 172 对象场景 **68.4 KiB**（均 407 B/对象，上限约 **311 个**）；(b) **不保存 nodeGraph/nodeBindings**（否则含模型的场景必超限）。超限走 §6.3。**注：若采纳 §13.2 的 `scenes` 独立资源族（cap 1 MiB），本条降为优化项——compact 变为可选** |
| C2 | 上游有 **10 秒自动保存且无并发保护** | 实测旧标签页每 10s 覆盖服务端数据 | 接 rs-iot `if_version` 乐观锁；自动保存改为"脏且静默"才触发，冲突走 UI 提示（§5.3） |
| C3 | 上游缺陷：**实测确认 3 项**，另 1 项曾被误判已更正 | 见 §8 | 需进 vendor 源码的补丁仅 1 处（D4 自动保存）；其余在适配层规避或不适用 |

---

## 2. 证据基线（2026-11-26 实测）

### 2.1 已验证的事实

| 项 | 结果 | 方式 |
|---|---|---|
| 可运行 | pnpm install + 修 2 处后跑通（前端 5173 / 后端 3002 / MongoDB 容器） | 实机 |
| core 单测 | 11/11 通过 | `node --test tests/*.test.js` |
| 持久化往返 | 建场景→拖放→保存→刷新，对象/材质/动画配置一致 | 实机 + API 回读 |
| DEMO 承载 | 172 对象工业车间、43 对象（3 台骨骼动画 GLTF）展厅均正常渲染与交互 | 实机截图 |
| GLTF 多实例 | 同一模型 3 实例各自独立播放不同剪辑 | 实机（`SkeletonUtils.clone`，per-bid controller） |
| three 版本 | Meteor `^0.184`，hmi-studio `0.187.0` | package.json；**0.187 下兼容性未实测**（见 Q2） |

### 2.2 架构事实（源码定位）

- **core 不依赖编辑器**：`PersistenceManager(sceneManager, editorStore, dbManager, options)` 的 `editorStore` 全部走 `?.` 可选调用；`restoreScene(sceneData, {syncEditorStore:false})` 是公开方法（`PersistenceManager.js` 的 `restoreScene` 方法）→ **运行页可不传 store、可由我方直接喂文档**。
- **DBManager 是唯一后端耦合点**：仅 `getSceneData` / `saveScene` 两个方法走 HTTP（`DBManager.js` 的 `saveScene`/`getSceneData`（@5ca4b84））→ 换接 rs-iot 只改这两个。
- **面板层零 UI 库依赖**：`packages/scene-editor/src` 的外部 import 只有 `vue/pinia/vue-router/three/leaflet/driver.js/3d-tiles-renderer/@meteor3d/core`——原生 `<input>`，无 element-plus。
- **运行页 SDK**：`loadScene({sceneId,serverUrl,container,config})` 返回实例 API：`on/off`（事件：`scene-click`/`scene-ready`/`animation-state-changed`/`control-mode-changed`）、`getObjectByBid`、`moveTo`、`focusObject`、`followObject`、`setView`、`setControlMode('orbit'|'ghost')`。
- **运行时能力**：`HighlightManager`（对象/BID 高亮）、`OutlineManager`、`LabelManager`（CSS2D 标签，`createLabel/updateLabel/removeLabel`）、`RaycastManager`（**three-mesh-bvh 加速**）、`AnimationManager`（per-bid controller）。
- **撤销重做**：`CommandFactory.js`（Add/Delete/Transform/Reparent/Composite）+ `HistoryManager.js`——位于 `scene-editor` 包，**不在 core**；运行页不需要。

### 2.3 存储体积实测（C1 的依据）

| 场景 | 对象数 | 原样（含 Mongo 键/默认值/id-bid 重复） | 精简后 | 均值 |
|---|---|---|---|---|
| 智慧工厂车间 | 172 | **139.0 KiB（108.6%，超限）** | 68.4 KiB（53.4%） | 407 B/对象 |
| 机器人展厅 | 43 | 34.9 KiB | 18.8 KiB（14.7%） | 449 B/对象 |

单个 primitive 的字节构成（`CNC_01_机身`，618 B）：`material` 247 B（其中过半是默认值 `emissive:0/wireframe:false/…`）、`geometry` 129 B、`id`+`bid` 50 B（值相同）、Mongo 键 117 B、transform 62 B。

> 更正：上轮评估称"1.5 KB/对象、50 对象无忧"系由单对象样本外推，**偏乐观**；实测均值为 407 B（精简后）/~800 B（原样）。

---

## 3. 目标架构

```
hmi-studio/src/
├─ vendor/meteor3d/                 ★ 新增：上游源码 vendored（锁 5ca4b84 + 带入补丁 + MIT LICENSE）
│  ├─ LICENSE                       上游 MIT（义务：保留版权声明）
│  ├─ core/                         = packages/core/src（7625 行，SDK：SceneManager/各 Manager/restoreScene）
│  ├─ editor/                       = packages/scene-editor/src（面板层 6637 行）
│  └─ PATCHES.md                    ★ 本地补丁清单（每条：上游缺陷 → 改动 → 可否上游）
├─ modules3d-meteor/                ★ 新增：适配层（hmi-studio 与 vendor 的唯一边界）
│  ├─ store-adapter.ts              DBManager 替身：getSceneData/saveScene → screensApi（含精简序列化+乐观锁）
│  ├─ compact.ts                    精简序列化/反序列化（纯函数，单测）
│  ├─ schema.ts                     scene3d/2 契约（类型 + 校验 + 与 scene3d/1 判别）
│  ├─ bindings.ts                   bid → 点位字段映射 + SSE → 场景驱动（纯逻辑 + 薄 three 调用）
│  ├─ events.ts                     点击/联动规则求值（纯函数）
│  ├─ assets.ts                     工业图元清单（对齐 symbols/registry 的概念，独立注册表）
│  ├─ types.d.ts                    vendor 的最小类型声明（上游无 d.ts）
│  └─ index.ts                      唯一允许 import vendor 的出口
├─ views3d/
│  ├─ Scene3DView.vue               已有：scene3d/1 运行页（程序化几何）——保留
│  ├─ Scene3DRunView.vue            ★ 新增：scene3d/2 运行页（Meteor 渲染 + SSE）
│  └─ Scene3DEditView.vue           ★ 新增：3D 编辑器页壳（顶栏复用 EditView 结构 + 挂 vendor EditorView）
├─ lib/
│  ├─ screens.ts                    已有 getScene/putScene（P1 导航分列时已落地）
│  ├─ scene3d.ts                    已有 SceneDoc(v1)；★ 扩展 v2 类型与判别
│  └─ screen-list.ts                已有 loadScreenCardsByKind
└─ router.ts                        ★ 新增 /edit3d/:id；/view3d/:id 按 $schema 分派 v1/v2
```

**不引入的东西**：`meteor3d-server`（Express+MongoDB+Redis）、`asset-manager` 包、`@sparkjsdev/spark`（动态 import，不装则泼溅不可用）。
> `3d-tiles-renderer` **必须安装**：core 顶层静态 import（`SceneManager`/`PersistenceManager` 耦合 GIS/tiles，实测不可裁，§6.2）——用 `manualChunks` 隔离为独立 chunk。
文档存储走 **rs-iot 元数据资源族**：建议新增 `scene:*`（Q1a），回退方案为 `screen:*` + compact。

### 3.1 数据流

```
编辑：/edit3d/:id ──getScene──▶ scene3d/2 doc ──restoreScene──▶ Meteor 编辑器
                                   ▲                                  │ saveScene
                                   └── putScene(if_version；精简可选) ◀──┘

运行：/view3d/:id ──getScene──▶ $schema 判别 ──┬─ v1 → Scene3DView（现有）
                                              └─ v2 → Scene3DRunView ─ restoreScene(doc,{syncEditorStore:false})
                                                        ├─ createRtdataStream(boundDevsOf) ─▶ bindings.apply
                                                        ├─ createAlarmStream ─▶ syntheticFields ─▶ prioMap ─▶ Highlight
                                                        ├─ installBridge(view) ─▶ 事件 command 下发
                                                        └─ setAgentPageScreenInfo ─▶ AI 页面上下文
```

---

## 4. 场景文档契约：`agent-hmi.scene3d/2`

```ts
interface SceneDocV2 {
  $schema: 'agent-hmi.scene3d/2'
  /** 与 v1 及 2D 画面一致：name/group 在 meta 内（scene3d-meta.ts 契约） */
  meta: { name: string; group: string }
  /** Meteor 原生：SceneManager.objects 的精简序列化（compact.ts 的输出） */
  objects: MeteorObjectRecord[]        // { bid, type, name, visible, position, rotation, scale, geometry?, material?, url?, assetId?, animation? }
  /** Meteor 原生：场景级配置（原 metadata 子集） */
  scene: {
    lightingConfig?: LightingConfig    // 含 enabled——避免"默认黑场"（D1）
    initialView?: { position: Vec3; target: Vec3 }
    environmentUrl?: string | null
    cameraFar?: number
  }
  /** ★ hmi-studio 语义层（Meteor 没有） */
  bindings: SceneBinding[]
  events: SceneEventRule[]
}

interface SceneBinding {
  id: string                 // 稳定 id
  targetBid: string          // 指向 objects[].bid（Meteor 的持久节点标识）
  field: string              // rs-iot 点位：'<devid>.<tag>'，判定规则复用 binds.ts 的 isSyntheticField
  /** 冗余记录 devid（field 前段解析得到），供命令下发反查目标设备（§13.3） */
  devId: string
  kind: 'color' | 'visible' | 'label' | 'emissive' | 'animationSpeed'
  /** kind 的参数，例如 color: 阈值→颜色表；label: 模板与单位；visible: 真值映射 */
  config: Record<string, unknown>
}

interface SceneEventRule {
  id: string
  on: { type: 'click'; targetBid?: string }      // targetBid 省略 = 任意对象
  do: (
    | { type: 'navigate'; slug: string; dev?: string }        // → 2D 画面（faceplate 等），复用 nav.ts parseNavTarget
    | { type: 'command'; targetBid: string; cmd: string; params?: Record<string, unknown> } // 走 bridge（§13.3）
    | { type: 'focus'; targetBid: string }
    | { type: 'setCamera'; view: { position: Vec3; target: Vec3 } }
  )
}
```

**设计原则**
1. `objects`/`scene` 是 **Meteor 原生形态的精简版**，不自创格式——切换内核只换这两段的产出/消费，`bindings/events` 不受影响。
2. `bid` 是绑定与事件的**唯一引用键**。Meteor 在 `SceneManager.addObject` 时为每个节点分配 bid 并持久化（`BidRegistry`），满足稳定性；但**用户在编辑器里删除再拖入同款对象会得到新 bid** → 绑定悬空。处置见 §7 R3。
3. **不保存 `nodeGraph` / `nodeBindings`**——**体积决策，非缺陷规避**：实测仅 3 台 GLTF 即 189 KiB（见 §8.3），保存则必超 128 KiB。代价是放弃"跨模型节点重挂/删除模型子节点"（工业组态不需要）。恢复链路本身经复测正常。

### 4.1 与 scene3d/1 的关系

**并存，不转换。** v1（`src/lib/scene3d.ts`）是语义节点模型（`kind:'flowmeter'` + 程序化几何），继续由现有 `Scene3DView.vue` 渲染；v2 由新运行页渲染。运行页/列表页按 `$schema` 判别（`isScene3D` 扩展为识别两版，新增 `scene3dVersion(doc)`）。

---

## 5. 适配层设计（`src/modules3d-meteor/`）

### 5.1 存储适配（`store-adapter.ts` + `compact.ts`）

替换 Meteor `DBManager` 的两个方法。**客户端按 Q1a 决策二选一**：

| 资源族 | 客户端 |
|---|---|
| 采纳 `scenes`（推荐） | `scenesApi.getScene/putScene/versions/rollback`（结构与 `screensApi` 同形，共用 `api()` 与 401 链） |
| 回退 `screens` | `screensApi.getScene/putScene`（已落地），且 compact **必做** |

| Meteor 原方法 | 适配实现 |
|---|---|
| `getSceneData(sceneId)` → `{objects, metadata}` | `getScene(id)` → v2 doc → `expand()` 还原默认值 → `{objects, metadata:{lightingConfig, initialView, …}}` |
| `saveScene({objects, metadata,…})` | `compact(objects)`（采纳 scenes 时可选）+ 合并 `bindings/events/meta` → `putScene(id, doc, version)`；**版本号由适配层持有**（加载时取、保存时传、成功后更新） |

**精简规则（compact，C1 的核心，纯函数可单测）**
- 删除：`_id/__v/sceneId/createdAt/updatedAt`（Mongo 键，本就不该进 rs-iot）
- 删除 `id`（与 `bid` 同值；expand 时还原 `id = bid`）
- `material` 中等于默认值的键删除（`emissive:0, emissiveIntensity:1, opacity:1, alphaTest:0, wireframe:false, flatShading:false, blending:1, side:0, transparent:false, depthTest/depthWrite:true, vertexColors:false`）；**保留非默认的自发光/透明度**（D2 的教训）
- `visible:true` 删除；`type === geometry.type` 时删 `type`
- 浮点保留 5 位小数（transform）
- 实测效果：139 KiB → 68.4 KiB（49%）

**保真边界（必须单测锁住）**：compact→expand 往返后，`restoreScene` 渲染结果与原对象逐属性一致（颜色/自发光/透明度/金属度/变换/动画配置）。

### 5.2 场景级配置默认值（规避 D1）

`expand()` 时若 doc 无 `scene.lightingConfig`，注入**非全零默认**（`enabled:true, ambient:0.85, hemisphere:1.8, key:3, fill:2, head:1.5, azimuth:45, elevation:55, exposure:1.25`——即 DEMO 实测可用的棚灯预设），而非上游的 `DEFAULT_LIGHTING`（全零）。新建 3D 场景工厂 `blankScene3D()` 同步写入该预设。

### 5.3 保存与并发（C2）

- **乐观锁**：适配层持有 `version`；`putScene(id, doc, version)`；409 → 提示"场景已被其他窗口修改"，提供"重新加载 / 另存为"。
- **自动保存策略**：上游每 10s 无条件 `save()`。改为：①有脏标记才保存（监听 `HistoryManager` 的命令执行 + 属性变更）；②自动保存**静默**且失败不弹错（只记 console + 顶栏状态点）；③**409 时自动关闭本页自动保存**直到用户处置，避免持续互相覆盖。
- **离开拦截**：沿用 2D `EditView` 的"未保存改动"提示语义。

### 5.4 编辑器页壳（`Scene3DEditView.vue`）

复用 2D `EditView.vue` 的顶栏结构（返回列表 / 画面名 / 版本 / 用户 / 退出 / 主题），主体挂 vendor 的 `EditorView`。生命周期纪律：
- 路由离开**必须**触发 `sceneManager.dispose()` + `animationManager.dispose()`（vendor Viewport 的 `onBeforeUnmount` 已做，适配层不得绕过其卸载路径）
- `window.editor` 全局：进入 3D 编辑页设置、离开清空（vendor 已在卸载时清理，需回归验证从 `/edit3d/:id` → `/edit/:id`（maotu）无 WebGL 上下文泄漏、无白屏）

### 5.5 运行页（`Scene3DRunView.vue`）

运行页必须接 **5 条与 2D 同源的数据通路**（`ViewView.vue` 的真实结构，见 §13.1）。只接第 1 条就不是平行线：

```
getScene(id) → doc(v2)
sceneManager = new SceneManager(canvas)
persistenceManager = new PersistenceManager(sceneManager, null, null, {dracoPath, ktx2Path})   // 不传 store
await restoreAll(doc)            // 并行恢复（batched cap 4），见 §13.4 T1
view = doc.scene.initialView（有则 setView，无则 fitCameraToScene）

① 实时值   stream = createRtdataStream({ devs: boundDevsOf(doc), onPoint: p => bindings.apply(sceneManager, p) })
           // boundDevsOf = bindings[].field ∪ events 引用点，口径同 binds.ts collectBinds；不是"场景内所有设备"
② 告警     alarmStream = createAlarmStream({...}) → AlarmStore
           onAlarmChange: agg = aggregateAlarms(store.active())
                          syntheticFields(agg, devs, qualityOfStream(state), fields)
                          → prioMap: devId → prio  → highlight.apply(sceneManager, prioMap)
③ 合成点   __area.*.alarm_count / __sys.quality → 场景级 HUD（Labels 或 DOM 角标），与 2D 口径一致
④ 命令     bridge = installBridge({ mode: 'view', router })   // 与 ViewView 同款
           事件 command → bridge.send(devId, cmd, params)      // devId 来自 SceneBinding.devId
⑤ 上下文   setAgentPageScreenInfo({ slug, name, group })       // AI 页面上下文与 2D 对齐
```

`bindings.apply` 按 `kind` 落到 Meteor 运行时能力：`color`/`emissive` → 材质；`visible` → 布尔映射；
`label` → `LabelManager.createLabel/updateLabel`；`animationSpeed` → `AnimationManager.setAnimationSpeed`。
**告警不走 bindings**，而是②的 `prioMap` → `HighlightManager`/`OutlineManager`（与 2D 的 `__prio` 注入语义等价）。

---

## 6. 关键决策明细

### 6.1 vendor 方式：源码拷贝进仓（而非 submodule / npm）

| 方式 | 取舍 |
|---|---|
| **源码拷贝进 `src/vendor/meteor3d/`（选用）** | 可直接打补丁（D4 自动保存策略需改源码——唯一一处）；构建链统一（Vite/TS）；离线可构建；锁 commit 记录在 `PATCHES.md` |
| git submodule | 补丁需 fork 维护，CI 检出复杂（本仓 CI 已有 lux/tsink 两个外部检出的复杂度，见 rs-iot CI） |
| npm 包 | 上游 `private:true` 未发包；无法打补丁 |

**义务**：保留上游 `LICENSE`（MIT）与版权声明；`PATCHES.md` 逐条登记改动，便于上游/升级。

### 6.2 vendor 范围（裁剪）——按"依赖层级"分三档

**依赖层级实测（2026-11-26，源码 import 定位）**：

| 模块 | 在 core 中的耦合方式 | 能否直接删 |
|---|---|---|
| `GeoCoordinateSystem` / `TileMapManager` / `GisUtils` | `SceneManager.js` 顶部（@5ca4b84） **顶层静态 import** | ✗ 不能删文件（SceneManager 依赖其 API） |
| `3d-tiles-renderer` | `PersistenceManager.js` 顶部（@5ca4b84） **顶层静态 import**（`TilesRenderer`） | ✗ 不能删；该 npm 包必须安装 |
| `@sparkjsdev/spark`（高斯泼溅） | `PersistenceManager.js` 的泼溅加载分支（@5ca4b84） **动态 `import()`** | ✓ 可不装（仅加载泼溅资产时才触发） |
| `leaflet` / `MapSelectorDialog` / `GisSettingsPanel` | 仅 `scene-editor` 面板层 | ✓ 可不带入面板 |
| `cannon-es` / 天气面板 | `scene-editor` 面板层 | ✓ 可延后 |
| `asset-manager` / `meteor3d-server` | 独立包 | ✓ 不带入 |

**结论：三档处置**
- **档 A 全量带入 core**（含 GIS/tiles 代码）：core 内部是静态耦合，强行裁剪的改动面与回归风险高于收益。代价是安装 `3d-tiles-renderer`（MIT）并接受其进入 bundle——用 Vite 手动分 chunk 隔离（`manualChunks`），不让它进首屏。
- **档 B 面板层按需带入**：GIS/地图/天气面板与 `leaflet` 不带入；`EditorView.vue` 里对应页签移除（纯模板改动，一处）。
- **档 C 不装**：`@sparkjsdev/spark`（动态 import，运行时按需——不装则泼溅资产类型不可用，在物料库里隐藏该分类即可）。

> 原计划"把 GIS 从 core 删掉"不可行（上面实测），已改为"全量带入 core + 面板按需"。P0 第 1 步不再有"评估裁剪耦合"的不确定性，改为直接落地三档。

### 6.3 超 128 KiB 的策略（C1）

精简后上限约 300 对象。超出时按序启用：
1. **模型外置**（默认已是）：GLTF 只存 `url+assetId`，体积在资产文件不在文档。
2. **图元组合**：重复结构（如 18 根滚筒、货架料箱）由 N 个对象改为 1 个"阵列/组合"对象 + 参数（需编辑器支持，P3+）。
3. **分片**：`objects` 拆到 `screen:<id>#parts/<n>` 多 key，加载时合并（需 rs-iot 侧确认 id 词法允许 `#`，否则用 `-part-` 后缀）。
4. **保存前校验**：适配层算 `TextEncoder.encode(JSON.stringify(doc)).length`，> 120 KiB 警告、> 128 KiB 阻止并提示（不让后端 413 裸露给用户）。

### 6.4 three 版本（Q2）

Meteor `^0.184` vs hmi-studio `0.187.0`。P0 首日实测：vendor 后在 0.187 下跑 core 单测 + 加载两 DEMO 场景；通过则不动版本；失败则评估锁 0.184 对现有 `src/modules3d/`（3D 运行页 v1）的回归影响。

---

## 7. 风险清单

| # | 风险 | 等级 | 应对 |
|---|---|---|---|
| R1 | three 0.187 兼容性未实测 | 中 | P0 首日验证；备选锁 0.184（§6.4） |
| R2 | `3d-tiles-renderer` 等 core 静态依赖进入 bundle，增大体积 | 低 | 实测 core 与 GIS/tiles 是静态耦合不可裁（§6.2）→ 全量带入 core，用 `manualChunks` 隔离成独立 chunk 不进首屏 |
| R3 | **绑定悬空**：对象删除重拖 → bid 变 → 绑定失效 | 中 | 保存时校验 `bindings[].targetBid ∈ objects[].bid`，悬空项在绑定面板标红而非静默丢弃；长期方案见 Q4 |
| R4 | 128 KiB 上限（精简后约 300 对象） | 中 | §6.3 四级策略；保存前体积校验 |
| R5 | 自动保存 × 乐观锁交互复杂 | 中 | §5.3：脏标记 + 409 自动停 + 手动保存兜底 |
| R6 | 上游无类型声明，vendor 代码在 TS 严格模式下报错 | 低 | vendor 目录用独立 `tsconfig`（`allowJs/checkJs:false`）+ 适配层手写最小 `types.d.ts`；`modules3d-meteor/index.ts` 是唯一出口 |
| R7 | WebGL 上下文泄漏（3D 编辑页 ↔ 2D 编辑页切换） | 中 | P0 验收项：来回切换 10 次 `about:gpu` 上下文数不增长 |
| R8 | 单人上游项目，长期维护不确定 | 中 | vendor 锁 commit 自养；补丁可上游则上游；架构上 bindings/events 独立于内核，可迁移 |
| R9 | GLB/贴图资产托管位置未定（Q3） | 低 | P0 先用 rs-iot 静态目录/gateway 静态机制；draco/ktx2 解码器需自托管（vendor `public/draco`） |
| R10 | 编辑器 UI 与 hmi-studio 风格不一致（原生 input vs element-plus） | 低 | P2 统一主题变量（`--el-*`）；不重写面板 |
| R11 | 现有 v1 运行页与 v2 并存增加维护面 | 低 | 明确 v1 冻结（只修 bug）；新场景一律 v2 |
| **R12** | **场景恢复串行**（上游 `restoreScene` 逐个 `await`）：GLTF 多时首屏线性劣化 | 中 | 适配层 `restoreAll` 用 `batched(cap 4)` 并行，随后统一节点图/父子排序（§13.4 T1） |
| **R13** | **bundle 增量**（tiles/postprocessing/vendor ≈ +1.5~2.5 MB）拖慢 2D 首屏 | 中 | `/edit3d`、v2 运行页路由级懒加载 + `manualChunks` 隔离；验收含"2D 首屏不回归"（验收 19） |
| **R14** | **vendor 长期可持续性**（14k 行 + 补丁，上游单人维护） | 中 | P0 出口做升级演练（验收 20）；不通过则改 fork + submodule |

---

## 8. 上游问题清单（按"与本方案的关系"分类）

实测过程中共遇到 9 个问题。**按归属分类**：属 `meteor3d-server`/`asset-manager` 的（本方案不引入，自动规避）、属编辑器行为的（适配层处理）、以及**一项曾被我误判为上游缺陷、实为自身错误的更正**。

### 8.1 本方案不引入的组件的问题（自动规避）

| # | 问题 | 所属组件 |
|---|---|---|
| D2 | `SceneObject` Mongoose schema 缺 `emissive/emissiveIntensity/opacity/alphaTest/wireframe/flatShading` → strict 模式剥除，自发光保存即丢 | `meteor3d-server` |
| D3 | `saveScene`/`saveInitialView` 的 `findOneAndUpdate` 未包 `$set` → 整文档替换，保存视角时吞掉 lightingConfig | `meteor3d-server` |
| D5 | load API 无 `Cache-Control` → 浏览器缓存陈旧场景 | `meteor3d-server` |
| D7 | `pnpm-workspace.yaml` 的 `allowBuilds` 是无效占位文本；`sharp` 原生依赖 install 被拦 | 构建配置 / `asset-manager`+`server` |
| D8 | 资产管线 meshopt 压缩后模型 bounds 缩小约 24 倍且无单位提示 | `asset-manager` / `server` pipeline |

→ 文档走 rs-iot 元数据资源族、资产不经其管线，以上 5 项**均不进入 hmi-studio**。但 D2 的教训（默认值被静默剥除导致保真丢失）由 `compact.ts` 的往返保真单测承接（§5.1）。

### 8.2 编辑器行为问题（适配层处理）

| # | 问题 | 处置 | 落点 |
|---|---|---|---|
| D1 | 新建场景默认灯光全零（`DEFAULT_LIGHTING`）→ 首次打开黑场 | 适配层对无 `lightingConfig` 的文档注入非零棚灯预设（§5.2） | `store-adapter.ts` |
| D4 | 每 10s 无条件自动保存，无并发保护 → 多标签互相静默覆盖 | 脏标记 + 乐观锁 + 409 自动停（§5.3） | **vendor 补丁（`Toolbar.vue`）**——本方案唯一需改 vendor 源码之处 |

### 8.3 更正：D6 不是上游缺陷

| # | 曾记录为 | 实际情况 |
|---|---|---|
| D6 | ~~"多 GLTF 实例 nodeGraph/nodeBindings 恢复缺陷，骨骼四肢飞至 150m"~~ | **误判，已更正。** 真因是我构建 DEMO 时把机器人 `scale` 设错（压缩后 bounds 0.026m 被我按原始尺寸补偿成 42 倍 → 84m 高的巨物互相遮挡），与恢复链路无关。 |

**更正依据（2026-11-26 复测，scale 修正后）**：带 `nodeGraph`（292 条）+ `nodeBindings`（每台 84 条）完整保存 → 全新加载 → 三台机器人各 19 mesh、骨架均在自身树内、**零飞出**、播放 4s 稳定。恢复链路工作正常。

**对方案的影响**：`stripBindings` **不再作为缺陷规避补丁**。但本方案**仍不保存 nodeGraph/nodeBindings**，理由改为**体积**——实测仅 3 台 GLTF：nodeGraph 105 KiB + nodeBindings 84 KiB，全量单文档 217 KiB，远超 128 KiB。取舍：放弃"跨模型节点重挂/删除模型子节点"这一高级编辑能力（工业组态不需要），换取体积可控。该取舍在 `store-adapter.ts` 的 compact 中实现（属适配层，不属 vendor 补丁）。

### 8.4 小结

需进 vendor 源码的补丁**仅 D4 一处**（自动保存策略）；D1 与"不保存节点图"均在适配层；其余 5 项不适用。


## 9. 分期实施计划

每期给「步骤 → 验证」，验证须可复现（命令 + 真实输出）。**P0 结束设停止点**，汇报后由用户决定是否继续。

### P0 — vendor 与最小闭环（预计 6~9 天；含 rs-iot 存储决策，见 §13.2）

**步骤**
1. 按三档落地（§6.2）：**全量**拷贝 `packages/core/src`；`scene-editor/src` **不带** GIS/地图/天气面板与 `leaflet`；带 `LICENSE`；建 `PATCHES.md`
2. `EditorView.vue` 移除被裁面板的页签（模板改动一处）；加独立 `tsconfig`（`allowJs`，vendor 不做 `checkJs`）
3. 新增依赖：`three-mesh-bvh`、`@tweenjs/tween.js`、`3d-tiles-renderer`（记录理由与许可，均 MIT）；`manualChunks` 隔离 tiles；three 版本验证（§6.4）
4. `schema.ts`（v2 契约 + `scene3dVersion`）、`compact.ts`（+ 单测：往返保真、体积断言）
5. `store-adapter.ts`（getScene/putScene + version 持有）
6. `Scene3DEditView.vue` + 路由 `/edit3d/:id`；3D 列表页"编辑"按钮接到它
7. **存储决策落地**（Q1，建议采纳）：rs-iot 新增 `scene` MetaKind（cap 1 MiB）——
   1 const + 7 薄 handler + 4 路由 + `validate_put` 加 cap 参数 + 指标数组 3→4（约 150 行）；
   hmi-studio 侧 `scenesApi`（`getScene/putScene/versions/rollback`）、列表页改 `/api/v1/scenes`、
   `screen-list.ts` 去掉 `is3d` 过滤、迁移现有 `iot-plant-3d`
   （若不采纳：保持 `screens`+compact，并在 `docs/` 登记"对象数>250 或体积>110KiB 即启动改造"的触发条件）
8. 把两个 DEMO 场景（工厂 172 / 展厅 43）播种为长期回归资产（配合 P0.5 的 e2e 播种）

**验证**
- `pnpm typecheck`、`pnpm test`（新增 compact/schema 单测）、`node scripts/check-layers.mjs` 通过（适配层为唯一 vendor 出口，需在分层规则中登记）
- core 单测在 0.187 下 11/11
- `git diff` 核对：vendor 相对上游 `5ca4b84` 的改动仅 D4（Toolbar 自动保存）+ 被裁面板的模板删除，与 `PATCHES.md` 一致
- `/edit3d/<工厂>` 打开：172 对象全部渲染、灯光开启、场景树完整
- 拖动一个对象 → 保存 → 读回体积（采纳 scenes：**< 1 MiB**；不采纳：**< 128 KiB**，实测值写入验收记录）→ 刷新位置保持
- 采纳 scenes 时：`GET /api/v1/scenes` 只返回 3D 场景，`GET /api/v1/screens` 只返回 2D 画面（互不混入）
- **升级演练**（§13.4 T3）：改上游一处无关代码 → 重放 D4 补丁 → core 单测 11/11 + 两 DEMO 场景回归通过
- `/edit3d/:id` ↔ `/edit/:id` 来回 10 次：无报错、无白屏
- `pnpm build`（带 `VITE_API_BASE=/api/rsiot VITE_LOGIN_PATH=/api/gw/login`）通过并部署到 gateway

**停止点**：汇报 P0 实测结果（尤其 three 兼容性、裁剪结果、体积实测），确认后进 P1。

### P0.5 — 数据面与治理对齐（**新增**，预计 4~6 天；见审查 §3）

**目的**：把 2D 线已有的 5 条数据通路与治理项补齐到 3D，否则不是平行线（审查结论）。

**步骤**
1. **订阅面**：`boundDevsOf(doc)` = `bindings[].field` ∪ `events` 引用点（口径同 `binds.ts` `collectBinds`），
   替换现有"订阅场景内全部设备"的 `bindFieldsOf`
2. **告警合成**：`modules3d-meteor/alarms.ts` —— `createAlarmStream` → `AlarmStore` → `aggregateAlarms` →
   `syntheticFields` → `prioMap(devId → prio)` → `HighlightManager`/`OutlineManager`；
   区域聚合 `__area.*` 映射到场景级 HUD
3. **资产保护**：`protected.ts` 登记 `IOT_PLANT_3D` 与后续 3D 长期资产（**当前 `iot-plant-3d` 不在册，属既有缺陷**）
4. **e2e 播种**：`seed3DScenes()`（工厂 172 / 展厅 43）纳入 `global-setup.ts`；`is3d` 相关 e2e 断言
5. **MCP 资源族分派**：`hmi-mcp` 的 screen 工具不再把 3D 文档当 2D 校验
   （采纳 `scenes` 则天然分离；否则 `hmi_validate_screen` 需按 `$schema` 早退）

**验证**
- 订阅面等价性单测：给定 v2 文档，`boundDevsOf` 输出 ⊆ 2D 同口径结果，且不含未绑定设备
- 告警一致性：让模拟器把 `dev_wm1` 推到 P1 → **2D L1 区域卡与 3D 场景同时变红**（截图对比），清除后同时恢复
- `iot-plant-3d` 出现在 `PROTECTED_SLUGS`；hmi-mcp 删除请求被拒
- `pnpm e2e` 含 3D 播种用例；e2e 清扫后 3D 场景仍在

### P1 — 运行页 + 实时驱动（预计 5~7 天）

**步骤**
1. `Scene3DRunView.vue`：`restoreScene(doc,{syncEditorStore:false})` + 初始视角 + dispose 纪律
2. `/view3d/:id` 按 `$schema` 分派 v1/v2
3. `bindings.ts`：`kind: color/visible/emissive/label/animationSpeed` 的 apply 实现（纯逻辑单测 + 薄 three 调用）
4. SSE 接入：`createRtdataStream({devs: boundDevsOf(doc)})`（复用 `src/lib/sse.ts`；订阅面由 P0.5 的 `boundDevsOf` 提供）
5. 并行恢复：`restoreAll(doc)` 用 `batched(items, 4, ...)`（复用 `screen-list.ts`），保持父子顺序语义（§13.4 T1）
5. 手写一份 bindings 的 v2 场景做端到端样例（工厂场景 3 台机床三色灯绑 `dev_*` 点位）

**验证**
- 运行页加载工厂场景，与编辑器所见一致（灯光/视角/材质）
- 修改 rs-iot 点位值（模拟器）→ 运行页对应对象颜色/标签在 ≤2 个刷新周期内变化
- SSE 断开/重连不泄漏监听；离开路由后 `sceneManager` 已 dispose
- 复用现有性能纪律：不在 per-point 回调里强制 `render()`（rAF 统一驱动——`Scene3DView.vue` 既有注释的教训）

### P2 — 绑定编辑与事件（预计 6~8 天）

**步骤**
1. 绑定面板（新组件，语义对齐 2D `BindPanel.vue`：设备树 `fetchDeviceTree` → 选点 → 选 kind → 配置）
2. 属性面板挂入口：选中对象 →「数据绑定」页签
3. `events.ts`：`click → navigate/focus/setCamera/command`；`navigate` 复用 `parseNavTarget`/`router`
4. **命令下发**（§13.3）：`installBridge({mode:'view'})` + `events.command` → `bridge.send(devId, cmd, params)`；
   目标 devId 由 `SceneBinding.devId` 反查
5. 悬空绑定校验（R3）
6. 自动保存改造（§5.3）；**`VersionPanel.vue` 泛化**（`screensApi` → 注入 client，使其同时服务 2D/3D）

**验证**
- 在编辑器里给对象绑定 `dev_wm1.flow_rate`，保存 → 运行页生效
- 点击 3D 设备 → 跳到对应 2D faceplate（`/view/iot-faceplate-*?dev=…`）
- 两窗口同时编辑同一场景：后保存者收到 409 提示，无静默覆盖
- 版本面板可列出/回滚 v2 场景（同一组件在两个编辑器内工作，未复制第二份）
- **命令**：3D 点击设备 → 下发命令 → rs-iot 收到（与 2D L2 画面的命令走同一 bridge，日志可见同构请求）

### P3 — 工业图元库与体验对齐（预计 6~9 天）

**步骤**
1. `assets.ts` + 首批工业图元：把 `src/modules3d/geometry.ts` 的设备工厂（水表/燃气表/电表/压力变送器/环境机/泵/罐）改造为"可拖放的组合对象"（Group + 子件 bid 稳定）
2. 物料库接入工业分类（水/电/气/环境）
3. 主题对齐：面板色值走 `--el-*` 变量（R10）
4. 文档：风格指南补 3D 编辑器条款；操作说明

**验证**
- 从物料库拖"远传水表"→ 落地、可选中、子件可绑定点位、保存刷新一致
- 深色/浅色主题切换面板无硬编码色残留（`lint.mjs --app` 0 FAIL）
- 新建 3D 场景 → 拖图元 → 绑定 → 保存 → 运行，全流程 ≤ 5 分钟可完成（低代码体验验收）

**合计：约 29~42 天**（P0 6~9 · P0.5 4~6 · P1 5~7 · P2 6~8 · P3 6~9；含审查新增的数据面与治理项，不含待决等待）。
> 相对首版 20~29 天的增量，来自补齐 2D 线已有的 5 条数据通路与 rs-iot 资源族——**不是范围膨胀，是原方案漏算了平行线的另一半**（审查 §1）。

---

## 10. 验收标准（对齐本仓 GATE）

**功能**
1. `/edit3d/:id`：加载 v2 文档、拖放/变换/删除对象、撤销重做、保存、刷新一致
2. `/view3d/:id`：v1/v2 按 `$schema` 正确分派；v2 渲染与编辑器一致
3. 绑定：编辑器内配置 → 运行页随 SSE 变化
4. 事件：点击 3D 对象 → 跳 2D 画面
5. 并发：409 有提示，不静默覆盖
6. 版本：可列/可回滚

**工程**
7. `pnpm typecheck` / `pnpm test` / `node scripts/check-layers.mjs` 通过
8. 对 vendor 的直接 import **仅** `src/modules3d-meteor/index.ts`（分层规则登记 + 单测守护）
9. 保存文档 ≤ 128 KiB；超限 UI 明确提示
10. `pnpm build`（带部署 env）通过
11. `PATCHES.md` 与 vendor 实际改动一致；MIT `LICENSE` 在位

**性能与稳定**
12. 172 对象场景编辑态交互流畅（主观验收 + 记录 fps）
13. `/edit3d` ↔ `/edit` 切换 10 次无 WebGL 上下文泄漏
14. 运行页 SSE per-point 回调不触发强制渲染

**平行线一致性（审查新增，§13.1）**
15. **告警一致**：同一设备 P1 时，2D L1 区域卡与 3D 场景同时变红；清除后同时恢复（截图对比留档）
16. **命令一致**：3D 点击设备下发命令，与 2D L2 画面走同一 bridge，rs-iot 侧日志同构
17. **订阅面等价**：3D 运行页订阅设备集 ⊆ 绑定/事件/告警引用集，不含未绑定设备（单测 + 运行时打印）
18. **资产保护**：3D 长期场景在 `PROTECTED_SLUGS`；hmi-mcp 拒删；e2e 清扫不误删
19. **首屏不回归**：`/hmi/`（2D 列表与 2D 编辑器）的 chunk 体积与 LCP 对比改动前无回归
20. **vendor 可持续**：升级演练通过（改上游一处 → 重放补丁 → core 单测 + 两 DEMO 回归）
21. **AI 边界**：hmi-mcp 对 3D 文档不再走 2D 校验（读可用；写按 Q10 决策，未实现时明确报错而非写坏）

---

## 11. 待决事项

| # | 待决 | 建议 | 阻塞 |
|---|---|---|---|
| Q1 | **方案批准**（本文件） | — | 全部 |
| **Q1a** | **3D 场景存储资源族**：`screens`+compact vs 新增 `scenes`（cap 1 MiB） | **`scenes`**——约 150 行 Rust，换来平行线在存储层物理分开，并消除 128KiB 四级策略/列表过滤/AI 误判三项补偿设计（审查 §2） | P0（+2~3 天） |
| Q2 | three 版本：0.187 兼容实测后定 | 先实测，倾向不动 | P0 |
| Q3 | GLB/贴图资产托管位置 | rs-iot 静态目录（复用 gateway 机制） | P1（运行页加载模型） |
| Q4 | 绑定悬空的长期方案（对象重建后 bid 不延续） | P2 出设计：组合对象/图元实例 id | P2 |
| ~~Q5~~ | ~~vendor 裁剪范围~~ | **已闭**：实测 core 与 GIS/tiles 静态耦合不可裁 → core 全量带入、面板按需（§6.2） | — |
| Q6 | vendor 方式 | **已定**：源码拷贝进仓（§6.1） | — |
| **Q7** | 3D 场景 cap（若采纳 Q1a） | **1 MiB**（≈2600 primitive，覆盖现实厂区） | P0 |
| **Q8** | 3D 编辑器 UI 基座：vendor 原生 input vs 重写为 element-plus | 先主题变量映射；若要求像素级一致需重写面板（+10~15 天） | P1 前 |
| **Q9** | 3D 是否支持命令下发 | **支持**（2D 已有，工业刚需） | P2 |
| **Q10** | 3D 是否纳入 AI 读写 | **读纳入、写暂缓**（3D 文档复杂，AI 易产悬空绑定） | P0.5/P2 |
| **Q11** | 3D 图元是否允许站点自建/插件 | 建议仅随版本发布，并在文档写明与 2D 的差异 | P3 前 |

---

## 12. 不在本方案范围

- 替换或改造 2D 编辑器（maotu）
- v1（`scene3d/1`）场景迁移到 v2
- Meteor 的 `meteor3d-server` / `asset-manager`（文档走 rs-iot；资产托管另议 Q3）
- GIS 瓦片底图、3D Tiles、高斯泼溅、天气特效
- 应用编辑器（上游商业组件，未开源）

---

## 13. 系统级审查修订（2026-11-26 晚，生效）

> 完整审查证据与 15 层对照矩阵见 **`2026-11-26-3d-editor-plan-review.md`**。本节只列结论与对本文的改动。

### 13.1 核心修正：数据面不是 1 条通路，是 5 条

首版把 3D 的数据面简化为「SSE → bindings」。对照 2D 运行页（`ViewView.vue`）的真实结构，实际有 5 条：

| # | 通路 | 2D 实现 | 3D 首版 | 已修订为 |
|---|---|---|---|---|
| ① | 实时值 | `createRtdataStream` → `setDevicePointByID` | ✓ | ✓（但订阅面收窄，见下） |
| ② | 告警 | `createAlarmStream` → `AlarmStore` → `aggregateAlarms` | ✗ | §5.5 ② |
| ③ | 合成点位 | `syntheticFields`（`__prio`/`__area`/`__sys`） | ✗ | §5.5 ③ |
| ④ | 命令 | `installBridge({mode:'view'})` | ✗ | §5.5 ④ + §13.3 |
| ⑤ | 页面上下文 | `setAgentPageScreenInfo` | ✗ | §5.5 ⑤ |

**订阅面修正**：首版 `bindFieldsOf(doc)` 订阅"场景内全部设备"；2D 只订阅**被绑定字段所属设备**。
已改为 `boundDevsOf(doc)`（`bindings[].field` ∪ `events` 引用点），口径同 `binds.ts` `collectBinds`。

### 13.2 存储：建议新增 rs-iot `scenes` 资源族（Q1a）

**问题**：把 3D 塞进 `screens` 会连带三项补偿性设计——128 KiB 四级超限策略、列表逐 doc 读 `$schema` 过滤、
hmi-mcp 的 2D 校验器误判 3D 文档（`hmi_validate_screen`）。

**成本实测**：`MetaKind` 已参数化（`routes_meta.rs:47`），新增一族 = 1 const + 7 薄 handler + 4 路由 +
`validate_put` 加 cap 参数 + 指标数组 3→4 + 隔离测试数组加一项 ≈ **150 行 Rust**；
版本/乐观锁/回滚/级联删除/判重随机制**免费继承**；`/api/rsiot/*` 网关零改动；`scene` 前缀不撞现有三族。

**收益**：平行线在存储层物理分开；2D 列表天然干净；观测可分开（`kind="scene"`）；cap 提到 1 MiB。

**若采纳**：`compact` 从"必做"降为"优化"；§6.3 四级策略仅保留"保存前体积校验"。
**若不采纳**：必须登记触发条件（对象数 > 250 或体积 > 110 KiB 即启动改造），不让 128 KiB 静默成为天花板。

### 13.3 命令下发（补 2D 已有能力）

`events.do` 增 `{type:'command', targetBid, cmd, params}`；运行页 `installBridge({mode:'view'})`；
`SceneBinding` 增 `devId` 字段（由 field 前段解析）供反查目标设备。缺此能力 3D 只能"看"不能"操作"，不构成平行线。

### 13.4 三个被低估的技术风险

| # | 风险 | 证据 | 补法 |
|---|---|---|---|
| T1 | 恢复串行 | 上游 `restoreScene` 对象循环逐个 `await` | `restoreAll` 复用 `batched(cap 4)`，保持父子顺序 |
| T2 | bundle 增量 | core 顶层静态 import tiles + three/examples 全家桶 | 路由级懒加载 + `manualChunks`；验收"2D 首屏不回归" |
| T3 | vendor 可持续 | 14k 行 + 1 处补丁 | P0 出口做升级演练（改上游 → 重放补丁 → 回归） |

### 13.5 治理项（原方案完全缺失）

| 项 | 2D 现状 | 3D 补法 | 期 |
|---|---|---|---|
| 资产保护 | `protected.ts` + hmi-mcp 删除闸 | 登记 3D 长期场景（**现有 `iot-plant-3d` 不在册，属既有缺陷**） | P0.5 |
| e2e 播种 | `seedIotScreens()` | `seed3DScenes()` 纳入 global-setup | P0.5 |
| AI/MCP | 9 读 + 7 写工具 | 按 `$schema`/资源族分派；3D 读纳入、写暂缓（Q10） | P0.5/P2 |
| 观测 | `rs_iot_meta_*{kind}` | 新资源族自带 `kind="scene"`；否则污染 screen 指标 | 随 Q1a |
| 图元扩展 | registry + 插件 + 站点自建 | 明确"仅随版本发布"（Q11） | P3 前 |

### 13.6 工期影响

20~29 天 → **29~42 天**（+P0.5 4~6 天、P0 +2~3、P2 +2~3、P3 +1）。增量全部来自补齐平行线的另一半。
