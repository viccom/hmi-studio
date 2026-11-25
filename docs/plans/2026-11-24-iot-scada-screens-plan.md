# 工业 SCADA 画面集实施计划（iot-demo，2026-11-24）

> 状态：**执行中**（2026-11-24 批准）。上游设计论证：`2026-11-24-faceplate-and-industrial-hmi-architecture.md`；
> 落地规范：`../hmi-style-guide.md`。数据面：10 设备 / 154 点（水表×3、燃气表×2 Modbus；
> 电表×3、环境、压力变送器 OPC UA），历史 30 天，见工作路径 `AGENTS.md`。
>
> 目标：交付一套符合 ISA-101 / HP-HMI 的新画面集（L1 总览 → L2 单元 → L3 设备面板），
> 配套 8 个功能件图元、服务端限值报警闭环与宿主合成点位；**保留**旧深色演示画面。

## 1. 交付物

| # | 交付 | 落点 |
|---|---|---|
| D1 | 8 个功能件图元（value-block / sparkline / status-badge / alarm-badge / quality-badge / pipe / area-card / dev-faceplate） | `src/symbols/` + 注册/分组/组件 |
| D2 | 设备与点位目录（10 设备、按类型点位/单位/精度/量程/限值） | `src/screen-assets/iot-catalog.ts` |
| D3 | 15 张画面生成器（L1×1、L2×4、L3×10——每台设备限值不同，一机一面板） | `src/screen-assets/iot-screens.ts` |
| D3b | **历史分析大屏**（BI 分析层，深色）+ L1/L3 就地历史趋势 | `src/screen-assets/iot-bi-screen.ts`、`ah-hist-trend` |
| D4 | 宿主合成点位（`__prio/__alarms/__area.*/__sys.*`） | `src/lib/synthetic.ts` + `ViewView.vue` |
| D5 | 跨画面设备上下文（`nav` 目标支持 `?dev=`） | `src/lib/nav.ts` + `ViewView.jump` |
| D6 | 服务端限值报警（Lua transform + 实例） | `rs-iot/scripts/limit-alarm/main.lua` |
| D7 | 播种与回归（fixtures/global-setup + e2e） | `e2e/` |
| D8 | 部署与视觉走查 | dist 部署 + 截图评审 |

## 2. 画面清单（group「工业 SCADA 演示」，1280×800）

| slug | 层 | 内容 | 主要绑定 |
|---|---|---|---|
| `iot-plant-overview` | L1 | 4 区域卡 + 全厂 P1 徽标 + 报警抽屉 + 历史分析入口 | `__area.*.alarm_count/prio`、`__sys.quality/p1/alarms`、区域 KPI |
| `iot-unit-water` | L2 | 水池→泵→主管→三路（阀+水表）；值块/状态/报警；趋势 | `dev_wm*.flow_rate/pressure/valve_status`、`__prio` |
| `iot-unit-power` | L2 | 进线→母线→三路馈线（断路器）；P/PF/U 值块；sparkline | `dev_em*.active_power/power_factor/ua/breaker_status`、`__prio` |
| `iot-unit-gas` | L2 | 调压站两路（阀+表+压力）；泄漏/超压徽标；安全提示 | `dev_gm*.flow_rate/pressure/leak_alarm/overpressure`、`__prio` |
| `iot-unit-env` | L2 | 环境机 + 压力变送器；温/湿/CO₂/PM/噪声/气压值块+趋势 | `dev_env1.*`、`dev_pt1.*`、`__prio` |
| `iot-faceplate-wm1/2/3` | L3 | 每台水表一张：faceplate + 14 点参数表 + 趋势 | `@dev.flow_rate` 等、`@dev.__prio/__alarms` |
| `iot-faceplate-gm1/2` | L3 | 每台燃气表一张（14 点） | 同上 |
| `iot-faceplate-em1/2/3` | L3 | 每台电表一张（20 点） | 同上 |
| `iot-faceplate-env1` | L3 | 环境机（12 点） | 同上 |
| `iot-faceplate-pt1` | L3 | 压力变送器（12 点） | 同上 |

## 3. 报警规则（Lua 判定，与 `iot-catalog.ts` 限值同步）

| 设备 | tag | 规则 | level |
|---|---|---|---|
| dev_wm* | flow_rate | H 30 / HH 31.5 | warn / error |
| dev_wm* | pressure | H 0.425 | warn |
| dev_wm* | leak_alarm / reverse_flow | true | error / warn |
| dev_gm* | pressure | L 1.85 / H 3.0 | warn / warn |
| dev_gm* | leak_alarm / overpressure | true | error |
| dev_em* | active_power | H 51 / HH 51.8 | warn / error |
| dev_em* | thd_voltage | H 2.9 | warn |
| dev_em* | overload_alarm | true | error |
| dev_env1 | co2 | H 800 / HH 820 | warn / error |
| dev_env1 | temperature | H 28 | warn |
| dev_env1 | alarm | true | error |
| dev_pt1 | pressure_1 | H 1.68 / HH 1.69 | warn / error |
| dev_pt1 | vibration | H 3.5 | warn |
| dev_pt1 | fault | true | error |

key 格式 `<devid>.<tag>.<hi|hh|lo|ll|alarm>`；迟滞 2%；HH/LL/故障 → `error`，H/L → `warn`，
其余（reverse/tamper）→ `info`。

## 4. 任务表（状态真相源）

| # | 任务 | 状态 | 验证 |
|---|---|---|---|
| T0 | 风格指南 + 计划文档 | ✅ 2026-11-24 | 文档评审 |
| T1 | `hp-hmi.ts` 调色板 | ✅ | typecheck |
| T2 | 8 图元描述符 + Vue 组件 + 注册 | ✅ | `pnpm test`、lint sweep |
| T3 | 图元测试（快照/props 对齐/jsdom 行为） | ✅ 43 项 | vitest |
| T4 | catalog 陈列室补全（每图元恰一次） | ✅ | `demo-screen.test` |
| T5 | `synthetic.ts`（设备/区域/全厂/点级优先级）+ binds `__` 排除 + nav `?dev=` | ✅ | vitest 13 项 |
| T6 | ViewView 接线（合成推送 + jump dev） | ✅ | vitest + e2e |
| T7 | `iot-catalog.ts`（10 设备 / 72 点模板 / 每台限值 / 显示量程） | ✅ | vitest |
| T8 | `iot-screens.ts` **15** 画面生成器（L3 一机一面板） | ✅ | vitest 78 项 + 快照 |
| T9 | protected 登记 + fixtures/global-setup 播种 | ✅ | protected.test |
| T10 | Lua 限值脚本 + `limit_alarm` 实例 + 启动对账 | ✅ 实例 running | `GET /alarms` fire/clear 实测 |
| T11 | e2e `iot-screens.spec.ts`（5 项） | ✅ 5 passed | e2e 绿 |
| T12 | dist 构建 + gateway 验证 + 截图走查（3 轮） | ✅ | 浏览器 10 张截图 |
| T13 | 全量门禁 + 文档回填 | ✅ | 见 §5 |
| T14 | **历史分析大屏 `iot-bi-station`**（深色分析层，14 面板真实点位） | ✅ | e2e 断言 KPI 有历史值 + 24h 趋势已绘 |
| T15 | **浅色历史趋势件 `ah-hist-trend`**（BI 通道 B 信封 → 操作层就地历史） | ✅ | 图元测试 + L1/L3 e2e 断言曲线已绘 |
| T16 | **设备模型死区按信号幅度修正**（压力/功率因数历史归档此前被 0.5 死区滤掉） | ✅ | `history?dev_id=dev_wm1&tag=pressure` 30min 内 14 点 |

## 5. 门禁

```bash
cd hmi-studio
pnpm test && pnpm run typecheck && node scripts/check-layers.mjs && pnpm -C mcp test
RSIOT_BASE=http://127.0.0.1:20000 pnpm e2e e2e/iot-screens.spec.ts
node node_modules/vite/bin/vite.js build   # 产物即 gateway hmi_dist
```

浏览器：`http://127.0.0.1:18080/hmi/view/<slug>`（gateway 统一登录）。

## 5.1 实施记录（2026-11-24）

- **L3 由 5 张参数化屏改为 10 张一机一面板**：每台表计的工程限值不同（wm2 压力基准 0.42、
  wm3 0.45；em1/2/3 负载 45/50/55 kW），一张参数化面板无法同时显示正确限值。`@dev` 重写管线
  保留（面板仍按 devs 激活），跨画面 `?dev=` 深链同样保留。
- **报警阈值贴近模拟器峰值**：初版阈值使 15~25 条告警常驻，违反 HP-HMI"正常灰阶"；
  收紧到峰值附近 + 布尔故障改为低频（`step.hold_s` 120/180s，值列表 9~15 个 false + 1 个 true），
  稳态 0~8 条、峰值短暂越限。
- **报警徽标语义修正**：`__sys.p1` 是"P1 条数"，不能当"优先级档位"绑定（组件 0-4 截断）；
  新增 `__sys.prio`（全厂最高优先级）供徽标，`__sys.p1` 保留为计数。
- **点级报警色**：值块原绑设备级 `__prio` 会让整台设备所有值变黄；改为
  `<devid>.<tag>.__prio`（合成点按告警 key 前两段聚合），只有真正越限的点变色。
- **限值未组态哨兵 `-99999`**：maotu props 必须有默认值，0 是合法限值；图元跳过哨兵档位。
- **显示量程 ≠ 模型量程**：压力变送器 0–5 MPa 全量程、工况 1.5–1.7，画面显示 0–2.5
  才看得清限值带；模型量程仍在 devmodel。
- **启动对账**：transform 重启丢 `fired` 表会留下孤儿告警；`on_timer` 分批 clear 全部规则 key
  （跳过本轮已 fire 的），详见 `rs-iot/docs/ops/iot-demo-limit-alarms.md`。
- **历史分析缺口的根因是死区不是画面**：设备模型给所有 f32 点位统一 `deadband=0.5`（绝对死区），
  水压(±0.04 MPa)、功率因数(±0.001)、变送器压力(±0.08 MPa) 的样本永远达不到死区 → 整条曲线
  不归档，BI 面板拿不到数据。已按信号幅度改死区（压力 0.005 MPa / 功率因数 0.002 / 频率 0.005…），
  模型改后即时生效（`devmodel/update` 整包替换，引用完整性预检）。
- **KPI 卡跨设备合计**：BI KPI 卡默认只显示首条序列（「今日用电量」会变成 1# 表的量）。
  契约层新增 `sum_series` 开关——面板声明后宿主把多条序列合成一条（label=面板标题，value=合计，
  点级按 ts 对齐求和），图元侧零改动。
- **L3 行距按实测取值**：紧凑值块高 24px 但行距 26px（底边框 1px + 画布间距 1px），布尔徽标行距
  28px；按名义高度排版会累计漂移压住最后一行（实测电表面板最后一行被历史趋势盖住）。
  L3 画布因此加高到 1280×900。

## 6. 已知取舍

- 设备是表计/传感器：faceplate 的 SP/OP/模式区默认关闭（`control=false`），不伪造控制回路。
- rs-iot 只有 clear 无 ack：活动报警闪烁、清除消失，不伪装确认态。
- 质量点为全局链路质量（`__sys.quality`），逐点 stale 判定不在本期。
- 阈值双处维护（Lua 判定 / TS 画面限值），两处注释互指。
- 编辑保存会丢 `meta.devs`（既有缺陷）：faceplate 内置 `ah-dev-selector` 作为兜底来源。
