# 3D HMI 组态编辑器技术方案（threejs-editor 内核引入 hmi-studio）

> 日期：2026-11-26 · 状态：**待评审**（本轮只出方案，不实现）
> 关联：`docs/plans/2026-11-26-3d-hmi-design.md`（3D 空间层总设计）、`docs/hmi-style-guide.md` §0/§2（三类画面）
> 调研对象：`3D研究/threejs-editor`（`z2586300277/threejs-editor`）

---

## 0. 一句话结论

以 `three-edit-cores`（npm 内核包）为编辑器内核，hmi-studio 出**适配层**（`src/modules3d3d/`），
复用本仓已有的登录/顶栏/存储/版本/绑定/主题基座，新增 `/edit3d/:id` 路由与 3D 编辑器视图。
**三个硬约束必须先决策**：内核包 npm 许可为 Proprietary、three 版本 0.184 vs 本仓 0.187、内核强依赖 `window.*` 全局。

---

## 1. 目标与边界

### 1.1 目标

开发一个与现有 2D HMI 组态编辑器（`maotu` 的 `MtEdit`，`src/views/EditView.vue`）**同级别**的 3D 组态编辑器：
物料库 + 三维画布 + 变换 gizmo + 属性面板 + 场景树 + 撤销重做 + 设备点位绑定 + 事件联动 + 版本面板 + 保存/预览。

### 1.2 边界

| 项 | 处置 |
|---|---|
| 2D 编辑器（maotu） | 不动。3D 编辑器是并列的第二套编辑器，不改 maotu 集成方式 |
| 现有 3D 运行页（`src/views3d/Scene3DView.vue`） | 保留，但需支持新文档格式（§4） |
| 现有 3D 场景文档（`agent-hmi.scene3d/1`） | 保留兼容；新编辑器产出 `scene3d/2`（§4） |
| 3D 组件库（threejs-editor 的 45 个 `compoents/*.js`） | 择机移植（§7），不做全量搬运 |
| 运行时性能优化（实例化、LOD） | 不在本方案范围（工业场景 10~50 设备量级，gizmo 编辑优先） |

---

## 2. 调研结论（2026-11-26 实测）

### 2.1 threejs-editor 的架构：UI 是薄壳，核心在 npm 包

`src/editor/lib.js` 全文只有一行：

```js
export * from 'three-edit-cores'
```

`src/editor/*.vue` 共 1840 行（index.vue 724 / right.vue 478 / left.vue 350 / editor.vue 89 / indexDb.js 136），
全部是**围绕内核实例的薄面板**，不含 gizmo/序列化/撤销栈的实现。

**这意味着：引入它 = 引入 npm 内核包 + 重写面板层，不存在「抄 UI 就能用」的路径。**

### 2.2 内核 API 面（实测自 `src/editor/editor.vue`、`left.vue`、`right.vue`）

```ts
const editor = new ThreeEditor(hostEl, {
  fps, pixelRatio,
  webglRenderParams: { antialias, alpha, logarithmicDepthBuffer },
  sceneParams,                       // 场景 JSON（见 §4.2）
})
editor.saveSceneEdit()               // → 场景 JSON（保存用）
editor.resetEditorStorage(sceneJson) // ← 加载场景
editor.getSceneEditorImage(['image/png','0.8']) // → base64 缩略图
editor.scene / editor.camera / editor.controls / editor.transformControls / editor.handler
editor.destroySceneRender()
```

面板与内核的通信方式是 **`window.*` 全局**（`window.threeEditor`、`window.updateSceneStats`、
`window.left_loadModel`）——这是 §5.3 全局隔离问题的来源。

### 2.3 内核的组件契约

`src/editor/compoents/*.js`（45 个）统一形态：

```js
export default {
  name: '围墙', label: '围墙',
  create(_,{scene}) { /* 建 three 对象并加入 scene */ },
}
```

组件库清单经 `window.editorJsons` / `window.models` / `window.addon_editor_json` 三个全局注入
（`src/editor/left.vue:111-129`）。

### 2.4 场景 JSON 结构（实测 `docs/editorJson/几何体.json`）

顶层键：`scene` / `perspectiveCamera` / `webglRenderer` / `orbitControls` / `transformControls` /
`effectComposer` / `handler` / `lightCores` / `innerCores` / `modelCores` / `textCores` /
`particleCores` / `geoCores` / `designCores` / `other`。

其中 `innerCores` 是图元实例数组，每个元素是**完整参数化序列化**：

```json
{ "name":"", "position":{"x":0,"y":0,"z":0}, "rotation":{...}, "scale":{...},
  "geometry":{"type":"BoxGeometry","parameters":{"width":1,"height":1,"depth":1,...}},
  "material":{"type":"MeshStandardMaterial","color":16777215,"roughness":0,"metalness":1,...} }
```

### 2.5 三个硬约束

| # | 约束 | 事实依据 | 影响 |
|---|---|---|---|
| H1 | **许可** | npm `three-edit-cores@0.0.19` 标注 `Proprietary`（`npm view` 实测）；但仓库源码是 Apache-2.0，且官方 README 指向**另一个开源仓库** `z2586300277/three-editor-cores`（"永久开源"） | 决定能否合法引入；见 §5.1 |
| H2 | **版本** | 内核依赖 `three@^0.184`；本仓 `three@0.187.0` | r184→r187 有 API 变更（`outputColorSpace` 等在 r152/r155 已改，r186/r187 另有变更）；必须逐项验证；见 §5.2 |
| H3 | **全局污染** | 内核与面板经 `window.*` 通信（§2.2） | 与 2D 编辑器同页共存会互相污染；见 §5.3 |

---

## 3. 目标架构

```
hmi-studio/
├─ src/
│  ├─ views3d/
│  │  ├─ Scene3DView.vue        # 运行页（已有，需支持 scene3d/2）
│  │  └─ Scene3DEditView.vue    # ★新增：3D 编辑器页（/edit3d/:id）
│  ├─ modules3d3d/              # ★新增：内核适配层
│  │  ├─ core.ts                # ThreeEditor 生命周期封装（创建/销毁/加载/保存）
│  │  ├─ schema.ts              # scene3d/2 文档契约（类型 + 校验 + 转换）
│  │  ├─ bindings.ts            # 设备点位绑定模型（对齐 2D 的 binds 语义）
│  │  ├─ events.ts              # 事件/联动模型
│  │  ├─ assets.ts              # 组件库/模型资源清单（对齐 2D 的 symbols/registry）
│  │  └─ components/            # 3D 编辑器面板（左物料库 / 右属性面板 / 场景树）
│  ├─ lib/
│  │  ├─ screens.ts             # 已有：补 getScene/putScene（已随 2D/3D 分列落地）
│  │  ├─ scene3d-meta.ts        # 已有：3D 文档 meta 改写（勿用 2D 的 unwrapDoc）
│  │  └─ screen-list.ts         # 已有：loadScreenCardsByKind
│  └─ router.ts                 # 已有 /screens3d；★新增 /edit3d/:id
```

### 3.1 与 2D 编辑器的对称关系

| 能力 | 2D（maotu MtEdit） | 3D（本方案） | 复用来源 |
|---|---|---|---|
| 顶栏（画面切换/版本/用户/退出） | `EditView.vue` 自绘 | 同构 | 抄 2D 顶栏结构 |
| 物料库 | maotu 内置（左栏） | 自绘左栏 + 内核 `window.editorJsons` | 新建 |
| 画布 | maotu 2D canvas | 内核 WebGL 画布 | 内核 |
| 变换操作 | 拖拽/缩放图元 | 内核 `transformControls`（平移/旋转/缩放） | 内核 |
| 属性面板 | maotu 内置（右栏） | 自绘右栏，读 `threeEditor.scene.children[i]` | 新建 |
| 场景树 | 无（2D 画布即结构） | **需新建**（内核无树视图） | 新建 |
| 撤销重做 | maotu 内置 | 内核有 `handleUndo/handleRedo` 事件（`index.vue` 已用） | 内核 |
| 设备绑定 | `BindPanel.vue` + `device-tree.ts` | 同构（3D 点位绑定面板） | 复用 2D 的绑定语义 |
| 事件/联动 | maotu `eventList`/`eventFlow` | 新建 3D 事件模型 | 新建 |
| 版本面板 | `VersionPanel.vue` | **直接复用**（只依赖 screensApi） | 复用 |
| 预览 | `openPreview`（新窗口 /view/:id） | 同构（/view3d/:id） | 复用 |
| 保存 | `screensApi.put(slug, wrapDoc(done,meta), version)` | `screensApi.putScene(slug, doc, version)` | 复用 |

**结论**：2D 编辑器里**约 40% 是可复用的周边设施**（顶栏、版本面板、绑定面板、设备树、预览、保存链路），
核心编辑交互（画布/gizmo/属性面板/场景树）必须新建或由内核提供。

---

## 4. 场景文档格式

### 4.1 版本策略

- 现有 `agent-hmi.scene3d/1`（`src/lib/scene3d.ts`）：手写 `nodes`/`links` 数组，`SceneNode` 是**语义级**描述
  （`kind: 'flowmeter'` + `pos` + `points.value`），几何由 `src/modules3d/geometry.ts` 程序化生成。
- 新增 `agent-hmi.scene3d/2`：**内核原生格式 + hmi-studio 语义层**。

保持两版共存的理由：`scene3d/1` 的程序化几何（管道、阀门、仪表盘）与 SSE 数据绑定的耦合已经很深，
迁移到内核格式会丢失「设备语义」。运行页按 `$schema` 分派渲染器。

### 4.2 scene3d/2 结构

```ts
interface SceneDocV2 {
  $schema: 'agent-hmi.scene3d/2'
  meta: {
    name: string
    group: string
    unit_m: number
    home: { pos: [number,number,number]; target: [number,number,number] }
  }
  /** 内核原生部分：saveSceneEdit() 的输出，原样保存 */
  core: unknown          // scene/camera/renderer/controls/transformControls/innerCores/lightCores/...
  /** hmi-studio 语义层：设备点位绑定（对齐 2D 的 bind 语义） */
  bindings: Array<{
    /** 内核 innerCores 的实例下标或 name（稳定标识） */
    target: string
    /** rs-iot 点位字段，如 dev_wm1.flow_rate */
    field: string
    /** 绑定类型 */
    kind: 'value' | 'status' | 'alarm'
  }>
  /** 事件/联动 */
  events: Array<{
    trigger: { target: string; event: 'click' | 'change' }
    action: { type: 'navigate' | 'command' | 'setCamera'; target?: string; value?: unknown }
  }>
}
```

**关键设计**：`core` 是内核的原生 JSON，**hmi-studio 不重新序列化它**——
内核的 `saveSceneEdit()` 输出即最终存储内容，避免两套序列化器互相丢字段
（内核 JSON 含完整 geometry/material 参数，任何裁剪都会破坏还原）。

### 4.3 与 scene3d/1 的转换

运行页 `Scene3DView.vue` 需要同时支持两版：

```
$schema === 'agent-hmi.scene3d/1' → 现有程序化渲染路径（src/modules3d/scene.ts）
$schema === 'agent-hmi.scene3d/2' → 内核渲染路径（ThreeEditor 只读模式）
```

**不做双向转换**——两版的语义模型不同（语义节点 vs 内核实例），转换会丢信息。
scene3d/1 的 iot-demo 场景保持原样，作为「程序化生成」路径的样例。

---

## 5. 三个硬约束的应对

### 5.1 H1 许可

**事实**：npm `three-edit-cores` 标注 Proprietary；仓库 `threejs-editor` 源码是 Apache-2.0；
官方 README 指向 `z2586300277/three-editor-cores`（自述"永久开源"）。

**决策点（需用户/法务确认）**：

| 方案 | 动作 | 代价 |
|---|---|---|
| A（推荐先做） | 联系作者确认 `three-editor-cores` 开源仓库是否包含本项目所需的完整能力，**优先从开源仓库引入** | 若开源仓库版本落后，需自行补齐 |
| B | 采购 npm 包商业授权（作者留了 QQ/微信） | 费用未知；与 maotu 同类支出 |
| C | 完全自研（参考 threejs-editor 的 Apache-2.0 部分思路，不引入其代码） | 工作量约 3~5 倍；无许可风险 |

**建议**：先按 A/B 之一取得**书面**许可结论，再进入 P0；在此之前只做不依赖内核的准备工作（§8 的 P0-0）。

**迁移代价评估（若将来从 B 退回 C）**：
- 可迁移：文档格式（§4.2 的 `bindings`/`events` 语义层）、面板层（Vue 组件）、hmi-studio 基座集成
- 需重写：内核承担的部分（gizmo 变换、撤销栈、场景序列化、模型加载）——约占工作量的 40%
- 因此**建议 `core` 字段设计成「内核原生 JSON」而非自研格式**，这样退回自研时只需替换「core 的产出与消费」两端，
  语义层（bindings/events）不受影响。

### 5.2 H2 three 版本

**事实**：内核 `three@^0.184`；本仓 `three@0.187.0`。

**两条路径**：

| 路径 | 做法 | 风险 |
|---|---|---|
| **P-1 锁 0.184**（推荐） | hmi-studio 的 three 降到 0.184，与内核同版本 | 本仓现有 3D 运行页（`src/modules3d/`）需回归测试；`outputColorSpace` 等 API 在 0.184 已可用（r152 起），影响面小 |
| P-2 验证 0.187 兼容 | 保留 0.187，验证内核在 0.187 上工作 | 内核内部可能用已变更的私有 API；three 不保证跨版本兼容；**失败则被迫回 P-1** |

**版本差异核查清单**（实施时逐项验证，不能凭记忆推断）：

- [ ] `WebGLRenderer.outputColorSpace` / `outputEncoding`（r152 改名，本仓已在用新名）
- [ ] `TransformControls` 的 API 与事件名（`dragging-changed` / `objectChange`）
- [ ] `OrbitControls` 的 `update()` 时序与 `controls.target`
- [ ] `GLTFLoader` / `DRACOLoader` 的路径与 API（内核用 draco 解压，见 `ThreeEditor.dracoPath`）
- [ ] `EffectComposer` / `postprocessing` 的 pass 顺序与 `OutlinePass` 参数名
- [ ] `WebGLRenderer.useLegacyLights` / 光照单位变更（r155 起默认物理光照）
- [ ] `BatchedMesh` / `InstancedMesh` 相关（内核若有实例化优化）

**验证方法**：P0 阶段以「加载 template.json → 拖一个模型 → 移动 → 保存 → 重新加载 → 位置一致」为最小回路，
在 0.184 与 0.187 各跑一遍对比。

### 5.3 H3 全局隔离

**事实**：内核与面板经 `window.*` 通信（`window.threeEditor` 等）。

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **S-1 iframe 承载**（推荐） | 3D 编辑器页内嵌 iframe 加载独立构建的编辑器 bundle；父子经 `postMessage` 通信 | 内核的 `window.*` 完全隔离在 iframe 内；与 2D 编辑器零冲突；内核可独立升级 | 需单独构建一个 bundle；postMessage 协议要自己定（加载/保存/事件） |
| S-2 独立路由页直接引入 | 在 `/edit3d/:id` 页面直接 import 内核 | 实现最快 | `window.threeEditor` 等会挂到主窗口；与 maotu 的 `window` 假设可能冲突；卸载需手工清理（`destroySceneRender`），路由切换易泄漏 WebGL 上下文 |
| S-3 命名空间垫片 | 加载内核前把 `window` 代理到沙箱对象 | 无需 iframe | JS 全局无法真沙箱化（`window` 不可 Proxy 代理全局作用域），实际不可行 |

**推荐 S-1**，理由：内核的全局假设（`window.editorJsons`、`window.models`、`window.addon_editor_json`、
`window.threeEditor`、`__isProduction__`）在同窗口内无法安全共存，而 iframe 是浏览器原生提供的隔离边界。

**postMessage 协议**（父子之间，S-1 需要）：

```
父 → 子：{ type: 'load', scene: SceneDocV2 }        // 加载场景
父 → 子：{ type: 'bind', devices: IDeviceInfo[] }   // 下发设备树（绑定面板用）
父 → 子：{ type: 'theme', dark: boolean }            // 主题同步
子 → 父：{ type: 'ready' }                          // 内核就绪
子 → 父：{ type: 'changed', scene: unknown }        // 场景变更（防抖后）
子 → 父：{ type: 'save', scene: unknown }           // 用户点保存
子 → 父：{ type: 'select', target: string }         // 选中对象（父侧属性面板联动）
子 → 父：{ type: 'undo' | 'redo' | 'canUndo' | 'canRedo' }
```

---

## 6. 存储、版本与限制

### 6.1 复用既有设施

- 保存：`screensApi.putScene(slug, doc, ifVersion)` —— 已随 2D/3D 分列落地（`src/lib/screens.ts`）
- 加载：`screensApi.getScene(slug)`
- 版本面板：`src/components/VersionPanel.vue` —— 只依赖 screensApi，**直接复用**
- 元信息改写：`src/lib/scene3d-meta.ts` —— 3D 的 name/group 在 `meta` 内，**不可用 2D 的 unwrapDoc/wrapDoc**

### 6.2 硬限制：128 KiB

后端 `PUT /api/v1/screens/:id` 校验（`rs-iot/src/api/routes_meta.rs:329`）：
id 词法合法 + **body ≤ 128 KiB** + JSON 语法合法。**无 schema 校验**（故 scene3d/2 可直接存）。

**风险量化**：`innerCores` 每项含完整 geometry 参数 + material 参数（实测 `几何体.json` 单个实例约 400~600 字节）。
128 KiB ÷ 500 B ≈ **260 个实例**。对工业厂区（10~50 设备 + 管线 + 区域）**通常够用**，
但若导入 GLB 模型（`modelCores` 含 url + 变换 + 材质），单模型可达数 KB，30 个模型即触顶。

**对策（三选一，按实施顺序）**：

1. **外置资源**：`modelCores` 的模型文件（GLB）不内嵌文档，文档只存 url + 变换。
   模型文件放 rs-iot 的静态资源目录或独立文件服务（参考 gateway 的 `hmi_widgets_dir` 机制）。
2. **分片存储**：超限时把 `core` 拆成 `core` + `core/parts` 多个 rs-iot key（需后端支持，非当前 API 能力）。
3. **保存前裁剪**：只保留运行必需的字段（丢弃 `effectComposer` 配置等）——**但会破坏内核还原**，仅作应急。

**建议**：P0/P1 用「模型外置 + 文档只存引用」，并在保存时**实测字节数**，超限时在 UI 明确报错
（而不是让后端返回 413 让人一头雾水）。

### 6.3 其他数据面

- 设备树：`src/lib/device-tree.ts`（`fetchDeviceTree`）直接复用
- 绑定语义：对齐 2D 的 `src/lib/binds.ts`（`collectBinds` 收集订阅字段）
- 运行时 SSE：`src/lib/sse.ts`（`createRtdataStream`）直接复用

---

## 7. 组件库策略

### 7.1 threejs-editor 的 45 个组件

目录 `3D研究/threejs-editor/src/editor/compoents/`，命名中英混杂（`ui-轮播图.js`、`围墙.js`、`fire.js`、`3dtiles.js`…）。
统一形态 `{ name, label, create(_,{scene}) }`（§2.3）。

**不整体搬运**。工业 SCADA 需要的是「设备/管线/仪表/区域」语义组件，不是特效组件。

建议**分三档处理**：

| 档 | 内容 | 处置 |
|---|---|---|
| **移植**（与工业相关，约 10 个） | 围墙、地面、标尺/刻度轴、热点信息、警告信息、雷达图、线图/散点图、表格类 ui 组件、3dtiles（地理场景） | 移植到 `src/modules3d3d/assets/`，改名为中文语义标签，补 `bindings` 能力 |
| **参考**（特效类，暂不做） | 烟花、火焰粒子、下雪、数字雨、粒子文字、水波纹、扫光地面、音乐、人物行走 | 不移植；将来按需 |
| **淘汰** | 依赖外部 CDN 资源（`z2586300277.github.io/...`）的组件 | 不移植（离线环境不可用） |

### 7.2 与 2D 图元体系的关系

2D 侧有 `src/symbols/`（registry/groups/index + `hp-hmi.ts` 调色板 + 47 个图元 + 工业功能件 8 个），
运行时由 `registerSymbols()` 注册、`maotu` 通过 `resolveDynamicComponent` + `Suspense` 渲染。

3D 侧**不共用 registry**（渲染栈完全不同：2D 是 Vue 组件，3D 是 three 对象工厂）。
但**概念对应**，命名与注册流程可对齐：

```
2D:  src/symbols/registry.ts     →  3D: src/modules3d3d/assets/registry.ts
     { tag, label, group, component }   { name, label, group, create(_, {scene}) }
```

**复用 2D 的工业调色板**（`src/symbols/hp-hmi.ts`）：3D 组件的默认材质色沿用 HP-HMI 灰阶，
保证同一画面里 2D/3D 的设备配色一致。

### 7.3 设备语义组件（必须新建）

现有 `src/modules3d/geometry.ts` 已有程序化设备几何（水表/燃气表/电表/压力变送器/环境机/泵/罐）。
这些是**与设备语义耦合**的（`makeDevice(n: SceneNode, anim)` 接收语义节点），与内核的通用实例模型不同。

**决策**：3D 编辑器的组件库中，**设备类组件用「内核通用实例 + 语义元数据」两层**：

```ts
// 内核能表达的几何（Box/Cylinder/…）作为底层
// 设备语义（devId、点位绑定）作为附加字段存进 bindings
```

即：编辑时放的是「一台水表」（由我们的 geometry.ts 生成内核兼容的 three 对象），
运行时按 `bindings` 把 SSE 实时值写进对应实例的材质/指针。

**这需要把 `geometry.ts` 的设备工厂改造成「输出内核可序列化的实例」**——是 P1 的主要工作量。

---

## 8. 分期路线

每期给「步骤 → 验证」，验证须可复现（命令 + 真实输出）。

### P0-0 内核可行性探针（不依赖许可，2~3 天）

**步骤**
1. 在**隔离目录**（不进 hmi-studio）clone `three-editor-cores`（若开源仓库满足需求）或装 npm 内核包
2. 写一个最小 HTML：创建 ThreeEditor → 加载 `docs/editorJson/几何体.json` → 渲染
3. 记录：three@0.184 下的实际行为、`saveSceneEdit()` 输出的真实结构与体积

**验证**
- 页面截图：模型正常渲染
- 控制台打印 `JSON.stringify(editor.saveSceneEdit()).length` → 得到**单场景真实字节数**
- **同时在 three@0.187 下跑一遍**（临时改 package.json）→ 得到 §5.2 版本差异的第一手证据
- 输出：一份探针报告（真实字节数 + 版本兼容矩阵 + 全局依赖清单）

### P0 内核 PoC（依赖 P0-0 结论，3~5 天）

**步骤**：hmi-studio 加 `src/modules3d3d/core.ts`；`/edit3d/:id` 路由；iframe 承载（S-1）；
postMessage 协议打通「加载 → 变换 → 保存」。

**验证**
- 打开 `/edit3d/iot-plant-3d` → 场景在 iframe 内渲染
- 拖动一个实例 → 保存 → `GET /api/v1/screens/iot-plant-3d` 返回的 doc 含新坐标
- 刷新页面 → 坐标保持（往返一致）
- 字节数打印：确认文档体积与 128 KiB 的距离

### P1 属性面板 + 场景树（5~8 天）

**步骤**：右栏属性面板（读 `threeEditor.scene.children`）、左栏场景树、选中联动、撤销重做按钮接内核事件。

**验证**：选中树节点 ↔ 画布高亮双向一致；改属性 → 画布即时更新；Ctrl+Z/Y 生效。

### P2 设备绑定 + 事件（5~8 天）

**步骤**：`bindings` 模型 + 绑定面板（复用 `BindPanel.vue` 语义）、设备树接入、事件模型与执行。

**验证**：绑定 `dev_wm1.flow_rate` → 运行页该实例数值随 SSE 变化；事件触发跳转。

### P3 版本 + 预览 + 对齐 2D（3~5 天）

**步骤**：`VersionPanel.vue` 接入、预览新窗口、性能体检。

**验证**：版本列表/回滚可用；预览页与编辑器所见一致；50 实例场景编辑态 ≥ 30 fps。

**总计**：约 18~29 天工程量（不含许可谈判与 P0-0）。

---

## 9. 风险清单

| # | 风险 | 等级 | 应对 |
|---|---|---|---|
| R1 | 内核 npm 包 Proprietary，无法采购 | **高** | P0-0 优先查开源仓库；先做不依赖内核的准备工作；文档格式设计成可平滑迁移（§5.1） |
| R2 | three 0.184 vs 0.187 不兼容 | 中 | P0-0 实测验证；优先锁 0.184（§5.2） |
| R3 | 场景 JSON 超 128 KiB | 中 | 模型外置；保存前字节数校验与 UI 报错（§6.2） |
| R4 | 内核 `window.*` 污染 2D 编辑器 | 中 | iframe 隔离（S-1）+ postMessage 协议（§5.3） |
| R5 | 内核 API 不公开/不稳定（0.0.x 版本） | 中 | 适配层收敛所有内核调用到 `src/modules3d3d/core.ts` 一个文件；锁精确版本；升级需回归 |
| R6 | WebGL 上下文耗尽 | 中 | 列表页不挂 WebGL（已落地）；编辑器页单上下文；路由切换务必 `destroySceneRender()` |
| R7 | 内核黑盒，出问题难定位 | 中 | 适配层加事件日志；P0-0 保留探针目录便于对照 |
| R8 | 设备语义与内核通用实例模型冲突 | 中 | §7.3 的两层方案；`geometry.ts` 改造是 P1 主要工作量 |
| R9 | GLB 模型文件无处托管 | 低 | 复用 gateway 的静态目录机制（`hmi_widgets_dir` 同款） |
| R10 | 内核的 draco 解压路径依赖 CDN | 低 | 自托管 draco 解码器到 rs-iot 静态目录 |

---

## 10. 验收标准

对齐本仓 GATE 门禁（`.zcode/AGENTS.md` §3）：

**功能**
1. `/edit3d/:id` 能加载 scene3d/2 文档并渲染
2. 能放置/移动/旋转/缩放/删除实例；撤销重做可用
3. 属性面板改值 → 画布即时反映
4. 绑定设备点位 → 预览页该实例数值随 SSE 更新
5. 保存 → `GET /api/v1/screens/:id` 内容一致；刷新后状态不丢
6. 版本面板可列版本、可回滚
7. 保存的 doc ≤ 128 KiB；超限时 UI 明确报错而非 413

**工程**
8. `pnpm typecheck` 通过；`pnpm test` 全绿（新增适配层与 schema 单测）
9. `node scripts/check-layers.mjs` 通过
10. 适配层对内核的直接引用**仅限** `src/modules3d3d/core.ts`（可测性边界）
11. `lint.mjs --app` 0 FAIL / 0 WARN（面板层视觉纪律）

**性能**
12. 50 实例场景编辑态 ≥ 30 fps；`/screens3d` 列表页 0 WebGL 上下文

**文档**
13. 本方案与实现同步；`docs/hmi-style-guide.md` §2 补 3D 编辑器的视觉纪律
14. 3D 编辑器操作说明（面向组态工程师）

---

## 11. 待决事项

| # | 待决 | 需要谁 | 阻塞什么 |
|---|---|---|---|
| Q1 | 内核许可路径：A（开源仓库）/ B（采购）/ C（自研） | 用户 + 作者 | 阻塞 P0 及以后全部 |
| Q2 | three 版本路径：锁 0.184 还是验证 0.187 | 技术 | 阻塞 P0 |
| Q3 | 3D 组件库移植清单（§7.1 三档划分需确认） | 用户 | 阻塞 P1 |
| Q4 | scene3d/2 是否要覆盖 scene3d/1（还是并存两版渲染器） | 用户 | 阻塞 P1 |
| Q5 | GLB 模型托管位置（rs-iot 静态目录 vs 独立服务） | 架构 | 阻塞 P2 |
