# HMI AI 助手与扩展体系总体设计（AI 面板 · hmi-mcp · 图元插件 · 画面版本管理）

> 建立时点 2026-10-30。本文是 **hmi-studio 引入 AI Coding Agent 能力的总体设计单一权威源**，
> 覆盖 2026-10-29~30 多轮讨论收敛的全部决策。rs-iot 侧后端详细设计独立成文：
> rs-iot `docs/designs/2026-10-30-screen-versioning-design.md`（本文 §3 只做概要与消费侧）。
>
> 实证基线（所有「现状」结论均有出处，勿凭印象改）：
> - hmi-studio 源码 2026-10-30 实读（src/symbols/、src/lib/、src/screen-assets/、
>   maotu dist 类型 `store/types.d.ts:14,27`、scripts/check-layers.mjs）
> - rs-iot gateway/agent 链路 2026-10-30 实读（crates/rsiot-gateway、crates/rsiot-mcp、
>   frontend/package.json、frontend/src/components/chat/）
> - 本机部署实况：warden 服务清单 + 端口表 + `~/.cache/ms-playwright/chromium-1248`
>   （含 reasonix **未部署**的关键事实，§4.4）
> - 画面体积实测：直连 8790 取 4 个真实画面（见 rs-iot 设计文档 §1.3）
>
> **2026-10-30 深度审查修订记录**（改动 + 依据）：
> 1. **插件加载器位置**：`src/lib/plugin-loader.ts` → `src/symbols/plugin-loader.ts`。
>    原方案会撞分层门禁——`check-layers.mjs:18` 的 `LIB_SYMBOLS_ALLOWLIST` 是**空集**
>    且注释明确禁止后加豁免，lib 层不得依赖 symbols
> 2. **保护 slug 清单无现成权威源**：`src/screen-assets/` **没有 index.ts**，12 个 slug
>    常量散在 5 个文件。修正为"P1 落地时新增 `src/screen-assets/protected.ts`"
>    （原文档声称"以导出为源派生，不手工维护"，是错误假设）
> 3. **删除闸语义修正**：保护 slug 从"升 CW"改为**硬拒绝**（CW 只是需审批，仍会删；
>    长期资产红线要求不可删）
> 4. **mcp 与分层脚本的关系写反了**：脚本只 walk `src/`（`check-layers.mjs:13`），
>    mcp 在 src 外不被扫描——原文档写"需增放行规则"是多余且错误的
> 5. **移植依赖清单补齐**（实测 rs-iot frontend/package.json）：本仓缺
>    `pinia`/`@incremark/vue`/`@incremark/theme`/`dompurify` 四项，原文档只说"复制优先"
>    未盘依赖
> 6. **vite proxy 顺序陷阱**（新增）：`'/api'` 通配在前的 proxy 会吃掉 `/api/agent`，
>    必须把更精确的规则写在前面
> 7. **reg-combin 载荷形状修正**：`combin_json?: IDoneJson`（**单数**，组合内嵌套走
>    `children?`），原文档写 `IDoneJson[]` 是错的；并据此修正 P3a 探针问题与
>    `symbol` MetaKind 的归属（属 P3a 的 rs-iot 小改，非"已含泛化"）
> 8. **变更感知复用既有连接**（`lib/alarms.ts` 硬编码 `?types=alarm` 需改 +
>    ScreenList 实时刷新明确降为可选项，而非含糊带过）
> 9. **截图工具前置条件**：需登录态注入 cookie（`/hmi/view/:id` 有路由守卫），
>    playwright/chromium 本机已核实可用
> 10. **mcp 单源引用的实现约束**（tsconfig 排除 `*.test.ts`、maotu 作 devDep 仅取类型）

---

## 0. 定位与决策台账

**做什么**：让 hmi-studio 获得 AI 时代的四层能力——AI 面板（人机协作入口）、hmi-mcp
（AI 工具层）、图元插件体系（客户自驱扩展）、画面版本管理（AI 写作的治理面）。四者合成
一个目标：**画面从「人工组态的产物」升级为「人与 AI 共同开发、可治理、可扩展的活文档」**。

**决策台账**（多轮讨论已拍板，实施时不再重议）：

| # | 决策 | 依据 |
|---|---|---|
| D1 | AI 工具层建独立 **hmi-mcp**（TS 包，本仓内），不扩 rsiot-mcp | 单源引用本仓 schema（registry/bi-contract）；发布节奏解耦；MCP 是 hmi-studio 带得走的接口边界 |
| D2 | 插件体系两级：**reg-combin 数据级**（激活）+ **插件目录代码级** | reg-combin 载荷 `combin_json: IDoneJson`（**单数**，maotu `store/types.d.ts:27`——注意不是数组）是纯配置数据，走 L1 零信任成本；代码级满足客户高频定制 |
| D3 | 画面**要**版本管理（下阶段）；图元插件**不做**版本管理 | 画面在 lux 无文件系统原语可依；插件是目录文件，文件系统即其历史机制，破坏性也不对称（插件坏=渲染降级，画面坏=数据丢失） |
| D4 | 信任边界 = **目录白名单**，第一版不上签名 | AI 持签名密钥的world里签名不设防（防的是不可信分发渠道，本威胁模型不存在）； revisit 触发条件=插件市场/跨站分发出现 |
| D5 | **数据不能加载代码**铁律：screens doc 永不引用插件路径；插件进入目录只能是显式安装动作 | 白名单边界的具体化 |
| D6 | 双部署模式并行（**站点属性**而非软件属性）：appliance 档（dist 外置甚至 embed）与 dev-server 档（源码+node 环境供 AI 做 L2 开发） | gateway 二进制两模式同一份；差异只在磁盘内容/授权面/部署门禁 |
| D7 | PUT 即生效，**不做**草稿/发布两态 | 演示场景实时性优先；审批闸 + 版本回滚兜底；出现「AI 改画面惊动值班员」实际痛点再议 |
| D8 | 源码级开发（L2）边界：**源码只改能力，画面只改内容** | 公共仓与客户定制的矛盾解法；客户差异性沉淀为 L1 数据留在现场 |

**不做**（范围排除）：插件签名与市场、插件版本存储、草稿/发布状态机、eventFlow 可视化
编排 UI、element-plus 进插件契约（v1）、跨源插件加载。

## 1. 现状事实基线

### 1.1 AI 面板管线（已建成，差运行时）

rs-iot 已实现完整四层（实读结论）：

```
浏览器 SPA ──/api/agent/*(JWT)──▶ rsiot-gateway(axum 反代 :18080)
                                    ├─ /api/rsiot/* → rs-iot :8790
                                    └─ /api/agent/* → reasonix serve :8787（SSE 裸 NDJSON）
                                              └─ spawn(stdio) → rsiot-mcp(25 工具) → rs-iot REST
```

- 前端：右侧抽屉 `AgentDrawer.vue`（919 行）+ 会话/审批/供应商管理子组件
  （rs-iot `frontend/src/components/chat/`），DOMPurify 消毒的流式 Markdown + 工具卡
- gateway：纯字节管道透传（`proxy.rs`），providers/attachments 本地实现，全部收在
  `/api/*` JWT 边界内（`auth.rs is_public`）
- 工具层：rsiot-mcp 25 工具，ReadOnly(14)/Write(7)/CriticalWrite(4) 三档 +
  RiskPolicy 硬闸 + serve 层审批（前端 PermissionModal）——**风险分级的范式现成**
- **关键事实：本机 reasonix 未部署**（warden `services.toml` 无该条目、8787 无服务、
  gateway.toml 无 `[reasonix]` 段）——控制台 AI 面板代码已就绪但运行时缺位，
  本设计 P1 的前置是**部署**而非开发
- hmi-studio 与控制台同源（gateway 挂 `/hmi/`）且共享 HttpOnly cookie 会话
  （`webhmi_token` 两 SPA 共享）→ **面板管线 hmi-studio 零后端改动即可复用**

### 1.2 hmi-studio 画面操作面

- 画面 = 纯 JSON 文档，存 rs-iot lux `screen:{id}` hash 单 field（`routes_meta.rs`），
  ≤128KiB，PUT 全量 upsert 即发布，**无历史无撤销**（P0 要解决的裸面）
- 图元 47 个 = 过程/操作 27 + BI 20（`src/symbols/registry.ts`），全编译期静态注册
- 数据通路：通道 A 实时 SSE（`lib/sse.ts`）+ 通道 B 历史聚合 30s 拍
  （`lib/bi-collector.ts` → `/api/v1/history/batch`）
- custom_code（eval 于 maotu 内核）+ 触发器 + 事件模板（`$rsiot.send`/`$mtEventCallBack`）

### 1.3 图元注册体系（插件设计的地基）

- maotu 注册类型六种：`'svg'|'vue'|'img'|'custom-svg'|'model'|'reg-combin'`
  （`node_modules/maotu/dist/src/components/mt-edit/store/types.d.ts:14`）；本仓用三种，
  **reg-combin（注册组合）从未使用**——其载荷 `combin_json?: IDoneJson`（**单数**，
  同文件 :27，是"一个组合体"而非数组）、`model_json?: IExportJson`（子装配件），
  二者均为纯配置
- **registerConfig 是运行时敞开的**：左面板 store 的 Map 变更方法，同名覆盖语义已在
  生产路径用于运行时刷新（nav-button 目标画面下拉，`src/symbols/index.ts:120-123`）；
  `app.component()` 同样可续注（`main.ts:28`）→ **插件加载不需要动 maotu 一行**
- props 九型契约 + 保存态平面值/导入归一化描述符（`types.ts` ⑤：未知键抛错——
  降级渲染要处理的点）
- 质量门禁：`symbol-lint.ts` 10 规则（纯函数）+ 陈列室 e2e——**只覆盖编译期 registry**，
  目录插件恰好绕过（§6.2 要补）

### 1.4 部署形态（外置已就绪）

- `/hmi/` 走 gateway 运行时 ServeDir（`static_assets.rs hmi_router`，`gateway.toml
  hmi_dist` 直指本仓 dist）——**build 即上线，零重启**；缓存策略已按反复重部署设计
  （assets 哈希名 immutable / index no-cache，2026-10-27 审查修）
- rust-embed 只用于控制台 SPA；「touch static_assets.rs 重编重启」铁律与 hmi-studio 无关

## 2. 总体架构

### 2.1 四级变更模型（每级对应一类作者与节奏）

| 级 | 变更对象 | 生效 | 作者 | 本设计对应 |
|---|---|---|---|---|
| L1 画面数据 | lux 里的 doc JSON | 秒 | 人（编辑器）/ AI（hmi-mcp） | P0 治理 + P1 写工具 |
| L1.5 站点扩展 | reg-combin（lux）+ 插件目录（文件） | 秒~分 | 组态员（数据级）/ AI（代码级） | P3 |
| L2 前端源码 | 本仓 src + 构建 | 分 | AI（dev-server 档特权） | P4 部署纪律 |
| L3 rs-iot 二进制 | gateway/rs-iot 构建 + warden 重启 | 重启级 | rs-iot 自身节奏 | 仅 P0 后端落在该仓 |

### 2.2 信任边界总图

```
低信任 ──────────────────────────────────────────▶ 高信任
lux 画面数据 ──(永不引用插件路径,D5)──▶ /hmi/widgets/ 白名单目录 ──(显式安装动作)──▶ 源码仓(L2)
   │ custom_code: 随画面 eval,词表限 $rsiot/$mtEventCallBack        │ agent 文件操作受 reasonix 审批模式管
   └ REST 写全部过 JWT + (hmi-mcp 写工具)审批闸                     └ 构建过部署门禁(P4)
```

数据不能加载代码（D5）是全图唯一硬不变量：lux 内容永远不能触发 import()；
`/hmi/widgets/index.json`（安装清单）只存在于管理员目录，AI/管理员写它的动作本身是
CriticalWrite 级操作。

### 2.3 工作流依赖

```
P0 版本管理(rs-iot) ──┬──▶ P1 hmi-mcp 写工具 ──▶ P2 AI 面板
P3a reg-combin 探针(独立,可先行)                      │
P3b 插件目录(依赖 P3a 结论定加载器细节)                ▼
P4 L2 部署纪律(独立,dev-server 档站点才需要)      跨域闭环:「建画面→查数→截图→修正」
reasonix 部署(P1 硬前置,用户侧动作)
```

P1 的读工具不依赖 P0（读无风险）；写工具依赖 P0（AI 写画面必须先有护栏）。

## 3. P0 画面版本管理（后端主体见 rs-iot 设计文档）

后端全部内容（键族/契约/捕获策略/指标/测试十一组）见 rs-iot
`docs/designs/2026-10-30-screen-versioning-design.md`，此处只定消费侧：

**hmi-studio 接入（小改，三处文件）**：
- `lib/screens.ts`：`get` 返回类型加 `version`；`put` 增加可选第三参
  `ifVersion`（拼 `?if_version=`）。**注意 `screensApi` 是纯薄封装**
  （`lib/screens.ts:45-53`），e2e fixtures 也用它——签名必须向后兼容（可选参）
- `views/EditView.vue` 保存链（`onSaveClick`，:160-179）：加载时把 `version` 存进
  ref → 保存时传入 → 409 处理：ElMessageBox 提示「画面已被他人/AI 修改」+ 重新加载
  （**保持现有三态保存锁 loadFailed/loaded 语义不变**，只加 version 这一维）
- 版本面板（EditView 侧栏，v1 极简）：列表（seq/ts/author/size）+ 预览单版 +
  一键回滚。author=`hmi-mcp` 的条目标 AI 徽标
- 变更感知：`ViewView` 复用**已有**的 alarm EventSource——`createAlarmStream`
  （`lib/alarms.ts:130-157`）的 `streamUrl()` 是硬编码 `?types=alarm`，改为
  `?types=alarm,screen` 并加一个 `addEventListener('screen')` + 新选项
  `onScreen?`（**不新开连接**：EventSource 有连接成本，且 `probeUnauthorized`
  失效探测逻辑现成复用）。收到本画面 put/rollback → 顶部横幅「画面已更新，点击刷新」
- **v1 不做 ScreenList 实时刷新**：列表页当前无任何 EventSource，为它单独开一条连接
  收益不抵成本（列表页有手动刷新与路由返回即重载）。登记为可选项，不在本期。
  —— 诚实标注：这是范围收缩，不是遗漏

**验收**：e2e 三用例——409 冲突路径（拦截 PUT 模拟他人先写）；AI 连改 3 次后列表 3 版
+ 回滚到第 1 版内容一致（走真实 rs-iot，LAN 档同款）；`types=alarm,screen` 单连接
双事件分发（现有 alarm-drawer.spec.ts 不得回归）。
**播种兼容回归**：全部现有 e2e 播种（11 个长期资产）在版本机制下仍幂等、不产生版本
条目——这是 rs-iot 判重设计的既有收益，在本仓 e2e 里加一条断言固化。

## 4. P1 hmi-mcp 工具层

### 4.1 包位置与结构（D1）

本仓新增顶层目录 `mcp/`（独立 package.json，**不转 monorepo**，app 构建零影响；
`pnpm install --dir mcp && node mcp/dist/index.js` 独立运行）：

```
mcp/
  package.json        # name: hmi-mcp, bin, deps: @modelcontextprotocol/sdk
  tsconfig.json       # include: src/** + 精确 include ../../src 的纯 TS 模块
  src/
    index.ts          # stdio server 入口（对齐 rsiot-mcp main.rs 形态）
    backend.ts        # REST 客户端：HMI_BASE_URL + HMI_JWT 环境变量注入 Bearer
    risk.ts           # ReadOnly / Write / CriticalWrite 三档（对齐 rsiot-mcp server.rs:234-268 范式）
    tools/
      screens.ts      # 画面 CRUD + validate + rollback
      widgets.ts      # 图元目录描述（单源引 registry）
      data.ts         # 设备/点表/历史/告警读
```

**单源引用**（D1 的核心价值，实施时验证）：`registry.ts` 的依赖链已核实**运行时零跨层
依赖**——`registry.ts` → 47 个图元定义（各自只 import `./types`）→ `kit.ts`（**零 import**）；
`types.ts`/`symbol-lint.ts` 对 maotu 只有 `import type`（编译期擦除）。故 mcp 直接相对
import 这三者即可，编辑器认什么 schema 工具就校验什么，永不漂移。

实现注意（本轮核实的具体约束）：
- **分层脚本不覆盖 mcp**：`scripts/check-layers.mjs` 只 `walk(join(ROOT,'src'))`
  （脚本第 13 行 `SRC`），`mcp/` 在 `src/` 外**不被扫描**——不需要加放行规则。但仍
  自愿遵守同向依赖（mcp → src 单向，src 永不 import mcp）
- mcp 的 `tsconfig.json` include 需**排除 `src/symbols/*.test.ts`**（那些文件 import
  vitest）与任何 `.vue`；`maotu` 作为 mcp 的 devDependency 仅取类型（npm 依赖消费，
  符合 LICENSE-NOTES 红线）
- 若 mcp 侧想省掉 maotu 依赖，可在 mcp 内用 `skipLibCheck` + 局部 `HmiSymbol` 结构
  声明——但**不推荐**（真正的单源就是拿真类型，二者不可兼得）

### 4.2 工具清单与风险分级

| 工具 | 档 | 行为要点 |
|---|---|---|
| `hmi_list_screens` / `hmi_get_screen` | R | get 带 version 与最新版本元数据 |
| `hmi_describe_widget_kit` | R | registry+groups 投影：每图元一行能力 + props 契约（喂给 LLM 的图元词典） |
| `hmi_validate_screen` | R | 纯计算：id/尺寸/JSON 语法（镜像 routes_meta 约束）→ 图元 tag 存在性（registry）→ binds `props.<name>.val` 路径合法性 → BI series 契约（bi-contract）→ custom_code 词表白名单扫描（`$rsiot`/`$mtEventCallBack`/`$getItemAttrByID` 之外标红） |
| `hmi_list_devices` / `hmi_list_points` | R | `/api/v1/devices`、`/api/v1/devreg`（选点绑定的词典） |
| `hmi_query_history` | R | `/api/v1/history/batch` 直通（≤32 条/批语义内置） |
| `hmi_list_alarms` | R | `/api/v1/alarms` |
| `hmi_screenshot` | R | 无头浏览器截 `/view/{id}`（**前置已核实**：本机 `node_modules/.bin/playwright` 与 `~/.cache/ms-playwright/chromium-1248` 均存在）。**必须带登录态**：`/hmi/view/:id` 是受守卫路由，截图前需注入 `webhmi_token` cookie 或先走登录页——实现走 `HMI_JWT` 直接设 cookie（免交互）。产出 PNG 存临时目录并回传路径+MIME（MCP 图像内容块） |
| `hmi_create_screen` / `hmi_put_screen` | W | 沿用「GET 探测（404 才建）」惯例 + 强制 if_version + 落库前调 validate 全绿 + bi-sanitize 语义（`props.data` 复位 `'[]'`） |
| `hmi_rename_group` | W | screen-group 批量合并语义复刻（cap 4 并发） |
| `hmi_rollback_screen` | CW | 回滚（改线上内容） |
| `hmi_delete_screen` | CW | 删除；**命中保护 slug 直接拒绝**（不可 force，报错提示走人工 UI） |
| `hmi_put_screen` 命中保护 slug | 升 CW | 保护清单内的画面允许改（e2e 播种即合法 PUT），但必审 |
| `hmi_install_plugin` | CW | §6.2 安装动作（代码入信任域） |

**保护 slug 清单的单一权威源**（本轮核实：`src/screen-assets/` 下**没有 index.ts**，
12 个 slug 常量散在 5 个文件——`demo-screen.ts:25-27` 的 DEMO_A/B/CATALOG、
`home-screens.ts:27-29` 的 HOME_E/W/G、`home-tab-screens.ts:26-28` 的 *_TABS、
`home-faceplate-screen.ts:20`、`bi-screen.ts:28` 的 BI_STATION）。mcp 侧硬编码清单必
漂移，故 P1 落地时**本仓新增** `src/screen-assets/protected.ts`：

```ts
// 长期资产画面 slug 单一权威源：新增画面生成器必须在此登记。
// 消费方：hmi-mcp 的删除拒绝闸 + e2e 清扫守卫。任何测试不得删除这些画面。
export const PROTECTED_SLUGS = [
  DEMO_A, DEMO_B, DEMO_CATALOG, HOME_E, HOME_W, HOME_G,
  HOME_E_TABS, HOME_W_TABS, HOME_G_TABS, HOME_E_FACEPLATE, BI_STATION,
] as const
```

mcp 直接 `import { PROTECTED_SLUGS }`（纯 TS、零依赖，符合 §4.1 单源原则）；新增一条
单测断言"每个 PROTECTED_SLUGS 项在 rs-iot 侧真实存在"（LAN/CI 档可跳过）。

### 4.3 认证与配置

- `HMI_BASE_URL`（默认 `http://127.0.0.1:8790`）+ `HMI_JWT`（预签发，sub=`hmi-mcp`，
  对齐 rsiot-mcp `RSIOT_JWT` 模式）——**凭据只走环境变量，公共仓零密钥**（仓内既有纪律）
- `HMI_VIEW_ORIGIN`（截图用，默认走 gateway `http://127.0.0.1:18080/hmi`）
- 日志：stderr 结构化 JSON（tool/tier/ok/ms）——reasonix 经 stdio 捕获，无独立日志面

### 4.4 reasonix 部署（P1 硬前置，用户侧 checklist）

代码零改动，环境侧三步（本机现状均缺，2026-10-30 核实）：

1. warden 加服务条目（services.toml）：reasonix serve，`REASONIX_HOME` 指向专用目录，
   监听 127.0.0.1:8787 → `POST /api/v1/config/reload`
2. `REASONIX_HOME/config.toml`：`[[providers]]`（OpenAI 兼容或 Anthropic 面，密钥进
   `.env` 不进 git）+ `[[plugins]]`：rsiot-mcp（已有形态）与 hmi-mcp **各一条**
   （spawn 命令分别指向两仓产物；工具目录 25+N 在同一会话共存，MCP 协议原生支持）
3. rs-iot `gateway.toml` 补 `[reasonix]` 段（home_dir/warden_url/service_name/
   workspace_dir——gateway `config.rs` 已定义这些键，缺省时 providers 端点 503）→
   warden 重启 rsiot-gateway

## 5. P2 AI 面板移植

### 5.1 移植策略：复制优先，不抽共享包

从 rs-iot `frontend/src/components/chat/` 整体复制 AgentDrawer 及子组件 + `stores/agent.ts`
+ 相关 types 到本仓 `src/components/chat/`。两 SPA 是不同仓不同发布节奏，为 ~1500 行
UI 提前抽公共 npm 包是过早抽象；复制后各自演化，真出现第三消费方再提取（决策台账级）。

**依赖增量（实测 rs-iot `frontend/package.json` vs 本仓，2026-10-30）**：

| 包 | 本仓现状 | 说明 |
|---|---|---|
| `pinia` | **缺** | `stores/agent.ts` 用 `defineStore`；本仓目前无状态库（纯 ref/模块态）。加 pinia 或改写为模块态 composable —— 建议**加 pinia**（改动最小、与控制台语义一致；pinia 3 约 15KB gzip） |
| `@incremark/vue` + `@incremark/theme` | **缺** | 流式增量 Markdown 渲染（`MessageItem.vue` 核心） |
| `dompurify` | **缺** | `lib/sanitizeMarkdown.ts` 的 XSS 消毒，**不可省**（面板渲染 AI 输出） |
| `element-plus` | 已有 ✓ | AgentDrawer/ProviderModal 用 `el-*` 组件（5+3 处），本仓现成 |

**不需移植**：控制台的 codemirror 全家（Lua 编辑器用）、`@codemirror/*`——面板本体无依赖。

适配点（全部小改）：
- 同源直连：EventSource `/api/agent/events`、fetch `/api/agent/*` 相对路径原样可用
  （hmi 挂在 gateway origin 下）；登录态共享（cookie + `webhmi_token`）零处理
- **懒加载**：面板整块走动态 `import()`（首屏 bundle 不背 chat 依赖，@incremark/DOMPurify
  不小）；顶栏按钮「AI 助手」首次点击才加载
- **上下文注入**（对标控制台 `lib/agentContext.ts`）：提交时附「[页面上下文] 当前路由
  /画面 slug / 编辑器选中图元 id / view|edit 模式」——AI 知道用户在看什么
- **降级**：面板按钮挂载前探 `GET /api/agent/status`，失败（reasonix 未部署/503）则隐藏
  按钮——appliance 档站点无 AI 也能用，不报错不弹窗
- **供应商/附件/工作区面板的降级**：`provider`/`attachments`/`workspace` 三组端点需要
  `gateway.toml [reasonix]` 段（`home_dir`/`workspace_dir`），未配置时 gateway 返 503
  （`attachments.rs:51-55` 已实现该语义）。面板要容忍：503 → 隐藏 ⚙/📎/@ 三个入口。
  workspace 引用对 hmi 场景甚至语义不合（@ 的是 reasonix 工作区文件，不是画面）——v1
  **可以整体裁掉 @ 与附件**，只留纯对话 + 工具卡 + 审批，实现更小
- dev 模式：`vite.config.ts` 现 `/api` → 8790 直连，**但 agent 面在 gateway :18080**。
  需加一条**更精确**的规则（vite proxy 按声明顺序匹配，`'/api'` 在前的通配会吃掉
  `/api/agent`）：把 `'/api/agent'` 与 `'/api/gw'` 写在 `'/api'` **之前**，均指向
  `http://127.0.0.1:18080`

### 5.2 面板工作流（P2 验收场景）

1. 「给 2# 泵加运行状态色绑定」→ AI：hmi_get_screen → hmi_list_points → 改 binds →
   hmi_validate_screen → hmi_put_screen（审批弹窗放行）→ 用户刷新即见
2. 「建一个空压机房 KPI 大屏」→ AI：选点 → 生成 doc（kpi/trend/table 组合）→ validate →
   create → hmi_screenshot 自检 → 「布局如下截图，需要调整吗」
3. 跨域（与 rsiot-mcp 同会话）：「画面配好了，看看 1# 电表昨天用电」→ hmi_query_history
   → 直接在对话里给结论

e2e：mock `/api/agent/submit|events`（playwright route 拦截 SSE 两帧：text + turn_done），
断言面板开合/消息渲染/上下文注入——不打真实 reasonix（测试面与 LLM 解耦）。

## 6. P3 图元插件体系

### 6.1 P3a：reg-combin 数据级（探针先行）

**探针（半天，/dev/probe 页 + 结论记 docs/）**：验证三件事——
(a) registerConfig 挂 `type:'reg-combin'` + `combin_json`（**单个 `IDoneJson`**，其
`children?` 字段是嵌套图元树——组合即"一个带子树的图元"，不是数组）后编辑器左面板出现、
拖入画布渲染子树；(b) maotu 是否自带「框选→存为组合」UI 入口（mt-edit 右键菜单探查）；
(c) 组合项的 props 归一化行为（子树内图元 props 是否可改、能否局部绑定）。

- 若 (b) 有内核入口 → 存储对接即可；若无 → 本仓补宿主动作：选中项 → 构造
  `combin_json`（复用 collectBinds 同款递归遍历取选中子树）→ 存 lux → registerConfig
- 存储：**rs-iot 需新增第三 MetaKind `symbol`**（键 `symbol:{id}`，复用 `MetaKind`
  结构与同一套 CRUD 校验；rs-iot 设计文档只做了 screens/themes 泛化，本项属 P3a 的
  rs-iot 侧小改——`routes_meta.rs` 加一个常量 + 四个 handler 转发，约 30 行）。
  纯数据，走既有 JWT/校验面，无新信任成本
- 编辑器启动：list symbols → registerConfig 进「我的符号」组（数据级定制面板，
  组态员不写代码的插件入口）
- 治理：随 P0 享有画面级备份（combin 存 lux，SAVE 覆盖）——无需独立版本机制（D3）

### 6.2 P3b：插件目录代码级

**工件契约 v1**（AI 作者面向，核心决策=宿主注入而非裸 import）：

```
widgets/<plugin-id>/
  manifest.json   # { id, name, version, entry }；id 强制 ^(?!ah-)[a-z][a-z0-9-]{0,63}$（`ah-` 前缀保留给上游内置图元，冲突=registerConfig 静默覆盖，命名空间约定是唯一防线）
  dist.js         # ESM，无裸 import（构建期检查），导出工厂：
                  #   export default function register(host) { host.registerSymbol(sym); host.registerComponent(name, comp) }
  src/            # 源码（AI 产出物留档=穷人版版本管理，D3 的落地形态）
```

`host` 注入面（v1）：`{ vue, echarts, registerSymbol(HmiSymbol), registerComponent(name, Component) }`。
**为什么工厂注入而非 importmap/裸依赖**：浏览器不解析裸 `import 'vue'`，importmap
需宿主暴露 runtime URL 且版本耦合脆弱；工厂注入显式契约、单一 vue 实例（reactivity
不断链）、可静态检查（构建期扫描 dist.js 无裸 import 即合规）。插件组件用 options API
对象 + host.vue 的 h/computed 书写——scaffold 模板给出范式，AI 照抄即可。

**分发链路**：

```
**安装（显式动作，CriticalWrite）**：`scripts/install-plugin.mjs`（人/AI shell 同款）
  → lint manifest（命名空间/entry 存在）→ 复制入目录 → 更新 index.json（白名单清单）
**服务**：gateway.toml 增可选 `hmi_widgets_dir` → ServeDir 挂 `/hmi/widgets/`（只读静态，
  全量 no-cache——插件非哈希名，靠版本查询参数 bust）
**加载**：`src/symbols/plugin-loader.ts`——**必须放 symbols 层，不能放 lib**：
  `scripts/check-layers.mjs` 的 `LIB_SYMBOLS_ALLOWLIST` 是**空集**（注释明确"防止后人
  误加豁免"），lib 层任何符号依赖都不被允许；而加载器要读 registry 类型 + 复用
  `lintSymbol`，属 symbols 层职责。分层规则 `symbols: ['symbols']`（symbols 源文件只
  依赖 symbols）恰好容纳它——`lintSymbol` 与 `HmiSymbol` 都在 symbols 层内。
  EditView/ViewView 挂载后 fetch index.json → 逐项 import(entry) → lintSymbol 门禁
  （不过 = 跳过 + 编辑器显式通知，不静默）→ registerConfig 进「扩展图元（本站）」组 +
  app.component 续注。**`app` 实例的来源**：现有 `registerSymbolComponents(app)` 由
  `main.ts:28` 以参数传入，插件续注需要同款持有——最简做法是 loader 导出
  `setPluginHost(app)`，main.ts 在 `registerSymbolComponents` 后调用一次；或把 app 存进
  symbols 层模块态（对齐 `nav-button.ts` 的 options 模块态先例）。二者择一，实现时定。
```

**降级渲染**（宿主适配，改 EditView/ViewView 装载路径）：doc 中图元 tag 不在注册表
（插件缺席）→ 灰色占位框 + tag 名标注，**不再整画面拒载**；props 未知键（现「抛错」
行为，types.ts ⑤）→ 回落默认值 + console warn。两处都把「插件级故障」隔离在单图元。
e2e：带未知 tag 的画面渲染出占位框而非空白。

**验收**：e2e 三用例——装一个样例插件（仓库附 example，兼当 scaffold）后编辑器可见
可拖可用；卸载（index.json 移除）后既有画面出占位框不崩；lint 不过的插件被拒且通知可见。

### 6.3 与 rs-iot 扩展哲学的对应（设计原则备忘）

reg-combin ≈ 组态/点表（数据级，现场活物）；插件目录 ≈ Lua/外置插件（代码级，现场活物）；
核心仓 ≈ rs-iot 二进制（冻结）。客户高频定制全部落在两个「活物」层，公共仓只进通用能力
（D8）。

## 7. P4 L2 源码开发模式部署纪律（dev-server 档站点启用）

**`scripts/deploy-dist.mjs` 单点收口**（AI 自律 runbook 的机械化——「工具不绿不给换 index」）：

1. 门禁：`git status --porcelain` 非空即拒（脏工作区不部署）→ typecheck → vitest →
   （`--e2e` 旗标时）playwright → build
2. 原子换装：vite 构建到 `dist-next/` → **assets 增量并入 dist/（不清空）** →
   `index.html` 与 `version.json` **最后落位**（近似原子：换装窗口内旧页面引用的旧
   hash 资产仍在，刷新前不坏）
3. `version.json`：`{ gitSha, builtAt }`（「线上跑的是什么」一句话可答；回滚 =
   旧 index 换回，`scripts/rollback-dist.mjs` 保留最近 N 份 index）
4. 清理：`scripts/prune-assets.mjs` 删当前 index 未引用的 hash 资产（防无限累积）

**边界（D8 机械执行）**：AI 的 L2 改动合法性 = 「新增能力」（可上游）vs「写死客户内容」
（应回落 L1）——deploy 门禁不判语义，语义边界靠评审 + 仓规；本脚本只保证**可部署态**
（干净/全绿/可回滚）。

## 8. 非功能设计

**可观测性**（随功能交付）：
- rs-iot：P0 四指标（版本创建/409 冲突/回滚/紧缩，见 rs-iot 设计文档 §5）
- hmi-mcp：stderr JSON 工具调用日志（reasonix 捕获）
- 前端：插件加载失败/图元降级 → ElNotification + console.error（用户可见，不静默）；
  deploy/rollback 脚本输出全量证据摘要
- reasonix 链路本身指标待其运行时部署后盘点（登记，不在本设计虚设）

**备份与站点工件集**（appliance 迁移/灾备的「一个站点=什么」）：
`lux 数据目录（画面+版本+combin，SAVE 覆盖）+ gateway.toml + hmi-studio dist +
widgets/ 目录 + REASONIX_HOME/config.toml（.env 密钥另行）`。**widgets/ 是纯文件，
lux SAVE 不覆盖它——备份纪律必须显式包含**（否则换机恢复=画面全在、插件全丢、满屏占位）。

**安全审查清单**：凭据只走环境变量（公共仓纪律）；custom_code 词表扫描进 validate 工具
（越词表标红，写审批时人可见）；插件构建期无裸 import 检查；screens doc 永不触发 import
（D5）；两层删除闸（`hmi_delete_screen` 本身 CW + 保护 slug 硬拒）。

## 9. 风险登记

| 风险 | 等级 | 对策 |
|---|---|---|
| reasonix 部署是外部依赖（P1 前置不可控） | 高（进度） | P0/P3a/P4 全部不依赖它，可先行；部署 checklist 已列（§4.4） |
| maotu reg-combin 行为未实证 | 中 | P3a 探针先行，结论落 docs/ 再定实现；探针失败则该子项降级重估 |
| 工厂注入契约对 AI 作者的心智成本 | 中 | scaffold 模板 + example 插件 + describe_widget_kit 词典喂给 LLM |
| 目录插件的 symbol-lint 无法覆盖运行时行为（lint 绿但渲染坏） | 中 | screenshot 工具闭环（AI 自检）+ 陈列室式 smoke（example 插件进 e2e） |
| 两 MCP 工具目录膨胀（25+N）token 开销 | 低 | describe 类工具按需调用；工具描述精简 |
| L2 部署爆炸半径（一次坏部署坏全站） | 低（有 git+回滚） | P4 门禁机械化 + index 最后落位 + N 份回滚保留 |
| 并发写（裸写者不挂 if_version） | 低 | 409 计数器暴露剩余裸写者；主要写者（编辑器/hmi-mcp）P0 后即接入 |

## 10. 实施顺序与验收判据

| 序 | 工作流 | 仓 | 验收 |
|---|---|---|---|
| 1 | P0 版本管理后端 | rs-iot | rs-iot 设计文档 §6 十一组测试全绿 + rest-api.md 更新 + LAN 实测回滚 |
| 2 | P0 消费侧（if_version/版本面板/screen 事件感知） | hmi-studio | §3 两 e2e + 单测 |
| 3 | reasonix 部署（用户配合） | 环境 | 控制台 AI 面板可用（既有功能首验） |
| 4 | P1 hmi-mcp 读工具族（validate/describe/query/screenshot 先行） | hmi-studio | mcp 单测 + 控制台 AI 抽屉实测「读画面+查历史+截图」 |
| 5 | P1 写工具族（挂 P0 之后）+ 保护 slug 闸 | hmi-studio | 审批弹窗全路径实测 + 保护 slug 删除被拒 |
| 6 | P2 面板移植 | hmi-studio | §5.2 三场景走通 + mock e2e |
| 7 | P3a reg-combin 探针 → 落地 | 两仓 | 探针结论文档 + 「存为符号」e2e |
| 8 | P3b 插件目录 | 两仓（gateway 一行配置） | §6.2 三 e2e + example 插件 |
| 9 | P4 deploy 脚本（按站点选做） | hmi-studio | 脏工作区拒部署/全绿换装/回滚三实测 |

每步独立可交付可回退；1-2 与 7 与 9 无 reasonix 依赖，遇部署阻塞不空等。
