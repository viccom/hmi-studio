# 3D 组态编辑器实施方案（Meteor3DEditor 内核接入 hmi-studio）

> 日期：2026-11-26 · 状态：**方案待批准**（未实施）
> 取代：`2026-11-26-3d-hmi-editor-design.md`（该文档的选型结论已被本文档取代；其 §12 的实测评估仍是本文档的证据来源，正文 §3~§11 基于 three-editor-cores，**不再有效**）
> 关联：`2026-11-26-3d-hmi-design.md`（3D 空间层总设计）、`docs/hmi-style-guide.md` §0/§2
> 上游基线：`z2586300277/threejs-editor` 同作者的 `nikonikoCW/Meteor3DEditor` @ commit **`5ca4b84`**（2026-11-11，MIT）

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
| C1 | rs-iot 单文档上限 **128 KiB** | ① 172 对象场景**原样存储 139 KiB，超限**；② 上游的 `nodeGraph`+`nodeBindings` 更重：**仅 3 台 GLTF 就 189 KiB**（105+84），全量存 217 KiB | 适配层**必须**做两件事：(a) 精简序列化（去 Mongo 键/材质默认值/重复 id）→ 172 对象场景 **68.4 KiB**（均 407 B/对象，上限约 **311 个**）；(b) **不保存 nodeGraph/nodeBindings**（否则含模型的场景必超限）。超限走 §6.3 |
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

**不引入的东西**：`meteor3d-server`（Express+MongoDB+Redis）、`asset-manager` 包、`3d-tiles-renderer`/`@sparkjsdev/spark`（GIS 瓦片与特效，工业场景不需要；vendor 时按需裁剪，见 Q5）。文档存储一律走 **rs-iot `screen:*`**。

### 3.1 数据流

```
编辑：/edit3d/:id ──getScene──▶ scene3d/2 doc ──restoreScene──▶ Meteor 编辑器
                                   ▲                                  │ saveScene
                                   └── putScene(精简, if_version) ◀────┘

运行：/view3d/:id ──getScene──▶ $schema 判别 ──┬─ v1 → Scene3DView（现有）
                                              └─ v2 → Scene3DRunView ─ restoreScene(doc,{syncEditorStore:false})
                                                        └─ createRtdataStream(devs) ─onPoint─▶ bindings.apply(bid, value)
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
  field: string              // rs-iot 点位：'<devid>.<tag>'
  kind: 'color' | 'visible' | 'label' | 'emissive' | 'animationSpeed'
  /** kind 的参数，例如 color: 阈值→颜色表；label: 模板与单位；visible: 真值映射 */
  config: Record<string, unknown>
}

interface SceneEventRule {
  id: string
  on: { type: 'click'; targetBid?: string }      // targetBid 省略 = 任意对象
  do: (
    | { type: 'navigate'; slug: string; dev?: string }        // → 2D 画面（faceplate 等）
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

替换 Meteor `DBManager` 的两个方法：

| Meteor 原方法 | 适配实现 |
|---|---|
| `getSceneData(sceneId)` → `{objects, metadata}` | `screensApi.getScene(id)` → v2 doc → `expand()` 还原默认值 → `{objects, metadata:{lightingConfig, initialView, …}}` |
| `saveScene({objects, metadata,…})` | `compact(objects)` + 合并 doc 的 `bindings/events/meta` → `screensApi.putScene(id, doc, version)`；**版本号由适配层持有**（加载时取、保存时传、成功后更新） |

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

```
getScene(id) → doc(v2)
sceneManager = new SceneManager(canvas)
persistenceManager = new PersistenceManager(sceneManager, null, null, {dracoPath, ktx2Path})   // 不传 store
await persistenceManager.restoreScene(doc, {syncEditorStore:false, notifyFailures:false, serverUrl})
view = sceneManager.initialView（有则 setView，无则 fitCameraToScene）
stream = createRtdataStream({ devs: bindFieldsOf(doc), onPoint: p => bindings.apply(sceneManager, p) })
sceneManager.on('scene-click', e => events.handle(e, { router }))
```

`bindings.apply` 按 `kind` 落到 Meteor 运行时能力：`color`/`emissive` → 材质；`visible` → 布尔映射；`label` → `LabelManager.createLabel/updateLabel`（悬浮数值标签）；`animationSpeed` → `AnimationManager.setAnimationSpeed`；告警态额外调 `HighlightManager.enable`。

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

→ 文档走 rs-iot `screen:*`、资产不经其管线，以上 5 项**均不进入 hmi-studio**。但 D2 的教训（默认值被静默剥除导致保真丢失）由 `compact.ts` 的往返保真单测承接（§5.1）。

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

### P0 — vendor 与最小闭环（预计 4~6 天）

**步骤**
1. 按三档落地（§6.2）：**全量**拷贝 `packages/core/src`；`scene-editor/src` **不带** GIS/地图/天气面板与 `leaflet`；带 `LICENSE`；建 `PATCHES.md`
2. `EditorView.vue` 移除被裁面板的页签（模板改动一处）；加独立 `tsconfig`（`allowJs`，vendor 不做 `checkJs`）
3. 新增依赖：`three-mesh-bvh`、`@tweenjs/tween.js`、`3d-tiles-renderer`（记录理由与许可，均 MIT）；`manualChunks` 隔离 tiles；three 版本验证（§6.4）
4. `schema.ts`（v2 契约 + `scene3dVersion`）、`compact.ts`（+ 单测：往返保真、体积断言）
5. `store-adapter.ts`（getScene/putScene + version 持有）
6. `Scene3DEditView.vue` + 路由 `/edit3d/:id`；3D 列表页"编辑"按钮接到它
7. 把两个 DEMO 场景（工厂 172 / 展厅 43）经 compact 写入 rs-iot `screen:*`（成为长期回归资产）

**验证**
- `pnpm typecheck`、`pnpm test`（新增 compact/schema 单测）、`node scripts/check-layers.mjs` 通过（适配层为唯一 vendor 出口，需在分层规则中登记）
- core 单测在 0.187 下 11/11
- `git diff` 核对：vendor 相对上游 `5ca4b84` 的改动仅 D4（Toolbar 自动保存）+ 被裁面板的模板删除，与 `PATCHES.md` 一致
- `/edit3d/<工厂>` 打开：172 对象全部渲染、灯光开启、场景树完整
- 拖动一个对象 → 保存 → `GET /api/v1/screens/<id>` 体积 **< 128 KiB**（实测值写入验收记录）→ 刷新位置保持
- `/edit3d/:id` ↔ `/edit/:id` 来回 10 次：无报错、无白屏
- `pnpm build`（带 `VITE_API_BASE=/api/rsiot VITE_LOGIN_PATH=/api/gw/login`）通过并部署到 gateway

**停止点**：汇报 P0 实测结果（尤其 three 兼容性、裁剪结果、体积实测），确认后进 P1。

### P1 — 运行页 + 实时驱动（预计 5~7 天）

**步骤**
1. `Scene3DRunView.vue`：`restoreScene(doc,{syncEditorStore:false})` + 初始视角 + dispose 纪律
2. `/view3d/:id` 按 `$schema` 分派 v1/v2
3. `bindings.ts`：`kind: color/visible/emissive/label/animationSpeed` 的 apply 实现（纯逻辑单测 + 薄 three 调用）
4. SSE 接入：`createRtdataStream({devs: bindFieldsOf(doc)})`（复用 `src/lib/sse.ts`）
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
3. `events.ts`：`click → navigate/focus/setCamera`；`navigate` 复用 `parseNavTarget`/`router`
4. 悬空绑定校验（R3）
5. 自动保存改造（§5.3）与版本面板接入（复用 `VersionPanel.vue`）

**验证**
- 在编辑器里给对象绑定 `dev_wm1.flow_rate`，保存 → 运行页生效
- 点击 3D 设备 → 跳到对应 2D faceplate（`/view/iot-faceplate-*?dev=…`）
- 两窗口同时编辑同一场景：后保存者收到 409 提示，无静默覆盖
- 版本面板可列出/回滚 v2 场景

### P3 — 工业图元库与体验对齐（预计 5~8 天）

**步骤**
1. `assets.ts` + 首批工业图元：把 `src/modules3d/geometry.ts` 的设备工厂（水表/燃气表/电表/压力变送器/环境机/泵/罐）改造为"可拖放的组合对象"（Group + 子件 bid 稳定）
2. 物料库接入工业分类（水/电/气/环境）
3. 主题对齐：面板色值走 `--el-*` 变量（R10）
4. 文档：风格指南补 3D 编辑器条款；操作说明

**验证**
- 从物料库拖"远传水表"→ 落地、可选中、子件可绑定点位、保存刷新一致
- 深色/浅色主题切换面板无硬编码色残留（`lint.mjs --app` 0 FAIL）
- 新建 3D 场景 → 拖图元 → 绑定 → 保存 → 运行，全流程 ≤ 5 分钟可完成（低代码体验验收）

**合计：约 20~29 天**（不含 Q1~Q5 待决造成的等待）。

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

---

## 11. 待决事项

| # | 待决 | 建议 | 阻塞 |
|---|---|---|---|
| Q1 | **方案批准**（本文件） | — | 全部 |
| Q2 | three 版本：0.187 兼容实测后定 | 先实测，倾向不动 | P0 |
| Q3 | GLB/贴图资产托管位置 | rs-iot 静态目录（复用 gateway 机制） | P1（运行页加载模型） |
| Q4 | 绑定悬空的长期方案（对象重建后 bid 不延续） | P2 出设计：组合对象/图元实例 id | P2 |
| ~~Q5~~ | ~~vendor 裁剪范围~~ | **已闭**：实测 core 与 GIS/tiles 静态耦合不可裁 → core 全量带入、面板按需（§6.2） | — |

---

## 12. 不在本方案范围

- 替换或改造 2D 编辑器（maotu）
- v1（`scene3d/1`）场景迁移到 v2
- Meteor 的 `meteor3d-server` / `asset-manager`（文档走 rs-iot；资产托管另议 Q3）
- GIS 瓦片底图、3D Tiles、高斯泼溅、天气特效
- 应用编辑器（上游商业组件，未开源）
