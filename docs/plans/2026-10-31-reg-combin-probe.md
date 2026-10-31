# P3a reg-combin 探针报告（设计 §6.1 三问）

> 建立时点 2026-10-31。探针页 `/dev/probe-combin`（src/dev/ProbeCombin.vue）+
> e2e `e2e/probe-combin.spec.ts` + maotu bundle 静态取证（node_modules/maotu/dist/maotu.es.js）。
> 证据类型：〔bundle〕静态代码引证 /〔DOM〕浏览器实测 /〔payload〕Ctrl+S 保存载荷。

## 结论速览

| 问 | 结论 | 证据 |
|---|---|---|
| (a) registerConfig reg-combin + combin_json 能否注册拖入 | **能**，但语义 = **模板批量插入**（拖入即自动解组展开为独立图元），**不是持久组合体** | bundle @1093181 插入分支尾 `XM(...)`（解组函数）调用；payload 顶层为独立 svg 项 |
| (b) maotu 自带「框选→组合」入口 | **有**：工具栏「组合/取消组合」按钮（i[title]）+ 右键菜单 + Ctrl+G/Ctrl+U；产出 `type:'group'` 项 | bundle @1077474 菜单配置；组合按钮点击后 payload 顶层收敛单 group |
| (c) 组合项 props/binds 归一化行为 + 宿主读取面 | 画布项持有**描述符 props + 私有 symbol 部分**；保存时拍平 props、剥 symbol（types.ts ⑤ 契约）；拖入展开后 **binds 原样保留**、binfo 百分比→绝对；`#deviceBind` 槽位给 **store 响应式选中项**（画布内存形态） | payload 实测对比 + BindPanel 头注释先例 |

## 细节（实现必读）

### 1. combin_json 的确切形状 = Ctrl+G 组合产物

```jsonc
{
  "id": "group-<Ks()>", "title": "组合", "type": "group", "tag": "group",
  "binfo": { left, top, width, height, angle },          // 包围盒（拖入时 left/top 换落点）
  "resize": true, "rotate": true, "lock": false, "active": true, "hide": false,
  "use_proportional_scaling": true,
  "props": {}, "common_animations": { val: "", delay: "delay-0s", speed: "slow", repeat: "infinite" },
  "children": [ /* 画布内存形态子项 */ ],
  "events": [], "ports": []
}
```

children（svg 型）必带三样，缺一即渲染崩（`symbol_id of undefined`，实测踩到）：

1. **私有 symbol 部分** `{ symbol_id, symbol_str, width, height }`——画布 svg 渲染直读
   `itemJson.symbol.symbol_id`（bundle @1044977，无守卫）。构造法：把 registry 定义喂
   `registerConfig` 后从 `leftAsideStore.config` 读回（FP/kf 归一化自动补）。
2. **描述符形态 props** `{fill:{title,type,val}}`（画布内存形态；保存时才拍平）。
3. **百分比 binfo**（相对 group bbox 的 0-100；Ctrl+G 产物坐标系；拖入解组时 PA 转回绝对）。

### 2. 拖入 = 插入即解组（关键语义修正）

bundle @1093181：`{...combin_json, id: regId-Ks, binfo:{...combin_json.binfo, left/top: 落点}}`
push 进 done_json 后**立刻调 XM（解组）** → children 提升为顶层独立图元、binfo 百分比→绝对、
逐项 id 加 Ks 后缀、**binds 原样保留**（实测 `pc-b1` 完整到达保存载荷）。

**对设计 §6.1 的偏差**：设计假设「组合即一个带子树的图元（持久）」；实证 reg-combin 是
**图库模板**语义（拖入展开、逐项独立可编辑）。持久组合只有 Ctrl+G（画布内）。
落地取向（T8）：「我的符号」= 模板库——这正是组态软件图库的经典语义，比持久组合更实用
（拖入即可局部改任意一件）；组合需求走内置 Ctrl+G。**无需降级重估，按模板语义实现。**

### 3. 「存为符号」的载荷来源 = 槽位项克隆（或保存载荷的 group 项）

`#deviceBind` 槽位（MtEdit 唯一内容插槽）随选中项渲染 store 响应式对象（BindPanel 依赖同款，
EditView 实证）。选中一个 group 项（Ctrl+G 产物）→ 槽位 `item` 即画布内存形态 group 项
（children 带 symbol 部分 + 描述符 props + 百分比 binfo）——**深克隆即合法 combin_json**，
零手工构造。非 group 项（单图元）也可存（combin_json = 包一层 group：children=[item]，
binfo 取其 binfo）。

**保存载荷同样可用**（实测修正）：拍平只作用于顶层项——group 的 children 在保存 doc 里
**原样保留 symbol 私有部分 + 描述符 props + 百分比 binfo**（顶层 svg 项则 props 拍平、
symbol 剥离）。即从 GET /screens 的 doc 里取 group 项直接就是合法 combin_json，
「存为符号」两条来源（槽位实时项 / 已存 doc）皆通。

### 4. e2e 驱动备忘（后续 e2e 复用）

- 左面板 = el-collapse **懒渲染**：先点组头展开，项 = `[draggable=true]` 40×40（title 不进 DOM 文本）
- 拖入 = HTML5 DnD（`dragTo(#mtCanvasArea, {targetPosition})`；mousedown 序列无效——
  左面板挂 onDragstart 而非 onmousedown）
- 画布项断言：`#mtCanvasArea img[src^="data:image/svg+xml"]`（types.ts ① dataURI 渲染）
- 工具栏按钮 = `.el-header button:has(i[title="组合"|"保存"])`；Ctrl+S 无效（未绑全局热键）
- 框选 = 空白处 mouse.down → 拖框 → up；全局 store 不导出，画布内容取证走保存按钮 payload
