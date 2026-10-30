# P0 消费侧 + P4 部署脚本实施计划（第 1 轮）

> **状态**：implemented（B1~B6 + C1~C4 全部完成——fe-quality 全绿、C4 四实测全过）
> **日期**：2026-10-30
> **实施**：2026-10-30 d24cc12（消费侧）/2610329（部署脚本）/e2e 加固——两轮全量 e2e 66/66、fe-quality 全绿
> **代码**：`src/lib/screens.ts`、`src/views/EditView.vue`、`src/lib/alarms.ts`、`src/views/ViewView.vue`、`src/components/VersionPanel.vue`（新增）、`e2e/screen-versioning.spec.ts`（新增）、`scripts/{deploy,rollback,prune}-dist.mjs`（新增）
> **测试**：`e2e/screen-versioning.spec.ts` 三组用例 + `src/lib/screens.test.ts`/`alarms.test.ts` 增量；基线 620 vitest + 60 e2e 不回归
> **遗留**：无（ScreenList 实时刷新为设计明确排除的可选项非遗漏；e2e 播种产生的版本条目由判重+TTL 消化——任务书 §6 既定口径）

上游：总体设计 `docs/plans/2026-10-30-ai-assistant-and-extension-system-design.md` §3（P0 消费侧）+ §7（P4）；
后端权威源 rs-iot `docs/designs/2026-10-30-screen-versioning-design.md`；任务书
`docs/plans/2026-10-30-p0-p4-kickoff-brief.md`（自包含，范围/门禁/运维约定以其为准）。

## 1. 开工基线（2026-10-30 实测，与任务书 §4 对比）

| 门禁 | 任务书 §4 基线 | 本轮开工实测 | 判定 |
|---|---|---|---|
| `just fe-quality`（typecheck+eslint+layers+vitest+e2e+build） | ✅ 全过 | 首跑 ❌ e2e 红（bi-dashboard 2 用例，根因 dev 8790 history 读挂死——运行态故障非代码，field 同二进制正常佐证）；**用户裁决重启 dev-rs-iot 后复跑 ✅ 全过**（60 e2e passed，`✅ fe-quality: 前端全部门禁通过`） | 漂移已收口（重启即愈，证实瞬态） |
| `vitest` 单跑 | ✅ 620 passed | ✅ 620 passed（随 fe-quality） | 一致 |
| `eslint .` | ✅ 0 errors（1 pre-existing warning：`e2e/probe-bi.spec.ts:22`） | ✅ 同款 1 warning | 一致 |
| 工作区状态 | 任务书 §4 仅记 README/AGENTS/.gitignore 整理 | 实测另有：`AGENTS.md`、两份 plan 文档、`src/symbols/registry.ts`（仅头注释）、`e2e/symbols.spec.ts`（仅注释）未提交——均为注释/文档性质，不涉 B/C 任务目标文件 | 基本一致（注释级漂移，无功能影响） |

**基线漂移详情（2026-10-30 19:44~20:05 实测，已按任务书 §7 停止，B/C 任务未动工）**：

1. **rs-iot 8790（dev）history 读路径挂死**（fe-quality e2e 红的直接根因）：
   `/api/v1/history/stats` 与 `/api/v1/history` 对**有数据 series + 有效窗口**的查询
   无限挂起（>120s / 10s 超时实测）；不存在 series 或非法窗秒回。写入面健康
   （sysstatus：engine ok、series 30、sent 持续涨、errors 0）。对照实验：field
   实例（18790，**同一二进制** 07:28 构建）读路径正常 → 排除代码缺陷，定位为
   dev 实例（16:10 起的进程）运行态故障。任务书基线实测（约 13:07 前，旧进程期）
   该套件为绿——故障发生在 16:10 重启后。
2. **rs-iot `just check` 两次瞬态红**（lux data_dir flock EAGAIN，log_e2e /
   events_e2e 各一次，单跑 ×3/×2 全绿、非本轮引入；机理排查：时钟粒度 20 万次
   零重复证伪、/tmp 为 ext2/3，仅 `--test-threads=4` 多 binary 并行档偶发）。
3. **rs-iot 工作区功能性未提交改动**（BUG#11：bind 级联/stats truncated/flush_gate
   观测，18 文件 +367 行）与 P0 后端目标文件重叠（`src/api/mod.rs`、`src/config.rs`、
   `src/api/routes_metrics/render.rs`、`docs/reference/rest-api.md`）——任务书 §4
   说「不涉你要改的 Rust/前端代码」与实测不符，§7 停止条件命中（分笔提交无法
   干净执行）。运行中的 dev/field 二进制（07:28 构建）即含这批未提交代码。

## 2. 任务表（状态真相源：☐ 未开始 / ⏳ 进行中 / ✅ 完成且验证过）

### B. P0 消费侧（依赖 rs-iot P0 后端三端点 + 判重语义）

| ID | 内容 | 依赖 | 验证命令 | 状态 |
|---|---|---|---|---|
| B1 | `lib/screens.ts`：`get` 返回类型加 `version`；`put` 增可选第三参 `ifVersion`（拼 `?if_version=`；签名向后兼容——e2e fixtures 同用此封装） | rs-iot A4/A5 | `pnpm test -- --run src/lib/screens.test.ts`（新增单测：ifVersion 拼参/缺省不拼）+ `pnpm run typecheck` | ☐✅ |
| B2 | `EditView.vue` 保存链：加载时存 `version` ref → 保存传 `ifVersion` → 409 用 `ElMessageBox` 提示「画面已被他人/AI 修改」并重新加载；三态保存锁（loadFailed/loaded）语义不变 | B1 | `pnpm e2e -- screen-versioning`（409 冲突路径用例） | ☐✅ |
| B3 | 版本面板（EditView 侧栏 v1 极简）：列表（seq/ts/author/size）+ 预览单版 + 一键回滚；author=`hmi-mcp` 标 AI 徽标 | B1 | `pnpm e2e -- screen-versioning`（3 版列表 + 回滚用例）+ `pnpm run typecheck` | ☐✅ |
| B4 | `lib/alarms.ts`：`streamUrl()` 改 `?types=alarm,screen` + `addEventListener('screen')` + 新选项 `onScreen?`（不新开连接；`parseScreenEvent` 纯函数同款健壮性） | — | `pnpm test -- --run src/lib/alarms.test.ts`（新增：URL 双 types、双事件分发、坏帧丢弃） | ☐✅ |
| B5 | `ViewView.vue`：alarm stream 挂 `onScreen`，收到本画面 put/rollback → 顶部横幅「画面已更新，点击刷新」 | B4 | `pnpm e2e -- alarm-drawer`（既有套件零回归）+ screen 横幅断言进 screen-versioning 用例 | ☐✅ |
| B6 | e2e 三组 + 播种幂等回归：①409 冲突（拦截 PUT 模拟他人先写）②连改 3 次 → 列表 3 版 + 回滚到第 1 版内容一致（走真实 rs-iot）③`types=alarm,screen` 单连接双事件分发；④播种幂等断言（长期资产播种前后 versions 为空/不变） | B1~B5, rs-iot 全量上线 | `pnpm e2e`（全量，既有 60 用例零回归） | ☐✅ |

### C. P4 部署脚本（独立，无 rs-iot 依赖）

| ID | 内容 | 依赖 | 验证命令 | 状态 |
|---|---|---|---|---|
| C1 | `scripts/deploy-dist.mjs`：门禁（`git status --porcelain` 非空即拒 → typecheck → vitest → `--e2e` 旗标选跑 → build）→ vite 构建到 `dist-next/` → assets 增量并入 `dist/`（不清空）→ `index.html`+`version.json`（gitSha/builtAt）最后落位 | — | 脏工作区拒部署 / 全绿换装 两实测（`node scripts/deploy-dist.mjs` 真跑，验证 dist/ 新旧资产共存与 version.json 内容） | ☐✅ |
| C2 | `scripts/rollback-dist.mjs`：保留最近 N 份 index（默认 5），`--to` 选目标版换回 | C1 | deploy 两次 → rollback 回第 1 份 → `curl` 验 index 内容回到旧版 | ☐✅ |
| C3 | `scripts/prune-assets.mjs`：删当前 index 未引用的 hash 资产（防无限累积；`--dry-run` 先列后删） | C1 | 造孤儿资产 → dry-run 列出 → 执行删除 → dist/assets 只剩被引用者 | ☐✅ |
| C4 | 三脚本收口实测（对齐总体设计 §7 验收：脏拒/全绿换装/回滚） | C1~C3 | `node scripts/deploy-dist.mjs` ×2 + `rollback` + `prune` 全链一遍，输出摘要留档本文件 | ☐⏳✅ |

## 3. 实施偏差记录（相对总体设计 §3/§7）

1. 设计 §3.6 说 auth 中间件「未注入请求扩展，需补提取」——实读 rs-iot `src/api/auth.rs:96-100`
   **已存在 `AuthedUser` Extension 注入**（复审 M2 已做）：P0 后端直接消费，无需改
   auth.rs。列此偏差以代码为准。
2. **prune 保留集修正（线上事故，2026-10-30 晚实测发现并当日修复）**：v1 只扫
   index.html 直接引用——懒加载 chunk（EditView/ViewView/LoginView，import() 不
  出现在 index.html）被全部误删 → /hmi/ 白屏。修复：deploy 换装时写
   `.rollback/build-<ts>-<sha>.files` 构建清单（一次构建的 chunk 集内部引用
   完备），prune 保留集 = 构建清单 ∪ index 引用 ∪ 旧制备份兜底；复验口径改为
   响应体检查（gateway SPA fallback 会把 assets 404 伪装成 200/HTML）。
   修复后全链实测：prune 零误删、20 资产响应体全部真实内容。
3. **deploy 构建入口修正（LAN 实测发现，当日修复）**：v1 裸调 `vite build` 绕过
   package.json 的 `VITE_API_BASE=/api/rsiot` 前缀 → 线上 chunk 落到 dev 形态，
   浏览器打 gateway 未代理的 `/api/v1/*` → 画面列表恒空。修复：deploy 改走
   `pnpm build`（env 单源，尾部参数透传 outDir）；复验口径加「chunk 内含
   api/rsiot」与「经 gateway /api/gw/login → /api/rsiot/api/v1/screens 取列表」。

## 4. 完成判据（任务书 §9 摘要）

- `just fe-quality` 全绿（§4 已知红保持原状；`e2e/probe-bi.spec.ts:22` warning 不顺手修）
- 三组新 e2e 全过且既有 60 e2e 零回归；播种幂等断言固化
- C4 三脚本实测通过；版本面板/409/横幅在 LAN 档真实 rs-iot 上可用

## 5. 实施后复审修复（2026-10-30）

对第 1 轮 P0/P4 代码做深度复审后的修复（不改 B/C 任务契约）：

### 5.1 P0 消费侧

| 发现 | 修复 | 验证 |
|---|---|---|
| L1 刷新横幅对参数化画面重置设备（`mountScreen(done,'')` 跳过 `?dev=` 并改写 URL） | reload 改 `mountScreen(done)`（深链路径读 `route.query.dev`）；失败保留横幅可重试 | `pnpm e2e` 全量 66 passed（含 w11 faceplate 三例） |
| L2 reload 无代际守卫（GET 在飞时跳转会挂错画面） | 捕获 target，await 后校验 `disposed \|\| currentSlug !== target` | 同上 |
| L3 版本面板无 slug 守卫（切画面时旧列表可对新画面回滚） | load/preview/rollback 全部捕获 slug 校验；loading 期间禁用行内按钮；确认框后二次校验 | `pnpm e2e`（版本面板三例） |
| L6-UI 面板把最新历史行标绿为 current（head 不在列表） | 移除 current 高亮与 CSS | typecheck/eslint |
| L7 delete 帧被忽略（画面被删无感知） | 横幅区分 `updated`/`deleted`；删除态点击回画面列表 | e2e 全量零回归 |
| L8 保存响应回写 version 无路由守卫 | save 捕获 reqSlug，迟到响应/错误不落到新画面 | 同上 |
| L9 新前端配旧 rs-iot 时 version 静默丢失 | `typeof r.version === 'number'` 才回写；面板对 404 提示"服务端未启用版本管理" | 同上 |
| L12 e2e 用 800ms 猜 SSE 就绪 | 改 `waitForResponse('/api/v1/events')` 就绪信号（goto 前挂等待） | 全量 e2e 66 passed（53.1s） |

### 5.2 P4 脚本

| 发现 | 修复 | 验证 |
|---|---|---|
| D1 无 env 烘焙机械门禁（列表全空事故可复发） | deploy 构建后断言 index.html 直接引用的 chunk 必须含 `api/rsiot` + `api/gw/login`，缺失即拒换装 | `node --check`；live dist 入口 chunk 两标记实测均=1 |
| D2 `dist-next/` 未 gitignore（失败构建致脏树门禁永久拒绝） | `.gitignore` 增 `dist-next/` | — |
| D3/D4 默认回滚目标就是"漏烘 env"坏版本；旧制备份懒加载 chunk 已失 | rollback 换装前预检：引用资产必须存在 + 入口 chunk 必须含 `api/rsiot`，失败拒绝（`--force` 放行）；`--list` 逐份标注 | `--list` 实测 3 份坏备份标 ⚠；无参回滚 exit=1 且 `dist/index.html` md5 不变 |
| D5 `.rollback` 不存在时 ENOENT | readdirSync try/catch → 友好"无备份" | `--list` 实测 |
| D6 deploy 门禁缺 lint/layers | 门禁补齐 `eslint .` + `check-layers.mjs`（对齐 `just fe-quality` 六道门） | 两道命令单独验证过；deploy 全链未实跑（需干净树，见 §6） |
| D7 assets 子目录会导致 cpSync EISDIR | 构建后显式检查 `dist-next/assets` 无子目录，有则 fail 并提示扩展脚本 | `node --check` |

## 6. 复审修复的验证口径（显式声明）

- 已实跑：`cargo test --test meta_versioning` 14/14（rs-iot）、`cargo test --lib` 673/673、`pnpm run typecheck`、`eslint`（改动的 4 文件）、`pnpm e2e` 全量 66/66、`rollback-dist.mjs --list` 与无参回滚预检（拒绝且不改线上）。
- **未实跑**：`deploy-dist.mjs` 全链（需干净工作区且会改线上 dist）；其新增断言按同一 dist 产物人工抽检（入口 chunk 双标记=1）验证逻辑，`node --check` 验证语法。
- 后端代码修复后**未重编 release、未重启 dev-rs-iot**——线上仍跑修复前二进制；本轮只做代码与测试收口，部署/重编留待用户裁决（`cargo build --release -p rs-iot --features history` 单独构建 + warden restart）。
