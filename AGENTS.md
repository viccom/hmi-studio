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

## 地图

- `src/lib/` 纯逻辑层（api/screens/binds/sse/command/alarms/nav…，同名 .test.ts 伴生）
- `src/views/` 四业务页（Login/ScreenList/Edit/View）+ `src/components/` 骨架层组件
- `src/symbols/` 手工重建图元（一图元一 ts，export ILeftAsideConfigItemPublic；21 类目录见 registry.ts 头注释；约定 lint 见 lib/symbol-lint；开发宪法 docs/maotu-symbol-development-guide.md）
- `src/dev/` 研究资产（spike/probe），不进导航不进守卫
- `e2e/` Playwright：smoke / m1-m4 / lan / symbols / w7 / w8（G 门 + 图元轮 + 用户反馈轮，webServer 自动起 5290）

## 文档

- 设计（六决策锁定）：docs/plans/2026-10-25-hmi-studio-design.md
- 实施方案 + 任务跟踪表：docs/plans/2026-10-25-hmi-studio-implementation-plan.md（§3 表格=任务状态真相源，完成任务即勾选回填 commit）
- maotu 实证与概念映射：docs/maotu-rsiot-architecture.md

## 纪律

- TDD：src/lib 纯逻辑测试先行（红→绿→commit）；Vue 页面靠 typecheck + E2E 门
- 登录形状：`POST /api/v1/user/login` `{user_id, pass}`；token 存 localStorage `hmi_token`
- rs-iot 寻址：`<devid>.<tag>` 是唯一 field 格式 = maotu bind_id = SSE 订阅键
