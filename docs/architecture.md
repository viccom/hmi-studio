# hmi-studio 架构与分层规范

> 本文是架构事实与分层规则的单一权威源。依赖方向规则由 `scripts/check-layers.mjs` 机械化拦截（`just layers`）。
> 建立时点：2026-10-27（基于当时 75 commit 的代码实测依赖图；漂移以脚本与本文同步修正为准）。

## 1. 系统上下文

```
浏览器 SPA（本仓库，dist 由 gateway 挂 /hmi）
  │  REST（Bearer 镜像）/ SSE（同源 HttpOnly cookie——统一会话，两形态一致）
  ▼
rsiot-gateway :18080 ──反代──▶ rs-iot :8790（采集 + 实时数据 + 画面真相 /api/v1/screens）
```

- 画面真相唯一存于 rs-iot（内嵌 lux 库），前端**无自有持久化**（本地仅 token/theme，localStorage）。
- maotu 0.6.5 是**外部依赖内核**：编辑器（MtEdit）/预览（MtPreview）/doc 格式（IExportJson）/注册协议（registerConfig）全部来自它；本仓库只消费，不修改（红线见 §4.1）。

## 2. 分层与依赖方向

实测分层（2026-10-29 更新，文件级零环依赖）：

```
L5 app 壳        main.ts / router.ts / App.vue          ──▶ views, lib, dev, assets
L4 views 页面    Login/ScreenList/Edit/View             ──▶ lib, components, symbols
L3 components    AlarmBanner/Drawer, BindPanel, Thumb…  ──▶ lib
L2 symbols 图元  27 图元 ts + Ah*.vue + kit/registry    ──▶ maotu 类型（+ bi-contract 单点白名单↓）
L1 lib 基础层    api/auth/sse/binds/command/alarms/nav… ──▶ maotu 类型
L1.5 assets 画面资产  screen-assets/*（预组态画面生成器）──▶ lib, symbols
L0 外部边界      maotu npm 包 / endpoints.ts（env 单源）/ 浏览器 API
```

### 依赖方向规则（check-layers 强制）

| 规则 | 内容 | 违反后果 |
|------|------|---------|
| 向下依赖 | 只允许依赖**更低**层；跨层跳依赖允许（views→lib），**反向一律禁止** | `just layers` 失败 |
| lib 纯度 | `src/lib/**` 禁止 import symbols / views / components / dev | 同上（2026-10-29 起豁免清单已清空，§4.2 结清） |
| symbols 封闭 | symbols 禁止 import views / components / dev；lib 仅测试文件可用 + `bi-contract.ts` 单点白名单 | 同上 |
| assets 封闭 | `src/screen-assets/**` 禁止 import views / components / dev | 同上 |
| components 封闭 | components 禁止 import views / symbols / dev | 同上 |
| views 互不依赖 | view 文件之间禁止互相 import（共用逻辑下沉 lib/components） | 同上 |
| dev 隔离 | 正式代码（非 src/dev）禁止 import `src/dev/**`；dev 不进导航不进守卫 | 同上 |
| 测试同层 | `*.test.ts` 只 import 被测层及更低层 | 同上 |

## 3. 模块清单（src/lib 一词一文件）

| 模块 | 职责 / 关键契约 |
|------|----------------|
| endpoints | 部署寻址单源：API_BASE / LOGIN_PATH（build 时 env 烘入） |
| api | REST 客户端：JWT 头（webhmi_token 镜像）+ 非 2xx 抛 ApiError + 401 全局回调（main.ts 接线登出） |
| auth | 登录形状 `{user_id,pass}` → token/user（镜像 `webhmi_token`/`webhmi_user`，权威凭证是 HttpOnly cookie） |
| screens | 画面 doc wrap/unwrap（meta 同体存储）+ screens CRUD 薄封装 |
| screen-list / screen-create | 并发上限分批取列表（cap=4）/ 探测式创建（ok/exists/failed） |
| screen-group | 画面 meta/组操作：组 = doc.group 字段投影（无实体），重命名/解散 = 批量 GET→合并→PUT；'' 删字段语义 |
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

### 4.2 画面资产独立层（2026-10-29 结清）

原「lib↔symbols 画面资产豁免」（9 个文件登记为技术债）已**结清**：画面资产迁至独立层 `src/screen-assets/`，`src/lib/**` 不再有任何模块依赖 symbols。

- 迁入：`demo-screen` / `home-screens` / `home-tab-screens` / `home-faceplate-screen`（+ 4 伴生测试 + 4 快照）
- `symbol-lint.ts` 及其测试同期迁至 symbols 层——lint 与被测对象（图元注册表）同层，反向豁免自然消失
- 新层规则（check-layers `ALLOWED.assets`）：`src/screen-assets/**` 可 import `lib` + `symbols`，禁止 import views / components / dev
- `LIB_SYMBOLS_ALLOWLIST` 随之清空（保留定义仅作后人勿加豁免的提示）

**保留的唯一反向白名单**：`symbols → lib/bi-contract.ts`（单点文件级）。理由：BI 契约层是宿主聚合收集器与图表图元共享的**载荷形状单点事实源**，两侧各写一份必然漂移；该文件是纯类型 + 纯函数（零网络 / 零 maotu 依赖），放行不破坏分层精神——symbols 依赖的是契约定义，不是业务实现。

新增规则（延续）：今后**新增** lib 模块禁止 import symbols；新画面资产一律放 `src/screen-assets/`。

### 4.3 window 全局面（收口清单）

| 全局 | 归属 | 约束 |
|------|------|------|
| `$rsiot` | bridge.ts 独占安装/卸载 | 其他模块禁止直接挂 window；图元 custom_code 只写一行调用 |
| `$mtEventCallBack` 等 maotu 实例名 | maotu 包 | 只消费不定义 |
| `__navCount` | ViewView（E2E 钩子） | 必须注释用途；测试专用，不进业务逻辑 |

### 4.4 状态与数据流归属

- 画面真相：rs-iot（PUT 全量 upsert；编辑器 onSaveClick 是唯一保存入口）。
- 会话态：HttpOnly cookie（权威，login 下发）+ localStorage 镜像 `webhmi_token`/`webhmi_user`/`webhmi_theme`（与 rs-iot 控制台共享），无 Pinia/全局 store——够用即不引入。
- 实时数据：SSE 桥单向上行（collectBinds 订阅面 → onPoint → setDevicePointByID），画面组件不直接 fetch。
- 命令：全部经 bridge（确认 → resolveInstance → POST → Tracker），组件不直发。

## 5. 架构决策登记簿

重大变更在此追加一行（日期 + 决策 + 依据），并同步本文与 check-layers：

- 2026-10-25 六决策锁定（D1 单 SPA … D6 编辑态命令显式确认）——docs/plans/2026-10-25-hmi-studio-design.md
- 2026-10-26 W11 设备参数化：`@dev.` 前缀重映射发生在 ViewView 数据层，maotu/rs-iot 协议无感知
- 2026-10-27 分层规范成文 + check-layers 机械化（本文）
- 2026-10-28 统一会话：login 下发 HttpOnly cookie（gateway 透传 + 认 cookie），两 SPA 共享 `webhmi_*` 键一次登录互通；SSE 弃 ?token= query 改同源 cookie；主题默认工业深色且键共享（webhmi_theme）
- 2026-10-28 组管理落地：组保持无实体（doc.group 字段投影）——新建/编辑对话框下拉可选已有组或输入新建（allow-create），卡片编辑信息改名称/组，组头重命名（同名合并）/解散（画面归未分组不删除）
- 2026-10-29 画面资产独立成层 `src/screen-assets/`（architecture §4.2 结清）：lib→symbols 豁免清空；`symbol-lint` 迁 symbols（与被测对象同层）；新增唯一反向白名单 `symbols → lib/bi-contract.ts`（BI 载荷形状单点事实源，纯类型+纯函数）
- 2026-10-29 BI 双通道定案：**通道 A** SSE bind 直写（实时，传统 HMI 屏）+ **通道 B** 宿主聚合（历史分析，BI 大屏）——BI 图元不自发请求，宿主（ViewView）扫画面 → 合并查询 → `/history/batch` → 结果按面板组装信封 → 写回 `props.data.val`（拉模式 30s）。累计量口径三态（instant/daily/cumulative）与分段累加算法见 docs/plans/2026-10-29-bi-monitoring-dashboard-design.md §1.4
