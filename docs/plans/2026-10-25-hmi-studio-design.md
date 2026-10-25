# hmi-studio 设计（v0.2 草案，讨论中）

- 日期：2026-10-25（v0.1 同日；v0.2 吸收三问质询修订）
- 状态：六决策锁定（v0.2 新增 D4-D6）；细节待继续讨论
- 输入：`docs/maotu-rsiot-architecture.md`（maotu 0.6.5 绑定模型实证 + 概念映射）、agent-hmi W1-W6 经验（已封版 `archive-v0.6.0`，作为视觉参考与桥层代码移植源）
- 图例：🔒=用户已锁定；⚖️=设计推荐待确认；❓=开放问题
- 变更（v0.2）：撤前端角色分权（D4 重述）；画面 CRUD/互跳细化（§5 扩充）；全面在线原则确立 + 编辑态命令从 mock 改显式选择（D5/§4 修订）

## 0. 定位

基于 maotu（闭源 npm 版）组态内核，为 rs-iot 构建 HMI 组态编辑器与画面运行浏览器。替代 agent-hmi 的自研编辑器/浏览器主线。

## 1. 已锁定决策 🔒

| # | 决策 | 内容 |
|---|------|------|
| D1 | 应用形态 | 单 Vue SPA；一个 dist 交 gateway 挂 `/hmi`，与 rs-iot 同源部署 |
| D2 | 图元策略 | **手工重建，不做迁移转换器**；agent-hmi 90 图元仅作视觉参考；按画面需求长线添加 |
| D3 | 告警呈现 | 页面骨架层（顶部横幅轮播 + 侧滑抽屉），不进 maotu 画布 |
| D4 | 账号体系 | **零自有用户/角色**。登录即 rs-iot 登录（gateway `/api/gw/login` → JWT）；`/edit` 对所有已登录用户开放；控制权在服务端 API（将来 rs-iot 加权限则 403 透传 + 按钮可见性跟随，前端零自有权限逻辑） |
| D5 | 在线原则 | 设备模型/标签点**全程在线实时**取自 rs-iot，无导出快照、无离线模式、无 mock 数据；编辑与运行用同一寻址 `<devid>.<tag>`，零转换 |
| D6 | 编辑态命令 | 点击命令图元弹「取消 / 真实下发」显式选择——不 mock、不误触 |

## 2. 总体架构与路由 ⚖️

```
/login        登录（gateway JWT → localStorage）
/             画面列表：卡片墙（名称+缩略图）；常驻"新建画面"
/view/:id     运行页：MtPreview + 页面骨架层（横幅/状态栏/导航栏/抽屉）
/edit/:id     编辑页：MtEdit + deviceInfo 设备树（在线拉取）
```

- 与 rs-iot 同源部署：无跨域，SSE 走 `?token=`
- 画面存储：`onSaveClick` → `PUT /api/v1/screens/:id`，doc = `{name, group?, ...IExportJson}`；加载 `GET /screens/:id` → `setImportJson` 还原。rs-iot 对 doc 零感知（已实证任意 JSON 可存）

## 3. 数据链路：SSE 桥 + 告警骨架 ⚖️

**SSE 桥**（运行页 mounted）：

1. 遍历 `done_json` 收集 `binds[].bind_id`（`<devid>.<tag>`）→ 去重出 dev 集合
2. 一条 SSE：`/api/v1/rtdatas/subscribe?dev_id=a,b&interval=N&token=`；cell 为 `[ts, localTime, value]`（ts 秒、value 字符串化 JSON）
3. 数值归一化（数字串→number，状态串保持）→ `setDevicePointByID(bind_id, val)` 批量分发
4. 双通道语义（probe 实证）：先直写 `bind_attr`（连续量），再评估 `triggers`（离散规则）

断线：指数退避重连；骨架层状态灯（在线/离线/订阅点数）；绑定但无数据的点在状态栏可查。

**告警骨架**：初始 `GET /api/v1/alarms?status=active` + 事件 SSE（`/api/v1/events?types=alarm`）增量，双源合并（agent-hmi subscribeAlarms 逻辑移植）。横幅轮播最新未确认告警（级别色，多条 5s 轮换）；点击展开抽屉：活动列表/确认/历史。

## 4. 命令链路 ⚖️

window 全局 `$rsiot`：运行页注入真实现；编辑态注入同实现 + 编辑态守卫（弹「取消/真实下发」而非静默拦截）。

- `$rsiot.send(devid, tag, value)` — ElMessageBox 二次确认（点名/值/目标设备）→ 桥内从在线设备注册表解析 `devid → inst_id` → `POST /api/v1/command/send {instance, devid, cmd:'write', data:JSON}` → CommandTracker（pending→confirmed/error/timeout，agent-hmi 移植）→ toast + 状态栏命令历史
- `$rsiot.nav('screen-slug')` 画面跳转；`$rsiot.back()` 上一画面；`$rsiot.home()` 回列表
- `$rsiot.prompt('devid','tag')` — 弹数值输入框（配 maotu input/change 事件）
- 图元 custom_code 只写一行调用，复杂度收在桥里
- 编辑器「预览」（onPreviewClick）→ 新窗口打开 `/view/:id` 真实运行页，所见即所运行

## 5. 画面管理：增删改与互跳 ⚖️

rs-iot screens API（`routes_meta.rs` 实测形状）：`GET /screens`（id 升序列表）、`GET /screens/:id → {id,doc}`、`PUT /screens/:id`（全量覆盖，创建=PUT 新 id，无 POST）、`DELETE`（幂等）。

- **新建**：列表页输入 slug id + 名称 → 空白 done_json → PUT。id 规则：URL 友好 slug（互跳引用稳定）
- **保存**：编辑器 onSaveClick → PUT 全量（含 name/group meta）
- **删除**：卡片删除（确认弹窗）→ DELETE
- **列表**：GET 全部 id → 并发 GET 各 doc 拼卡片（量级几十可接受 ❓画面过百时给 rs-iot 加轻量 meta 列表端点，后续项）
- **互跳**：运行页骨架层常驻导航（画面切换下拉/平铺）；图元 click custom_code 调 `$rsiot.nav/back/home`。编辑器侧栏提供当前画面 slug 清单供抄写
- 画面真相在 rs-iot DB，保存即生效 ❓是否需要发布隔离（draft/publish）待议

## 6. 图元工作流：手工重建 + 绑定友好约定 ⚖️

`src/symbols/` 每图元一个 ts 文件，export `ILeftAsideConfigItemPublic`，启动时 `registerConfig` 分组注入。deviceInfo 每次编辑器 mount 在线构建：`/api/v1/devices` 设备 → `/api/v1/tags` 点位（glob `<devid>.<tag>`），树节点 value 即 field 全格式，选中即 bind_id。

约定优于配置：

- 状态图元统一暴露 `fill`（状态色）——绑 `props.fill.val` + triggers 变色
- 旋转/动画类统一 `animation` 属性，triggers 控制启停
- 数值显示不进复合图元：内置文本图元单独绑 `props.text.val`（❓SVG 复合体内文本注入机制需实现期验证一次）
- ports 规范 leftBottom/rightBottom，工艺连线用 maotu 系统线

首批按水处理演示画面需要 ~12 个：离心泵/潜水泵、闸阀/蝶阀、罐、液位计、流量计、电机、隔离开关、值牌、管线。

## 7. 主题 ⚖️

maotu `useThemeToggle` 明暗切换，骨架层 CSS 变量跟随 element-plus dark，工业默认深色。缩略图 v1：MtPreview 小尺寸渲染（❓卡片量大时性能待验证）。

## 8. 质量门禁与测试 ⚖️

agent-hmi G1 五道静态门为"Agent 盲写 JSON"而设，人工组态下**退役**。替代：

- 运行时契约：bind_id 不在订阅集→状态栏提示；画面 404/SSE 断线→显式状态
- 桥层 vitest 单测：cell 解析/归一化/分发、命令状态机、告警双源合并、devid→inst_id 解析
- 一条 Playwright 冒烟：演示画面数据驱动变色

## 9. 里程碑

| # | 内容 | 验收 |
|---|------|------|
| M1 | 登录 + 画面列表 + 编辑保存/加载 round-trip | rs-iot 真实 CRUD 存取 done_json |
| M2 | 运行页：SSE 桥 + 骨架层 + 命令桥 | 真实数据驱动变色 + 命令下发闭环 + 画面互跳 |
| M3 | 12 图元 + 水处理演示画面 | 全流程演示（浏览/告警/命令/跳转） |
| M4 | 主题/断线重连/命令历史/缩略图打磨 | — |

## 10. 风险与开放问题

- SSE token 过期后的重连取新 token 机制
- custom_code eval 环境：受控方（已登录用户组态）可接受，`$rsiot` API 面保持最小
- maotu SVG props 注入对复合图元内文本的支持细节（M3 前验证）
- 画面规模增长后的列表端点与缩略图性能
- echarts 趋势图（已装依赖）：v1 是否引入待议
