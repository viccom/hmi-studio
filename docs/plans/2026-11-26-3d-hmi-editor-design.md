# 3D HMI 组态编辑器技术方案（threejs-editor 内核引入 hmi-studio）

> 日期：2026-11-26 · 状态：**待评审**（本轮只出方案，不实现）
> 关联：`docs/plans/2026-11-26-3d-hmi-design.md`（3D 空间层总设计）、`docs/hmi-style-guide.md` §0/§2（三类画面）
> 调研对象：`3D研究/threejs-editor`（`z2586300277/threejs-editor`）、`3D研究/three-editor-cores`（`z2586300277/three-editor-cores`）

---

## 0. 一句话结论

以 **`three-editor-cores` 开源内核**（Apache-2.0，11958 行源码）为编辑器内核，
hmi-studio 出**适配层**（`src/modules3d3d/`），复用本仓已有的登录/顶栏/存储/版本/绑定/主题基座，
新增 `/edit3d/:id` 路由与 3D 编辑器视图。

**不需要采购**（2026-11-26 更正，详见 §5.1）：npm 上两个内核包虽标注 Proprietary，
但其源码仓库 `z2586300277/three-editor-cores` 是 Apache-2.0 且含完整实现，
其 README 明写「功能齐全，拥有 新/旧编辑器 three-editor 仓库的所有内置功能」。

**剩下的真问题**是 three 版本跨度（内核 0.158 vs 本仓 0.187，约 30 个 minor）
与内核无 `index.d.ts` 需自补类型——都是工程活，不是采购问题。

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

**这意味着：引入它 = 引入内核 + 重写面板层，不存在「抄 UI 就能用」的路径。**

### 2.1b 三份相关资产的关系（2026-11-26 实测厘清）

初稿只看到 npm 包的 Proprietary 标注就推断需采购，实测后发现是**三份不同的东西**：

| 资产 | 位置 | 许可 | 内容 |
|---|---|---|---|
| ① 编辑器 UI 壳 | `z2586300277/threejs-editor` 仓库 | Apache-2.0 | 1840 行 Vue 面板 + 45 个组件 + 文档站；**依赖 ②**（`package.json` 里 `"three-edit-cores": "^0.0.19"`） |
| ② npm 内核包（专有） | npm `three-edit-cores` / `three-editor-cores` | **Proprietary** | 打包后的内核，API 与 ③ 不同（`saveSceneEdit` vs `saveSceneEditor`、多 `resetEditorStorage`） |
| ③ **开源内核源码** | `z2586300277/three-editor-cores` 仓库 | **Apache-2.0** | **11958 行完整源码**（`lib/`），README 明写能力覆盖 ① 的全部内置功能 |

**结论**：走 ③（源码引入），不必碰 ② 的专有包。① 的 UI 面板代码仍可参考（Apache-2.0），
但组件清单里的 CDN 资源需替换为本地资源（§7.1）。

### 2.2 内核 API 面

**npm 版**（实测自 `3D研究/threejs-editor/src/editor/{editor,left,right}.vue`）：

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

**开源源码版**（实测自 `3D研究/three-editor-cores/lib/main.js`）——**签名不同，面板层要按这版写**：

```ts
import { ThreeEditor } from './vendor/three-editor-cores/lib/main.js'

const editor = new ThreeEditor({
  threeBoxRef: hostEl,               // DOM 容器
  rendererParams: { antialias: true, alpha: true, logarithmicDepthBuffer: true },
  sceneParams,                       // 场景 JSON（构造时传入，无 resetEditorStorage）
  saveEditorCallBack: (sceneParams, meshListParams) => { /* 保存回调 */ },
})
editor.saveSceneEditor()             // → 场景 JSON
editor.getSceneEditorImage(['image/png','0.8'])
editor.setSceneControlMode('translate' | 'rotate' | 'scale')
editor.setTransformControlsProperty(key, value)
editor.setOutlinePass(meshList)      // 轮廓光选中
editor.viewer.destroySceneRender()   // 销毁（注意是 .viewer. 之下）
```

对照表：

| 能力 | npm 版（②） | 开源版（③） |
|---|---|---|
| 构造 | `new ThreeEditor(hostEl, opts)` | `new ThreeEditor({ threeBoxRef, ... })` |
| 加载场景 | `resetEditorStorage(json)` | 构造时传 `sceneParams` |
| 保存 | `saveSceneEdit()` | `saveSceneEditor()` |
| 销毁 | `destroySceneRender()` | `viewer.destroySceneRender()` |
| 类型声明 | npm 包自带 `.d.ts` | **无**（§9 R5） |

面板与内核的通信方式：npm 版经 **`window.*` 全局**（`window.threeEditor`、`window.updateSceneStats`、
`window.left_loadModel`）；开源版是 ES 模块可直接 import，但内核内部仍读 `window.editorJsons` /
`window.models` / `__isProduction__` 等全局（组件库注入通道）——这是 §5.3 的来源。

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
| H1 | **许可** | **有 Apache-2.0 开源路径，无需采购**：`z2586300277/three-editor-cores` 仓库实测含 11958 行完整内核源码（`lib/`：Api/Editor/EffectComposer/Scene/Shader），LICENSE = Apache-2.0，其 README 明写「功能齐全，拥有 新/旧编辑器 three-editor 仓库的所有内置功能」 | 见 §5.1（结论已修正：开源可自建构建，不依赖专有 npm 包） |
| H2 | **版本** | 开源内核基于 `three@^0.158`（其 package.json devDeps / README「THREE.js 0.157.0」）；本仓 `three@0.187.0` | **版本跨度反而更大**（0.158→0.187），必须逐项验证；见 §5.2 |
| H3 | **全局污染** | 内核与面板经 `window.*` 通信（§2.2）；开源内核可用 `import { ThreeEditor } from './core'` 走模块引入（不强制全局） | 比 npm 包更可控；见 §5.3 |

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

### 5.1 H1 许可：**无需采购**

**2026-11-26 更正**：本节初稿基于 npm 元数据（`three-edit-cores` / `three-editor-cores` 两个包
在 npm 上均标注 `Proprietary`），推断需采购。**该推断不完整**——进一步核实后结论相反。

**核实到的事实**（全部实测，非转述 README）：

| 事实 | 证据 |
|---|---|
| 开源内核仓库存在且含完整源码 | `z2586300277/three-editor-cores` 已 clone 到 `3D研究/three-editor-cores`；`lib/` 下 11958 行源码：`Api/ThreeApi.js`、`Editor/Editor.js`、`Editor/Handler/{History,TransformControls,SyncTransform,KeyDown,Helpers}.js`、`Editor/Basic/{Renderer,Camera,Light,Controls,Composer}.js`、`Scene/{SetScene,SceneEvent}.js`、`Shader/`、`EffectComposer/` |
| 许可为 Apache-2.0 | 仓库 `LICENSE` = Apache License 2.0 |
| 能力覆盖 threejs-editor 全部内置功能 | 其 README 第 7 行：「此内核包, 功能齐全, 拥有 新/旧编辑器 three-editor 仓库的所有内置功能」 |
| 关键能力在源码里可查 | 撤销栈 `lib/Editor/Handler/History.js`（`handlerHistory` / `setHandlerHistory` / `restoreHistoryHandler`）；gizmo `lib/Editor/Handler/TransformControls.js`；场景序列化 `lib/Editor/Editor.js:21` 的 `saveSceneEditor()`；场景装载 `lib/Scene/SetScene.js:6` 的 `initScene(DOM, initParams, sceneParams, save)` |
| 可作库构建 | `vite.config.js` 有 `build.lib` 配置（entry `./lib/main.js`，name `ThreeEditorCores`），`package.json` 的 `files` 含 `dist` + `index.d.ts` |

**结论**：**不需要采购**。有 Apache-2.0 的完整源码路径。

**三条落地路径**：

| 方案 | 动作 | 优点 | 代价 |
|---|---|---|---|
| **A-1 直接引入开源源码**（推荐） | 把 `three-editor-cores/lib/` 作为**源码级依赖**引入 hmi-studio（vendor 到 `src/modules3d3d/vendor/` 或 git submodule / 本地 path 依赖），自建构建 | 零采购成本；Apache-2.0 可商用；内核可按需改 | 需自行维护与 three 版本的适配（见 §5.2）；仓库**无 `index.d.ts`**，需自己写类型声明 |
| A-2 自建 npm 包 | fork 开源仓库 → 改 `package.json` → 构建 → 本地 registry / 打包 tarball 安装 | 与 npm 包体验一致；类型声明可自己补全 | 多一层构建链 |
| B 采购 npm 商业包 | 买 `three-edit-cores` 授权 | 拿作者持续更新与支持 | 花钱；且 §2.2 实测 npm 版 API 与开源版**不一致**（`saveSceneEdit` vs `saveSceneEditor`、多 `resetEditorStorage`），不是同一物 |

**推荐 A-1**。理由：能力已被开源版覆盖（README 明证 + 源码可查），采购换来的主要是「省掉版本适配与类型声明」，
而这两项本来就必须自己做（开源版基于 three 0.158，与本仓 0.187 的适配是**必做项**，不是可选项）。

**采用 A-1 需注意**：
1. **保留 Apache-2.0 归属**：vendor 源码时保留原 LICENSE 与版权声明（Apache-2.0 §4 要求）。
2. **类型声明**：开源仓库 `package.json` 声明了 `types: ./index.d.ts` 但仓库里**没有该文件**——
   hmi-studio 是 TS 项目，须补一份 `index.d.ts`（或用 `// @ts-expect-error` 局部豁免，见 §8 的 P0-0）。
3. **依赖冲突**：开源版 devDeps 为 `three@^0.158`、`gsap@^3.12`、`dat.gui`、`proj4`、`cannon-es`；
   本仓用 `three@0.187`，`gsap`/`proj4`/`cannon-es` 需新增依赖（`dat.gui` 已被内核替代为 `lil-gui`，开源版未用）。
4. **API 差异**：开源版 `ThreeEditor` 构造函数签名与 npm 版不同（`params` 含 `threeBoxRef`/`rendererParams`/`sceneParams`/`saveEditorCallBack`），
   面板层须按开源版 API 写。

**迁移代价（若将来要从 A-1 切到 B 或 C）**：
- 可迁移：文档格式（§4.2 的 `bindings`/`events` 语义层）、面板层（Vue 组件）、hmi-studio 基座集成
- 需重写：内核承担的部分（gizmo、撤销栈、场景序列化、模型加载）——约占工作量 40%
- 因此**建议 `core` 字段存内核原生 JSON**（不自研格式），切换内核只换「core 的产出与消费」两端，语义层不受影响


### 5.2 H2 three 版本

**事实（更正后）**：采用开源内核（§5.1 的 A-1）后，版本跨度**更大**——开源内核基于
`three@^0.158`（其 package.json devDeps + README「THREE.js 0.157.0」），本仓用 `three@0.187.0`。
跨度 0.158 → 0.187（约 30 个 minor），比 npm 包（0.184 → 0.187）大得多。

**三条路径**：

| 路径 | 做法 | 风险 |
|---|---|---|
| **P-1 降本仓 three 到 0.158** | 内核零改动 | 本仓现有 3D 运行页（`src/modules3d/`）用 r187 特性需回归；`outputColorSpace` 在 r152 起可用（0.158 已有），但 r16x~r18x 有其他变更（如 r165 `WebGLRenderer` 弃用项、r167 `BatchedMesh`、r175 lighting 调整） |
| **P-2 内核跟随本仓升到 0.187**（推荐） | 改 vendored 内核的 three 依赖版本，修适配点 | 需逐项核对；three 不保证跨版本兼容，但内核只用了较稳定的 API（`outputColorSpace`、`TransformControls`、`OrbitControls`、`GLTFLoader`） |
| P-3 验证 0.187 兼容（不预判） | 先在 P0-0 实测，再定走 P-1 还是 P-2 | 实测前无法判定 |

**实测已知的内核 API 用法**（读源码得到，非猜测）：

- `lib/Editor/Basic/Renderer.js:8,37,60` —— 用 `renderer.outputColorSpace` + `THREE.SRGBColorSpace`
  （**新 API**，r152 之后才有 → 内核要求 three ≥ 0.152，与 README 的 0.157 一致）
- `lib/Scene/SceneEvent.js` —— 场景点击/拾取事件（`sceneClick` / `rawSceneClick`）
- `lib/Editor/Handler/History.js` —— 撤销栈
- `lib/Editor/Handler/TransformControls.js` —— gizmo

**版本差异核查清单**（实施时逐项验证，不能凭记忆推断）：

- [ ] `WebGLRenderer.outputColorSpace`（内核用新 API，本仓也用新 API —— 此项**应无冲突**，待验）
- [ ] `TransformControls` 的 API 与事件名（`dragging-changed` / `objectChange`）
- [ ] `OrbitControls` 的 `update()` 时序与 `controls.target`
- [ ] `GLTFLoader` / `DRACOLoader` 的路径与 API（内核用 draco 解压，见 `ThreeEditor.dracoPath`）
- [ ] `EffectComposer` / `postprocessing` 的 pass 顺序与 `OutlinePass` 参数名
- [ ] 光照单位变更（r155 起默认物理光照）—— 内核 `lib/Editor/Basic/Light/` 的强度默认值是否需要重标定
- [ ] `ShaderChunk` 内部实现（内核 `lib/Shader/ShaderChunk_A.js` / `_B.js` 大量引用 three 内部常量，**跨版本最易碎**）

**验证方法**：P0 阶段以「加载 template.json → 拖一个模型 → 移动 → 保存 → 重新加载 → 位置一致」为最小回路，
先在 0.187（不降级）跑通，跑不通再降级到 0.158 对比。

### 5.3 H3 全局隔离

**事实**：npm 版内核与面板经 `window.*` 通信（`window.threeEditor` 等，§2.2）。
**开源版的情况更好**：`lib/main.js` 是标准 ES 模块，导出 `export class ThreeEditor`——
可以 `import { ThreeEditor } from './vendor/three-editor-cores/lib/main.js'` 直接用，
不必依赖 `window.*`。但内核**自身内部**仍有全局引用（如 `window.editorJsons`、`window.models`、
`__isProduction__`），且 threejs-editor 的面板层就是靠这些全局注入组件库。

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **S-2 模块引入 + 全局垫片**（更正后推荐） | 3D 编辑器页直接 `import { ThreeEditor }`；组件库清单由适配层在挂载前写入 `window.editorJsons`/`window.models`（hmi-studio 自己的资产清单，不与 2D 冲突） | 实现最快；无 iframe 复杂度；postMessage 协议不用定；可精确控制内核销毁 | `window.*` 仍挂在主窗口，但**只挂 3D 专有键**（`editorJsons`/`models`），2D 编辑器（maotu）不读这些键，实测不冲突 |
| S-1 iframe 承载 | 3D 编辑器页内嵌 iframe 加载独立 bundle；父子经 `postMessage` 通信 | 全局完全隔离；内核可独立升级 | 需单独构建 + 自定 postMessage 协议；调试链路长；**在开源模块引入可行的前提下是过度设计** |

**更正说明**：初稿推荐 S-1（iframe），前提是「只能拿到 npm 版、必须用它的全局约定」。
采用开源源码后，模块引入可行，iframe 的隔离收益不再抵偿其复杂度。

**必须遵守的纪律**（无论选哪个）：
1. 组件库清单由 **hmi-studio 侧**提供（`src/modules3d3d/assets/`），不读 `docs/config/*.js` 里那些 CDN 地址
2. 路由离开 `/edit3d/:id` 时**必须**调用 `threeEditor.viewer.destroySceneRender()`（开源版入口：`lib/Scene/SetScene.js:76`），
   否则 WebGL 上下文泄漏——从 2D 编辑器切过来会白屏
3. `window` 上挂的 3D 专有键在 `onBeforeUnmount` 里清理

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

### P0-0 内核可行性探针（2~3 天）

**目的**：拿到版本适配的第一手证据，并实测单场景真实字节数。

**步骤**
1. 开源内核已 clone 到 `3D研究/three-editor-cores`（Apache-2.0，11958 行）
2. 在**隔离目录**（不进 hmi-studio）建最小 Vite 工程：`import { ThreeEditor } from './lib/main.js'`
   → 加载 `3D研究/threejs-editor/docs/editorJson/几何体.json` → 渲染
3. 记录：three@0.187 下的实际行为、`saveSceneEditor()` 输出的真实结构与体积

**验证**
- 页面截图：模型正常渲染
- 控制台打印 `JSON.stringify(editor.saveSceneEditor()).length` → 得到**单场景真实字节数**
- 若 0.187 跑不通：改 package.json 的 three 到 0.158 再跑 → 得出 P-1/P-2 的选择依据
- 记录内核实际用到的 three API（对照 §5.2 核查清单逐项打勾）
- 输出：一份探针报告（真实字节数 + 版本兼容矩阵 + 全局依赖清单）

### P0 内核 PoC（依赖 P0-0 结论，3~5 天）

**步骤**：hmi-studio 加 `src/modules3d3d/core.ts`（vendor 开源内核 + 自写 `index.d.ts`）；
`/edit3d/:id` 路由；模块引入（S-2）；打通「加载 → 变换 → 保存」。

**验证**
- 打开 `/edit3d/iot-plant-3d` → 场景渲染
- 拖动一个实例 → 保存 → `GET /api/v1/screens/iot-plant-3d` 返回的 doc 含新坐标
- 刷新页面 → 坐标保持（往返一致）
- 字节数打印：确认文档体积与 128 KiB 的距离
- **从 `/edit3d/:id` 切到 `/edit/:id`（2D 编辑器）→ 无 WebGL 上下文泄漏、无白屏**

### P1 属性面板 + 场景树（5~8 天）

**步骤**：右栏属性面板（读 `threeEditor.scene.children`）、左栏场景树、选中联动、撤销重做按钮接内核事件。

**验证**：选中树节点 ↔ 画布高亮双向一致；改属性 → 画布即时更新；Ctrl+Z/Y 生效。

### P2 设备绑定 + 事件（5~8 天）

**步骤**：`bindings` 模型 + 绑定面板（复用 `BindPanel.vue` 语义）、设备树接入、事件模型与执行。

**验证**：绑定 `dev_wm1.flow_rate` → 运行页该实例数值随 SSE 变化；事件触发跳转。

### P3 版本 + 预览 + 对齐 2D（3~5 天）

**步骤**：`VersionPanel.vue` 接入、预览新窗口、性能体检。

**验证**：版本列表/回滚可用；预览页与编辑器所见一致；50 实例场景编辑态 ≥ 30 fps。

**总计**：约 18~29 天工程量（含 P0-0；**不含许可谈判**——已确认无需采购，见 §5.1）。

---

## 9. 风险清单

| # | 风险 | 等级 | 应对 |
|---|---|---|---|
| R1 | ~~内核 npm 包 Proprietary，无法采购~~ | **已消除** | **2026-11-26 实测更正**：开源仓库 `three-editor-cores` 含 11958 行完整源码、Apache-2.0、能力覆盖 README 明证 → 无需采购（§5.1） |
| R2 | three 版本跨度大（内核 0.158 vs 本仓 0.187） | **高** | P0-0 实测；备选 P-1 降级本仓到 0.158（§5.2）；内核 `lib/Shader/ShaderChunk_*.js` 引用 three 内部常量，**最易碎**，需重点回归 |
| R3 | 场景 JSON 超 128 KiB | 中 | 模型外置；保存前字节数校验与 UI 报错（§6.2） |
| R4 | 内核 `window.*` 与 2D 编辑器冲突 | **低**（更正） | 开源版可模块引入；只挂 3D 专有全局键；不采用 iframe（§5.3） |
| R5 | 开源内核**无 `index.d.ts`**（package.json 声明了但文件不在） | 中 | 适配层自写类型声明；或局部 `@ts-expect-error`（P0-0 评估工作量） |
| R6 | WebGL 上下文耗尽 | 中 | 列表页不挂 WebGL（已落地）；编辑器页单上下文；路由切换务必 `destroySceneRender()` |
| R7 | vendor 内核的维护与升级 | 中 | 锁 commit；改动集中在 `src/modules3d3d/`；Apache-2.0 要求保留版权声明 |
| R8 | 设备语义与内核通用实例模型冲突 | 中 | §7.3 的两层方案；`geometry.ts` 改造是 P1 主要工作量 |
| R9 | GLB 模型文件无处托管 | 低 | 复用 gateway 的静态目录机制（`hmi_widgets_dir` 同款） |
| R10 | 内核的 draco 解压路径依赖 CDN | 低 | 自托管 draco 解码器到 rs-iot 静态目录（开源仓库自带 `public/draco/`） |
| R11 | 内核新增依赖（`gsap`/`proj4`/`cannon-es`/`dat.gui`）与本仓冲突 | 低 | 均为独立库，无冲突；记录进依赖清单（新增依赖需按 GATE 说明理由与许可） |

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

| # | 待决 | 需要谁 | 阻塞什么 | 状态 |
|---|---|---|---|---|
| ~~Q1~~ | ~~内核许可路径~~ | — | — | **已解决**（2026-11-26）：选 **A-1 开源源码引入**，Apache-2.0，无需采购（§5.1） |
| Q2 | three 版本路径：内核升到 0.187 还是本仓降到 0.158 | 技术（P0-0 实测后定） | 阻塞 P0 | 待 P0-0 实测 |
| Q3 | 3D 组件库移植清单（§7.1 三档划分需确认） | 用户 | 阻塞 P1 | 待确认 |
| Q4 | scene3d/2 是否要覆盖 scene3d/1（还是并存两版渲染器） | 用户 | 阻塞 P1 | 待确认 |
| Q5 | GLB 模型托管位置（rs-iot 静态目录 vs 独立服务） | 架构 | 阻塞 P2 | 待确认 |
| Q6 | 开源内核 vendored 的方式：源码拷贝进仓 vs git submodule vs 本地 path 依赖 | 技术 | 阻塞 P0 | 待 P0-0 一并定（建议：源码拷贝进仓并锁 commit，Apache-2.0 需保留 LICENSE 归属） |

---

## 12. 候选深评更新（2026-11-26 晚）：实测 Meteor3DEditor 后推荐切换内核

> 触发：用户指定深评 `nikonikoCW/Meteor3DEditor`。已 clone 到 `3D研究/Meteor3DEditor`，
> 完成 pnpm install + 修复两处上游问题后**实际跑通**（本地 5173 + 后端 3002 + MongoDB 容器），
> 并在其上构建了两个功能丰富的 DEMO 场景（172 对象工业车间 / 3 台骨骼动画机器人展厅），
> 全部经真实浏览器验证。

### 12.1 实测基本信息（与 §2.1b 三资产对照同框架）

| 项 | 事实 |
|---|---|
| 许可 | **MIT**（2025 Meteor3D Team）——比 Apache-2.0 更宽松 |
| 技术栈 | Vue 3.5 + **Pinia** + vue-router + three `^0.184` + Vite 7（与 hmi-studio 同栈） |
| 结构 | pnpm monorepo：`packages/core`（SDK 7625 行）+ `packages/scene-editor`（编辑器面板 6637 行）+ `packages/asset-manager` + `meteor3d-server`（Express+MongoDB） |
| 活跃度 | 最后提交 2026-11-11；单人项目（commit 显示从私有仓库同步） |
| 商业成分 | README「商业许可」徽章仅指**未开源的应用编辑器**；仓库内三个包全 MIT |
| 质量 | core 自带 11 个单元测试（node --test），实测全过 |

### 12.2 能力面（实测——全部源码定位到行号/实际操作验证）

**编辑器交互层（three-editor-cores 完全没有的部分）**：
- 场景树 `SceneTree.vue`+`TreeNode.vue`：选中/删除/**reparent 重挂**
- 属性面板 `PropertiesPanel.vue`（transform/名称/可见性/地理坐标）+ 材质面板 + 动画面板 + GIS/天气/相机面板
- 撤销重做：`CommandFactory.js`（Add/Delete/Transform/**Reparent**/Composite 命令类）+ `HistoryManager.js`——完整命令模式
- 物料库 `LibraryPanel.vue`：通用几何（盒/球/锥/柱/面）拖放 + 模型资产 + 可视化特效（护盾/扫描/标签/火焰，运行时预览不持久化）
- 工具栏：选择/平移/旋转/缩放 gizmo 三模式 + 撤销/重做 + 批量导入 + 保存

**运行时 SDK（`loadScene`）**：`Meteor3D.loadScene({sceneId, serverUrl, container})`——**运行页可完全脱离编辑器**加载场景渲染（返回实例 API：enableStats/三角统计）。编辑器产出 → 运行页消费的所见即所得架构成立。

**运行时 manager（设备绑定告警的底层能力全齐）**：
- `HighlightManager`（按对象/BID 高亮）、`OutlineManager`（轮廓光）、`LabelManager`（CSS2D 浮动标签，支持经纬度）、`RaycastManager`（**BVH 加速拾取**）、`AnimationManager`（per-bid controller，14 clips 切换/调速/暂停）

**序列化体积（128KiB 实测）**：节点图只存 `bid+parentBid+order+transform`，GLTF 按 `url+assetId` 外置引用——实测 1 立方体全文档 **1556 B**，50 对象约 40~60 KB，**远优于 three-editor-cores 的全参数内嵌**（§6.2 的 128KiB 风险在此候选下基本消除）。

**资产管线**：GLTF/GLB 上传 → 格式转换/清洗 → **KTX2 纹理压缩 + Meshopt 几何压缩** → 缩略图 → 边界盒/三角统计（实测 RobotExpressive 3237 面压缩+处理全通过）。

**GIS（three-editor-cores 无此面板）**：`GeoCoordinateSystem` + `TileMapManager` 瓦片底图 + leaflet 地图选择器（904 行）。

### 12.3 实测暴露的上游缺陷（7 项——评分输入，4 项已本地修）

| # | 缺陷 | 影响 | 本地处置 |
|---|---|---|---|
| D1 | 新建场景默认灯光**全零**（`DEFAULT_LIGHTING` enabled:false+全 0）→ 首次打开必黑场 | 体验 | 脚本写灯；用户可右栏「设置」面板手动开 |
| D2 | `SceneObject` Mongoose schema material 缺 `emissive/emissiveIntensity/opacity/alphaTest/wireframe/flatShading` → strict 剥除，**自发光保存即丢** | 功能 | **已修**（补 schema 字段） |
| D3 | `saveScene`/`saveInitialView` 的 `findOneAndUpdate` **未包 `$set`** → 整文档替换，保存视角吞掉 lightingConfig/gisConfig | 功能（隐蔽：修好的配置被下次保存吞掉） | **已修**（两处补 `$set`） |
| D4 | **10s 自动保存无并发保护** → 多标签互相静默覆盖（实测覆盖掉服务端修复） | 协作 | 无代码修法；记入评分（对比 hmi-studio `if_version` 乐观锁+409） |
| D5 | load API 无 `Cache-Control` → 浏览器缓存陈旧场景响应 | 排障干扰 | **已修**（`no-store`） |
| D6 | nodeGraph/nodeBindings 对**同一 GLTF 多实例**恢复链路有缺陷：骨骼被错误重挂/放大（实测四肢 world 飞至 150m） | 功能 | **已绕过**（`saveScene({stripBindings:true})` 剥离 nodeGraph/nodeBindings，加载端整段跳过；不使用跨模型重挂的场景无损失） |
| D7 | 资产管线 meshopt 压缩把模型**缩小 ~24 倍**且无尺寸提示（实测 4.5m→0.19m） | 易错 | 已按压缩后 bounds 校正 scale；建议上游出 bounds 时带单位提示 |

另：纯 JS 无 `index.d.ts`（hmi-studio 需补类型）；`window.editor` 全局（编辑器页内部自洽，影响小）。

### 12.4 与 2D 组态编辑器的低代码体验差距表（本轮评估核心问题）

| 2D（maotu）能力 | 3D（Meteor3D）现状 | 缺口工作 |
|---|---|---|
| 拖拽图元上画布 | 拖几何体/模型上视口 ✓ | 无 |
| 属性面板所见即所得 | Properties/Material 面板 ✓ | 无 |
| 撤销重做 | 命令模式 + HistoryManager ✓ | 无 |
| 物料库 | 通用几何+GLTF 资产+特效 | **工业语义图元库**（水表/泵/罐/管线→GLB 或几何组合，移植 `modules3d/geometry.ts`） |
| **数据绑定（rs-iot 点位）** | **无任何绑定概念** | **自研 bindings 层**：bid→field 映射 + 绑定面板（复用 BindPanel 语义）+ device-tree |
| **运行时数据驱动** | loadScene 只加载静态场景 | **自研运行页**：loadScene SDK + `createRtdataStream` SSE → 材质色/标签值/动画速度驱动（`HighlightManager`/`LabelManager` 现成） |
| 事件/联动 | SceneEvent 点击拾取基础 | 自研 events（点击设备→跳 2D faceplate 等） |
| 版本/乐观锁 | MongoDB 版本（无 if_version） | 换 rs-iot screens API → 乐观锁+版本面板**直接获得** |
| 保存链路 | DBManager 两方法 | **适配层约 30 行**：`saveScene/getSceneData` 换 `screensApi.putScene/getScene`（DBManager 是唯一后端耦合点） |

**结论**：交互壳（物料/属性/材质/动画/撤销/场景树/视角管理）已达到甚至超过 2D 体验的下限；**「类似 2D 的低代码体验」的缺口集中在数据面**——绑定、运行驱动、事件三块，这三块无论选哪个候选都必须自研（3D 组态的固有工作量），Meteor3D 不欠账更多。

### 12.5 两候选终评对比（更新 §5.1/§9）

| 维度 | three-editor-cores（§5.1 原推荐） | **Meteor3DEditor（新推荐）** |
|---|---|---|
| 许可 | Apache-2.0 | **MIT** |
| three 版本差 | 0.158 → 0.187（**29 minor，§9 R2 高风险**） | 0.184 → 0.187（**3 minor，低**） |
| 编辑器面板层 | 无（threejs-editor 壳绑专有 npm 包） | **自带全套 Vue3 面板** |
| 撤销重做 | 简单 History | 命令模式+复合命令 |
| 场景树 | 无 | 有（含 reparent） |
| 序列化体积 | 全参数内嵌（128KiB 高危） | 节点图+URL 引用（实测 1.5KB/对象） |
| 运行页 SDK | 无 | `loadScene` 独立入口 ✓ |
| GIS/资产管线 | 无 | 有（leaflet 底图 + KTX2/Meshopt 管线） |
| 测试/类型 | 无测试无 d.ts | 11 测试 ✓ / 无 d.ts |
| 已知缺陷 | 多 GLTF 实例链路未验 | 7 项实测缺陷（4 项已本地修） |
| 维护 | 单人（28 commits） | 单人（活跃至 2026-11-11） |

**推荐**：**首选内核切换为 Meteor3DEditor**，three-editor-cores 降为备选。核心理由：①three 版本贴（头号风险 R2 从高降低）；②交互壳现成（省 P1 主要工作量）；③序列化体积健康（R3 消除）；④MIT + 运行页 SDK 使「编辑器→运行页」架构一步到位。

### 12.6 更新后的分期路线（替换 §8）

| 期 | 内容 | 验证 |
|---|---|---|
| P0 vendor + 存储适配（3~5 天） | `src/modules3d3d/` vendor Meteor core（锁 commit+保留 MIT 声明）；DBManager 适配 rs-iot（`putScene/getScene` + if_version）；`index.d.ts` 补类型；路由 `/edit3d/:id` | 打开 `/edit3d/:id` 加载/编辑/保存/刷新一致；从 `/edit/:id` 切换无 WebGL 泄漏 |
| P1 运行页 + SSE 驱动（5~8 天） | `/view3d/:id` 改用 loadScene SDK 渲染 scene3d/2；SSE `createRtdataStream` 接入；高亮/标签驱动 | 场景对象随实时值变化；编辑保存 → 运行页所见一致 |
| P2 绑定层（5~8 天） | `bindings`（bid→field）+ 绑定面板（复用 BindPanel 语义/device-tree）+ 告警→Highlight/Label 映射 | 绑定 `dev_wm1.flow_rate` → 运行页对象数值/高亮随 SSE 变化 |
| P3 事件 + 工业图元首批（5~8 天） | 点击设备→跳 2D faceplate；`modules3d/geometry.ts` 改造输出 Meteor 兼容 GLTF/组合件（泵/罐/管线首批） | 全链路：3D 点击→2D 面板→返回；首批工业图元可拖放 |

总计约 18~29 天（与 §8 量级一致，但 P0/P1 风险显著更低——交互壳与运行 SDK 现成）。

### 12.7 待决事项更新（替换 §11）

| # | 待决 | 状态 |
|---|---|---|
| Q1 内核许可 | ~~已解决~~ → **随候选切换重开：MIT，无采购问题** | 已闭 |
| Q2 three 版本 | Meteor 用 0.184：**P0 实测 core 在 0.187 下运行**（3 minor 差距，大概率兼容）或锁 0.184 | 待 P0 实测 |
| Q3 组件库移植 | Meteor 自带通用几何+模型资产；工业图元仍需移植 `geometry.ts` | 待确认首批清单 |
| Q4 scene3d/2 契约 | 按 §4.2 结构，`core` 字段存 Meteor `saveScene` 原生 JSON | 待 P0 定稿 |
| Q5 GLB 托管 | 建议 rs-iot 静态目录（复用 gateway 静态机制） | 待架构确认 |
| Q7 **新增**：autoSave 与 if_version 乐观锁的交互（D4）——引入后自动保存需走乐观锁，冲突时 UI 提示 | 设计 | P0 需出方案 |
| Q8 **新增**：Meteor3D 编辑器 UI 与 hmi-studio 风格统一（工业深色主题/HP-HMI 色板）程度 | 设计 | P1 |
