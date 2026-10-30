# P0 + P4 实施启动指令（交给新会话 Coding Agent 的自包含任务书）

> 建立时点 2026-10-30。**本文是任务书，不是设计文档**——设计在
> `2026-10-30-ai-assistant-and-extension-system-design.md`（总体）与 rs-iot
> `docs/designs/2026-10-30-screen-versioning-design.md`（P0 后端权威源）。
>
> 用法：新会话（无人参与）把本文完整交给 Coding Agent 作为任务说明。本文自包含——
> 不依赖任何此前对话上下文。**第 1 轮范围 = P0（版本管理，两仓）+ P4（部署脚本）；
> P1 hmi-mcp / P2 面板 / P3 插件明确排除，等第 2、3 轮。**

---

## 0. 角色与目标

你是本项目的实施工程师。在无人参与下完成 §2 范围内的开发与测试，产出可交付、
可回退、门禁全绿的代码。**不询问、不等确认**——遇到超出本文授权范围的阻塞，
按 §7 上报协议停下并写报告。

## 1. 必读（按顺序，读完再动手）

1. `hmi-studio/docs/plans/2026-10-30-ai-assistant-and-extension-system-design.md`
   —— 总体设计。重点：§0 决策台账（D1~D8 已拍板，**不得重议**）、§3 P0 消费侧、§7 P4、
   文首「深度审查修订记录」（10 条已修正的坑，勿重犯）
2. `rs-iot/docs/designs/2026-10-30-screen-versioning-design.md`
   —— P0 后端**单一权威源**。重点：§1 事实基线、§3 契约、§4.3 失败矩阵、§6 十一组测试
3. `AGENTS.md`（工作区地图：端口、warden 托管、部署铁律）
4. 两仓各自的 `AGENTS.md`（`rs-iot/`、`hmi-studio/`）

设计文档「实证基线」章节列了全部事实出处（file:line）。**改动前先读原文件确认**，
不要凭文档转述改代码。若发现文档与代码矛盾，**以代码为准**，并在最终报告里列出偏差。

## 2. 范围（严格限定）

**做**：

- **A. rs-iot P0 后端**（按 screen-versioning-design.md 全文）：
  存储键族（`sv:` 独立前缀）/ 捕获与判重 / `if_version` 乐观锁 / 三端点
  （versions 列表、单版取回、rollback）/ auth Extension 注入（author）/
  `EventPayload` 新增 `Screen` 变体 / `[meta]` 配置段 / 四指标 /
  `docs/reference/rest-api.md` §4.19 + §4.10 更新 / §6 的 11 组测试
- **B. hmi-studio P0 消费侧**（主文档 §3）：
  `lib/screens.ts` 加 `version` + 可选 `ifVersion` / `views/EditView.vue` 保存链
  409 处理 / 版本面板（极简）/ `lib/alarms.ts` 改 `types=alarm,screen` 单连接双事件
- **C. hmi-studio P4 部署脚本**（主文档 §7）：
  `scripts/deploy-dist.mjs` / `rollback-dist.mjs` / `prune-assets.mjs`

**不做**（明确排除，不要顺手做）：

- 不改 `maotu/`（闭源 npm 依赖，只消费）
- 不碰 `../tsink_fork`、`../lux`（跨仓，超出授权）
- 不实现 P1（hmi-mcp）/ P2（AI 面板）/ P3（插件体系）——下一轮
- 不做草稿/发布两态、不做版本 diff、不做 ScreenList 实时刷新（已判定不做）
- 不改设计文档正文；若需修订，只在文末追加「实施偏差记录」小节

## 3. 硬约束

- 工作区根 `AGENTS.md`（`/root/myprojects/webhmi/AGENTS.md`）的「部署与构建铁律」+
  两仓各自 `AGENTS.md` 的约定全部适用
- **禁止删除任何长期资产画面**（slug 见 `hmi-studio/src/screen-assets/` 各文件 export 常量）
- 不改既有测试的断言意图；新增测试只加不减
- 提交信息不加任何 AI 署名尾注（无 `Co-Authored-By`）
- 不提交密钥/凭据/.env；`gateway.toml` 及其 `.bak` 永不入库
- **不 `git push`**（本地提交即可，用户决定何时推）
- 每处改动可追溯到设计文档某章节；不确定归属的改动不做

## 4. 已知红（pre-existing，不要修、不算你的失败）

**2026-10-30 实测基线（本机，任务书定稿时逐条跑过，非推断）**：

| 门禁 | 结果 |
|---|---|
| rs-iot `just check`（fmt + docs + lint 三档含 all-features + 全 tests + s7/eip） | ✅ **全过**（输出 `✅ rs-iot 本地门禁全过`） |
| rs-iot `cargo test --lib` | ✅ 670 passed, 0 failed, 9 ignored |
| rs-iot `python3 scripts/check_docs.py` | ✅ 71 md 全过 |
| hmi-studio `just fe-quality`（typecheck + eslint + layers + vitest + e2e + build） | ✅ **全过**（输出 `✅ fe-quality: 前端全部门禁通过`；含真实 e2e 打 8790） |
| hmi-studio `vitest` 单跑 | ✅ 620 passed |
| hmi-studio `eslint .` | ✅ 0 errors（1 个 pre-existing warning：`e2e/probe-bi.spec.ts:22` 多余 disable 指令，**不要顺手修**） |

结论：**两仓门禁此刻全绿，无既存红**。真实风险只有 2 项 flaky（下），出现时重跑即可。

**两条此前的误判，已作废，勿再传播**：
1. ~~"`--all-features` 因 tsink 漂移必失败"~~ —— 错。实测 `cargo check --all-features`
   与 `cargo clippy --all-features -- -D warnings` 均通过；tsink_fork 的 6 个符号在
   **多行 `pub use storage::{…}` 重导出块**里，早先的单行 grep 漏判。
2. **tsink_fork 与 HMI AI 助手无任何关系**——它只是 rs-iot `history` feature 的 path
   依赖，`--all-features` 时连带编译；AI 助手走 gateway `/api/agent/*` 反代 + MCP，
   全程不碰时序库。**不要因为提到 AI 就去动 tsink/lux。**

真实风险仅 2 项 flaky（不是缺陷；出现即重跑，**不要改测试断言**）：

1. rs-iot `lua_north_e2e::north_lifecycle_running_stats_stop`：
   需本地 MQTT broker（`127.0.0.1:1883`），本机无 → SKIP/degraded 是正确行为。
   `docs/guides/testing-and-verification.md` §三 有记载。
2. hmi-studio e2e 段 2 `el-select` 时序偶发；rs-iot `tests/events_e2e.rs` 并发时序偶发。

判据：你的改动完成后，上述项**保持与改动前完全相同的状态**即视为合格。
**开工第一件事：先跑一遍基线门禁并把输出摘要写入 plan 文档**，收尾时对比。
若基线出现本文未列的新红，按 §7 上报，不要自行判定为"环境问题"绕过。

**2026-10-30 晚环境变更（任务书定稿后发生；不改门禁基线，但你要有预期，勿当异常上报）**：

1. warden 拆成两套 systemd 实例：`warden-dev`（:8789，服务名 `dev-rs-iot`/`dev-gateway`/
   `dev-history-monitor`，运行目录 `dist/run/dev/`）与 `warden-field`（:18789，现场模拟栈）。
   重启 dev 服务用 `dev-*` 名，见 §6。
2. **本机恒有 2 个 rs-iot 进程**（dev :8790 + field :18790，同一二进制）——这不是僵尸进程，
   判别看 `--config` 参数（dev=`config.toml`，field=`config/config.toml`）。
3. `rs-iot/config.toml` 已转为**本地实例配置并 gitignore**（模板 `config.example.toml` 入库）；
   它仍在磁盘上，测试照常能读。工作区另有当日的 README/AGENTS/.gitignore 未提交改动，
   属环境整理，不涉你要改的 Rust/前端代码。
4. docs 档基线复核过仍绿（71 md，2026-10-30 晚实测）。

## 5. 门禁命令（权威入口 = justfile；两仓都有）

**rs-iot**（工作目录 `/root/myprojects/webhmi/rs-iot`）：

```bash
just check            # ← 首选：fmt + docs + lint(三档含 all-features) + test + s7/eip
just check-ws         # 全 workspace（含 rsiot-mcp / rsiot-gateway）
# 需要单跑某道门时：
cargo fmt --all --check
python3 scripts/check_docs.py            # 改了 docs/ 必跑（状态块/索引/代码路径引用）
cargo clippy --all-targets -- -D warnings
cargo test --lib
cargo test --tests --no-default-features --features lua -- --test-threads=4
```

**注意（2026-10-30 亲历，别重蹈）**：`just check` 的 `docs` 档会校验
**新增 designs/ 文档的三件事**，缺一即整条门禁红在 docs 档：
1. 头部完整状态块（`> **状态**：` + 日期/实施/代码/测试/遗留 五字段，见
   `docs/conventions/documentation.md` §3）
2. `docs/README.md` 里**以文件名链接开头的独立索引行**（主题链路行不算）
3. 正文引用的 `src/` `tests/` 路径必须真实存在（计划稿写"计划新增 `tests/x.rs`"
   这类措辞可豁免）

**hmi-studio**（`/root/myprojects/webhmi/hmi-studio`）：

```bash
just fe-quality   # ← 首选：typecheck + eslint + layers + vitest + e2e + build
# 需要单跑某道门时：
pnpm run typecheck
pnpm exec eslint .
node scripts/check-layers.mjs
pnpm test
pnpm e2e        # 需 rs-iot 8790 存活；先 curl 127.0.0.1:8790 确认有响应
pnpm build
```

**注意**：hmi-studio 的 `docs/` 没有机械文档检查（`check-layers` 只管 src 分层），
但 `docs/standards.md` §4.1 要求 plan 文档的任务表是"任务状态真相源"——
完成即勾选 + 同 commit 回填，这是人工约定，你自己守。

## 6. 服务运维（P0 后端改完必走，否则消费侧 e2e 打的是旧二进制）

```bash
cd /root/myprojects/webhmi/rs-iot
cargo build --release -p rs-iot          # **单独**构建；勿与其他 crate 合并构建
                                         # （jsonwebtoken feature 冲突 → 运行时 panic）
curl -X POST 127.0.0.1:8789/api/v1/services/dev-rs-iot/restart
pgrep -af "rs-iot "     # 应恰好 2 个：dev（--config config.toml，8790）+ field
                         # （--config config/config.toml，18790）——同一二进制两实例，
                         # 不是僵尸；你只对 dev 那个负责，field 数量异常要报告但别去动它
```

⚠️ **重编的连带影响（知道即可，不在本轮范围）**：`cargo build --release -p rs-iot`
覆盖的 `target/release/rs-iot` 被 field 栈共用——field-rs-iot 下次重启（崩溃自愈/机器重启）
会跟着换上新二进制。属预期耦合；若你在验证中发现 field 侧异常，报告即可，不要改 field 配置。

重启后**实测新契约**（admin/admin 登录拿 JWT）：

1. PUT 带错误 `if_version` → 409 + `current_version`
2. 同内容 PUT 两次 → `version` 不变（判重）
3. `GET /screens/{id}/versions` → 有元数据（seq/ts/author/size/sha）
4. rollback → head 内容等于目标版，且回滚前 head 已存为新版本
5. `GET /api/v1/screens` 列表**不含**任何 `sv:` 派生项（§1.2 脆弱点）
6. `curl 127.0.0.1:8790/metrics | grep 'rs_iot_meta_'` → 四指标存在

**e2e 预期副作用（已知，不算污染）**：hmi-studio e2e 打真实 8790（仓库既有做法），
P0 上线后 `w8` 等改内容的测试会产生少量版本条目——判重挡住内容相同的播种，
剩余由 30 天 TTL 清理。不要为此改测试或加清理钩子。

## 7. 卡住上报协议（重要）

**立即停止**并在报告里写明的条件：

- **基线漂移**：开工基线与你实测结果**不一致**（§4 说全绿却出红、测试数明显不同、
  已有未提交改动涉及你要改的文件）→ 先报告差异再等指示，**不要**自行判断
  "可能是环境问题"然后硬推。依据：§4 基线是任务书定稿时（2026-10-30）的快照，
  若 rs-iot/hmi-studio 工作区在此期间被他人改动，基线失效
- 设计文档契约无法实现（lux 命令不满足、幂等语义矛盾）
- 需要改动 §3 禁改对象（maotu / tsink_fork / lux / 其他仓）
- 需要外部资源（reasonix 部署、provider API key、MQTT broker、真实设备）
- 同一测试连续 3 轮修复失败 → 停止改代码，点名最可疑假设 + 用一条诊断命令证伪它
- 门禁出现 §4 未列出的新红，且 2 轮内无法判定是否自己引入

**可继续**：测试失败但原因在自己改动范围内；文档某处含糊但代码可判定。

## 8. 产出物（缺一不可）

1. **实施计划 + 任务跟踪清单**（开工第一步就建，边做边更新）：

   | 侧 | 文件 |
   |---|---|
   | rs-iot | `docs/designs/2026-10-30-screen-versioning-plan.md` |
   | hmi-studio | `docs/plans/2026-10-30-p0-p4-implementation-plan.md` |

   格式参照两仓既有 `*-plan.md`：任务表（ID / 内容 / 依赖 / **验证命令** / 状态），
   状态 `☐ ⏳ ✅`。每个任务必须标注**它自己的验证命令**，不要只写"跑测试"。

   ⚠️ **rs-iot 那份 plan 文档本身也要过 docs 门禁**（§5 注意三条）：状态块
   （状态取 `draft`，收尾改 `partially-implemented`/`implemented` 并按规范填
   实施/代码/测试/遗留）+ `docs/README.md` 独立索引行。**这份文档是新建的，
   最容易漏**——建完立刻单独跑 `python3 scripts/check_docs.py` 验证。

2. **代码 + 测试**（TDD：先写失败测试再实现；测试验证意图，不追行数）
3. **提交**：按逻辑单元分笔（建议：存储层 / 契约端点 / SSE+指标 / 文档 / 消费侧 /
   部署脚本），每笔可独立构建通过
4. **最终报告**（放会话回复，不另建文档）：
   改动摘要 | 逐条验证证据（真实命令 + 真实输出，**禁止"应该通过"**）|
   已知红前后对比 | 与设计文档的偏差清单 | 未覆盖/风险点 | 下一步建议

## 9. 完成判据

- §5 全部命令绿（§4 已知红保持原状）
- rs-iot 十一组新测试全过；hmi-studio 三组新 e2e 全过且既有 e2e 无回归
- 服务重启后 §6 的 6 条实测全部返回预期结果
- 两份 plan 文档全部任务为 ✅，每项有对应验证记录
- 报告能回答三问：**改了什么、怎么验证的、还有什么没做**

---

## 附：轮次说明（供后续会话衔接）

| 轮次 | 范围 | 前置 |
|---|---|---|
| 第 1 轮（本文） | P0 后端 + P0 消费侧 + P4 部署脚本 | 无外部依赖，可完全无人完成 |
| 第 2 轮 | P1 hmi-mcp 读工具族 + P2 面板移植（mock e2e） | 第 1 轮产出（API 形状、测试基线） |
| 第 3 轮 | P1 写工具族 + P3a/P3b 插件体系 | ~~reasonix 部署~~ **已完成**（2026-10-30 在 `field/` 现场模拟栈部署验证：warden-field 条目 + REASONIX_HOME + gateway `[reasonix]` 段 + vl-gateway provider，AI 读/写/审批链路实测通过，见 `field/README.md §5`）；剩余前置仅 dev 栈如需接入再配（主文档 §4.4 三步） |
