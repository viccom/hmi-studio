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
