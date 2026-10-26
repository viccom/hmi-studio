import { rsiotPutScreen } from './helpers'
import { buildDemoScreen, buildCatalogScreen, DEMO_CATALOG } from '../src/lib/demo-screen'

/**
 * M2 数据段种子画面（T6）——形状全部来自 2026-10-25 编辑器/BindProbe 实测：
 * - 文本图元 = maotu 内置「系统组件·文字」（tag text-vue，type vue）；props 为平面值
 *   （text/fill/fontFamily/fontSize/vertical），导入后 maotu 运行时归一化为描述符形
 *   （props.text.val）——故 bind_attr 必须写 props.text.val（写 props.text 会砸掉描述符）。
 * - bind 结构 = src/dev/Probe.vue 实证：binds[].bind_id/bind_attr/pel_id；triggers 为空
 *   时 setDevicePointByID 直写 bind_attr（vP 语义，BindProbe 验证 DOM 文本 51999 渲染）。
 * - 断言路径：vue 图元渲染为真实 DOM——`[id^="text-vue-"] .break-words` 的 textContent。
 */

const TEXT_PEL_ID = 'text-vue-e2et60001'
const NAV_A_PEL_ID = 'text-vue-e2enavA'
const NAV_B_PEL_ID = 'text-vue-e2enavB'

export function textPelId(): string { return TEXT_PEL_ID }
export function navAPelId(): string { return NAV_A_PEL_ID }
export function navBPelId(): string { return NAV_B_PEL_ID }

/**
 * M2 命令段种子画面（T7）——在文本图元上加 click(customCode) 事件：
 * 事件形状 = Probe.vue 实证（id/type:'click'/action:'customCode'/change_attr/custom_code/
 * event_flow_ids/trigger_rule）；custom_code 单行调 $rsiot.send（设计 D2：复杂度收在桥里）。
 */
export async function seedCommandScreen(slug: string): Promise<void> {
  await rsiotPutScreen(slug, {
    name: 'E2E-T7 命令桥', canvasCfg: {
      width: 800, height: 600, scale: 1, color: '#141414', img: '',
      guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
    }, gridCfg: { enabled: true, align: true, size: 10 },
    json: [{
      active: false, hide: false, lock: false, resize: true, rotate: true,
      id: TEXT_PEL_ID, title: '文字', type: 'vue', tag: 'text-vue',
      binfo: { angle: 0, height: 50, left: 200, top: 150, width: 220 },
      common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
      events: [{
        id: 'ev-cmd', type: 'click', action: 'customCode', change_attr: [],
        custom_code: "$rsiot.send('rsiot', 'uptime_s', 1);",
        event_flow_ids: [], trigger_rule: {},
      }],
      ports: [],
      props: { fill: '#FFF700', fontFamily: '黑体', fontSize: 18, text: '命令', vertical: false },
      binds: [],
    }],
    eventList: [], eventFlow: [],
  })
}

export async function seedScreen(slug: string): Promise<void> {
  await rsiotPutScreen(slug, {
    name: 'E2E-T6 数据驱动', canvasCfg: {
      width: 800, height: 600, scale: 1, color: '#141414', img: '',
      guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
    }, gridCfg: { enabled: true, align: true, size: 10 },
    json: [{
      active: false, hide: false, lock: false, resize: true, rotate: true,
      id: TEXT_PEL_ID, title: '文字', type: 'vue', tag: 'text-vue',
      binfo: { angle: 0, height: 50, left: 200, top: 150, width: 220 },
      common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
      events: [], ports: [],
      props: { fill: '#FFF700', fontFamily: '黑体', fontSize: 18, text: '文字', vertical: false },
      binds: [{
        id: 'bd-uptime', pel_id: TEXT_PEL_ID, bind_id: 'rsiot.uptime_s', bind_name: '运行时长',
        bind_attr: 'props.text.val', bind_mapping: [], triggers: [],
      }],
    }],
    eventList: [], eventFlow: [],
  })
}

/**
 * 值牌预设（T13，设计 §6/F16 约定的落地件）：**不注册新图元**——内置文本图元 + 绑定即值牌。
 * valueTagItem() 产 text-vue 图元 json（平面 props + props.text.val 直写 bind，vP 语义），
 * T14 演示画面直接拼装；seedValueTag() 一步种出单值牌画面（断言路径 .break-words 文本）。
 */
export function valueTagItem(id: string, opts: {
  text?: string
  bindId?: string
  bindName?: string
  left?: number
  top?: number
  width?: number
  fill?: string
} = {}) {
  const {
    text = '0', bindId = 'rsiot.uptime_s', bindName = bindId.split('.')[1] ?? bindId,
    left = 0, top = 0, width = 160, fill = '#FFF700',
  } = opts
  return {
    active: false, hide: false, lock: false, resize: true, rotate: true,
    id, title: '文字', type: 'vue', tag: 'text-vue',
    binfo: { angle: 0, height: 40, left, top, width },
    common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
    events: [], ports: [],
    props: { fill, fontFamily: '黑体', fontSize: 20, text, vertical: false },
    binds: [{
      id: `bd-${id}`, pel_id: id, bind_id: bindId, bind_name: bindName,
      bind_attr: 'props.text.val', bind_mapping: [], triggers: [],
    }],
  }
}

export async function seedValueTag(slug: string, name = 'E2E 值牌'): Promise<void> {
  await rsiotPutScreen(slug, {
    name, canvasCfg: {
      width: 800, height: 600, scale: 1, color: '#141414', img: '',
      guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
    }, gridCfg: { enabled: true, align: true, size: 10 },
    json: [valueTagItem('text-vue-e2eval01', { left: 320, top: 280 })],
    eventList: [], eventFlow: [],
  })
}

/**
 * T14 水处理演示画面（长期 LAN 演示资产）：slug 恒定 water-demo-m3 / water-demo-m3-b，
 * PUT 全量 upsert 幂等——与 e2e-t* 清扫语义相反，**任何测试不得删除这两个画面**。
 * 组态源 = src/lib/demo-screen.ts buildDemoScreen()（纯函数，结构防漂移快照在彼处单测）。
 */
export async function seedDemoScreens(): Promise<void> {
  const { a, b } = buildDemoScreen()
  await rsiotPutScreen('water-demo-m3', a)
  await rsiotPutScreen('water-demo-m3-b', b)
}

/**
 * 图元陈列室（批 C 长期资产）：slug 恒定 catalog-demo，PUT upsert 幂等——
 * 与 e2e-t* 清扫语义相反，**任何测试不得删除此画面**（同 water-demo-m3 约定）。
 */
export async function seedCatalogDemo(): Promise<void> {
  await rsiotPutScreen(DEMO_CATALOG, buildCatalogScreen())
}

/**
 * M2 互跳段种子画面组（T9）：
 * - A（源）：click custom_code `$mtEventCallBack('nav', $item_info.id, '<B>')`——bundle 实证
 *   custom_code 经 new Function('$item_info','$args',code) 编译且以图元信息实参调用，$item_info 运行时可用；
 *   兼绑 uptime_s 制造初始 SSE 流——容器内跳转后 resubscribe 关旧开新，订阅数 1→2 是重订直接证据。
 * - B（目标）：uptime 绑定文本（复用段1 机制），断言新流 snapshot 到达。
 */
export async function seedNavScreens(slugA: string, slugB: string): Promise<void> {
  const canvasCfg = {
    width: 800, height: 600, scale: 1, color: '#141414', img: '',
    guide: true, adsorp: true, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 },
  }
  const gridCfg = { enabled: true, align: true, size: 10 }
  const pel = (id: string, text: string) => ({
    active: false, hide: false, lock: false, resize: true, rotate: true,
    id, title: '文字', type: 'vue', tag: 'text-vue',
    binfo: { angle: 0, height: 50, left: 200, top: 150, width: 220 },
    common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
    events: [] as unknown[], ports: [],
    props: { fill: '#FFF700', fontFamily: '黑体', fontSize: 18, text, vertical: false },
    binds: [{
      id: `bd-${id}`, pel_id: id, bind_id: 'rsiot.uptime_s', bind_name: '运行时长',
      bind_attr: 'props.text.val', bind_mapping: [], triggers: [],
    }],
  })
  await rsiotPutScreen(slugA, {
    name: 'E2E-T9 跳转源', canvasCfg, gridCfg,
    json: [{ ...pel(NAV_A_PEL_ID, '跳转到B'), events: [{
      id: 'ev-nav', type: 'click', action: 'customCode', change_attr: [],
      custom_code: `$mtEventCallBack('nav', $item_info.id, '${slugB}');`,
      event_flow_ids: [], trigger_rule: {},
    }] }],
    eventList: [], eventFlow: [],
  })
  await rsiotPutScreen(slugB, {
    name: 'E2E-T9 跳转目标', canvasCfg, gridCfg,
    json: [pel(NAV_B_PEL_ID, 'B-待机')],
    eventList: [], eventFlow: [],
  })
}
