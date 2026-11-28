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

- `src/lib/` 纯逻辑层（api/screens/binds/sse/command/alarms/nav/synthetic/agent-context/sanitizeMarkdown…，同名 .test.ts 伴生；synthetic = 告警→`__prio/__alarms/__area/__sys` 合成点位）
- `src/views/` 四业务页（Login/ScreenList/Edit/View）+ `src/components/` 骨架组件
- `src/components/chat/` AI 面板（入口 `AiDrawerHost` 挂 App.vue）：懒加载 defineAsyncComponent，`GET /api/agent/status` 非 2xx → 入口隐藏（appliance 档降级）；附件上传/工作区 @ 引用已对齐控制台（2026-10-31）；样式变量 `chat-theme.css` 与控制台 main.css 同值——**改色两仓同步**
- `src/symbols/` 图元 + `src/screen-assets/` 画面生成器 + `widgets/` 插件运行时（gitignore）+ `mcp/` hmi-mcp 工具层（独立 npm 包，根 tsconfig/vitest 不含它）——**图元·符号·插件·画面体系全部细节 → docs/widgets-plugins-guide.md**（分类总表 / 新图元工作流 / **2D 没有「物料库」的术语澄清与 2D↔3D 对照** / **硬约束速查（必须·禁止·后果·谁在卡）** / **已知限制 12 条** / 组合与「我的符号」/ 插件全链路 / 保护清单 / 数据契约 / AI Agent 快速上手 / hmi-mcp 工具面）。工业 SCADA 画面集在 `src/screen-assets/iot-screens.ts` + `iot-catalog.ts` + `iot-bi-screen.ts`（`iot-*` 16 张 = L1 总览/L2×4 单元/L3×10 设备面板 + `iot-bi-station` 历史分析大屏；图元分组「工业功能件」9 件；规范 docs/hmi-style-guide.md，点表/限值目录即 iot-catalog.ts）
- `src/modules3d/` **3D 组态模块（可整体剔除的独立模块）**：3D 列表页 `/screens3d`、组态编辑器 `/edit3d/:id`、运行页 `/view3d/:id`；含上游 Meteor3DEditor 内核拷贝 `vendor/meteor3d/`（**锁定副本**，差异全登记在 `vendor/meteor3d/PATCHES.md`，升级流程见该文件）与 `adapter/` 适配层（存储/绑定/事件/设备反查/工业图元/厂区场景生成器）。**删掉整个目录 2D 功能不受影响**（`pnpm modules:verify:full` 为证：真删副本后 typecheck + build 仍过）；`scripts/check-layers.mjs` 的 module3d 层规则保证它只向下依赖 `lib/components/symbols/assets`
- `src/dev/` 研究资产（spike/probe/probe-combin），不进导航不进守卫
- `e2e/` Playwright：smoke / m1-m4 / lan / symbols / w7-w11 / alarm-drawer / screen-versioning / home-meters / bi-dashboard / probe-bi / ai-panel / probe-combin / my-symbols / plugin-dir / iot-screens（工业画面集，真实点位）
- `scripts/check-layers.mjs` 分层依赖方向门禁（just layers）

## 文档

- 分层与依赖方向：docs/architecture.md；工程规范：docs/standards.md
- 设计（六决策锁定）：docs/plans/2026-10-25-hmi-studio-design.md
- 实施方案 + 任务跟踪表：docs/plans/2026-10-25-hmi-studio-implementation-plan.md（§3 表格 = 任务状态真相源，完成即勾选回填 commit）
- **图元与插件体系——分类与开发指南（AI Agents 开发图元入口，自包含）**：docs/widgets-plugins-guide.md
- **工业 HMI 组态规范（HP-HMI/ISA-101 落地）**：docs/hmi-style-guide.md；工业画面集计划：docs/plans/2026-11-24-iot-scada-screens-plan.md
- **3D HMI 空间层设计（独立于 2D：独立场景文档/路由/单一 WebGL 上下文）**：docs/plans/2026-11-26-3d-hmi-design.md
- **3D 物料与图元开发规范（AI Agents 开发 3D 图元/物料的入口，自包含）**：docs/3d-parts-and-assets-guide.md
  （图元 spec 契约 / 5 种几何参数白名单 / 物料库 7 分区矩阵 / 资产物料接入 / 命名与身份 / 已知限制 11 条）
- **3D 组态编辑器实施方案**（Meteor3DEditor 内核，2D/3D 两条平行功能线）：docs/plans/2026-11-26-3d-editor-meteor-implementation-plan.md；系统级审查：docs/plans/2026-11-26-3d-editor-plan-review.md（15 层对照矩阵，修订结论见方案 §13）
- maotu 图元开发宪法：docs/maotu-symbol-development-guide.md；maotu 实证映射：docs/maotu-rsiot-architecture.md
- BI 大屏内容体系：docs/plans/2026-10-29-bi-monitoring-dashboard-design.md
- AI 助手与扩展体系设计：docs/plans/2026-10-30-ai-assistant-and-extension-system-design.md

## 纪律

- TDD：src/lib 纯逻辑测试先行（红→绿→commit）；Vue 页面靠 typecheck + E2E 门
- 登录形状：`POST /api/v1/user/login`（dev）/ `/api/gw/login`（gateway，endpoints.ts 单源）；会话 = HttpOnly cookie（login 下发，SSE 靠它）+ localStorage 镜像 `webhmi_token`/`webhmi_user`（与 rs-iot 控制台共享，一次登录两 SPA 互通）
- rs-iot 寻址：`<devid>.<tag>` 是唯一 field 格式 = maotu bind_id = SSE 订阅键
