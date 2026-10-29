# 监控站级 BI 数据大屏：内容体系与图表图元设计（P2 路线图）

> 建立时点 2026-10-29。上游路线定案见 `docs/plans/2026-10-25-hmi-studio-implementation-plan.md`
> 与 webhmi 工作区 AGENTS.md「BI 大屏路线（路线 A）」。本文是 **P2 阶段的内容与图元
> 单一权威源**——「监控站级大屏有什么内容、每个内容的数据从哪来、需要哪些图表图元」。
>
> 实证基线（本文所有结论均有出处，勿凭印象改）：
> - 后端端点形状：见 rs-iot `src/api/routes_*.rs`（2026-10-29 实读）
> - 现场数据实况：直连 127.0.0.1:8790 curl 实测（见 §1.2）
> - maotu 通道机制：见 `docs/maotu-symbol-development-guide.md` 与 bundle 实读

---

## 0. 定位与边界

**做什么**：在 hmi-studio 里做「监控站级」的数据分析大屏——一个工段/站点汇聚多台设备、
多类计量（电/水/气）的集中监控大屏，主体是 BI 图表而非传统 HMI 工艺画面。

**与既有 HMI 的分工**：
- 传统 HMI（`home-meter-*` 三屏）= **实时工艺画面**：仪表盘、阀门状态、趋势曲线
- 本 BI 大屏 = **历史分析画面**：KPI、排名、占比、分布、对比、告警统计
- 两者共用同一份活数据（rs-iot 时序库 + SSE），不新增采集链路

**不做**（本阶段明确排除，避免范围膨胀）：
- 不引入 DuckDB/Parquet 深分析外挂（P4，可延期）
- 不做地图/拓扑图元（缺 geo 数据源与拓扑模型，见 §2.2 J 区）
- 不做告警历史（后端只存当前活跃集，见 §1.3 缺口 2）
- 不做跨设备的服务端 group-by 聚合（后端无此端点，见 §1.3 缺口 3）

---

## 1. 数据现实盘点

### 1.1 现有端点能力矩阵（后端能给什么）

| 端点 | 形状 | 大屏用途 | 硬限制 |
|------|------|---------|---------|
| `GET /api/v1/history/stats` | `{dev_id,tag,stats:{count,last,last_ts,avg,min,max,sum}}` | 单 series 整窗统计 | 单条；`agg`/`interval` 传了也被静默忽略 |
| `POST /api/v1/history/batch` | `{results:[{dev_id,tag,points:[{ts,value}],count}\|{…error}]}` | **多 series 一次往返**（≤32 条） | 只返 points 不返 stats；并发 cap 4 |
| `GET /api/v1/history` | `{dev_id,tag,points,count}` | 单 series raw/降采样 | 单条；桶数 ≤100000 |
| `GET /api/v1/rtdatas` | `{dev:[{field:[ts,local,value]}]}` | 当前值快照 | 值是字符串；无历史 |
| `GET /api/v1/devices` / `/devreg` / `/devmodels` | 设备树 / 台账 / 型号模板 | 台账、型号分组（`category`/`vendor`） | 无状态字段、无业务分组维度 |
| `GET /api/v1/tags` | `{key:{history,deadband,desc,unit,…}}` | **哪些点有历史**的唯一清单 | 属性扁平自由文本 |
| `GET /api/v1/alarms` | `[{key,level,source,message,ts,count}]` | 当前活跃告警、级别分布 | **只存活跃**（清除即消失），无历史 |
| `GET /api/v1/inst/roster` / `/inst/stats` | 实例状态 / 健康计数 | 采集器在线、成功率 | 进程启动以来累计值，重启清零 |
| `GET /api/v1/sysstatus` | 平台计数（pipeline/hub/mqtt/history/process） | 写入成功率、数据质量 | 同上，累计值无时间窗 |
| `GET /api/v1/logs/recent` | 环形缓冲最近日志 | 错误 Top 排名 | 容量 2000，重启失忆 |

### 1.2 现场实况（2026-10-29 实测）

- 在网设备 **6 台**（`home-meter-e1/e2` 电、`g1/g2` 燃气、`w1/w2` 水），模型 `meter_electric`/
  `meter_gas`/`meter_water`；采集实例 `home-meter-{e,g,w}-sim`，周期 2s
- **归档（history=true）只有 12 条 series**：`energy`、`energy_today`（电×2）、
  `gas_total`、`balance`（气×2）、`flow_total`、`flow_reverse`（水×2）
- 瞬时量 **全部 history=false**：`voltage/current/power/pf/frequency/status/pulse`、
  `gas_instant/valve/leak_alarm/battery`、`flow_instant/reverse_flag/…`
- 实际有历史深度的：电表 `energy` 约 42k 点/7d；窗内 `min=12580.0 → max=12590.674`
  （即累计表，窗口增量 ≈ 10.7 kWh）
- 实时值经 SSE 正常推送（`/api/v1/events` 的 `rtdata` 帧可见）

### 1.3 三条硬缺口与对策

**缺口 1：归档点位太少 → 趋势类分析几乎无米下锅**
- 现状：`power/voltage/current` 等瞬时量全部不归档，历史库只有累计表
- 对策：**纯 API 前置动作，不改代码**——`POST /api/v1/tag/batch`
  `{pattern:"home-meter-*.power", history:true}`（glob 批量，覆盖 effective 全量 key）
- 量级评估：6 设备 × 9 tag × 2s 采样 → series 12 → ~50，written 3.8k → ~16k/周期，tsink 无压力
- 死区建议：连续量给 `deadband`（如 power 0.05kW）压归档量；bool/str 恒档不受死区影响
- **这是 P2 的前置门**：不开归档，D/E/F 区的历史分析无数据源

**缺口 2：告警无历史**
- 现状：`/alarms` 只存当前活跃集，清除即消失 → 做不了告警趋势/发生率/MTTR
- 对策（本期）：F 区只做**当前活跃告警的分布与 Top 源**（level 占比、Top source、
  明细表）。告警趋势列为 P4 候选（需后端新增告警历史存储）
- 诚实标注：大屏上不出现「昨日告警数」这类伪装指标

**缺口 3：无服务端 group-by / 跨设备聚合**
- 现状：所有 history 端点都是单 series 精确定位
- 对策：**宿主侧聚合**——`/history/batch` 一次拉 ≤32 条 series 的同口径统计，
  前端按业务维度求和/排序/占比。6 台设备规模完全够（6 ≤ 32）
- 代价：聚合逻辑落在前端 lib（可单测），后端零改动

### 1.4 累计量语义（一等公民，错了整屏皆错）

现场 6 个归档 tag 中 **5 个是累计量**（`energy`/`energy_today`/`gas_total`/`flow_total`/
`flow_reverse`），`balance`（余额）也是累计型。

**实施期实测发现（2026-10-29，重要）**：现场表计**存在周期性复位**——`energy` 与
`energy_today` 在 24h 窗内各有 **16 次回退**（值跌回基准值 10.0 / 12580.0）。
故累计量的「窗口用量」**不能**用「主窗末值 − 前窗末值」求得（复位点两侧末值不可直接相减，
否则差出**负用量**——首版实现即踩此坑，KPI 显示「今日用电 -0.89 kWh」）。

三种计量口径（契约 `BiMode`，实施后定案）：

| mode | 适用 | 口径 | 查询形态 |
|------|------|------|---------|
| `instant` | 瞬时量（power/voltage/current/…） | 窗口聚合（avg/max/min/sum/count/last） | agg + interval=窗口长（落一桶） |
| `daily` | 周期累计计数器（`energy_today`） | **取当前值**（它本身就是本周期累计量，不做差） | agg=last + interval=窗口长 |
| `cumulative` | 累计表（`energy`/`gas_total`/`flow_total`） | 窗口用量 = **分段累加** | **raw 逐点**（不降采样） |

**分段累加算法**（`bi-contract.ts` 的 `cumulativeTotal`）：按回退点（值变小 = 计数器复位）
切段，每段取「段末 − 段初」的增量求和。无回退时等价于「末值 − 首值」；有回退时各段独立
计量再相加——复位不是「倒扣」，而是「换了新的一段计量」。

**为何 cumulative 必须走 raw**：桶聚合会把复位点抹平（回退发生在桶内时，桶末值已复位，
段增量算不准）。raw 逐点才拿得到真实的回退位置。

**跨介质不可比**：kWh 与 m³ 不能放进同一张排名/占比图（量级不可比 = 谎报）。
故大屏的排名图只放同单位同介质的序列，跨介质维度由 KPI 卡与构成图分别承载。

---

## 2. 大屏内容分区体系

下表是「监控站级大屏」的完整内容清单。**可行档**含义：
`现成` = 现有端点直接支撑；`需开归档` = 需 §1.3 缺口 1 的纯 API 动作；`缺口` = 本期不做。

| 区 | 分区 | 典型内容 | 图表形态 | 数据来源 | 可行档 |
|---|------|---------|---------|---------|--------|
| **A** | 总览 KPI | 站内有功总负荷、今日电/水/气用量、活跃告警数、设备在线率、写入成功率、历史序列数 | KPI 数字卡（带迷你趋势） | batch 聚合 + `/inst/roster` + `/sysstatus` | 需开归档（power/energy_today） |
| **B** | 实时负荷曲线 | 总功率、三相电压/电流、频率随时间 | 多序列折线（历史聚合口径） | `/history/batch` agg=avg/min/max | 需开归档 |
| **C** | 能耗分项占比 | 电/水/气 用量占比 | 环形图 | batch + 前端求和 | 现成（累计量 delta） |
| **D** | 设备排名 | 各表计今日用量 Top N | 横向条形 + 排名 | batch agg=last 双窗 | 现成 |
| **E** | 峰谷时段分布 | 一天 24h × 7d 的负荷热力 | 时段热力图 | batch agg=sum interval=3600 | 需开归档 |
| **F** | 告警分析 | 级别分布、Top 告警源、近期明细 | 饼图 + 条形 + 表格 | `/api/v1/alarms` | 现成（**仅当前活跃**） |
| **G** | 设备健康 | 在线/离线、采集器健康、最近错误 | 状态卡 + 日志表 | `/inst/roster` `/inst/stats` `/logs/recent` | 现成 |
| **H** | 数据质量 | 写入/丢弃/跳过计数、归档完整率、死区比例 | KPI 卡 + 迷你趋势 | `/sysstatus` | 现成 |
| **I** | 明细报表 | 设备清单 + 关键指标表 | 可排序表格 | `/devices` + batch 统计 | 现成 |
| **J** | 地图/拓扑 | 站点平面图、设备位置 | 地图 | — | **缺口**（无 geo 数据源与拓扑模型） |
| **K** | 对比分析 | 同比/环比、基准对比 | 分组柱状 | batch 双窗 | 现成 |
| **L** | 分布分析 | 某指标分布 | 箱线/直方 | batch raw 或降采样 | 需开归档 |

**分区落位建议**（1920×1080 设计分辨率，一屏放下 A/L/F/H 关键区）：
```
┌─────────────────────────────────────────────────────────────┐
│ A 站名 + 6 张 KPI 卡（总负荷/今日电/今日水/今日气/告警/在线率）│
├──────────────┬──────────────────────────┬───────────────────┤
│ B 负荷趋势    │  C 能耗占比环  +  D 排名条 │  F 告警分布+明细   │
│ (多序列折线)  │                          │                   │
├──────────────┼──────────────────────────┼───────────────────┤
│ E 时段热力    │  K 对比柱状  +  L 分布箱线 │  H 数据质量 KPI 条  │
├──────────────┴──────────────────────────┴───────────────────┤
│ G 设备健康表（在线状态 + 采集健康 + 最近错误）                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 数据通道契约

### 3.1 两条通道并存（既有裁定不变）

| 通道 | 机制 | 用途 | 既有先例 |
|------|------|------|---------|
| **A 实时直写** | SSE → `setDevicePointByID(field,value)` → bind 直写 `props.<name>.val` | 实时瞬时值、实时趋势 | `AhTrendChart`（tick0-2） |
| **B 宿主聚合** | 宿主 REST 拉 `/history/batch` → `setItemAttrByID(id,'props.data.val',JSON)` → 图元 watch 解析 | 一切历史分析（KPI/排名/占比/热力/对比） | `ProbeBi`（4KB/40KB/120KB 实证，<1ms、零丢帧） |

**通道 B 是 P2 的新增主体**。理由：
- 图元不自开 EventSource、不轮询（既有架构裁定）
- 一次 batch 拉全画面所有图元的 series（全站 6 设备 ≤32 条上限内）→ **一次往返喂全屏**
- 写回机制已实证可靠（大 JSON + 连写 10 次零丢帧）

### 3.2 通道 B 的四段链路

```
① 扫描：宿主遍历 done.json 顶层 → 找出 tag 前缀 'ah-bi-' 的图元 → 读其 props 查询规格
② 计划：把每个图元的每条 series 展开为 query → 跨图元合并 → 按 32 条分批
③ 取数：POST /api/v1/history/batch（结果按 dev_id+tag 索引，单条 error 字段化不影响全屏）
④ 写回：按图元重组 JSON → setItemAttrByID(item.id, 'props.data.val', json)
```

**合并是宿主聚合收集器的核心价值**：一屏 12 张图元若各自取数 = 12 次往返；
合并后 1~2 次往返。

### 3.3 BI 图元 props 契约

每个 BI 图元声明以下 prop（组态员可编辑，保存态保留）：

| prop | 类型 | 语义 |
|------|------|------|
| `fill` | color | 强调色（边框/主色），lint 强制 |
| `title` | input | 图表标题 |
| `series` | textArea | **查询规格 JSON 串**（见下），`[]` 起步 |
| `agg` | select | 窗口聚合口径：`avg/max/min/sum/count/last`（瞬时量）/ `delta`（累计量） |
| `interval` | number | 降采样桶宽（秒）；0 = 不降采样（raw） |
| `windowSecs` | number | 统计窗长（秒） |
| `live` | number | 可选：bind 直写的实时当前值通道（KPI 卡用） |
| `data` | textArea | **运行时数据通道**——宿主写回，组态员不填 |

`series` JSON 规格（每条一 series）：
```json
[{"dev_id":"home-meter-e1","tag":"energy","label":"1#电表","unit":"kWh",
  "mode":"cumulative","color":"#f5a623"}]
```
- `mode`：`instant`（瞬时量）/ `cumulative`（累计量，增量口径见 §1.4）
- `label`/`unit`/`color`：图例与坐标轴呈现，缺省回落 dev_id.tag 与调色板

**数据通道 prop 必须能被宿主定位**：宿主按 `tag` 前缀识别 BI 图元，故所有 BI 图元 id
统一 `ah-bi-*` 前缀（lint 与 E2E 锚点同款约定）。

### 3.4 写回卫生（保存态不被数据污染）

- 运行时写入 `props.data.val` 会进 maotu 内部 store；若用户随后在编辑页保存，
  这坨 JSON 会被 PUT 进 rs-iot → **画面文档膨胀（128KiB 上限）+ 编辑器面板显示噪声**
- 对策：`EditView.save()` 落库前 sanitize——把 BI 图元的 `props.data` 复位为 `'[]'`
  （纯函数放 lib，单测锁定；编辑页本就跑不了收集器，正常路径本就是干净的，
  sanitize 是防御性兜底）

### 3.5 刷新节奏

- 通道 B 走**拉模式**：宿主周期刷新（默认 30s，可配），非逐帧推送
- 理由：历史分析对实时性不敏感；30s 一次 batch 在 6 设备规模下开销可忽略
- 通道 A 保持 SSE 推送不变

---

## 4. 图表图元总清单

「多多益善」——先定全集，再按批次实现。**23 个图元，全部 vue 型**（需 echarts 渲染与
DOM 布局，svg 型承载不了图表）。

### 4.1 批次划分

**P2 首批（7 个）——本阶段交付**
| id | 名称 | 图表 | echarts 依赖 | 依赖通道 B |
|----|------|------|-------------|-----------|
| `ah-bi-kpi` | KPI 数字卡 | 自绘 + sparkline | LineChart | 是 |
| `ah-bi-trend` | 多序列趋势 | 折线/面积 | LineChart + Grid | 是 |
| `ah-bi-rank` | 排名条形 | 横向条形 | BarChart | 是 |
| `ah-bi-pie` | 占比环 | 环形 | PieChart | 是 |
| `ah-bi-stack` | 状态时长条 | 百分比堆叠横条 | BarChart | 是 |
| `ah-bi-heat` | 时段热力图 | 热力 | HeatmapChart | 是 |
| `ah-bi-table` | 明细表格 | 自绘表格 | — | 是 |

**P3 扩展（10 个）——图元族扩容**
| id | 名称 | echarts 依赖 |
|----|------|-------------|
| `ah-bi-bar` | 分组柱状对比 | BarChart |
| `ah-bi-gauge` | 仪表盘 | GaugeChart |
| `ah-bi-scatter` | 相关性散点 | ScatterChart |
| `ah-bi-radar` | 多指标雷达 | RadarChart |
| `ah-bi-boxplot` | 分布箱线 | BoxplotChart |
| `ah-bi-sankey` | 能流桑基 | SankeyChart |
| `ah-bi-calendar` | 日历热力 | HeatmapChart + CalendarComponent |
| `ah-bi-progress` | 容量利用率条 | 自绘 |
| `ah-bi-waterfall` | 增量贡献瀑布 | 自绘 + BarChart |
| `ah-bi-sparkline` | 行内迷你趋势 | LineChart |

**P4 候选（6 个）——依赖新数据源**
| id | 名称 | 阻塞 |
|----|------|------|
| `ah-bi-funnel` | 漏斗 | 无阶段数据模型 |
| `ah-bi-treemap` | 层级占比 | 无层级维度（无区域/产线分组） |
| `ah-bi-sunburst` | 旭日 | 同上 |
| `ah-bi-map` | 地图 | 无 geo 数据源 |
| `ah-bi-graph` | 拓扑关系图 | 无拓扑模型 |
| `ah-bi-wordcloud` | 标签云 | 非工业监控典型场景 |

### 4.2 统一实现约束（继承既有约定）

- 数据通道 prop 用 **textArea + JSON 串**（maotu `jsonEdit` 是坐标/锚点专用 UI，
  不可用；guide §2.2 实证）
- 数据通道 prop 名称统一 `data`；组态员编辑的是 `series`（查询规格），
  两者语义分离：**编辑的是「查什么」，运行时填的是「查到了什么」**
- 组件 `defineProps` 名与注册项 props 键**一一对应**（jT 平面化直传，多余/缺失即静默失联）
- 每个图元一个注册项 ts（`src/symbols/bi-<name>.ts`）+ 一个组件（`AhBi<Name>.vue`）
- 全部走既有 lint 十规则（`fill` 承载位 / 宽高 / 描述符三键 / 缩略图锚点…）
- 序列配置解析一律容错（坏 JSON → 空，不炸；沿用 `trend-buffer.ts` 范式）

---

## 5. 分层落点

| 层 | 文件 | 说明 |
|----|------|------|
| L1 lib | `src/lib/bi-query.ts` | **纯逻辑**：扫描 done.json → 提取 BI 图元查询规格 → 合并 → 分批计划（可单测） |
| L1 lib | `src/lib/bi-collector.ts` | **运行时层**：执行计划（fetch batch）→ 重组 → 写回回调（依赖注入，可单测） |
| L1 lib | `src/lib/bi-query.test.ts` / `bi-collector.test.ts` | TDD 主战场 |
| L1 lib | `src/lib/bi-sanitize.ts` | 保存态 sanitize（纯函数） |
| — assets | `src/screen-assets/bi-screen.ts` | **画面资产新落位**（architecture §4.2 迁移目标，见 §6.1） |
| L2 symbols | `src/symbols/bi-*.ts` × 7 | 注册项描述符 |
| L2 symbols | `src/symbols/AhBi*.vue` × 7 | 组件 |
| L2 symbols | `src/symbols/bi-batch.test.ts` | 图元契约（注册/配对/lint/快照/组件行为） |
| L4 views | `src/views/ViewView.vue` | 挂载收集器、周期刷新、卸载清理 |
| — e2e | `e2e/bi-dashboard.spec.ts` | 端到端（真 rs-iot + 真数据） |

**分层合规要点**：
- `bi-query.ts` / `bi-collector.ts` 放 lib —— 但它们**不得 import symbols**
  （architecture §4.2 新增规则）。BI 图元识别用 **tag 前缀字符串约定** `'ah-bi-'`，
  不从 registry 反查（registry 反查会构成 lib→symbols 依赖）
- 收集器的写回目标是 maotu preview 实例 → 由 ViewView 注入回调（lib 不碰 maotu）

---

## 6. 待办与门禁

### 6.1 前置动作清单

| # | 动作 | 性质 | 门 |
|---|------|------|---|
| 1 | 为瞬时量开归档白名单（`/api/v1/tag/batch` glob + deadband） | **纯 API，无代码** | 验证 `/api/v1/tags?history=true` 条数增长、`/sysstatus.history.series` 上升 |
| 2 | `src/screen-assets/` 新目录 + `check-layers.mjs` 加层 + architecture §2/§4.2 同步 | 代码 | `just layers` 绿 |
| 3 | lib 三件套 + 单测 | 代码 | `pnpm test` 红→绿 |
| 4 | 7 个图元 + 契约测试 | 代码 | `pnpm test` 红→绿 + lint 绿 |
| 5 | ViewView 挂载 + 周期刷新 + 清理 | 代码 | typecheck + e2e |
| 6 | BI 大屏画面资产 + 播种 | 代码 | e2e |
| 7 | `EditView.save()` sanitize | 代码 | 单测 |
| 8 | 门禁 `just fe-quality` + 部署验证 | — | 全绿 |

### 6.2 任务表（勾选 = 完成，与代码同 commit 回填）

- [x] T1 归档白名单开通 + 验证（series 12→30，死区压制 40%，errors 0）
- [x] T2 screen-assets 分层迁移 + check-layers 加层（lib→symbols 豁免清空）
- [x] T3 `bi-contract.ts` 契约层 + 单测（21 用例）
- [x] T4 `bi-collector.ts` 运行时 + 单测（12 用例）
- [x] T5 `bi-sanitize.ts` + 单测（5 用例）
- [x] T6 `bi-chart-kit.ts` 图表底座 + 单测（19 用例）
- [x] T7-T13 7 个 BI 图元（kpi/trend/rank/pie/stack/heat/table）+ 契约测试（61 用例）
- [x] T14 `bi-screen.ts` 监控站大屏画面 + 播种（10 用例）
- [x] T15 ViewView 挂载 + EditView sanitize 接线
- [x] T16 `bi-dashboard.spec.ts` e2e（3 用例）
- [x] T17 全量门禁 + 部署验证

**实测门禁结果（2026-10-29）**：typecheck 0 错 / eslint 0 error / layers 通过 /
单测 501 全绿 / e2e 60 全绿 / build 成功 / LAN 部署 9/9 图元有真实数据。

### 6.3 实施期发现的三个真问题（已修，记此备查）

| # | 问题 | 根因 | 修法 |
|---|------|------|------|
| 1 | 图表图元**永远空白** | 图表容器用 `v-if` 渲染 → 空态时容器不在 DOM → `onMounted` 拿不到元素 → echarts 永不初始化，数据到达后仍空白 | 容器**常驻** + 空态用覆盖层遮罩（trend/stack/heat 三图元同款） |
| 2 | 累计量 KPI 显示**负值** | 表计周期性复位，双窗末值差失效（§1.4） | 三口径契约（instant/daily/cumulative）+ 分段累加 |
| 3 | 排名图**跨单位比较** | kWh 与 m³ 混排排名（量级不可比 = 谎报） | 排名图只放同单位同介质序列 |

### 6.3 风险与未覆盖点（诚实登记）

| 项 | 说明 |
|----|------|
| 归档白名单是**数据面变更** | 非代码，但改变了 rs-iot 的写入行为与存储量；需用户确认点位与死区参数 |
| 批量 32 条上限 | 一屏 series 数超 32 需多批（本期 6 设备远未触顶） |
| `limit` 是 tsink 分页语义「取最旧 n 点」 | 长窗 raw 查询可能拿到窗前段；本设计走降采样口径规避，raw 仅小窗使用 |
| 空窗与不存在 series 同形 | `points: []` 无法区分「无数据」与「tag 打错」→ 图元显示占位而非 0 值 |
| 告警历史缺口 | F 区只呈现当前活跃集，不做趋势/发生率 |
| 地图/拓扑缺口 | J 区本期不做 |
| 累计量 delta 精度 | 双窗 last 差法依赖「窗初有采样」，Δ=60s 兜底；表计停采时增量偏小 |
| `balance` 是余额不是用量 | 参与占比/排名会失真——图元 series 声明里由组态员选择是否纳入 |

---

## 7. 与既有文档的关系

- 本文 = **P2 内容与图元的单一权威源**
- `docs/architecture.md` → P2 落地后追加分层（`screen-assets` 层）与「BI 双通道」决策
- `docs/maotu-symbol-development-guide.md` → 追加 BI 图元通道章节（通道 B 契约）
- `AGENTS.md`（hmi-studio）→ 地图补一行 BI 资产落位
- webhmi 工作区 `AGENTS.md` → 主线 P2 状态回填
