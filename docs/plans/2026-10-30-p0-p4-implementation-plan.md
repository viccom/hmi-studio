# P0 消费侧 + P4 部署脚本实施计划（第 1 轮）

> **状态**：partially-implemented（B1~B6 + C1~C3 完成；C4 部署实测进行中——脏拒 ✅，全绿换装/回滚/清理实测随收尾）
> **日期**：2026-10-30
> **实施**：2026-10-30 d24cc12（消费侧）/2610329（部署脚本）/e2e 加固——两轮全量 e2e 66/66、fe-quality 全绿
> **代码**：`src/lib/screens.ts`、`src/views/EditView.vue`、`src/lib/alarms.ts`、`src/views/ViewView.vue`、`src/components/VersionPanel.vue`（新增）、`e2e/screen-versioning.spec.ts`（新增）、`scripts/{deploy,rollback,prune}-dist.mjs`（新增）
> **测试**：`e2e/screen-versioning.spec.ts` 三组用例 + `src/lib/screens.test.ts`/`alarms.test.ts` 增量；基线 620 vitest + 60 e2e 不回归
> **遗留**：全部（见任务表）

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
| C4 | 三脚本收口实测（对齐总体设计 §7 验收：脏拒/全绿换装/回滚） | C1~C3 | `node scripts/deploy-dist.mjs` ×2 + `rollback` + `prune` 全链一遍，输出摘要留档本文件 | ☐⏳ |

## 3. 实施偏差记录（相对总体设计 §3/§7）

1. 设计 §3.6 说 auth 中间件「未注入请求扩展，需补提取」——实读 rs-iot `src/api/auth.rs:96-100`
   **已存在 `AuthedUser` Extension 注入**（复审 M2 已做）：P0 后端直接消费，无需改
   auth.rs。列此偏差以代码为准。
2. （其余随实施追加）

## 4. 完成判据（任务书 §9 摘要）

- `just fe-quality` 全绿（§4 已知红保持原状；`e2e/probe-bi.spec.ts:22` warning 不顺手修）
- 三组新 e2e 全过且既有 60 e2e 零回归；播种幂等断言固化
- C4 三脚本实测通过；版本面板/409/横幅在 LAN 档真实 rs-iot 上可用
