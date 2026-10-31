# hmi-studio

基于 maotu（闭源 npm 版，仅作依赖消费——**源码/反编译产物不得入库**，边界见 docs/LICENSE-NOTES.md）为 rs-iot 构建 HMI 组态系统：单 SPA，`/edit` 组态编辑（MtEdit）、`/view` 运行浏览（MtPreview + SSE 数据桥/命令桥/告警骨架）、画面真相存 rs-iot `/api/v1/screens`。

## 命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | dev server（主仓 5273 / worktree E2E 5290），`/api` 代理到 `RSIOT_BASE`（默认 127.0.0.1:8790） |
| `pnpm test` | vitest 单测（jsdom，纯逻辑契约层——TDD 主战场） |
| `pnpm e2e` | Playwright（webServer 自动起 5290，打真实 rs-iot，里程碑门禁） |
| `pnpm run typecheck` | vue-tsc --noEmit（每任务必跑） |
| `pnpm build` | 产物 dist/ → 交 gateway `hmi_dist` 挂 `/hmi`（T18）。**会清空 dist/**（含 version.json 与 .rollback/）：仅 dev 自测用，本地验证建议 `--outDir dist-next`；上线一律 `node scripts/deploy-dist.mjs [--e2e]`（门禁 + 原子换装 + 版本记录） |
| `just fe-quality` | 全套门禁：typecheck + eslint + 分层检查 + 单测 + e2e + build |
| `pnpm -C mcp test` | hmi-mcp 单测（独立包；配套 `pnpm -C mcp run typecheck`、`pnpm -C mcp run build`） |

## 地图

- `src/lib/` 纯逻辑层（api/screens/binds/sse/command/alarms/nav/agent-context/sanitizeMarkdown…，同名 .test.ts 伴生）
- `src/views/` 四业务页（Login/ScreenList/Edit/View）+ `src/components/` 骨架组件
- `src/components/chat/` AI 面板（入口 `AiDrawerHost` 挂 App.vue）：懒加载 defineAsyncComponent，`GET /api/agent/status` 非 2xx → 入口隐藏（appliance 档降级）；附件上传/工作区 @ 引用已对齐控制台（2026-10-31）；样式变量 `chat-theme.css` 与控制台 main.css 同值——**改色两仓同步**
- `src/symbols/` 图元 + `src/screen-assets/` 画面生成器 + `widgets/` 插件运行时（gitignore）+ `mcp/` hmi-mcp 工具层（独立 npm 包，根 tsconfig/vitest 不含它）——**图元·符号·插件·画面体系全部细节 → docs/widgets-plugins-guide.md**（分类总表 / 新图元工作流 / 组合与「我的符号」/ 插件全链路 / 保护清单 / 数据契约 / AI Agent 快速上手 / hmi-mcp 工具面）
- `src/dev/` 研究资产（spike/probe/probe-combin），不进导航不进守卫
- `e2e/` Playwright：smoke / m1-m4 / lan / symbols / w7-w11 / alarm-drawer / screen-versioning / home-meters / bi-dashboard / probe-bi / ai-panel / probe-combin / my-symbols / plugin-dir
- `scripts/check-layers.mjs` 分层依赖方向门禁（just layers）

## 文档

- 分层与依赖方向：docs/architecture.md；工程规范：docs/standards.md
- 设计（六决策锁定）：docs/plans/2026-10-25-hmi-studio-design.md
- 实施方案 + 任务跟踪表：docs/plans/2026-10-25-hmi-studio-implementation-plan.md（§3 表格 = 任务状态真相源，完成即勾选回填 commit）
- **图元与插件体系——分类与开发指南（AI Agents 开发图元入口，自包含）**：docs/widgets-plugins-guide.md
- maotu 图元开发宪法：docs/maotu-symbol-development-guide.md；maotu 实证映射：docs/maotu-rsiot-architecture.md
- BI 大屏内容体系：docs/plans/2026-10-29-bi-monitoring-dashboard-design.md
- AI 助手与扩展体系设计：docs/plans/2026-10-30-ai-assistant-and-extension-system-design.md

## 纪律

- TDD：src/lib 纯逻辑测试先行（红→绿→commit）；Vue 页面靠 typecheck + E2E 门
- 登录形状：`POST /api/v1/user/login`（dev）/ `/api/gw/login`（gateway，endpoints.ts 单源）；会话 = HttpOnly cookie（login 下发，SSE 靠它）+ localStorage 镜像 `webhmi_token`/`webhmi_user`（与 rs-iot 控制台共享，一次登录两 SPA 互通）
- rs-iot 寻址：`<devid>.<tag>` 是唯一 field 格式 = maotu bind_id = SSE 订阅键
