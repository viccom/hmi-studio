# hmi-studio 架构与分层规范

> 本文是架构事实与分层规则的单一权威源。依赖方向规则由 `scripts/check-layers.mjs` 机械化拦截（`just layers`）。
> 建立时点：2026-10-27（基于当时 75 commit 的代码实测依赖图；漂移以脚本与本文同步修正为准）。

## 1. 系统上下文

```
浏览器 SPA（本仓库，dist 由 gateway 挂 /hmi）
  │  REST（JWT）/ SSE（gateway: ?token= / dev: 同源 Cookie）
  ▼
rsiot-gateway :18080 ──反代──▶ rs-iot :8790（采集 + 实时数据 + 画面真相 /api/v1/screens）
```

- 画面真相唯一存于 rs-iot（内嵌 lux 库），前端**无自有持久化**（本地仅 token/theme，localStorage）。
- maotu 0.6.5 是**外部依赖内核**：编辑器（MtEdit）/预览（MtPreview）/doc 格式（IExportJson）/注册协议（registerConfig）全部来自它；本仓库只消费，不修改（红线见 §4.1）。

## 2. 分层与依赖方向

实测分层（2026-10-27，文件级零环依赖）：

```
L5 app 壳        main.ts / router.ts / App.vue          ──▶ views, lib, dev
L4 views 页面    Login/ScreenList/Edit/View             ──▶ lib, components, symbols
L3 components    AlarmBanner/Drawer, BindPanel, Thumb…  ──▶ lib
L2 symbols 图元  27 图元 ts + Ah*.vue + kit/registry    ──▶ lib（仅测试），maotu 类型
L1 lib 基础层    api/auth/sse/binds/command/alarms/nav… ──▶ maotu 类型（经豁免清单例外↓）
    （画面资产）  demo-screen / home-*（现居 lib，见 §4.2）
L0 外部边界      maotu npm 包 / endpoints.ts（env 单源）/ 浏览器 API
```

### 依赖方向规则（check-layers 强制）

| 规则 | 内容 | 违反后果 |
|------|------|---------|
| 向下依赖 | 只允许依赖**更低**层；跨层跳依赖允许（views→lib），**反向一律禁止** | `just layers` 失败 |
| lib 纯度 | `src/lib/**` 禁止 import symbols / views / components / dev | 同上（豁免清单除外，§4.2） |
| symbols 封闭 | symbols 禁止 import views / components / dev；lib 仅测试文件可用 | 同上 |
| components 封闭 | components 禁止 import views / symbols / dev | 同上 |
| views 互不依赖 | view 文件之间禁止互相 import（共用逻辑下沉 lib/components） | 同上 |
| dev 隔离 | 正式代码（非 src/dev）禁止 import `src/dev/**`；dev 不进导航不进守卫 | 同上 |
| 测试同层 | `*.test.ts` 只 import 被测层及更低层 | 同上 |

## 3. 模块清单（src/lib 一词一文件）

| 模块 | 职责 / 关键契约 |
|------|----------------|
| endpoints | 部署寻址单源：API_BASE / LOGIN_PATH / SSE_TOKEN_IN_QUERY（build 时 env 烘入） |
| api | REST 客户端：JWT 头 + 非 2xx 抛 ApiError + 401 全局回调（main.ts 接线登出） |
| auth | 登录形状 `{user_id,pass}` → token/user（localStorage `hmi_token`） |
| screens | 画面 doc wrap/unwrap（meta 同体存储）+ screens CRUD 薄封装 |
| screen-list / screen-create | 并发上限分批取列表（cap=4）/ 探测式创建（ok/exists/failed） |
| device-tree / device-registry | rs-iot 设备+标签 → maotu 级联树（叶子 value=`<devid>.<tag>`）/ devid→owner_inst 解析 |
| binds | collectBinds(doneJson)：递归收集 bind_id → 去重 `{fields, devs}`（订阅面） |
| sse | SSE 客户端：帧解析纯函数 + EventSource 流层（退避重连 + 401 探测 auth-failed） |
| command | 命令契约：buildCommandReq / CommandTracker 状态机 / resolveInstance |
| bridge | `window.$rsiot` 安装/卸载（send 二次确认 + nav 别名 + 命令历史环形 20） |
| alarms | AlarmStore 双源合并（REST 快照 + events SSE）+ 轮播游标 |
| nav | 事件词表分发器（nav/back/home/dev/alarm）+ 历史栈 |
| dev-context | `@dev.` 前缀重映射（模板画面 → 具体设备）+ `@meta.dev` 回显通道 |
| uid / fit-scale / trigger-value / theme / symbol-lint | 稳定 uid / contain 缩放纯函数 / 触发器值归一 / 明暗单源 html.dark / 图元约定七规则 lint |
| demo-screen / home-* | **画面资产**（预组态画面的纯函数生成器，见 §4.2） |

## 4. 耦合边界与约束

### 4.1 maotu 耦合（三通道，其余禁止）

1. **类型通道**：`import type` 自 'maotu'（IExportJson / ILeftAsideConfigItemPublic 等）——lib 与 symbols 均可用。
2. **注册通道**：`registerConfig` / `leftAsideStore` / `MtEdit` / `MtPreview` / `setImportJson` / `setDevicePointByID` / `$mtEventCallBack` / `deviceBind` 插槽——仅 symbols 注册管道与 views 装配处调用。
3. **视觉通道**：自家 `:deep()` CSS 覆盖（横幅/logo/工具栏）——不改包文件、不用 pnpm patch（预留手段，至今未用）。

红线：maotu 包源码/反编译产物不得入库（docs/LICENSE-NOTES.md）；已知缺陷一律绕过不修包。

### 4.2 lib↔symbols 的画面资产豁免（技术债登记）

`demo-screen.ts / home-screens.ts / home-tab-screens.ts / home-faceplate-screen.ts`（及其 4 个伴生测试）+ `symbol-lint.test.ts`（lint 全量被测对象在 symbols）共 **9 个文件**是**画面内容资产**（预组态画面生成器），语义上居于 symbols 之上、views 之下，现物理存于 lib 并 import symbols/registry——与 lib 纯度规则冲突。豁免清单与 `scripts/check-layers.mjs` 的 `LIB_SYMBOLS_ALLOWLIST` 保持同步（规则见本文 §5 登记簿约定）。

- 处置：**登记豁免**（check-layers 白名单），不是认可。迁移目标 `src/screen-assets/`（或并入 symbols 侧），做迁移的时机 = 下一次新增画面资产模块时。
- 新增规则：今后**新增** lib 模块禁止 import symbols；新画面资产一律不再放 lib。

### 4.3 window 全局面（收口清单）

| 全局 | 归属 | 约束 |
|------|------|------|
| `$rsiot` | bridge.ts 独占安装/卸载 | 其他模块禁止直接挂 window；图元 custom_code 只写一行调用 |
| `$mtEventCallBack` 等 maotu 实例名 | maotu 包 | 只消费不定义 |
| `__navCount` | ViewView（E2E 钩子） | 必须注释用途；测试专用，不进业务逻辑 |

### 4.4 状态与数据流归属

- 画面真相：rs-iot（PUT 全量 upsert；编辑器 onSaveClick 是唯一保存入口）。
- 会话态：localStorage（token/user/theme），无 Pinia/全局 store——够用即不引入。
- 实时数据：SSE 桥单向上行（collectBinds 订阅面 → onPoint → setDevicePointByID），画面组件不直接 fetch。
- 命令：全部经 bridge（确认 → resolveInstance → POST → Tracker），组件不直发。

## 5. 架构决策登记簿

重大变更在此追加一行（日期 + 决策 + 依据），并同步本文与 check-layers：

- 2026-10-25 六决策锁定（D1 单 SPA … D6 编辑态命令显式确认）——docs/plans/2026-10-25-hmi-studio-design.md
- 2026-10-26 W11 设备参数化：`@dev.` 前缀重映射发生在 ViewView 数据层，maotu/rs-iot 协议无感知
- 2026-10-27 分层规范成文 + check-layers 机械化（本文）
