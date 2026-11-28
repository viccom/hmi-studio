# 3D 物料与图元开发规范（v1.0）

> 定位：**面向 AI Agent 的自包含开发手册**——在 3D 组态编辑器里新增图元/物料，只需本文
> + 阅读 `adapter/industrial-parts.ts` 的邻居写法，不必回读整套 3D 实施方案。
>
> | 主题 | 权威文档（本文不重复，只引用） |
> |---|---|
> | 3D 线整体架构、vendor 补丁、分期与验收 | `docs/plans/2026-11-26-3d-editor-meteor-implementation-plan.md`（含附录 A 厂区迁移、附录 B 体检与止血） |
> | 分层与依赖方向（module3d 只能向下依赖） | `docs/architecture.md` §2 |
> | 工业 HMI 视觉纪律（灰阶常态、饱和色只给状态） | `docs/hmi-style-guide.md` |
> | 2D 图元/符号/插件体系（**与本文是两条独立线**） | `docs/widgets-plugins-guide.md` |
> | 工程规范与门禁总览 | `docs/standards.md` |
>
> 本文管：**3D 图元的规格契约、硬约束、开发工作流、命名与身份、物料库分区矩阵、
> 资产类物料的接入方式、验证门禁、已知限制**。
> 计数时点 **2026-11-28（commit 331bbaa）**；权威源 = `src/modules3d/adapter/industrial-parts.ts`
> 与 `src/modules3d/vendor/meteor3d/core/PersistenceManager.js`——本文表格是导览，漂移以代码为准。

## 0. 快速上手（先读这节）

按任务取节：

| 任务 | 读哪节 | 落点文件 |
|---|---|---|
| 新增一个工业设备图元（水表/阀/泵…） | §1 → §3 → §4 | `src/modules3d/adapter/industrial-parts.ts`（写 specs + 注册） |
| 用代码批量生成整个场景 | §7.2 | `src/modules3d/adapter/plant-scene.ts` |
| 接入 GLB 设备模型（模型物料） | §7.3 | `src/modules3d/adapter/model-assets.ts`（新建）+ `vendor/.../services/assetService.js` |
| 给图元子件挂实时数据/点击事件 | §8 | 编辑器 UI（绑定/事件页签），无代码 |
| 排查「图元刷新后变形/消失」 | §3 白名单 + §10 坑 1/2 | — |
| 排查「点设备显示的设备名不对」 | §5 命名规范 | `Scene3DEditView.vue` 的 `buildIndustrialPart` |
| 排查「物料库模型分区为空」 | §7.3 | `assetService.js` 空桩 |

**门禁速查**（`e2e` 需 rs-iot 实例存活，本工作路径用 `RSIOT_BASE=http://127.0.0.1:20000`）：

```bash
pnpm run typecheck                        # vue-tsc
pnpm exec eslint .                        # vendor 目录已豁免（见 §3 注）
node scripts/check-layers.mjs             # 分层：module3d 只许向下依赖
pnpm test                                 # 单测（图元注册表断言在 industrial-parts.test.ts）
pnpm e2e e2e/scene3d.spec.ts              # 3D 专项 e2e
pnpm modules:verify                       # 可剔除性：删掉 src/modules3d 后 2D 仍 typecheck
```

**五条红线**（违反即 review 阻断——这些不是风格偏好，是持久化契约）：

1. **几何类型必须在 5 种白名单内**（§3.1）。白名单外不会报错，直接静默降级成 1×1×1 方块。
2. **禁止把子件包进 `Group`**。上游按对象序列化，Group 会吞掉子件的 bid 与几何。
3. **禁止贴图、ShaderMaterial、自定义几何**。文档只存几何参数与材质参数，没有 `map` 字段。
4. **子件名必须唯一且带语义**（`表体`/`状态灯`/`阀杆`），落库拼成 `<前缀>/<子件名>`——
   设备反查与场景树都依赖这个格式。
5. **饱和色只给状态件**。常态件用灰蓝令牌（`P.base/body/panel/dark/frame`），
   绿/黄/红/青只给指示灯、状态灯、手轮这类表达状态的件。

## 1. 第一性原理：为什么图元是 spec 列表

**3D 图元不是一个自定义 three 对象，而是一串「基础几何规格」（spec list）。**

原因在持久化。场景文档落库时，上游按 `geometry.type` 用 `if` 链重建几何
（`vendor/meteor3d/core/PersistenceManager.js:700-745`），只认 5 种；材质也只存参数
（`serializeObject` 输出的 15 个标量字段，`PersistenceManager.js:495-520`），**没有贴图通道**。

所以：

- 自定义 `LatheGeometry`/`TorusGeometry`/`TubeGeometry` → 存不进文档，**刷新即丢**
- ShaderMaterial / CanvasTexture → 同样存不进
- 把子件包成 `Group` → 序列化时子件塌成一个对象，bid/几何丢失，也无法单独绑点位

推论（本文所有规范都从这里推出）：

| 需求 | 因为持久化契约，只能这样做 |
|---|---|
| 复杂的曲面外形 | 用 5 种几何**拼**（球做表头、圆柱做法兰、盒做柜体） |
| 圆环状零件（手轮/法兰边） | 用扁圆柱近似，或用 `CylinderGeometry` 的 `openEnded` 做筒体 |
| 动画（叶轮旋转） | 要么用 GLB 自带动画（§7.3），要么接受「刷新后不转」 |
| 材质渐变/纹理 | 不支持；用两三个不同色的子件叠出层次 |
| 一台设备多个部件分别绑点 | ✅ 天然支持——每子件独立 bid（这是 spec 列表最大的收益） |

**与 2D 图元的差异**：2D 图元是 maotu 组件（Vue/SVG，有自己的渲染管线与 props 契约）；
3D 图元只是**几何参数**，没有逻辑代码，行为（变色/发光/显隐/标签）全部由**绑定层**
（`adapter/bindings.ts`）在运行期施加。所以 3D 图元不需要写渲染代码，只需要写几何。

## 2. 两条开发路径

| | 路径 A：图元库（物料库可拖） | 路径 B：程序化场景生成 |
|---|---|---|
| 入口 | `adapter/industrial-parts.ts` → `INDUSTRIAL_PARTS` | `adapter/plant-scene.ts` 的 `buildPlantScene()` |
| 使用者 | 编辑器里的人**拖拽**放置 | 脚本生成整份 v2 文档并 PUT 到 `scenes` 族 |
| 实例身份 | 每次拖入生成新随机 bid | 生成器用**语义化 bid**（`plant_wm1_02`），可重复生成 |
| 适合 | 可复用设备（水表、泵、阀） | 一次性场景（整厂布置、批量实例化） |
| UI | 物料库「工业设备」分组自动出现 | 无 UI，产物是数据 |

两者共用同一套 `PartSpec` 结构与 `buildPartSpecs()`，所以**图元写一次，两条路都能用**
（`plant-scene.ts` 直接用 `partById()` 取 specs）。

选型：**要做"能拖进任何场景的设备"→ 路径 A；要做"这个场景长这样"→ 路径 B**。
路径 B 的额外约定见 §8.3（锚点/接线端面/介质表）。

## 3. 硬约束

### 3.1 几何白名单（5 种，参数键名必须逐字一致）

| type | 参数（`PersistenceManager.js:703-740` 实际读取的键） | 缺键后果 |
|---|---|---|
| `BoxGeometry` | `width` `height` `depth` | `undefined` → 几何退化/不可见 |
| `SphereGeometry` | `radius` `widthSegments` `heightSegments` | 同上 |
| `PlaneGeometry` | `width` `height` `widthSegments` `heightSegments` | 同上 |
| `ConeGeometry` | `radius` `height` `radialSegments` `heightSegments` `openEnded` `thetaStart` `thetaLength` | 同上 |
| `CylinderGeometry` | `radiusTop` `radiusBottom` `height` `radialSegments` `heightSegments` `openEnded` `thetaStart` `thetaLength` | 同上 |

**其它任何 type**（含 `TorusGeometry`、`RingGeometry`、`LatheGeometry`、`ExtrudeGeometry`、
`CircleGeometry`）→ 命中 `else` 分支，**静默变成 `BoxGeometry(1,1,1)`**，不报错、不警告。

文件内已有三个 helper 负责补全参数（`industrial-parts.ts:42-47`）：

```ts
cyl(radiusTop, radiusBottom, height, radialSegments = 20)   // CylinderGeometry
box(width, height, depth)                                    // BoxGeometry
sph(radius, segments = 16)                                   // SphereGeometry
```

**默认用 helper，不要手写 parameters**——手写容易漏段数键。

### 3.2 材质白名单

`PartSpec.material` 只声明 7 个字段（`industrial-parts.ts:22`）：

```ts
{ color: number            // 必填，0xRRGGBB
  roughness?: number       // 0~1，常态 0.85
  metalness?: number       // 0~1，金属件 0.3~0.4
  emissive?: number        // 0xRRGGBB，仅状态件
  emissiveIntensity?: number
  opacity?: number
  transparent?: boolean }
```

上游还能存 `alphaTest/blending/side/depthTest/depthWrite/vertexColors/wireframe/flatShading`
（`PersistenceManager.js:509-520`），但 **`PartSpec` 类型未声明**——需要它们时要先扩类型，
并确认 `Scene3DEditView.vue` 的 `buildIndustrialPart` 会把它们传给 `MeshStandardMaterial`
（现状只传 color/roughness/metalness/emissive/emissiveIntensity/opacity/transparent）。

**禁止**：任何 `map`/`normalMap` 类字段（文档没有贴图通道，写了也会丢）。

### 3.3 禁止项

| 禁止 | 原因 | 后果 |
|---|---|---|
| 子件包 `Group` | 上游按对象序列化 | 子件塌成一个，bid/几何丢失，无法绑点 |
| 自定义几何/着色器/贴图 | 无持久化通道 | 刷新即丢 / 静默变形 |
| 在 spec 里做动画（自转/流动） | 落库不含动画状态（GLB 除外） | 编辑期看得见，刷新后不动 |
| 在 `industrial-parts.ts` 里 import `three` | 该文件必须**零运行时依赖**（纯数据，供 SSR 脚本与单测使用） | 迁移脚本/单测加载失败 |
| 图元 id 重复 | 物料库按 id 做 key | 同 id 后项覆盖前项 |

> **关于 eslint**：`src/modules3d/vendor/**` 整体豁免 lint（上游锁定副本）。
> 但 `industrial-parts.ts` 在 `adapter/` 下，**不豁免**——新图元要过 lint。

## 4. 图元开发工作流（路径 A）

### 4.1 写 specs

在 `industrial-parts.ts` 加一个工厂函数（返回 `PartSpec[]`），**局部坐标以设备落地中心为原点**
（`y=0` 是地面，向上为正）：

```ts
/** 闸阀：阀体 + 两侧法兰 + 阀杆 + 手轮 */
const gateValve = (): PartSpec[] => [
  { name: '阀体',   geometry: cyl(0.26, 0.26, 0.5, 20), position: [0, 0.4, 0],
    material: { color: P.body, roughness: 0.75, metalness: 0.25 } },
  { name: '法兰左', geometry: cyl(0.32, 0.32, 0.08, 16), position: [-0.28, 0.4, 0],
    rotation: [0, 0, Math.PI / 2], material: { color: P.frame, roughness: 0.6, metalness: 0.35 } },
  { name: '法兰右', geometry: cyl(0.32, 0.32, 0.08, 16), position: [0.28, 0.4, 0],
    rotation: [0, 0, Math.PI / 2], material: { color: P.frame, roughness: 0.6, metalness: 0.35 } },
  { name: '阀杆',   geometry: cyl(0.05, 0.05, 0.5, 8),  position: [0, 0.85, 0],
    material: { color: P.dark, roughness: 0.9 } },
  { name: '手轮',   geometry: cyl(0.22, 0.22, 0.05, 20), position: [0, 1.12, 0],
    material: { color: P.p1, roughness: 0.5, metalness: 0.2 } },   // 红色手轮：状态件
]
```

尺寸基准：**1× 原生**（设备最大外径 0.5~1.0 m，总高 0.8~1.8 m）。不要用 2× 缩放——
物料库其他图元都是 1×，混用会让新图元显得小一半。

### 4.2 注册

```ts
export const INDUSTRIAL_PARTS: IndustrialPart[] = [
  // …现有 7 项
  { id: 'gate-valve', name: '闸阀', category: 'common', specs: gateValve() },
]
```

`category` 只能是 `water | power | gas | env | common`（决定物料库分组与中文标题，
`CATEGORY_TEXT` 在 `industrial-parts.ts:127-133`）。

**注册即完成 UI 接入**：物料库是数据驱动的（`LibraryPanel.vue:245-252` 遍历注册表按
`category` 分组），不需要改任何 Vue 组件。

### 4.3 挂数据（在编辑器里操作，无代码）

| 目的 | 选哪个子件 | 绑定 kind | 配置要点 |
|---|---|---|---|
| 状态灯随实测值亮 | 状态灯/指示灯 | `emissive` | `color` 给状态色，`scale` 控制亮度系数 |
| 阈值显隐（如阀门开到位才显示） | 任意子件 | `visible` | `truthyAbove` 阈值 |
| 浮出实时读数 | 主体件 | `label` | **需要 `position`**（见 §10 坑 4） |
| 超过阈值变色 | 主体件 | `color` | 注意：`config.color` 恒有默认值 → 实际是静态改色（见 §10 坑 5） |
| 点击跳 2D 设备面板 | 主体件 + 主要可点子件 | 事件 `navigate` | 一台设备要挂**多条**规则（射线可能命中任一子件） |

**为什么一台设备要挂多条事件**：v2 里每个子件是独立对象，点到哪一件取决于射线命中。
只给主体件挂规则的话，点中面板/接管只会聚焦、不跳转——操作员会觉得"有的地方能点、
有的地方不能"。厂区 DEMO 的 `PART_ANCHOR.clickable` 就是这个问题的解
（`plant-scene.ts:82-89`）。

### 4.4 验证

```bash
pnpm exec vitest run src/modules3d/adapter/industrial-parts.test.ts
```

该测试**自动**覆盖新图元的三条不变量：id 唯一、`category` 是已知值、`specs` 非空。

浏览器验收（`/edit3d/<场景>`）：物料库找到新图元 → 拖入 → 选中子件能看到属性 →
保存 → 刷新 → 位置/材质/场景树名都在 → 运行页（`/view3d/<场景>`）数据生效。

### 4.5 自检清单

- [ ] 几何只用 5 种白名单，参数走 `cyl`/`box`/`sph`
- [ ] 子件名唯一、有语义、中文
- [ ] 至少一个「主体件」（体积最大、可点）+ 一个「状态件」（可发光）
- [ ] 尺寸 1× 原生（最大外径 ≤ 1.0 m）
- [ ] 常态件用灰蓝令牌；饱和色只给状态件
- [ ] `id` 全局唯一、kebab-case
- [ ] 文件没有 `import 'three'`
- [ ] 跑过 `industrial-parts.test.ts`

## 5. 命名与身份规范

| 项 | 规则 | 依据 |
|---|---|---|
| 图元 `id` | kebab-case，全局唯一（`water-meter`） | 物料库 key、`Industrial:<id>` 拖放载荷 |
| 图元 `name` | 中文短名（`远传水表`） | 物料库显示 |
| 子件 `name` | 中文短名，**同一图元内唯一**（`表体`/`状态灯`） | 场景树可读性 |
| 落库对象名 | `<前缀>/<子件名>` | `buildPartSpecs`（`industrial-parts.ts:183`） |
| 编辑器拖入前缀 | `<图元名> <实例序号>`，如 `远传水表 2` | `Scene3DEditView.vue:90-93`（**注意是"空格+数字"，不是斜杠**） |
| 程序化生成前缀 | 设备位号（`WM-101`）或设备标签（`WM-101 1#水表`） | `plant-scene.ts:205` |
| `bid` | `bid_<随机8位>_<随机8位>` | `industrial-parts.ts:162-165` |

**两条必须知道的推论**：

1. **设备反查靠名字前缀分组**：`adapter/device-panel.ts:38` 用 `deviceKeyOf()` 取 `/` 之前的部分
   作为设备 key。所以同一台设备的**所有子件前缀必须完全一致**，且不同设备前缀必须不同
   （这就是实例序号的由来——2026-11-28 修过一次"两台同名水表被并成一台"的缺陷）。
2. **bid 是随机的，不是稳定的**：每次拖入/重建都是新 bid。因此**不能把 bid 当设备身份**，
   也不能做"图元模板复用"——删除后重新拖入，原有绑定/事件会悬空（`binding-ops.ts` 只能标红，
   不能自动修复）。要设备身份，用名字前缀（运行时）或设备台账（业务侧）。

## 6. 现有图元清单（7 种，39 子件）

| id | 名称 | 分类 | 子件数 | 子件 |
|---|---|---|---|---|
| `water-meter` | 远传水表 | water | 6 | 底座 / 表体 / 接管左 / 接管右 / 表盘 / 状态灯 |
| `gas-meter` | 燃气表 | gas | 6 | 底座 / 表体 / 接管左 / 接管右 / 表盘 / 状态灯 |
| `power-meter` | 三相电表 | power | 8 | 底座 / 柜体 / 面板 / 铭牌 / 指示灯A / 指示灯B / 指示灯C / 散热片 |
| `env-sensor` | 环境传感器 | env | 7 | 底座 / 机体 / 顶盖 / 探头温 / 探头湿 / 探头气 / 显示屏 |
| `pressure-transmitter` | 压力变送器 | env | 4 | 底座 / 支杆 / 表头 / 法兰 |
| `pump` | 离心泵 | common | 4 | 底座 / 泵体 / 叶轮罩 / 出口管 |
| `tank` | 立式储罐 | common | 4 | 基座 / 罐体 / 顶沿 / 呼吸阀 |

**明确没有的**：阀门（闸阀/球阀/蝶阀）、管道图元、风机、换热器、电机、输送带。
补这些是下一步最自然的扩展。

## 7. 物料（物料库）分区矩阵

**"图元"与"物料"的区别**：图元 = 一台可拖放的设备（spec 列表）；物料 = 物料库条目的总称，
包含 7 个分区，图元只是其中之一。

| # | 分区 | 数据源 | 拖放 type | 可落库 | 现状 |
|---|---|---|---|---|---|
| 1 | 工业设备 | `INDUSTRIAL_PARTS` | `Industrial:<id>` | ✅ 每子件独立对象 | 7 种，可用 |
| 2 | 几何体 | 上游内置 | `Box`/`Sphere`/`Cone`/`Cylinder`/`Plane` | ✅ | 可用 |
| 3 | 可视化效果 | 上游内置 | `PreviewShield`/`Scan`/`Label`/`Fire` | ❌ **明确不序列化** | 编辑期占位，刷新即失 |
| 4 | 模型 | `getAssets('model')` | `GLTFModel` + `url` | ✅（存 url/assetId/动画） | **空**（空桩） |
| 5 | 环境贴图 | `getAssets('hdri')` | `Environment` + `url` | ✅（`scene.environmentUrl`） | 空 |
| 6 | 3D Tiles | `getAssets('tileset')` | `Tileset` + `url` | ✅（存 url） | 空 |
| 7 | 高斯泼溅 | `getAssets('gaussian-splat')` | `GaussianSplat` + `url` | ⚠️ 有落库分支，但渲染器是桩 | 不可用 |

### 7.1 分区 1/2：已通

分区 1 = 本文 §4 的图元开发；分区 2 不可扩展（加新几何类型要改 vendor 双侧，见 §3.3）。

### 7.2 分区 1 的第二条路：程序化生成

`plant-scene.ts` 用同一套 specs 批量生成场景，额外用了三个约定（**给路径 B 用的**，
路径 A 不需要）：

| 约定 | 作用 | 位置 |
|---|---|---|
| `PART_ANCHOR` | 每个图元的「主体件」（发光/标签目标）与「可点击件」清单 | `plant-scene.ts:82-89` |
| `PART_NOZZLE_R` | 图元的接线端面半径——管线在此收住，不穿进设备几何体 | `plant-scene.ts:130-136` |
| `MEDIA` | 介质表：配色 / 自发光色 / 敷设高度 / 管径 | `plant-scene.ts:116-121` |

**新增图元若要被 `plant-scene.ts` 使用**，需要在 `PART_ANCHOR` 补一行（否则生成器抛
"缺锚点定义"）。这是有意的:强制作者想清楚"哪件是主体件、哪件是状态件"。

### 7.3 分区 4~7：资产物料（C 类）

**前端链路已完整，缺的是「文件放哪」与「清单从哪读」。**

已验证的三条事实：

1. 落库完整：`GLTFModel` 分支存 `url / assetId / assetVersionId / nodeBindings / animation`
   （`PersistenceManager.js:448-470`），加载走 `loadGLTFModel(data.url)`。
2. **URL 可写绝对路径**：运行页 `restoreScene` 不传 `serverUrl`，`resolveResourceUrl` 原样返回
   （`PersistenceManager.js:1208-1209`）→ 只要 url 是 `/hmi/...` 或完整 http 地址就能加载，
   **前端零改动**。
3. **GLB 是引用不是内嵌** → **不占 1 MiB 场景文档上限**（这是模型物料最大的优势）。

接入所需（最小可行）：

| 步骤 | 落点 | 说明 |
|---|---|---|
| 1. 文件就位 | gateway 的 `/hmi/widgets` 静态挂载（`hmi_widgets_dir`） | 生产需在 `rs-iot/gateway.toml` 加一行；dev 由 vite 中间件把 `/widgets/*` 映射到仓根 `widgets/`（`vite.config.ts:18-34`） |
| 2. 写清单 | `src/modules3d/adapter/model-assets.ts`（新建） | 随版本发布的常量数组 |
| 3. 接桩 | `vendor/.../services/assetService.js` 的 `getAssets(kind)` | 现在恒返回 `[]`；改后按 kind 返回清单 |

`LibraryPanel` 消费的字段（`LibraryPanel.vue:135-143`）：

```ts
interface ModelAsset {
  _id: string          // 必需：v-for key
  name: string         // 显示名
  url: string          // 拖放载荷（绝对路径）
  originalName?: string // tooltip
  assetVersionId?: string
}
```

三种物料的差异：

| kind | 落库字段 | 运行期行为 | 前置条件 |
|---|---|---|---|
| `model` | url / assetId / animation | 加载 GLB，支持骨骼动画 | 文件可访问 |
| `hdri` | `scene.environmentUrl` | 只影响环境光照 | 文件可访问 |
| `tileset` | url | 依赖 `3d-tiles-renderer`（已装） | 瓦片数据可访问 |

**分区 7（高斯泼溅）不要接**：渲染器被 alias 到 `stubs/spark.js`，构造即抛错
（`vite.config.ts:13`）。

## 8. 数据挂载规范

### 8.1 绑定 kind（5 种，当前可达性）

| kind | 配置字段 | 运行期行为 | 当前限制 |
|---|---|---|---|
| `emissive` | `color` `scale` | 自发光强度 = 实测值 × scale | 可用（最常用） |
| `visible` | `truthyAbove` | 值 > 阈值才显示 | 可用 |
| `label` | `unit` `precision` `position` `offset?` `color?` | 浮出读数 | **必须给 `position`**；编辑器面板无输入框（见 §10 坑 4） |
| `color` | `color` | 改材质颜色 | `config.color` 有默认值 → **实时值不生效**，等价静态改色 |
| `animationSpeed` | — | 改 GLB 动画速度 | **需 GLB 对象**；纯几何无 AnimationClip → 不可达 |

### 8.2 事件动作（4 种，当前行为）

| 动作 | 编辑器可配 | 运行页行为 |
|---|---|---|
| `navigate` | slug + dev | **点击不跳转**——目标交给设备详情面板的按钮（2026-11-27 按 v1 契约回归） |
| `focus` | 固定当前对象 | 相机聚焦该对象 |
| `setCamera` | 视角写死默认值 | 切到固定机位（无"采集当前视角"入口） |
| `command` | 命令名 | 经 `window.$rsiot.send` 下发；无 params UI |

### 8.3 程序化路径的三张表（§7.2）

新增图元若用于 `plant-scene.ts`，需同步维护：

| 表 | 缺了会怎样 |
|---|---|
| `PART_ANCHOR` | `buildPlantScene()` 抛「缺锚点定义」 |
| `PART_NOZZLE_R` | 管线端点回退到 0.4 m 默认值（可能穿进设备） |
| `MEDIA` | 只影响管线，与图元无关（新增介质才需要） |

## 9. 验证与门禁

| 门 | 命令 | 覆盖什么 |
|---|---|---|
| 类型 | `pnpm run typecheck` | specs 字段是否合法（`PartSpec` 强类型） |
| lint | `pnpm exec eslint .` | adapter 下的图元代码（vendor 豁免） |
| 分层 | `node scripts/check-layers.mjs` | 图元文件只能依赖 lib/components/symbols/assets |
| 单测 | `pnpm exec vitest run src/modules3d/adapter/industrial-parts.test.ts` | id 唯一 / 分类合法 / specs 非空 |
| 单测（场景） | `... plant-scene.test.ts` | 若图元被生成器使用：bid 唯一、几何白名单、绑定/事件不悬空 |
| e2e | `RSIOT_BASE=... pnpm e2e e2e/scene3d.spec.ts` | 运行页渲染、详情面板、保护闸、预览 |
| 可剔除 | `pnpm modules:verify` | 删掉 `src/modules3d/` 后 2D 仍能 typecheck |

**当前门禁的缺口**（已知，未补）：没有测试校验"几何类型是否在白名单内"——
`makeGeometry` 的 `default` 分支会静默返回 Box。新增图元后请人工对照 §3.1。

## 10. 已知限制（都是现状事实，不是待办）

| # | 限制 | 影响 | 出处 |
|---|---|---|---|
| 1 | 几何白名单外**静默变方块** | 图元造型静默损坏 | `Scene3DEditView.vue:122` |
| 2 | 材质不共享：每次拖入 `new MeshStandardMaterial` | 同类设备改配色要逐台改 | `Scene3DEditView.vue:96` |
| 3 | bid 随机生成 | 无模板复用；重建后绑定悬空 | `industrial-parts.ts:162` |
| 4 | `label` 绑定在编辑器配不出位置 | 面板建的 label 绑定运行页不显示 | `bindings.ts:124` + `BindingPanel` 无 position 字段 |
| 5 | `color` kind 的 `config.color` 恒有默认值 | 实时值永远不生效 | `binding-ops.ts:19` |
| 6 | `animationSpeed` 需 GLB | 纯几何图元不可达 | `bindings.ts:147` |
| 7 | 可视化效果（护盾/扫描/火焰）不落库 | 只能当编辑期参考 | `VisualPreviewManager.js:1-4` |
| 8 | 高斯泼溅渲染器是桩 | 该分区不可用 | `vite.config.ts:13` |
| 9 | 资产分区（模型/环境/Tiles）全空 | 不能拖真实模型 | `assetService.js` |
| 10 | 图元库是**编译期常量** | 新增图元要改代码 + 构建部署，站点不能自建 | `INDUSTRIAL_PARTS` |
| 11 | 长期资产场景受保护 | 删除被拦（`iot-plant-3d` 等） | `protected.ts:48` + `ScreenList3DView` 删除闸 |

**若要把第 10 条变成"站点自建"**：需要把图元库从 TS 常量改成数据（新资源族或复用
`screens`），物料库从 API 读。这是实施方案里 Q11「图元扩展模型」那个未决项——
当前代码与方案建议一致（"仅随版本发布"），所以不算漂移。

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-28 | v1.0 首版：从代码反推的完整规范（图元 spec 契约、5 种几何参数表、物料 7 分区矩阵、资产物料接入路径、命名与身份、已知限制 11 条） |
