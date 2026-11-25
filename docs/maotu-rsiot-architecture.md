# maotu × rs-iot HMI 架构（深度研究结论，2026-10-25）

> 研究方法：包自带 d.ts（101 文件全量）+ 0.3.1 开源同源码比对 + 0.6.5 运行时黑盒探针
> （探针结论见 §1，全部实测通过）。授权事务由使用者与作者直接对接，本仓不涉及。

## 1. 实测结论（Playwright 黑盒探针，probe.vue）

| # | 验证项 | 结果 |
|---|---|---|
| A | `MtEdit` 挂载 + `registerConfig` 注入自有 SVG 符号 | ✅ 面板缩略图正常 |
| B | `setDevicePointByID('rsiot.cpu_percent', 91)` → trigger(>80) → changeAttr | ✅ fill 变 #ff4d4f |
| C | 点位值 50（阈值下）→ 先**直写 bind_attr** 再求值 trigger | ✅ 值 50 落入 props.fill.val |
| D | `setItemAttrByID('p1','props.fill.val','#409eff')` 直改 | ✅ |
| E | click 事件 `custom_code` 执行（eval，含 window） | ✅ |
| F | `onEventCallBack` emit | 仅 custom_code 显式调 `$mtEventCallBack(...)` 才回传 |

**绑定模型语义（C 实证）**：`bind_attr` = 连续量直通通道（写原始值，数值显示用）；
`triggers[]` = 离散规则通道（operator/value → changeAttr/customCode，状态变色用）。
与 agent-hmi 的 BindingSpec（prop 直通）+ rules（求值）双通道设计一一对应。

## 2. 概念映射（maotu ↔ rs-iot ↔ agent-hmi 资产）

| maotu | rs-iot | agent-hmi 可复用资产 |
|---|---|---|
| `bind_id`（绑定标识） | `<dev>.<tag>`（如 rsiot.cpu_percent） | BindingSpec keys |
| `bind_attr`（值直通） | SSE datachange 值 | value-text 语义 |
| `triggers[].rule`（operator/value） | —（画面侧规则） | defaultRules 翻译源 |
| `changeAttr`（target_attr=props 路径） | — | state 组显隐 → 用 fill/display 等属性近似 |
| `custom_code`（click） | `POST /api/v1/command/send` | 桥：`window.$rsiot.sendCommand(...)` |
| `IDeviceInfo` 树（编辑器设备绑定面板） | 设备/标签树（devreg/tag effective） | — |
| `IExportJson`（done_json 文档） | lux `screen:{id}` 存 rs-iot screens CRUD（W-2 已有，存任意 JSON） | ScreenDoc→done_json 转换器 |
| MtPreview `setDevicePointByID` | SSE `/rtdatas/subscribe` 推送 | adapter-rsiot 复用 |
| mt-event-flow（九节点可视化逻辑） | 可选：映射 rs-iot Lua 边缘脚本或纯客户端联动 | — |

## 3. 架构

```
┌─ 编辑器页（/）────────────────────────────┐
│ MtEdit(deviceInfo=rs-iot 设备树)           │
│  ├ 符号面板：agent-hmi 90 图元（转换器）    │
│  ├ 设备绑定面板：选 dev.tag → binds[]       │
│  ├ 触发规则面板：operator/value→changeAttr  │
│  └ onSaveClick(done_json) → PUT /screens   │
└──────────────────────────────────────────┘
┌─ 浏览器页（/view/:id）────────────────────┐
│ MtPreview(exportJson=GET /screens/:id)     │
│  ├ rs-iot SSE ──▶ setDevicePointByID 批推  │
│  ├ click custom_code ──▶ $rsiot.sendCommand│
│  │    （二确/审计/超时逻辑在桥层）           │
│  └ $mtEventCallBack ──▶ 宿主导航/弹窗       │
└──────────────────────────────────────────┘
存储：rs-iot lux screen:{id}（done_json 原样）＋ git 导出备份
```

要点：
- **done_json 为唯一编辑真相**（不再维护 ScreenDoc 双格式——那是 agent-hmi 路线的历史）。
  G1 式校验后置为「保存前 lint」：bind_id 必须在设备树、trigger 必须有 target 等。
- **命令桥**：`window.$rsiot = { sendCommand, confirm }`，custom_code 里调用；
  桥层实现二次确认弹窗 + /command/send + 审计（复用 agent-hmi CommandTracker 思路）。
- **SSE→点推**：adapter-rsiot 订阅 → 按 bind_id 分发 setDevicePointByID（可批量 setItemAttrs）。
  客户端过滤逻辑照搬（tag= contains 不可靠）。
- **告警**：alarm-banner/list 以 maotu custom-component 形式注入（vue 类型符号），
  数据仍走 /api/v1/alarms + events SSE。

## 4. 实施顺序

1. **符号迁移**：agent-hmi 90 件 manifest→maotu 符号（svg + props + ports + 默认 binds 模板）
   一次性转换器；状态组（ah-state）语义降级为 fill/opacity 属性触发（探针 C 语义）。
2. **编辑器页**：deviceInfo 喂 rs-iot 设备树 + 保存落 lux + 画面列表。
3. **浏览器页**：SSE 桥 + 命令桥 + 登录（rs-iot cookie/JWT，同源经 gateway）。
4. **告警组件** + 水处理演示画面重做（在 maotu 里）。
5. agent-hmi 仓降级为「符号工厂 + 工具链」继续供图元（或并入本仓 tools/）。

## 5. 风险与已知边界（技术侧）

- 闭源停更：bug 只能绕（例如 F 项 onEventCallBack 需 custom_code 配合）。
- eval 执行链（custom_code/事件引擎）：编辑保存面要加 lint（禁 fetch 外域等）。
- SVG→img(dataURL) 渲染：无 DOM 级动画控制（flash 用 maotu common_animations 近似）。
- mt-event-flow 的 timer/http 在预览端执行——真设备联动仍应走 rs-iot 侧脚本。

## 6. 增补：画面真相源两层模型与合成点位（2026-11-25）

### 6.1 生成器（git）↔ 画面文档（lux）

- **生成器** = `src/screen-assets/*.ts` 纯函数（demo/home/bi/iot 系列），用 TS 逐元素构造
  maotu `done_json`——与编辑器保存产物同构，字段与绑定形状由 `HmiSymbol`/`IExportDoneJson`
  类型约束。**SPA 产物不含生成器**；它只在 vitest / e2e 播种 / hmi-mcp 三个 Node 场景执行。
- **画面文档** = lux `/api/v1/screens/<slug>`，编辑器/浏览器的唯一运行时数据。
  编辑器手工改动只落 lux，不回写 git；e2e global-setup 会用生成器输出**覆盖**受保护
  画面（PUT 幂等）——手工调整要长期保留必须回移植生成器或存「我的符号」。
- 仓库里的 `__snapshots__/*.snap` 是生成结果的完整 JSON 基线（回归防线），
  字面上也包含画面 JSON，但身份是测试资产。

### 6.2 宿主合成点位（`src/lib/synthetic.ts`）

活动告警清单（AlarmStore）与 SSE 链路状态对画布不可见，故宿主把它们翻译成可绑定的
"点"，走与 SSE 相同的 `setDevicePointByID` 直写通道，**不新增网络请求**：

| 字段 | 含义 |
|---|---|
| `<devid>.__prio` / `<devid>.__alarms` | 设备最高优先级（0-4）/ 活动告警条数 |
| `<devid>.<tag>.__prio` | **点级**优先级（值块/面板只染真正越限的点） |
| `__area.<area>.alarm_count/.prio` | 区域聚合（water/power/gas/env） |
| `__sys.prio/.alarms/.p1/.quality` | 全厂优先级 / 总数 / P1 数 / 链路质量 |

规则：`__` 开头的 bind_id 不进 SSE 订阅面也不计 deadFields（`binds.ts`）；
优先级映射 error→P1 / warn→P3 / info→P4；推送时机 = 告警快照/增量/清理后、
SSE 状态变化后、画面装载后——保证"清除后写回 0"，不残留最后报警颜色。
告警判定源在 rs-iot 侧 `scripts/limit-alarm`（见该仓 ops 文档），HMI 只显示结果。
