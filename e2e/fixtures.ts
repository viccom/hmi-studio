import { rsiotPutScreen, rsiotPutScene } from './helpers'
import { buildDemoScreen, buildCatalogScreen, DEMO_CATALOG } from '../src/screen-assets/demo-screen'
import { buildHomeScreens, HOME_E, HOME_W, HOME_G } from '../src/screen-assets/home-screens'
import { buildHomeTabScreens, HOME_E_TABS, HOME_W_TABS, HOME_G_TABS } from '../src/screen-assets/home-tab-screens'
import { buildHomeFaceplateScreen, HOME_E_FACEPLATE } from '../src/screen-assets/home-faceplate-screen'
import { buildBiStationScreen, BI_STATION } from '../src/screen-assets/bi-screen'
import { buildIotScreens } from '../src/screen-assets/iot-screens'
import { buildIotBiStationScreen } from '../src/screen-assets/iot-bi-screen'
import { IOT_L1, IOT_WATER, IOT_POWER, IOT_GAS, IOT_ENV, IOT_BI_STATION } from '../src/screen-assets/protected'

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
 * 组态源 = src/screen-assets/demo-screen.ts buildDemoScreen()（纯函数，结构防漂移快照在彼处单测）。
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
 * P3 家庭三表三屏（长期资产）：slug 恒定 home-meter-power/water/gas，PUT 全量 upsert 幂等——
 * 与 e2e-t* 清扫语义相反，**任何测试不得删除这三张画面**（同 water-demo-m3 约定）。
 * 组态源 = src/screen-assets/home-screens.ts buildHomeScreens()（纯函数，结构防漂移快照在彼处单测）；
 * 数据面 = 真实活数据 home-meter-e/w/g 系列（周期 2s）。
 */
export async function seedHomeScreens(): Promise<void> {
  const { power, water, gas } = buildHomeScreens()
  await rsiotPutScreen(HOME_E, power)
  await rsiotPutScreen(HOME_W, water)
  await rsiotPutScreen(HOME_G, gas)
}

/**
 * W10 页签三屏（长期资产）：slug 恒定 home-meter-*-tabs，PUT upsert 幂等——
 * **任何测试不得删除**（同 water-demo-m3 约定）。组态源 = home-tab-screens.ts（纯函数）；
 * 数据面 = 真实活数据 home-meter-e/w/g 系列。
 */
export async function seedHomeTabScreens(): Promise<void> {
  const { power, water, gas } = buildHomeTabScreens()
  await rsiotPutScreen(HOME_E_TABS, power)
  await rsiotPutScreen(HOME_W_TABS, water)
  await rsiotPutScreen(HOME_G_TABS, gas)
}

/**
 * W11 参数化样板屏（长期资产）：slug 恒定 home-meter-power-faceplate，PUT upsert 幂等——
 * **任何测试不得删除**。绑定面 = @dev 点缀 + @meta.dev（运行页按 ?dev=/按钮/选择器激活）。
 */
export async function seedFaceplateScreen(): Promise<void> {
  await rsiotPutScreen(HOME_E_FACEPLATE, buildHomeFaceplateScreen())
}

/**
 * 工业 SCADA 画面集（2026-11-24 长期资产）：L1 + 4 个 L2 + 10 个 L3（每台设备一张面板）。
 * slug 常量在 src/screen-assets/protected.ts（权威源）；PUT 幂等，组态源 = 纯函数
 * buildIotScreens()（结构与绑定契约在其伴生单测冻结）。**任何测试不得删除**。
 */
export async function seedIotScreens(): Promise<void> {
  const { l1, water, power, gas, env, faceplates } = buildIotScreens()
  await rsiotPutScreen(IOT_L1, l1)
  await rsiotPutScreen(IOT_WATER, water)
  await rsiotPutScreen(IOT_POWER, power)
  await rsiotPutScreen(IOT_GAS, gas)
  await rsiotPutScreen(IOT_ENV, env)
  for (const [slug, doc] of Object.entries(faceplates)) {
    await rsiotPutScreen(slug, doc)
  }
}

/** 工业历史分析大屏（BI 分析层）：长期资产，PUT 幂等，任何测试不得删除。 */
export async function seedIotBiStation(): Promise<void> {
  await rsiotPutScreen(IOT_BI_STATION, buildIotBiStationScreen())
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

/**
 * P2 监控站 BI 大屏（长期资产）：slug 恒定 bi-station，PUT 全量 upsert 幂等——
 * **任何测试不得删除**（同 water-demo-m3 约定）。组态源 = src/screen-assets/bi-screen.ts
 * buildBiStationScreen()（纯函数，结构防漂移快照在彼处单测）。
 *
 * 数据面 = 真实活数据：宿主聚合收集器（ViewView）在运行页扫出画面里的 ah-bi- 图元，
 * 向 rs-iot /api/v1/history/batch 取历史数据后写回图元 props.data.val。
 */
export async function seedBiStationScreen(): Promise<void> {
  await rsiotPutScreen(BI_STATION, buildBiStationScreen())
}

/**
 * 3D 场景基准集（P0.5，2026-11-26）：纳入回归的 v2 场景（`scenes` 资源族）。
 *
 * 为什么用**纯函数构造**而不是搬真实的 172 对象工厂场景：e2e 要的是"结构与契约稳定"，
 * 不是"内容大"——大场景让每次播种都传 200KB，且内容一改就要更新基线。
 * 这里构造的是**最小可断言形态**：2 个 primitive + 1 条绑定 + 1 条事件 + 灯光/初始视角，
 * 覆盖 v2 契约的全部关键字段（objects/scene/bindings/events）。
 * 真实大场景（iot-workshop-3d / iot-robot-hall-3d）由运维迁移，不在 e2e 里重建。
 */
export function buildScene3DFixture(): Record<string, unknown> {
  return {
    $schema: 'agent-hmi.scene3d/1',
    meta: { name: 'E2E 3D 基准', group: '空间层', unit_m: 1, home: { pos: [12, 9, 12], target: [0, 1, 0] } },
    nodes: [], links: [],
    objects: [
      {
        id: 'bid_e2e_box', bid: 'bid_e2e_box', type: 'BoxGeometry', name: 'E2E 基准设备/箱体',
        visible: true,
        position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
        geometry: { type: 'BoxGeometry', parameters: { width: 1, height: 1, depth: 1 } },
        material: { color: 0x27ae60, roughness: 0.6, metalness: 0.1 },
      },
      {
        id: 'bid_e2e_lamp', bid: 'bid_e2e_lamp', type: 'SphereGeometry', name: 'E2E 基准设备/状态灯',
        visible: true,
        position: { x: 1.5, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
        geometry: { type: 'SphereGeometry', parameters: { radius: 0.2, widthSegments: 16, heightSegments: 12 } },
        material: { color: 0x27c93f, emissive: 0x27c93f, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.1 },
      },
    ],
    scene: {
      lightingConfig: { enabled: true, ambient: 0.85, hemisphere: 1.8, key: 3, fill: 2, head: 1.5, azimuth: 45, elevation: 55, exposure: 1.25 },
      initialView: { position: { x: 6, y: 4, z: 6 }, target: { x: 0, y: 0.5, z: 0 } },
    },
    bindings: [{
      id: 'bind_e2e_lamp', targetBid: 'bid_e2e_lamp', field: 'dev_wm1.flow_rate',
      devId: 'dev_wm1', kind: 'emissive', config: { color: 0x27c93f, scale: 0.1 },
    }],
    events: [{
      id: 'evt_e2e_box', on: { type: 'click', targetBid: 'bid_e2e_box' },
      do: { type: 'focus', targetBid: 'bid_e2e_box' },
    }],
  }
}

/**
 * e2e 专用 3D 场景 slug（**不得复用真实长期资产**）。
 *
 * 踩坑记录（2026-11-26）：初版直接用 `IOT_WORKSHOP_3D`/`IOT_ROBOT_HALL_3D` 播种最小 fixture
 * ——那是 PUT 全量覆盖，会把 172 对象的工厂场景和机器人展厅**直接覆盖成 2 个立方体**。
 * e2e 播种只允许写自己的命名空间；真实场景由运维迁移，测试不得触碰。
 */
export const E2E_SCENE_A = 'e2e-scene-3d-a'
export const E2E_SCENE_B = 'e2e-scene-3d-b'

/** 3D 基准场景播种（PUT 幂等；只写 e2e 命名空间） */
export async function seed3DScenes(): Promise<void> {
  const doc = buildScene3DFixture()
  await rsiotPutScene(E2E_SCENE_A, doc)
  await rsiotPutScene(E2E_SCENE_B, doc)
}
