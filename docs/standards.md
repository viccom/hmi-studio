# hmi-studio 工程规范（TS / Vue / 测试 / 文档）

> 编码规范 + 测试规范 + 文档规范的单一权威源；架构与分层规则另见 docs/architecture.md。
> 原则：规范条目尽量机械化（vue-tsc / ESLint / check-layers / symbol-lint 四道门），文字只规定机器管不了的部分。
> 本文描述的是**既有事实风格的成文化**（2026-10-27 基于 75 commit 代码提炼），不是空想标准。

## 0. 门禁总览（背压优先）

```bash
just fe-quality   # typecheck + 单测 + e2e + build + lint + layers 全套
```

| 门 | 工具 | 拦什么 |
|----|------|--------|
| typecheck | `vue-tsc --noEmit`（strict） | 类型错误 |
| lint | ESLint（typescript-eslint + vue，非格式化规则） | 悬空变量、误用模式、`any`（warn 提示，review 关注） |
| layers | `scripts/check-layers.mjs` | 反向依赖 / 越层依赖（规则见 architecture.md §2） |
| test | vitest（jsdom） | 纯逻辑契约回归 |
| e2e | Playwright（需 rs-iot :8790 存活） | 里程碑与用户反馈轮验收 |
| symbol-lint | vitest 内置（lib/symbol-lint 七规则全量循环） | 图元约定（fill/ports/viewBox…） |

## 1. TypeScript 编码规范

### 1.1 类型纪律

- **strict 已开，不豁免**：新代码禁 `any`；外部边界（API 返回、maotu 未导出类型、SSE 帧）一律 `unknown` + 显式收窄（见 sse.ts `asRecord` 范式）。
- 镜像 maotu 官方类型时跟随包命名（`I` 前缀如 IExportJson——不发明自有 `I` 前缀类型；自有类型用名词不带前缀）。
- 类型收窄允许局部 `as`，但**必须在行内或注释说明依据**（如 d.ts 实读、curl 实测形状）。
- 公共契约（跨模块的形状）定义在**消费侧最近的模块并 export**，不建集中 types.ts 大杂烩（现状 symbols/types.ts 是图元域内聚，允许）。

### 1.2 命名

| 对象 | 约定 | 例 |
|------|------|-----|
| 文件（lib/symbols ts） | kebab-case，一词一文件 | `device-registry.ts` |
| Vue 组件文件 | PascalCase.vue；图元组件 `Ah` 前缀 | `BindPanel.vue` / `AhTrendChart.vue` |
| 变量/函数 | camelCase，动词开头 | `collectBinds` `applyDevContext` |
| 类型/组件 | PascalCase | `CommandTracker` |
| 常量 | UPPER_SNAKE + 具名（禁魔法数字） | `HISTORY_CAP = 20` |
| 图元注册 id | `ah-` 前缀 kebab | `ah-power-gauge` |
| 测试文件 | 与被测模块同名 `.test.ts` 伴生 | `sse.test.ts` |

### 1.3 错误处理

- REST 错误统一 `ApiError{status,body}`（api.ts 单点抛出）；调用侧 catch 后必须三选一：用户可见提示（ElMessage）/ 降级并注释 / 记入状态（Tracker/state）。
- **禁止无注释的空 catch**；现有风格 `catch { /* 为什么可以吞 */ }` 必须保留说明。
- 畸形输入在边界处静默丢弃是允许的（SSE 坏帧），但纯函数须返回安全值（`undefined`/`[]`）并**有测试覆盖**。

### 1.4 模块设计

- **纯函数优先 + 依赖注入**：lib 模块把可函数化的逻辑提为纯函数（可测），环境依赖（fetch/EventSource/localStorage/token）经参数注入（见 api.ts `api(opts)`、sse.ts `createRtdataStream(opts)`）；流层与纯函数同文件分区（sse.ts `// ---------- 流层 ----------` 分隔），流层不进 jsdom 单测、由 E2E 验证——此分工须在文件头注明。
- 模块态（闭包级可变量）允许但须注释生命周期（nav-button.ts options 式）。
- import 分组：vue/三方 → maotu → 相对路径，组间空行（现有事实风格）。

### 1.5 注释

- 文件头契约注释：是什么 + 关键实证依据（F 系列编号）+ 约束/边界——这是本仓最有价值的文档资产，**新文件必须有**。
- 注释写「为什么/依据/陷阱」，不写「下一步做什么」；对 maotu 行为的论断必须带证据出处（bundle 函数名、实证编号或 issue）。
- 中文注释；标识符与 API 名英文。

## 2. Vue 约定

- `<script setup lang="ts">` + SFC 三段序 script → template → style scoped；样式用 element-plus CSS 变量（`var(--el-*)`），主题单源 html.dark（F23）。
- **生命周期纪律（硬规则）**：onMounted 挂的每样东西——ResizeObserver / EventSource / bridge / 定时器 / window 属性——必须在 onUnmounted 对应清理（ViewView.vue 范式）；漏清理=review 阻断项。
- window 只经 §4.3 收口清单写入；组件禁止自挂全局。
- 事件监听拼写陷阱：maotu 组件事件必须模板精确大小写 `@onEventCallBack`（F15，kebab 静默失效）。
- 视觉修正 maotu 内部样式只能 `:deep()`（非 scoped 块注明原因），禁改包文件。
- 视图间不共享组件内状态；跨页数据经 lib（screens/nav）或路由参数/查询（`?dev=`）。

## 3. 测试规范

### 3.1 单元（vitest，TDD 主战场）

- **红→绿→commit**：lib/symbols 纯逻辑先写失败测试；新增 lib 模块无测试不予合入。
- describe/it 用**中文意图句**（"cell 行 [ts,localTime,value] → {field,value}"），断言即文档。
- 必测三类：正常契约 / **畸形输入反例**（parseFrame 坏帧、unwrap 裸 done_json）/ 边界（backoff 封顶、环形上限）。
- 快照 = 契约资产（图元结构/画面生成器）：有意变更须在 commit 说明并整批刷新；禁止快照里出现随机/时间成分。
- mock 边界：只 stub 环境依赖（`vi.stubGlobal('fetch')` 范式），被测逻辑不 mock。

### 3.2 E2E（Playwright，验收门）

- 打**真实 rs-iot**（`RSIOT_BASE`，默认 127.0.0.1:8790）；网络层 mock 仅限三类——SSE 流（route.fulfill，cell 必须真数组，F20 陷阱）、命令 payload 断言（route 拦截）、告警 REST 快照（m2/m3 确定性需要，spec 内注释说明）。
- **长期资产保护**：对存量画面（water-demo-m3 等）先备份→变更→断言→try-finally 回写，不留痕；测试自建资产用 `e2e-*` 前缀并在断言后清扫。
- 断言锚优先级：`data-testid` > maotu 节点 id（`{symbol_id}-{随机}`）> `img[src*="ah-xxx"]`（E2E 定位锚约定）> 文本。
- 新用户可见功能必须带至少一条 e2e 断言（W 轮惯例）；spec 命名跟随里程碑/轮次（m1-m4 / w7…w11 / symbols）。

### 3.3 验证自证

- 汇报"完成"前实际跑过对应门并贴真实输出；失败/跳过显式声明（全局底线，本仓同守）。

## 4. 文档与提交规范

### 4.1 docs/ 结构

| 位置 | 内容 | 规则 |
|------|------|------|
| docs/plans/YYYY-MM-DD-*.md | 设计/实施方案 + 任务跟踪表 | §3 表格 = 任务状态真相源，完成即勾选回填 commit（与代码同 commit） |
| docs/architecture.md | 架构与分层规范 | 变更走 §5 决策登记簿 |
| docs/standards.md | 本文 | 修规范 = 单独 commit 说明动机 |
| docs/maotu-*.md | maotu 实证/概念映射/图元开发宪法 | 实证结论带证据（bundle 函数名/探测输出） |
| docs/LICENSE-NOTES.md | 授权边界 | 禁止 maotu 源码入库 |

- AGENTS.md = 地图（~40 行内）：命令/目录/文档指针/纪律红线，细节一律下沉 docs/。
- 实证事实（API 形状、maotu 行为）回填实施方案 **F 系列表**，不散落在会话或 commit message 里。

### 4.2 提交

- 格式：`type(scope): 中文摘要——要点`（feat/fix/test/docs/chore/refactor；scope = 任务号/轮次/模块）。
- 一 commit 一意图；任务跟踪表回填与功能同 commit；禁 Co-Authored-By 等署名尾注。
- 禁入库：maotu 源码/反编译产物、密钥/凭据、dist/、node_modules/（.gitignore 已列）。

### 4.3 分支与 worktree

- 长任务（≥3 commit 或 ≥5 文件）开 worktree（`hmi-studio-w` 惯例）；日常小修直接 master。
- master 随时可部署：合入前 `just fe-quality` 绿（e2e 需 rs-iot 在跑）。

## 5. 纪律红线（违反即 review 阻断）

1. **TDD 红线**：纯逻辑模块测试先行，禁止跳过测试报完成。
2. **maotu 零改动红线**：不改包文件、不用 patch（豁免须经架构登记簿）。
3. **实测不符即停**：F 系事实与实际行为不符时，先核实回填文档再继续写码。
4. **在线原则**（设计 D5）：不引入 mock 设备数据路径、不做离线快照。
5. **生命周期清理**（§2）：挂载必清理。
6. **新增 lib 依赖方向**（architecture §4.2）：lib 新模块禁 import symbols。
