# hmi-studio

基于 maotu（闭源 npm 版，仅作依赖消费——**源码/反编译产物不得入库**，边界见 docs/LICENSE-NOTES.md）为 rs-iot 构建 HMI 组态系统：单 SPA，`/edit` 组态编辑（MtEdit）、`/view` 运行浏览（MtPreview + SSE 数据桥/命令桥/告警骨架）、画面真相存 rs-iot `/api/v1/screens`。

## 命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | dev server（主仓 5273 / worktree E2E 5290），`/api` 代理到 `RSIOT_BASE`（默认 127.0.0.1:8790） |
| `pnpm test` | vitest 单测（jsdom，纯逻辑契约层——TDD 主战场） |
| `pnpm e2e` | Playwright（webServer 自动起 5290，打真实 rs-iot，里程碑门禁） |
| `pnpm run typecheck` | vue-tsc --noEmit（每任务必跑） |
| `pnpm build` | 产物 dist/ → 交 gateway `hmi_dist` 挂 `/hmi`（T18） |
| `just fe-quality` | 全套门禁：typecheck + eslint + 分层检查 + 单测 + e2e + build |
| `pnpm -C mcp test` | hmi-mcp 单测（独立包；配套 `pnpm -C mcp run typecheck`、`pnpm -C mcp run build`） |

## 地图

- `src/lib/` 纯逻辑层（api/screens/binds/sse/command/alarms/nav…，同名 .test.ts 伴生）
  - **BI 契约层**：`bi-contract.ts`（载荷形状单点事实源）+ `bi-collector.ts`（宿主聚合收集器）+ `bi-sanitize.ts`（保存态复位）——见 docs/plans/2026-10-29-bi-monitoring-dashboard-design.md
  - `agent-context.ts`（AI 面板页面上下文）+ `sanitizeMarkdown.ts`（AI 输出 XSS 消毒）——P2
- `src/views/` 四业务页（Login/ScreenList/Edit/View）+ `src/components/` 骨架层组件
  - **`src/components/chat/`** AI 面板（P2 移植自 rs-iot 控制台，复制优先不抽包）：`agent.ts`
    store（serve SSE 裸 NDJSON 分发）+ AgentDrawer 族；入口 `AiDrawerHost` 挂 App.vue——
    **懒加载**（defineAsyncComponent 首点才拉 chunk）+ **降级**（GET /api/agent/status 非 2xx
    → 入口不出现；providers 503 → ⚙ 隐藏）。样式变量在 `chat-theme.css`（作用域
    .agent-drawer，与控制台 main.css 同值，改色需两仓同步）
- **`mcp/`** hmi-mcp 工具层（P1，独立 npm 包**不转 monorepo**，根 vitest/tsconfig 均不含它）：
  9 读工具（list/get/validate/describe/devices/points/history/alarms/screenshot）+
  7 写工具（create/put/put_protected/rename_group/rollback/delete/install_plugin——
  put 强制 if_version、validate error 前置、保护 slug 硬拒无 force、bi-sanitize 落库前复位），
  单源相对 import src/symbols+bi-contract+screen-assets/protected（校验器所见 = 编辑器所认）。
  运行配置全走环境变量：`HMI_BASE_URL`（默认 127.0.0.1:8790）/ `HMI_JWT`（sub=hmi-mcp）/
  `HMI_VIEW_ORIGIN`（截图 origin）。构建 = esbuild bundle（`pnpm -C mcp run build` → dist/index.js，
  **bundle 摊平模块层级**——import.meta.url 相对推导须双候选探测，见 writes.ts repoRoot）
- `src/screen-assets/` 画面资产层（预组态画面生成器：demo/home-*/bi-screen）
  - **`protected.ts`**：PROTECTED_SLUGS 长期资产 slug 单一权威源（11 项，**常量定义在此**——
    生成器 re-import，保持本文件零依赖可被 mcp 单源引用）；hmi-mcp 删除拒绝闸
    与 e2e 清扫守卫的唯一 import 面；新增画面生成器必须登记
- `src/symbols/` 手工重建图元（一图元一 ts，export ILeftAsideConfigItemPublic；权威 id 集合 = groups.ts SYMBOL_GROUP_DEFS，registry.ts 头注释为导览快照；约定 lint 见 symbols/symbol-lint；开发宪法 docs/maotu-symbol-development-guide.md）
  - **BI 图元族**（`ah-bi-*`，20 个，全量 id 清单以 `groups.ts` SYMBOL_GROUP_DEFS「BI 数据图表」组为准）走**通道 B**（宿主聚合写 props.data.val），底座 `bi-chart-kit.ts`；window/alarms 无 series（上行控制/告警信封，不吃历史查询）
  - **站点扩展面（P3，2026-10-31）**：`my-symbols.ts`（「我的符号」= reg-combin 模板库，
    拖入即展开；存 rs-iot `/api/v1/symbols`）+ `plugin-loader.ts`（`widgets/index.json` →
    动态 import → lintSymbol 门禁 → 「扩展图元（本站）」组 + app.component 续注）+
    `plugin-fallback.ts`（未知 tag → `ah-plugin-missing` 占位/未知 props 键剔除，编辑侧
    保存还原原项）。**语义与驱动手法实证见 docs/plans/2026-10-31-reg-combin-probe.md**（e2e 复用其 §4 备忘）
- `widgets-example/hello-card/` 插件 scaffold（入库，e2e fixture）；`widgets/` 运行时目录
  （gitignore，`scripts/install-plugin.mjs` 维护 = 人/AI 同款安装动作，manifest lint +
  裸 import 检查 + index.json 白名单）；prod 由 gateway `hmi_widgets_dir` 挂 `/hmi/widgets`，dev 由 vite 中间件挂 `/widgets`
- `src/lib/symbols-api.ts` 符号模板 REST 薄封装（P3a；rs-iot MetaKind 第三资源族）
- `src/screen-assets/` 画面资产层（预组态画面生成器：demo/home-*/bi-screen）
- `src/dev/` 研究资产（spike/probe/probe-combin），不进导航不进守卫
- `e2e/` Playwright：smoke / m1-m4 / lan / symbols / w7-w11 / alarm-drawer / screen-versioning（P0 版本面板/409/SSE 双事件，打真实 8790）/ home-meters / bi-dashboard（G 门 + 图元轮 + 用户反馈轮 + BI 通道 B 门）/ probe-bi（大 JSON 写入探针，打 /dev 页）/ ai-panel（mock /api/agent/*——面板开合/上下文注入/审批契约，不打真实 reasonix）/ probe-combin（reg-combin 探针取证）/ my-symbols（存为符号全流程，打真实 8790 symbols 端点）/ plugin-dir（插件装/卸占位/lint 拒三态，串行共享 widgets 目录），webServer 自动起 5290
- `scripts/check-layers.mjs` 分层依赖方向门禁（just layers）

## 文档

- **架构与分层规范（依赖方向规则）**：docs/architecture.md
- **工程规范（TS/Vue/测试/文档/提交）**：docs/standards.md
- 设计（六决策锁定）：docs/plans/2026-10-25-hmi-studio-design.md
- 实施方案 + 任务跟踪表：docs/plans/2026-10-25-hmi-studio-implementation-plan.md（§3 表格=任务状态真相源，完成任务即勾选回填 commit）
- **BI 大屏内容体系与图元清单（P2）**：docs/plans/2026-10-29-bi-monitoring-dashboard-design.md（内容分区/数据映射/累计量口径三态/23 图元全表）
- maotu 实证与概念映射：docs/maotu-rsiot-architecture.md

## 纪律

- TDD：src/lib 纯逻辑测试先行（红→绿→commit）；Vue 页面靠 typecheck + E2E 门
- 登录形状：`POST /api/v1/user/login`（dev）/ `/api/gw/login`（gateway，endpoints.ts 单源）；会话 = HttpOnly cookie（login 下发，SSE 靠它）+ localStorage 镜像 `webhmi_token`/`webhmi_user`（与 rs-iot 控制台共享，一次登录两 SPA 互通）
- rs-iot 寻址：`<devid>.<tag>` 是唯一 field 格式 = maotu bind_id = SSE 订阅键
