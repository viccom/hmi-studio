# P1 + P2 实施计划（第 2 轮：hmi-mcp 读工具族 + AI 面板移植）

> 建立时点 2026-10-30。授权源 = 用户「继续第 2 轮」指令；设计权威源 =
> `2026-10-30-ai-assistant-and-extension-system-design.md`（§4 P1 / §5 P2，§0 决策台账 D1~D8 不重议）。
> 本文档是任务状态真相源（standards §4.1）：完成即勾选 + commit 回填。

## 0. 范围

**做**：

- **A. 前置**：`src/screen-assets/protected.ts`（PROTECTED_SLUGS 单一权威源，设计 §4.2）+ 单测
- **B. P1 hmi-mcp 读工具族**（9 个，本仓新增顶层 `mcp/` 包，D1）：`hmi_list_screens` /
  `hmi_get_screen` / `hmi_describe_widget_kit` / `hmi_validate_screen` / `hmi_list_devices` /
  `hmi_list_points` / `hmi_query_history` / `hmi_list_alarms` / `hmi_screenshot`
- **C. P2 AI 面板移植**（设计 §5）：`src/components/chat/`（AgentDrawer 族 + agent store +
  types + 主题变量）+ 新依赖 pinia / @incremark/vue + @incremark/theme / dompurify +
  懒加载入口 + status 探测降级 + vite proxy 顺序 + mock e2e

**不做**（本轮明确排除）：写工具族（`hmi_create_screen`/`hmi_put_screen`/`hmi_rename_group`/
rollback/delete/install_plugin——第 3 轮，挂 P0 治理 + 审批闸）；reasonix 部署与真实对话联调
（用户侧动作，mock e2e 不受阻）；P3 插件体系。

## 1. 实施决策记录（设计未钉死处的取舍）

| # | 决策 | 依据 |
|---|---|---|
| K1 | **裁掉 WorkspacePicker + 📎 附件**（@ 引用与附件上传整体不移植） | 设计 §5.1「v1 可以整体裁掉 @ 与附件，只留纯对话 + 工具卡 + 审批」；workspace 语义（reasonix 工作区文件）对 hmi 场景不合 |
| K2 | **ProviderModal（⚙）保留**，入口按 providers 端点探测结果显隐（非 2xx → 隐藏 ⚙） | 设计 §5.1「503 → 隐藏 ⚙/📎/@」；📎/@ 已裁，仅 ⚙ 需降级 |
| K3 | **PlanCard.vue 不移植** | 源仓自身注释承认「当前不在 MessageItem 中渲染」——移植即死代码；serve 出现 plan 事件再补 |
| K4 | **入口 = App.vue 全局悬浮按钮**（固定右下，非逐视图顶栏），登录页不显示 | 「顶栏按钮」在 ViewView（全屏画布无顶栏）无处安放；单点挂载少改三视图 |
| K5 | agent store 落位 `src/components/chat/agent.ts`（components 层），types 同目录 `types.ts` | 设计 §5.1「复制到本仓 src/components/chat/」；分层：components → lib 合法 |
| K6 | 上下文注入：`src/lib/agent-context.ts` 纯函数 + 从 `window.location` 解析 route/mode/slug；**选中图元 id 暂缺**（maotu 编辑器选中态无低成本读取口，登记后续） | 设计 §5.1 上下文注入四项中前三项零依赖可得；第四项需侵入 maotu store，v1 裁 |
| K7 | 截图 = playwright-core + 本机既有 chromium（`~/.cache/ms-playwright/chromium-*` 解析 executablePath，不触发浏览器下载）；登录态 = cookie `token` + localStorage `webhmi_token/webhmi_user` 双注入 | 守卫读 localStorage（lib/api.ts tokenStore）、SSE/API 靠 cookie（endpoints.ts 注释）；国内网络不重下浏览器 |
| K8 | mcp 依赖面：`@modelcontextprotocol/sdk` + `zod`（运行时）；`typescript`/`vitest`/`playwright-core`/`@types/node`/`maotu@0.6.5`（dev，仅类型） | 设计 §4.1；maotu 只取类型符合 LICENSE-NOTES |
| K9 | 根 vitest/tsconfig **不含 mcp/**（include 均为 src/e2e 限定，天然隔离）；root eslint 补 `mcp/dist/**` ignore；mcp 自带 `pnpm -C mcp test` + `tsc --noEmit` | 包独立（设计 §4.1「不转 monorepo」） |
| K10 | 面板样式：控制台 main.css 中 chat 族实际消费的 CSS 变量（28 个，grep 实测清单）以 `chat-theme.css` 移植（:root + html.dark 两块），挂抽屉根类作用域；未定义的 `--color-ink-primary`/`--color-ink-tertiary` 补映射 | hmi-studio 只有 element-plus 变量桥，无控制台变量盘；html.dark 机制两仓一致（lib/theme.ts） |
| K11 | 提交分笔：① protected.ts ② lib 两模块（sanitizeMarkdown/agent-context）③ mcp 包 ④ chat 移植（含依赖）⑤ 入口+proxy+e2e+文档 | 每笔可独立 typecheck 通过 |

## 2. 任务表

| ID | 内容 | 依赖 | 验证命令 | 状态 |
|---|---|---|---|---|
| T1 | `src/screen-assets/protected.ts`：PROTECTED_SLUGS 11 项（re-export 各源常量聚合）+ `protected.test.ts`（条数/无重复/与源常量恒等） | — | `pnpm vitest run src/screen-assets/protected.test.ts` | ✅ |
| T2 | `src/lib/sanitizeMarkdown.ts` 移植 + 单测（script/iframe/srcdoc/style 剥除、正文保留） | — | `pnpm vitest run src/lib/sanitizeMarkdown.test.ts` | ✅ |
| T3 | `src/lib/agent-context.ts`：location 解析（view|edit/slug）+ buildAgentContextBlock + 单测 | — | `pnpm vitest run src/lib/agent-context.test.ts` | ✅ |
| T4 | `mcp/` 包骨架：package.json/tsconfig/src/{index,backend,risk}.ts + vitest；backend = Bearer REST 客户端（HMI_BASE_URL/HMI_JWT）+ stderr JSON 日志；risk = R/W/CW 三档 | T8 依赖面 | `pnpm -C mcp test` | ✅ |
| T5 | `mcp/src/tools/screens.ts`：list/get（带 version+版本元数据）+ validate 纯校验器（id 词法 ≤64、doc ≤128KiB、JSON 语法——镜像 routes_meta.rs:282-297；tag/bind/词表/BI 契约→warnings） | T4 | `pnpm -C mcp test` | ✅ |
| T6 | `mcp/src/tools/widgets.ts`：describe（registry+groups 投影，单源相对 import，排除 *.test.ts） | T4 | `pnpm -C mcp test`（投影断言 ≥47 类、BI 20） | ✅ |
| T7 | `mcp/src/tools/data.ts`（devices/points/history≤32/alarms）+ `screenshot.ts`（playwright-core 截 /view/{id}，登录态双注入） | T4 | `pnpm -C mcp test`（data 形状/参数；screenshot 仅路径解析单测） | ✅ |
| T8 | 依赖安装：root `pnpm add pinia @incremark/vue @incremark/theme dompurify`；`pnpm --dir mcp install` | — | `pnpm exec vue-tsc --noEmit`（pinia 类型就位） | ✅ |
| T9 | chat 移植：types.ts / agent.ts（api 换 hmi 侧 fetch+Bearer；裁 monitor/workspace/附件；providers 探测显隐）/ AgentDrawer（裁 📎/@ 行）/ MessageItem / ToolCallCard / PermissionModal / AskModal / ProviderModal / useChatScroll / chat-theme.css + `agent.test.ts`（SSE 聚合/历史映射/approve 失败不清弹窗/上下文注入/effort 映射） | T2 T3 T8 | `pnpm vitest run src/components/chat/agent.test.ts` + `pnpm run typecheck` | ✅ |
| T10 | 入口与降级：`AiDrawerHost.vue`（status 探测 → 失败隐藏按钮；点击动态 import 抽屉）+ App.vue 挂载 + main.ts `use(createPinia())` + vite proxy `'/api/agent'`+`'/api/gw'` 前置于 `'/api'` | T9 | `pnpm run typecheck` + `pnpm exec eslint .` + `node scripts/check-layers.mjs` | ✅ |
| T11 | mock e2e `e2e/ai-panel.spec.ts`：status 失败→按钮隐藏；开面板+提交→submit body 含 [页面上下文]；SSE 帧→消息+工具卡渲染；approval_request→审批弹窗 + POST /approve body {id,allow} | T10 | `pnpm exec playwright test e2e/ai-panel.spec.ts` | ✅ |
| T12 | 文档：AGENTS.md 地图（mcp/ + chat/ + e2e 清单 + mcp 门禁行）；本计划勾选回填 | 全部 | `git status` 干净 + 人工核对 | ✅ |
| T13 | 收尾门禁全套 + 分笔提交（K11） | 全部 | `just fe-quality` + `pnpm -C mcp test` + `pnpm -C mcp exec tsc --noEmit` | ✅ |

## 3. 验证口径（显式声明）

- **TDD 适用面**：protected/sanitizeMarkdown/agent-context/agent store/mcp 全部逻辑先红后绿；
  .vue 视图层靠 typecheck + eslint + mock e2e（仓内既有分工，AGENTS.md 纪律条目）。
- **mcp 单测边界**：backend/tools 全部走注入 fetch 的 mock；screenshot 不做真浏览器单测
  （只测 executablePath 解析与 cookie/localStorage 注入脚本的构造）；真链路（真实 JWT 截图、
  reasonix 会话实测）待 dev 栈接 reasonix + 用户签发 `sub=hmi-mcp` JWT 后验收——**登记为本轮未覆盖项**。
- **已知 flaky（任务书 §4 同款，不改断言）**：e2e 段 2 el-select 时序偶发。

## 4. 风险与偏差登记（收尾回填）

- 截图对 SSE 长连接：`waitUntil networkidle` 永不满足（EventSource 常开）→ 用 domcontentloaded + canvas 等待 + 固定延时（已实现）。
- vite proxy 顺序陷阱：`'/api/agent'`/`'/api/gw'` 必须写在 `'/api'` 之前（设计修订记录 #6；已按此序实现）。
- K4/K6 为对设计正文的**偏差**（顶栏按钮→全局悬浮；选中图元 id 缺席），已在 §1 记录依据。
- **安全发现（移植实证，两仓同款待加固）**：DOMPurify 是文本级消毒——markdown 链接语法
  `[x](javascript:…)` 的 scheme 不在覆盖面，@incremark/vue 渲染 `href=node.url` 无白名单
  （node_modules 实读）。控制台同管线同样存在。加固方向（两仓后续）：MessageItem 层对
  渲染后 a[href] 做 scheme 白名单（http/https/mailto）。
- mcp tsconfig 采用 `moduleResolution: bundler` + esbuild bundle（`--packages=external`）：
  NodeNext 的显式扩展名要求与单源引用（extensionless）不可调和，emit 又不重写 import——
  bundle 是唯一同时保住 D1 单源与 node 运行时的路径（bin = dist/index.js）。
- zod 数组 `.max` 的内部检查字段名跨版本不稳——测试用 `safeParse` 行为级断言，不探内部属性。

## 5. 验证记录（真实输出摘要，2026-10-30）

| 门 | 命令 | 结果 |
|---|---|---|
| mcp 单测 | `pnpm -C mcp test` | **38 passed (38)** |
| mcp 类型 | `pnpm -C mcp exec tsc -p tsconfig.json` | 0 error |
| mcp 构建+握手 | `pnpm -C mcp run build` + stdio initialize/tools-list 冒烟 | dist/index.js 113.7kb；`TOOLS: hmi_list_screens, … hmi_screenshot` 9 个 |
| mcp 真链路 | tools/call（dev 8790 + admin JWT） | `SCREENS: 11`；`WIDGETS: 47 groups: 6` |
| src 单测 | `pnpm test` | **667 passed (45 files)** |
| 类型 | `pnpm run typecheck` | 0 error |
| eslint | `pnpm exec eslint .` | 0 errors（1 pre-existing warning：probe-bi disable，任务书 §4 原样） |
| 分层 | `node scripts/check-layers.mjs` | 通过 |
| e2e | `pnpm e2e` | **70 passed (57.1s)**（66 既有 + ai-panel 4 新增，零回归） |
| 构建 | `pnpm build` | ✓ 1.89s；**懒加载实证**：dompurify/incremark 仅出现在 `AgentDrawer-*.js` 懒 chunk，主 chunk 0 命中 |

## 6. 状态块

> **状态**：implemented（2026-10-30）
> **实施**：第 2 轮 P1 hmi-mcp 读工具族（9 工具）+ P2 AI 面板移植（mock e2e），§2 任务表 T1~T13 全 ✅
> **代码**：mcp/（新包：backend/risk/registrar + tools/{screens,widgets,data,screenshot} + index）、
> src/components/chat/（新：types/agent-api/agent store + AgentDrawer 族 + chat-theme.css +
> AiDrawerHost）、src/lib/{sanitizeMarkdown,agent-context}.ts、src/screen-assets/protected.ts、
> App.vue、main.ts（pinia）、vite.config.ts（proxy 前置）、eslint.config.js（mcp/dist ignore）、
> e2e/ai-panel.spec.ts、AGENTS.md
> **测试**：mcp vitest 38 例 + src 侧新增 41 例（4+5+8+24）+ e2e ai-panel 4 例（mock，全量 70 绿）
> **遗留**：① 选中图元 id 上下文注入（K6，待 maotu 选中态低成本的读取口）；② 真实 reasonix 链路
> 联调（dev 栈接 reasonix + 签发 sub=hmi-mcp JWT 后验收「读画面+查历史+截图」三件套）；
> ③ javascript: 链接向量两仓加固（§4）；④ 写工具族 + 审批闸 + 保护 slug 硬拒（第 3 轮）
