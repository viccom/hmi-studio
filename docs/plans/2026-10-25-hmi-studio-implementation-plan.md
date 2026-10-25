# hmi-studio 实施方案（M1-M4）Implementation Plan

> **执行者注意**：本方案按任务逐条执行（配合 executing-plans 技能）。每任务 = 失败测试 → 最小实现 → 通过 → 提交。禁止跳过测试直接报"完成"。

**Goal**：基于 maotu 0.6.5 内核为 rs-iot 建成单 SPA 组态系统（编辑器 + 运行浏览器 + 数据/命令/告警三桥），以真实 rs-iot 实例验收。

**Architecture**：单 Vue SPA 由 gateway 挂 `/hmi` 与 rs-iot 同源；画面真相 = rs-iot `/api/v1/screens`（doc = `{name,group?,...IExportJson}`）；编辑器 `MtEdit`（deviceInfo 在线设备树），运行页 `MtPreview` + 页面骨架层；三桥（SSE 数据桥/命令桥/告警骨架）+ `$mtEventCallBack` 事件分发器实现容器内画面互跳。设计依据 `docs/plans/2026-10-25-hmi-studio-design.md`（v0.3，六决策锁定）。

**Tech Stack**：Vue3 + vue-router + element-plus + maotu@0.6.5 + @vueuse/core；vitest（纯逻辑单测）；@playwright/test（E2E，打真实 rs-iot）；vite。

---

## 0. 可行性基线（2026-10-25 全部实测核实）

| # | 事实 | 核实方式 |
|---|------|---------|
| F1 | 登录 `POST /api/v1/user/login` `{user_id,pass}` → `{status,token,user}`；admin/admin 有效；JWT 墙覆盖 `/api/v1/*` | curl 实测 |
| F2 | `GET /api/v1/devices` → 设备树（`{dev:{children:[{label,value(tag名),type}]}}`）；`GET /api/v1/tags` → 平铺 `{"rsiot.cpu_percent":{desc,...}}`；`GET /api/v1/rtdatas` → 嵌套 `{dev:{field:[ts,localTime,"value"]}}`，value 恒为字符串 | curl 实测 |
| F3 | SSE `GET /api/v1/rtdatas/subscribe?dev_id=a,b&interval=N&token=`；cell 同 F2 形态；ts 秒 | agent-hmi adapter + rs-iot 源码 |
| F4 | screens CRUD：`GET /screens`（id 列表）、`GET /screens/:id`→`{id,doc}`、`PUT /screens/:id`（全量，创建=PUT 新 id）、`DELETE` 幂等 | routes_meta.rs 实读 |
| F5 | maotu 绑定：`setDevicePointByID(bind_id,val)` 直写 bind_attr + 评估 triggers；`$mtEventCallBack(type,id,...args)`→`onEventCallBack` 透传；custom_code 有 window 访问 | hmi-studio probe 六项全过 |
| F6 | maotu 无原生画面跳转；事件动作 `changeAttr/customCode/eventFlow`；`ILeftAsideConfigItemPublic.events` 支持默认事件模板 | 0.6.5 bundle 全量 grep |
| F7 | 活数据可用：`rsiot.uptime_s`（单调增）、`rsiot.cpu_percent`、`rsiot.alarm_active`；命令 `POST /api/v1/command/send {instance,devid,cmd,data}` 需 `devid→inst_id` 解析 | curl + CommandReq 源码 |
| F8 | 环境：rs-iot 0.0.0.0:8790（pid 在跑）、gateway 0.0.0.0:18080、hmi-studio dev 5273 | ss 实测 |

**风险与对策**：① maotu SVG 复合图元内文本注入未验 → T11 首个图元即验，文本一律走内置文本图元；② SSE token 过期 → T5 重连时重登录换 token；③ 默认事件模板拖拽实例化未验 → T13 nav-button 首验，退路为使用文档提示手写一行 custom_code；④ 画面规模 N+1 列表 → T17 并发上限 + 后续 rs-iot 轻端点。

## 1. 可验证目标（Definition of Done）

| 门 | 判据（全部可执行验证） |
|----|----------------------|
| **G-M1** | `npx playwright test e2e/m1.spec.ts` 绿：登录 → 新建 `e2e-m1` → 拖入图元保存 → 刷新后图元仍在（done_json 等价）；`curl GET /screens/e2e-m1` doc.json 非空含 name。单测：screens wrap/unwrap round-trip、deviceTree value=`<devid>.<tag>` |
| **G-M2** | `npx playwright test e2e/m2.spec.ts` 绿：运行页绑 `rsiot.uptime_s` 的文本 3s 内数值变化（读 DOM 文本两次不等）；命令按钮弹确认 → 下发 → rs-iot 返回 ok（route 拦截断言 payload `{instance,devid,cmd:'write'}`）；nav 图元点击 → URL 变 `/view/<目标>` 且 `window.__navCount` 递增（无整页刷新）；SSE 断链（route abort）→ 状态灯 offline → 恢复后 online。单测：parseCell/collectBinds/命令状态机/告警合并/事件词表全绿 |
| **G-M3** | `e2e/m3.spec.ts` 绿：演示画面 ≥12 图元渲染（DOM 计数）；`cpu_percent` 阈值触发变色（对比两次截图色值或 attr）；告警横幅随 active 告警存在性显隐；图元 lint 单测 100% 通过 |
| **G-M4** | `npm run build` 零错误；dist 交 gateway `/hmi` 后 `http://172.27.199.30:18080/hmi/` LAN 可达且登录可用（Playwright 对 gateway origin 跑 m1 冒烟）；断线重连 UX + 命令历史 + 缩略图在位 |

## 2. TDD 策略

- **纯逻辑单测（vitest，先行）**：所有可函数化的契约——doc 包装、设备树构建、bind 收集、cell 解析/归一化、SSE 重连序列、命令状态机、inst 解析、告警合并、事件词表/历史栈、图元约定 lint。这些是 TDD 的主战场：**测试先于实现**，每个纯函数模块 `src/lib/*.ts` 与 `src/lib/*.test.ts` 同目录。
- **组件装配（typecheck + 少量断言）**：Vue 页面不搞 jsdom 深测（maotu 渲染依赖真浏览器 SVG→img），靠 `vue-tsc --noEmit` + E2E 覆盖。
- **E2E（Playwright，里程碑门禁）**：chromium 打真实 rs-iot（`RSIOT_BASE` env，默认 `http://127.0.0.1:8790`）；数据用 F7 活点；命令用 route 拦截断言 payload；SSE 断链用 `page.route` abort。
- **提交纪律**：红→绿→commit 一循环；E2E 门绿才允许合入下一里程碑任务。

## 3. 任务跟踪清单（执行时勾选并填 commit）

| ID | 任务 | 里程碑 | 验证 | 状态 | commit |
|----|------|--------|------|------|--------|
| T0 | 工程基建：目录/路由壳/API client/测试基座 | M1 | `npm test` 基线绿 | ☑ | c3d0c66..05c9e90 |
| T1 | auth composable + 登录页 + 路由守卫 | M1 | 单测 + E2E 登录段 | ☐ | |
| T2 | screens API 模块（wrap/unwrap/CRUD） | M1 | 单测 round-trip | ☐ | |
| T3 | 画面列表页（卡片墙+新建+删除） | M1 | E2E m1 列表段 | ☐ | |
| T4 | 编辑页（MtEdit+deviceInfo+存取 round-trip） | M1 | G-M1 全绿 | ☐ | |
| T5 | SSE 客户端（解析/归一化/重连/换 token） | M2 | 单测 | ☐ | |
| T6 | collectBinds + 运行页分发桥 | M2 | 单测 + E2E 数据段 | ☐ | |
| T7 | 命令桥（状态机/inst 解析/编辑态守卫） | M2 | 单测 + E2E 命令段 | ☐ | |
| T8 | 告警骨架（双源合并/横幅/抽屉） | M2 | 单测 + E2E 显隐段 | ☐ | |
| T9 | 事件分发器（词表/历史栈/容器内跳转） | M2 | 单测 + G-M2 全绿 | ☐ | |
| T10 | M2 E2E 汇总门 | M2 | G-M2 | ☐ | |
| T11 | 图元基建：注册管道 + 约定 lint + 首个图元（泵）验证文本注入边界 | M3 | lint 单测 | ☐ | |
| T12 | 图元批 1：阀×2/罐/液位计/流量计（fill 约定） | M3 | lint + 快照 | ☐ | |
| T13 | 图元批 2：电机/隔离开关/nav-button（默认事件）/值牌 | M3 | 默认事件实证 | ☐ | |
| T14 | 水处理演示画面组态入库 | M3 | G-M3 | ☐ | |
| T15 | M3 E2E 汇总门 | M3 | G-M3 | ☐ | |
| T16 | 主题(dark 默认)/状态栏/命令历史/断线 UX | M4 | E2E 断线段 | ☐ | |
| T17 | 缩略图 + 列表性能（并发上限） | M4 | 画面列表 E2E | ☐ | |
| T18 | build + gateway 部署 + LAN 验证 | M4 | G-M4 | ☐ | |

## 4. 任务详情

### T0 工程基建

**Files**: Create `src/lib/api.ts`、`src/router.ts`、`src/views/{LoginView,ScreenListView,EditView,ViewView}.vue`（空壳）、`src/pages/.gitkeep`；Modify `package.json`（+vitest,@playwright/test）、`src/main.ts`（挂 router + element-plus）；Create `playwright.config.ts`、`AGENTS.md`（仓库地图 ~30 行）；Move `src/probe.vue`→`src/dev/probe.vue`（研究资产归档位）。

**Step 1 失败测试** `src/lib/api.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, ApiError } from './api'

describe('api client', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })
  it('带 token 请求；401 抛 ApiError 并触发 onUnauthorized', async () => {
    localStorage.setItem('hmi_token', 'tok123')
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url.includes('/ok') ? new Response('{"a":1}')
        : new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const onUnauthorized = vi.fn()
    const client = api({ base: 'http://x', onUnauthorized })
    expect(await client.get('/ok')).toEqual({ a: 1 })
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer tok123' })
    await expect(client.get('/bad')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })
})
```

**Step 2** `npm test` → FAIL（api.ts 不存在）。**Step 3 最小实现** `src/lib/api.ts`：fetch 封装（base+JWT 头+非 2xx 抛 `ApiError{status,body}`+401 回调）、`npx vitest run` PASS。**Step 4** 路由壳四页 + main.ts 接线，`npm run dev` 手查 4 路由 200。**Step 5** `npm i -D vitest @playwright/test && npx playwright install chromium`；commit `feat: T0 工程基建——路由壳/api client/测试基座`。

### T1 auth + 登录页

**Files**: Create `src/lib/auth.ts`(+`.test.ts`)、`src/views/LoginView.vue`；Modify `src/router.ts`（守卫）。

测试先行（auth.ts）：`login()` 真形状 F1——POST `/api/v1/user/login` `{user_id,pass}` 存 token+user 到 localStorage；`logout()` 清空；`isAuthed()`。守卫：未登录访问非 /login → redirect /login。E2E（并入 m1.spec.ts 首段）：错误密码 401 提示；admin/admin 跳列表。commit `feat: T1 登录与路由守卫`。

### T2 screens API 模块

**Files**: Create `src/lib/screens.ts`(+`.test.ts`)。

**测试先行**（关键契约，全量代码）：

```ts
import { describe, it, expect } from 'vitest'
import { wrapDoc, unwrapDoc, blankScreen } from './screens'

it('wrap/unwrap round-trip：meta 与 done_json 同体，多余字段保留', () => {
  const done = { canvasCfg: { width: 800, height: 600 } } as any
  const doc = wrapDoc(done, { name: '取水1', group: '水处理' })
  expect(doc.name).toBe('取水1')
  const back = unwrapDoc(doc)
  expect(back.done.canvasCfg.width).toBe(800)
  expect(back.meta.name).toBe('取水1')
})
it('unwrap 容错：无 meta 的裸 done_json（历史/probe 数据）不炸', () => {
  expect(unwrapDoc({ canvasCfg: { width: 1 } } as any).meta.name).toBeUndefined()
})
it('blankScreen：800x600 深色画布 + 空 json 数组', () => {
  const d = blankScreen('test-1')
  expect(d.json).toEqual([])
  expect(d.canvasCfg.width).toBe(800)
})
```

实现 ≤40 行：`wrapDoc(done,meta)=>({...done,...meta})`、`unwrapDoc(doc)=>{done:剔除meta键, meta:{name,group}}`、`blankScreen(slug)`。再加 CRUD 薄封装（list/get/put/del 走 api client）。commit `feat: T2 screens 契约与 CRUD`。

### T3 画面列表页

**Files**: Create `src/views/ScreenListView.vue`、`src/lib/screen-list.ts`(+`.test.ts`)。

`loadScreenCards()`：GET ids → 并发上限 6（`Promise.all` 分批）GET 各 doc → `{id,name,group}`[]（并发分批器做成纯函数并单测批大小/顺序）。UI：el-card 网格；新建对话框（slug 校验 `^[a-z0-9-]+$` + 名称）→ PUT blankScreen；删除 el-popconfirm → DELETE → 刷新。E2E 断言：新建后卡片出现、删除后消失。commit `feat: T3 画面列表`。

### T4 编辑页（G-M1 主战场）

**Files**: Create `src/views/EditView.vue`、`src/lib/device-tree.ts`(+`.test.ts`)；Modify `src/App.vue`（改造为编辑容器或由 EditView 承载 MtEdit）。

**测试先行** `device-tree.test.ts`（F2 实测形状）：

```ts
it('devices+tags → maotu IDeviceInfo 级联，叶子 value=完整 field', () => {
  const devices = { rsiot: { children: [{ label: 'cpu_percent', type: 'float', value: 'cpu_percent' }] } }
  const tree = buildDeviceTree(devices as any)
  expect(tree).toEqual([{ label: 'rsiot', value: 'rsiot', children: [
    { label: 'cpu_percent', value: 'rsiot.cpu_percent' } ] }])
})
it('点位无 children（叶即点）与多余字段过滤', () => { /* ... */ })
```

EditView 装配：mount 时 `buildDeviceTree`（在线拉 devices，F5 在线原则）→ `MtEdit :deviceInfo` ；`onSaveClick` → `PUT /screens/:id`（wrapDoc）；进入时 GET → `setImportJson`。图元注册从 `App.vue` 现有 registerConfig 迁入 `src/symbols/index.ts`（先 4 个试验图元）。**G-M1 验收**：跑 `e2e/m1.spec.ts`（新建→拖图元→保存→reload→断言 done_json 等价，对比 `GET /screens/e2e-m1` 两次 doc.json 深等）。commit ×2（device-tree / EditView+G-M1 绿）。

### T5 SSE 客户端

**Files**: Create `src/lib/sse.ts`(+`.test.ts`)。

**测试先行**（全契约）：

```ts
it('parseCell：字符串值归一化——数字串→number，JSON 串→对象，状态串保持', () => {
  expect(parseCell('12.5')).toBe(12.5)
  expect(parseCell('"RUN"')).toBe('RUN')
  expect(parseCell('true')).toBe(true)
  expect(parseCell('{"a":1}')).toEqual({ a: 1 })
})
it('cell 行 [ts,localTime,value] → {field,value:归一化}', () => {
  expect(toPoint('rsiot.cpu_percent', [1792941675, '2026-10-25 23:21:15', '0'])).toEqual(
    { field: 'rsiot.cpu_percent', value: 0 })
})
it('backoff：1s,2s,4s...封顶 30s；成功后复位', () => {
  const b = backoff(); expect(b.next()).toBe(1000); expect(b.next()).toBe(2000)
  expect(b.next()).toBe(4000); b.reset(); expect(b.next()).toBe(1000)
})
```

实现：`createRtdataStream({base,token,getDevs,onPoint,onState})`——EventSource（`?dev_id=&interval=1000&token=`）、onmessage 逐行 JSON → `{dev:{field:cell}}` 展开 → toPoint → onPoint；onerror → backoff 重连，第 3 次起调 `relogin()` 换 token（F1）再试；onState('online'/'offline')。commit `feat: T5 SSE 客户端`。

### T6 collectBinds + 运行页分发桥

**Files**: Create `src/lib/binds.ts`(+`.test.ts`)、`src/views/ViewView.vue`。

`collectBinds(doneJson)`：递归 children，收集 `binds[].bind_id` 去重 → `{fields:string[], devs:string[]}`（dev=field 前段去重）。测试：多图元/嵌套 group/空。ViewView：`<MtPreview ref>` + mounted 订阅（devs）→ onPoint → `preview.setDevicePointByID(field, value)`；未命中字段（bind 集内有、流里长期无）计入 `deadFields` 供状态栏。E2E 数据段：绑 `rsiot.uptime_s` 文本图元，读 DOM 文本两次断言变化。commit ×2。

### T7 命令桥

**Files**: Create `src/lib/command.ts`(+`.test.ts`)、`src/lib/device-registry.ts`(+`.test.ts`)；Modify ViewView/EditView。

**测试先行**（状态机——agent-hmi CommandTracker 语义）：

```ts
it('pending→confirmed / →error / →timeout(5s) 单向迁移；终态不可再迁', () => {
  const t = new CommandTracker('c1'); expect(t.state).toBe('pending')
  t.confirm(); expect(t.state).toBe('confirmed')
  expect(() => t.error('x')).toThrow(/终态/)
})
it('resolveInstance：设备注册表 devid→inst_id；缺表抛 CommandError("未知设备")', () => { /* mock 表 */ })
it('buildCommandReq：{instance,devid,cmd:"write",data:JSON.stringify({tag,value})}', () => {
  expect(buildCommandReq({ inst: 'modbus-1', devid: 'pump1', tag: 'spd', value: 800 }))
    .toEqual({ instance: 'modbus-1', devid: 'pump1', cmd: 'write', data: '{"tag":"spd","value":800}' })
})
```

`window.$rsiot.send(devid,tag,value)`：ElMessageBox 确认（含 D6 编辑态双按钮「取消/真实下发」）→ POST → Tracker 更新 → ElMessage 结果 → 命令历史（环形 20 条）。E2E：route 拦截 `/command/send` 断言 payload。commit ×2。

### T8 告警骨架

**Files**: Create `src/lib/alarms.ts`(+`.test.ts`)、`src/components/AlarmBanner.vue`、`AlarmDrawer.vue`；Modify ViewView。

**测试先行**（双源合并——agent-hmi subscribeAlarms 语义移植）：

```ts
it('初始快照 + SSE 增量：同 id 去重（后到覆盖），按时间倒序，active 优先', () => {
  const s = new AlarmStore()
  s.applySnapshot([{ id: 'a1', level: 'warn', ts: 100, state: 'active' }])
  s.applyEvent({ id: 'a1', level: 'warn', ts: 105, state: 'active', text: 'x' })  // 覆盖
  s.applyEvent({ id: 'a2', level: 'crit', ts: 106, state: 'active' })
  expect(s.active().map(a => a.id)).toEqual(['a2', 'a1'])
})
it('confirm(id) 后从 active 剔除、入历史；轮播索引在 confirm 后收敛', () => { /* ... */ })
```

数据源：`GET /api/v1/alarms?status=active` + `/api/v1/events?types=alarm` SSE；横幅轮播 5s（`useIntervalFn`）；抽屉确认 `POST /api/v1/alarms/.../confirm`（以 rs-iot 实际路由为准，T8 开工时 curl 核实并回填此处）。E2E：active>0 横幅可见 / =0 隐藏。commit ×2。

### T9 事件分发器 + 容器内跳转

**Files**: Create `src/lib/nav.ts`(+`.test.ts`)；Modify ViewView。

**测试先行**：

```ts
it('词表分发：nav(target)/back/home 命中；未知 type 落 onUnknown 并计数', () => {
  const h = vi.fn(); const d = createDispatcher({ onNav: h, onBack: vi.fn(), onHome: vi.fn() })
  d.dispatch(['nav', 'item-1', 'water-2']); expect(h).toHaveBeenCalledWith('water-2', 'item-1')
  expect(() => d.dispatch(['fly', 'x'])).not.toThrow()
})
it('历史栈：nav 压栈；back 弹栈返回；空栈 back 回 home；重复画面不压栈', () => { /* ... */ })
```

ViewView：`@onEventCallBack="(type,id,...rest)=>d.dispatch([type,id,...rest])"`；onNav → GET doc → `setImportJson` + `router.replace` + **SSE 重订**（先 close 旧流再按新 collectBinds 订阅）+ `window.__navCount++`（E2E 钩子）。`window.$rsiot.nav/back/home` 同源走 dispatcher。**G-M2 验收**：`e2e/m2.spec.ts` 全绿。commit ×2。

### T10 M2 E2E 汇总门

`e2e/m2.spec.ts` 整合 T6-T9 断言 + SSE 断链重连段（`page.route('**/rtdatas/subscribe*', route=>route.abort())` → 状态灯 offline → unroute → online）。跑绿后勾 G-M2。commit `test: T10 M2 门禁全绿`。

### T11 图元基建 + 首图元（泵）

**Files**: Create `src/symbols/{index.ts,types.ts,pump-centrifugal.ts}`、`src/lib/symbol-lint.ts`(+`.test.ts`)；Modify EditView/ViewView（注册管道接入）。

`symbol-lint`（约定优于配置的机械化——F 系约定）：

```ts
it('状态图元必含 fill 色属性；动画图元必含 animation；ports 仅 leftBottom/rightBottom；svg 含 viewBox 与宽高', () => {
  for (const s of allSymbols()) expect(lintSymbol(s)).toEqual([])
  expect(lintSymbol(brokenSymbol)).toContain('FILL_MISSING')  // 反例
})
```

泵图元：SVG 根属性 `fill` 驱动 + `animation`（CSS 类旋转，由 maotu common_animations 或 props 控制——T11 实证并固化写法）；**文本注入边界验证**：临时在 SVG 内放 `<text>{{text}}</text>` 型 prop，确认 maotu 是否展开——不展开则确认"数值一律用内置文本图元"约定并删除该 text prop。每图元 vitest 快照（ILeftAsideConfigItemPublic 结构 hash）。commit `feat: T11 图元基建+离心泵`。

### T12-T13 图元批 1/2

T12（fill 约定族）：闸阀/蝶阀/罐/液位计/流量计——罐与液位计的"液位高度"用 `props.h.val` 绑连续值（probe 同款 bind_attr 直写路径，T11 固化的写法）。T13：电机（animation）/隔离开关（fill 二值）/**nav-button**（`target` prop + 默认 click 事件模板 `$mtEventCallBack('nav', $item_info.id, target)`——**F6 退路**：若拖拽不带事件，则注册后用 maotu setItemAttrByID 补挂，或文档指引手写一行）/值牌（内置文本图元包装预设）。每图元：lint + 快照 + 编辑器手查一次拖入。commit 各一批。

### T14-T15 演示画面 + M3 门

手工组态"水处理-取水泵房"画面入 rs-iot（≥12 图元、≥3 绑定、≥1 nav、≥1 命令按钮）；`e2e/m3.spec.ts`：图元计数、`cpu_percent` 阈值变色（断言 SVG 属性色值变化）、横幅显隐、容器内跳转。G-M3 勾选。commit ×2。

### T16-T18 M4 打磨与部署

T16：dark 默认（`useThemeToggle` 初始 dark + element-plus dark CSS 变量对齐骨架层）、状态栏（在线灯/订阅点数/deadFields/命令历史抽屉）。T17：缩略图（列表卡片内 MtPreview 小尺寸 scale 渲染，懒加载 IntersectionObserver）+ 并发上限降到 4。T18：`npm run build` → dist 拷 gateway `hmi_dist` → 重启 gateway → LAN `http://172.27.199.30:18080/hmi/` 跑 m1 冒烟（Playwright 对 gateway origin）→ G-M4 勾选。commit ×3。

## 5. 执行纪律

1. **顺序**：T0→T18 串行（T12/T13 内部可并行批）；每个里程碑门（G-M1/M2/M3/M4）是硬闸门，绿了才进下一里程碑。
2. **跟踪**：每任务完成即更新 §3 表格（勾选 + 填 commit hash），与代码同 commit——本文件就是任务跟踪记录清单。
3. **TDD 红线**：纯逻辑模块测试必须先行（红→绿留痕）；E2E 是里程碑验收不是日常开发循环；`vue-tsc --noEmit` 每任务跑一次。
4. **不确定即停**：F 系事实若与实测不符（如 alarms confirm 路由），先 curl 核实、回填本方案对应行，再继续。
5. **worktree**：执行阶段开 `hmi-studio-w` worktree（≥3 commit/≥5 文件长任务），日常小修在 master。
