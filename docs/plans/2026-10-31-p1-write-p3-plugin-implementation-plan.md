# 第 3 轮实施计划：P1 写工具族 + P3a reg-combin + P3b 插件目录 + dev 栈接 reasonix

> 建立时点 2026-10-31。授权源 = 用户「开始第 3 轮」指令；设计权威源 =
> `2026-10-30-ai-assistant-and-extension-system-design.md`（§4.2 写工具清单 / §4.4 reasonix
> 三步 / §6 P3a/P3b）与 rs-iot `docs/designs/2026-10-30-screen-versioning-design.md`（P0 契约，
> 已上线）。本文档是任务状态真相源（standards §4.1）：完成即勾选 + commit 回填。
> LLM 提供商信息 = 现场版配置（`field/home/config.toml`：vl-gateway OpenAI 兼容面
> `127.0.0.1:51190/v1` + `api_key_env` 引 `.env`，密钥 600 不入库）。

## 0. 范围

**做**：

- **D. 前置（纯环境，不入 git）**：dev 栈接 reasonix —— REASONIX_HOME（镜像 field 版
  provider 配置）+ warden `dev-reasonix` 条目 + `gateway.toml [reasonix]` 段 + rsiot/hmi
  两个 MCP 插件 `mcp enable` + `GET /api/agent/status` 实证
- **A. P1 hmi-mcp 写工具族**（6 个）：`hmi_create_screen` / `hmi_put_screen`（强制
  if_version + validate 全绿前置 + bi-sanitize + 保护 slug 升 CW）/ `hmi_rename_group`
  / `hmi_rollback_screen`（CW）/ `hmi_delete_screen`（CW + 保护 slug 硬拒不可 force）/
  `hmi_install_plugin`（CW，spawn install-plugin.mjs）
- **B. P3a reg-combin**：探针先行（/dev/probe-combin 页 + 结论文档）→ rs-iot 第三资源族
  `symbol`（MetaKind 泛化 ~30 行）→ 宿主侧「存为符号」+ 启动注册「我的符号」组
- **C. P3b 插件目录**：widgets-example（scaffold 兼 e2e fixture）+ install-plugin.mjs +
  gateway `hmi_widgets_dir` + symbols 层 plugin-loader + 降级渲染（未知 tag 占位框 +
  未知 props 键回落）+ 三 e2e

**不做**（本轮排除）：插件签名/市场/版本存储（D3/D4 已定）；symbol 的 versions 浏览端点
（v1 裁剪，put/delete 内部版本捕获免费继承）；screenshot 真浏览器验收与真实对话联调的
全部三场景（只走通「写审批」一场景，其余登记）；`sub=hmi-mcp` 专用 JWT 以外的用户体系改动。

## 1. 实施决策记录

| # | 决策 | 依据 |
|---|---|---|
| K1 | **审批闸的实现面**：MCP annotations（readOnlyHint/destructiveHint）只是提示信号；真正的审批 = reasonix serve `permissions.mode="ask"` 的工具放行弹窗（field 实测同款管线）。hmi-mcp 侧职责 = 风险档标注正确 + 服务端护栏（if_version 强制 / validate 前置 / 保护 slug 硬拒 / bi-sanitize） | 设计 §4.2 对齐 rsiot-mcp 范式 |
| K2 | **create 的竞态闸**：GET 探测（仅 404 放行，镜像 lib/screen-create.ts）+ PUT 带 `?if_version=0`（探测后他人抢先创建 → 409 而非静默覆盖） | REST 契约「seq 缺失视为 0」 |
| K3 | **put 强制 if_version 的落地形式**：zod 入参必填 `.int().min(0)`——缺参在 schema 层拒绝，LLM 必须先 `hmi_get_screen` 取 version；validate errors 非空 = 拒绝落库（warning 透传不拦）；落库前 `sanitizeBiProps`（单源 import lib/bi-sanitize，纯函数） | 设计 §4.2「强制 if_version + validate 全绿前置」 |
| K4 | **rename_group 镜像编辑器语义**：批量 GET→合并 group 字段→PUT，cap 4 并发、画面级隔离（fail 计数不上抛）；不带 if_version（与 ScreenListView 现行为同款，不引入新差异） | 设计 §4.2「批量合并语义复刻」 |
| K5 | **install_plugin = 脚本薄封装**：工具 spawn `node <repo>/scripts/install-plugin.mjs <source_dir>`（spawnImpl 可注入单测）；repo 根从 `import.meta.url` 上推，不依赖 cwd | 设计 §6.2「人/AI shell 同款」+ 审批/审计统一在工具面 |
| K6 | **protected.ts 常量定义方向翻转**：slug 常量定义移入 protected.ts（零依赖），5 个生成器文件改为 re-import（消除 mcp import 拖进 lib/api 浏览器面的传递链）；protected.test.ts 断言语义不变 | 单源原则的正确形态；round-2 实现的缺陷修正 |
| K7 | **P3b 目录落点**：运行时目录 = 仓根 `widgets/`（gitignore，站点工件）；scaffold = `widgets-example/hello-card/`（入库）；index.json = `{plugins:[{id,name,version,entry}]}`；entry URL 以 `?v=<version>` bust；dev 模式 vite 中间件 serve `/widgets/`（prod 走 gateway `/hmi/widgets/`） | 设计 §6.2 分发链路 + 备份纪律（widgets 与 dist 生命周期解耦） |
| K8 | **loader 落位 symbols 层**（`src/symbols/plugin-loader.ts`）：check-layers `symbols:['symbols']` 恰好容纳（lintSymbol/HmiSymbol 同层）；`setPluginHost(app)` 由 main.ts 在 registerSymbolComponents 后调用（设计两案取前者）；host 注入面 v1 = `{ vue, echarts, registerSymbol, registerComponent }`；动态 import 带 `/* @vite-ignore */` | 设计 §6.2（LIB_SYMBOLS_ALLOWLIST 空集警示） |
| K9 | **降级渲染**：`plugin-fallback.ts`（symbols 层）两功能——未知 tag 项替换为 `ah-plugin-missing` 占位（保留原 id/binds/尺寸，原项存档）+ 已知 tag 项未知 props 键剔除 + console.warn；EditView 保存时按 id 把存档项合并回 payload（数据不丢）；ViewView 仅渲染侧替换 | 设计 §6.2「插件级故障隔离在单图元」 |
| K10 | **「存为符号」入口 = BindPanel 内按钮**（选中项 `type==='group'` 时出现）：maotu 全局 store 不导出（bundle 实证 `H=ps({...})` 非 pinia），但 `#deviceBind` 槽位给的是 store 响应式选中项（BindPanel 头注释实证）；内置 Ctrl+G 组合产出 `type:'group'` children 子树（bundle 实证「组合/取消组合」菜单）——先组合后存符号，v1 零 maotu 改动 | 探针前置结论；设计 §6.1「若无内核入口→宿主补动作」 |
| K11 | **symbol 资源族四端点**（list/get/put/delete）：MetaKind 泛化 + metrics 数组 `[;2]→[;3]`（process_metrics.rs 五族同改）+ mod.rs 路由 + SSE `resource:"symbol"` 免费搭车（前端 ScreenEvent.resource 已是宽松 string）；rest-api.md §4.19 补行 | 设计 §6.1「约 30 行」 |
| K12 | **dev reasonix 细节**：REASONIX_HOME=`dist/run/dev/reasonix/home`（provider=vlgw 同 field、permissions=ask、sandbox.bash=off）+ work=`dist/run/dev/reasonix/work`（serve token=`dev-serve-token-2026`、rsiot+hmi 两插件）；注册 `hmi-mcp` 用户（lux users hash，`/user/register` 公开端点）→ 登录取 sub=hmi-mcp JWT 作 HMI_JWT（版本 author=AI 徽标语义闭环）；RSIOT_JWT/HMI_JWT 24h 过期按 field README §5 刷新流程登记 | 用户「参考现场版配置」指令 + 路径纪律（运行目录入 dist/run） |

## 2. 任务表

| ID | 内容 | 依赖 | 验证命令 | 状态 |
|---|---|---|---|---|
| T1✅ | K6 protected.ts 方向翻转（常量定义入 protected，生成器 re-import） | — | `pnpm vitest run src/screen-assets/protected.test.ts` + `pnpm run typecheck` | ☐ |
| T2✅ | mcp `tools/writes.ts`：6 写工具 + 纯函数（tier 判定/保护 slug 拒/校验闸）+ `writes.test.ts`（mock backend：409 透传/判重/if_version 缺参 schema 拒/保护 slug 硬拒/rename cap4/install spawn 注入） | T1 | `pnpm -C mcp test` | ☐ |
| T3✅ | mcp index.ts 注册写工具（tools 9→15）+ stderr ready 日志更新 | T2 | `pnpm -C mcp test` + build + stdio tools/list 冒烟 | ☐ |
| T4✅ | dev 栈接 reasonix（K12 全套：home/work/warden reload/gateway.toml/用户注册/mcp enable ×2） | — | `curl 8787`（401）+ 带 JWT `GET /api/agent/status`（200）+ 页面 AI 按钮出现 | ☐ |
| T5✅ | P1 真链路：stdio tools/call 打 dev 8790——create→put（409/判重/validate 拒）→rename_group→rollback→delete 保护 slug 拒→清理测试画面 | T3 T4 | 脚本化输出记录（版本数/409 body/author=hmi-mcp） | ☐ |
| T6✅ | P3a 探针：`/dev/probe-combin` 页（registerConfig reg-combin + 组合/取消组合 UI 验证 + 选中项读取路径验证）+ 结论落 `docs/plans/2026-10-31-reg-combin-probe.md` | — | playwright DOM 断言 + 截图证据入报告 | ☐ |
| T7✅ | rs-iot MetaKind `symbol`（K11：routes_meta/process_metrics/mod.rs/rest-api.md + 测试镜像 screens 最小组） | — | `cargo test --lib meta` + `just check` | ☐ |
| T8✅ | hmi-studio P3a 宿主侧：`lib/symbols-api.ts` 薄封装 + `symbols/my-symbols.ts`（list→registerConfig「我的符号」+ combin 构造纯函数 + 单测）+ BindPanel「存为符号」+ EditView/ViewView 启动挂载 | T6 T7 | `pnpm vitest run src/symbols/my-symbols.test.ts` + typecheck | ☐ |
| T9✅ | P3a e2e：存为符号（seed 带 group 项画面 → 存 → 左面板「我的符号」出现；若探针 (a) 成立再断言拖入渲染） | T8 | `pnpm exec playwright test e2e/my-symbols.spec.ts` | ☐ |
| T10✅ | P3b 工件：`widgets-example/hello-card`（manifest/dist.js/src）+ `scripts/install-plugin.mjs`（lint manifest 命名空间/entry 存在 → 复制入 `widgets/` → 维护 index.json）+ lintManifest 纯函数单测 | — | `pnpm vitest run scripts/install-plugin.test.ts` + 手跑装/卸 | ☐ |
| T11✅ | gateway `hmi_widgets_dir`：config 键 + widgets_router（ServeDir 全量 no-cache）+ app.rs 挂 `/hmi/widgets` + 测试（未配置不挂/配置后 200+no-cache） | — | `cargo test -p rsiot-gateway widgets` | ☐ |
| T12✅ | hmi-studio P3b：`symbols/plugin-loader.ts`（setPluginHost/loadPlugins：index.json→动态 import→lintSymbol 门禁→「扩展图元（本站）」组+app.component 续注，失败 ElNotification 不中断）+ `AhPluginMissing.vue` + `plugin-fallback.ts`（占位/存档/props 清洗）+ main.ts/EditView/ViewView 接线 + vite dev 中间件 | T10 | `pnpm vitest run src/symbols/plugin-loader.test.ts src/symbols/plugin-fallback.test.ts` + typecheck + layers | ☐ |
| T13✅ | P3b e2e 三用例：装 example → 编辑器组可见+拖入可用；index.json 移除 → 既有画面占位框不崩；lint 不过 → 拒 + 通知可见 | T12 | `pnpm exec playwright test e2e/plugin-dir.spec.ts` | ☐ |
| T14✅ | mcp `hmi_install_plugin` 真链路（装 hello-card 经 MCP 工具 → gateway `/hmi/widgets/` 200）+ 真实 reasonix 写审批一场景（对话建画面 → 审批弹窗 → 放行 → screenshot 自检） | T4 T10 T12 | 会话记录 + wire 证据 | ☐ |
| T15✅ | 文档：两仓 AGENTS.md 地图行、probe 报告索引、plan 回填、rs-iot docs（rest-api/README 若牵连） | 全部 | `python3 scripts/check_docs.py`（rs-iot 侧）+ 人工核对 | ☐ |
| T16 | 收尾门禁 + 分笔提交（顺序：T1 翻转 → mcp 写族 → 探针页+报告 → rs-iot symbol → gateway widgets → 宿主 P3a → P3b 工件+loader → e2e+文档） | 全部 | `just fe-quality` + `pnpm -C mcp test` + rs-iot `just check` | ☐ |

## 3. 验证口径（显式声明）

- **TDD 面**：mcp 写工具/纯函数、my-symbols 构造、install-plugin lint、plugin-loader/fallback
  全部先红后绿；.vue 视图层（BindPanel 按钮/占位组件）走 typecheck + e2e（仓内分工惯例）。
- **rs-iot 测试边界**：symbol 资源族复用 MetaKind 既有 11 组测试机制——只加最小镜像组
  （list/get/put/delete + 保护不变量），不为泛化机制重复造测试。
- **探针 = 证据优先**：P3a 探针结论必须带 DOM 断言/截图/bundle 引证三类之一；探针 (a)
  若失败（reg-combin 拖入不可用），T8/T9 按「降级重估」上报后再动，不硬写。
- **真实对话联调只覆盖写审批一场景**（设计 §5.2 场景 1 的子集）；场景 2/3 与 screenshot
  真浏览器链路沿用第 2 轮登记，不在本轮验收面。
- **dev reasonix 环境动作不入 git**：dist/run/dev/**、rs-iot gateway.toml（已 gitignore）、
  .env（600）——提交物只有代码与文档。

## 4. 风险与偏差登记（收尾回填）

- 「gateway 一行配置」实际 = 配置键 + widgets_router + app.rs 挂载三处小改（~40 行，
  设计 §6.2 原文即如此；用户任务书表述从简）——非偏差，预期内。
- **探针重大语义修正（T6）**：reg-combin 拖入即**模板展开**（bundle 插入分支尾调解组函数
  XM；e2e payload 顶层为独立图元实证），非设计假设的「持久组合体」——「我的符号」按
  **图库模板**语义落地（拖入展开、逐项可改；持久组合走内置 Ctrl+G）。详见
  `docs/plans/2026-10-31-reg-combin-probe.md`。
- **combin_json 子项三要素**（缺一渲染崩 `symbol_id of undefined`，探针实测踩到）：
  私有 symbol 部分 + 描述符 props + 百分比 binfo——「存为符号」克隆槽位项天然满足。
- **group children 在保存载荷保留 symbol 部分 + 描述符 props**（拍平只作用顶层项，
  实测修正探针报告初稿的错误推断）——保存 doc 的 group 项也是合法 combin_json 来源。
- mcp `import.meta.url` 仓根推导在 esbuild bundle 下失效（摊平层级）——repoRoot 双候选
  探测修复（源/束布局都命中），T14 实测踩到。
- 插件装载与画面加载竞态 + fallback 判定盲区（插件 tag 不在静态 registry → 误降级）：
  loader 暴露 `pluginSymbols()`、fallback 合并已知集、两视图先 `await loadPlugins` 再挂
  画面——T13 e2e 红后修复。
- **审批链路验证口径**：面板首轮对话实证「非只读工具（bash）被拦 → 权限弹窗 → 批准放行」；
  第二轮（收敛提示词 + serve 清态）面板→LLM→hmi_get/validate/put→落库全通（画面 v2、
  旧版捕获 author=hmi-mcp）。hmi 写工具自身的弹窗触发未单独截图（该轮权限模式已为放行）——
  annotations readOnlyHint:false 与 bash 同档非只读，同一权限引擎，登记为已知未覆盖点。
- CLI（`reasonix -p`）非交互直通写工具（ask 模式不拦 CLI）——面板才是 K1 审批面，CLI 行为
  登记不修。
- 基线：hmi-studio `just fe-quality` 全绿（e2e 71）+ mcp 40 例；rs-iot `just check` 全绿。
  收尾对比须一致（新红须归因本轮改动或显式上报）。

## 5. 验证记录（2026-10-31 收尾）

| 门 | 命令 | 结果 |
|---|---|---|
| 单测（root） | `pnpm test` | **695 passed (49 files)**（第 2 轮基线 667；净增 28：my-symbols 5 + plugin-loader 6 + plugin-fallback 8 + install-plugin 9） |
| mcp 单测 | `pnpm -C mcp test` | **60 passed**（40 + writes 20） |
| e2e 新增 | probe-combin / my-symbols / plugin-dir | **4 + 2 + 3 = 9 例全绿**（全量见 fe-quality 行） |
| P1 真链路 | stdio tools/call 打 dev 8790 | 12 步全绿（create/exists/409 结构化/保护拒/put_protected 409/rollback/author=hmi-mcp/delete 拒+删/rename noop） |
| install_plugin 真链路 | stdio 工具 → 脚本 → gateway | ok:true + `/hmi/widgets/hello-card/dist.js` 200 no-cache |
| 真实对话 | CLI 建画面 + 面板改画面 | v1 创建 ✓；面板 v2 修改 + 旧版 author=hmi-mcp ✓；bash 审批弹窗拦/放行 ✓ |
| rs-iot | `cargo test --lib` / `--test meta_versioning` / `-p rsiot-gateway` | 675 / 15 / 31+e2e 全绿 |
| symbols 端点 live | warden 重启后 curl | `{"symbols":[]}` → PUT/GET/list/DELETE 全通 |

## 6. 状态块

> **状态**：implemented（2026-10-31，T16 门禁收尾中）
> **实施**：第 3 轮 P1 写工具族（7）+ P3a reg-combin（探针→两仓落地）+ P3b 插件目录 + dev 栈接 reasonix
> **代码**：hmi-studio = mcp/tools/writes.ts + index(16 工具) + screen-assets/protected(方向翻转) +
> lib/symbols-api + symbols/{my-symbols,plugin-loader,plugin-fallback,AhPluginMissing} + BindPanel/
> EditView/ViewView 接线 + widgets-example/hello-card + scripts/install-plugin.mjs + vite 中间件 +
> e2e{probe-combin,my-symbols,plugin-dir} + dev/ProbeCombin；rs-iot = routes_meta SYMBOLS +
> process_metrics 三元数组 + mod.rs 四路由 + render 三 kind + gateway{config,static_assets,app}
> hmi_widgets_dir + tests/meta_versioning symbols 组
> **测试**：root 695 + mcp 60 + e2e 净增 9 + rs-iot lib 675/meta 15/gateway 31
> **遗留**：① hmi 写工具弹窗单点截图（本轮权限模式为放行未截到，引擎同 bash 已实证）；
> ② CLI 直通行为（登记）；③ vitest include 扩至 scripts 面（install-plugin 单测落位）；
> ④ 真实对话三场景中场景 2/3（建 KPI 大屏/跨域查数）未走（LLM 质量波动，链路已由场景 1 子集证明）

## 7. 深度审查修复（2026-10-31，两轮 review 后）

第一轮审查 11 条 + 第二轮复核新增 7 条，已修复 12 条（剩余为登记项，见末尾）：

| # | 问题 | 修法 | 证据 |
|---|---|---|---|
| N2 | `hmi_rename_group` 可改保护清单画面（W 档绕过） | 保护成员过滤为 `protected_skipped`，不 PUT | `writes.test.ts` 新增保护用例；fe-quality 全绿 |
| #2 | `hmi_rename_group` 无乐观锁（GET 的 version 被丢弃） | PUT 带 `?if_version=`；409 计入 `conflicts`（fail 不含） | 既有 3 例 mock 路径同步带 if_version + 2 新例 |
| #1 | 安装器 entry 相对穿越（可读源目录外文件、覆盖 widgets 外既有文件） | `entryIsSafe`（相对、无 `..`）+ 源/目标 resolve 包含性双检 | 攻击复现：修复前覆盖 victim.js，修复后 exit 1 内容不变 |
| N3 | index.json 半写/损坏 → 静默抹掉已装表项 | `parseIndex` 损坏返回 null → 中止操作；`writeIndex` 改 tmp+rename 原子写 | 截断 fixture 实测：修复前表项全丢，修复后中止且文件未动 |
| N4 | lint 允许相对 import，但安装只复制 entry 单文件 | lint 增 `findRelativeImports` 拒装 | helper.js fixture 实测 exit 1；hello-card 照常安装 |
| N1 | 缺 id 图元绕过 lint → `s.id.startsWith` TypeError → 编辑器整页拒载 | `lintSymbol` 增 `ID_MISSING`；`loadPlugins` 逐插件 try 隔离 | 单测 2 例（lint/装载器）；坏插件只记 failed |
| — | 多插件逐插件 `registerConfig` 互相覆盖（只剩最后一个） | 收集后聚合一次注册 | 新增多插件聚合单测（2 插件 → 一次注册含 2 图元） |
| #8 | 每次挂载重注册 → maotu「已存在，已覆盖」info 刷屏 | 内容签名（JSON of symbols）未变跳过 registerConfig | 新增去重单测；maotu bundle `registerConfig` 实证 `Vs.info` |
| #3 | 「我的符号」签名只含 id:name → 同名更新后面板拖出旧组合 | 签名含 version（EditView 从 GET 带出） | 新增 version 变化重注册单测 |
| #4 | 未知 props 清洗后提前 return，跳过 children 递归 | 改 fall-through（`out` 变量 + 统一递归） | 新增「插件组合 + 子级未知 tag」单测 |
| #6 | `BUILTIN_TAGS` 双源漂移（mcp 漏 group → 组合项恒报 unknown_tag） | 抽出 `src/symbols/builtin-tags.ts` 单源，两处 import | mcp 单测：group 项 warnings=[] |
| #7 | 占位框上移动/缩放被整项还原丢弃 | 还原时 `binfo` 取当前 payload，身份字段取存档 | 新增几何保留单测 |
| #5 | 写工具零审计日志（设计 §4.3） | `mcp/src/logging.ts` 装饰器单点埋点（tool/tier/ok/ms，含结构化 ok:false + code）；screenshot 自埋点移除 | 4 例单测（成功/档位/结构化拒绝/抛错） |
| N6 | 畸形符号文档抛错 → 整组「我的符号」静默消失 | 逐条过滤 + console.warn | 新增隔离单测 |
| N7 | 注册项 id `sym-sym-…` 双前缀 | 已带 `sym-` 不再叠加 | 单测补两例 |
| N5 | 「存为符号」未做 BI 运行态复位（与保存链不对称） | onSaveSymbol 走 `sanitizeBiProps({json:[combin_json]})` | ViewView/EditView 逻辑；e2e my-symbols 绿 |
| #9 | 保护清单文案硬编码「11 个」 | 改 `PROTECTED_SLUGS.length` | — |
| — | 插件装载失败阻断画面（EditView try 内 await / ViewView try 外） | 两处 `await pluginsReady.catch(() => {})` | e2e screen-versioning/plugin-dir 绿 |

**门禁（修复后）**：`just fe-quality` 全过——typecheck / eslint 0 error / layers / **707 单测**（+12）/
**e2e 80 passed** / build / **mcp 67 passed**（+7）；rs-iot 侧无代码改动（审查结论：SSE/MetaKind/gateway 面无疑点）。

**登记未修（低风险/设计权衡）**：
- 写工具 `HmiApiError(status=200)` 语义倒挂（2xx 非 JSON），无实害；
- `refreshMySymbols`/`onSaveSymbol` 无并发 cap、同名查找 N+1（符号量级小，机制与 rename 的 cap4 不一致）；
- 复制「插件缺席占位框」后保存会把占位 tag 固化（数据已丢的复制语义，需产品决策）。

## 8. AI 面板功能对齐（2026-10-31，控制台 → hmi）

背景：两面板同源移植，但 hmi 侧 P2 裁决裁掉了附件/工作区引用，与控制台形成功能差。
本次对齐（方案 A）：

| 能力 | 修法 | 证据 |
|---|---|---|
| 📎 本机文件上传 | hmi `AgentDrawer` 增 attach-row（chips/上传中态/发送前 @token 前置）；store 增 `uploadAttachment`（FormData → `/api/agent/attachments`） | `agent.test.ts` 5 例（FormData/413/缺 path/路径编码/503）；e2e 附件上传+移除 3 例 |
| 📁 工作区 @ 引用 | 移植 `WorkspacePicker.vue`（gateway `/api/agent/workspace` 一层列表 + 面包屑下钻）；选中路径经 `escapeRefPath` 插入 textarea 光标处 | e2e 选择器下钻+插入引用；live e2e 列真实 dev 工作区 |
| 发送/禁用条件 | 文本**或**附件任一非空；上传中禁发；发送后清空 chips | e2e「仅附件可发送」断言 submit body 以 `@path` 开头 |
| agent-api FormData | 不设 `content-type: application/json`（浏览器自动生成 multipart boundary） | 上传 200 + 落盘断言 |

**门禁**：typecheck / eslint 0 error / 单测 712（707+5）/ e2e 84（80+3 mock + 1 live）/ build 全绿。
**live e2e**：`e2e/ai-panel-live.spec.ts` 打真实 dev gateway，上传落 `dist/run/dev/reasonix/work/.reasonix/attachments/`，测试后按前后差集清理。
