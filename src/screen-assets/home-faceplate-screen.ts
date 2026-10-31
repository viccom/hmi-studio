/**
 * W11 参数化样板屏（传统 HMI faceplate）：bind_id 前缀 `@dev.` = 设备上下文相对标签，
 * 一张画面服务 N 台同型设备（100 仪表 ≠ 100 张画面）。机制 = ViewView 在加载/切换时把
 * `@dev.*` 重写为 `<devid>.<tag>` 重挂（dev-context.ts）；`@meta.dev` 由宿主直推当前
 * 设备 id（标题/选择器绑它回显）。
 *
 * 画面件：标题 + 当前设备回显（@meta.dev）+ 设备选择器（ah-dev-selector）+ 双设备按钮
 * （$mtEventCallBack('dev',…)——T9 customCode 实证路线）+ 单表全参数面板（表盘 + 六行
 * 值牌 + 趋势）。切换入口三选一：选择器下拉 / 设备按钮 / 深链 ?dev=<devid>。
 *
 * 编辑器授权（BindPanel「模板绑定 @dev」勾选后产出同形 bind）；设备清单即按钮/选择器
 * JSON——增设备 = 加一行 JSON 或一个按钮，不动画面结构。
 */
import type { IExportDoneJson, IDoneJsonBindList } from 'maotu'
import type { ScreenDoc } from '../lib/screens'
import { canvas, textItem, trendItem, svgItem, HOME_GROUP } from './home-screens'
import { HOME_E_TABS } from './home-tab-screens'
import { buttonItem } from './home-tab-screens'

// slug 常量定义在 protected.ts（权威源），此处 re-export 保持既有导入路径
export { HOME_E_FACEPLATE } from './protected'

/** 参数化绑定（bind_id = @dev.<tag>，运行时重写为 <devid>.<tag>） */
function pbind(pelId: string, tag: string, attr: string): IDoneJsonBindList {
  return {
    id: `bd-${pelId}-${attr.split('.')[1]}`, pel_id: pelId, bind_id: `@dev.${tag}`,
    bind_name: tag, bind_attr: attr, bind_mapping: [], triggers: [],
  }
}

/** 宿主注入绑定（bind_id = @meta.dev，不重写；ViewView 挂载/切换后直推当前设备 id） */
function mbind(pelId: string, attr: string): IDoneJsonBindList {
  return {
    id: `bd-${pelId}-metadev`, pel_id: pelId, bind_id: '@meta.dev',
    bind_name: '当前设备', bind_attr: attr, bind_mapping: [], triggers: [],
  }
}

/** 设备按钮：customCode 词表 dev → ViewView.setDev */
function devButton(id: string, o: { text: string; devid: string; left: number; type?: string }): IExportDoneJson {
  return buttonItem(id, {
    text: o.text, left: o.left, top: 20, width: 100, height: 40, type: o.type,
    events: [{
      id: `ev-${id}`, type: 'click', action: 'customCode', change_attr: [],
      custom_code: `$mtEventCallBack('dev', $item_info.id, '${o.devid}');`,
      event_flow_ids: [], trigger_rule: {},
    }],
  })
}

/** 值牌行（标签 + @dev 绑定值），home-tab-screens 同布局族（380/540 列） */
function valueRow(p: string, key: string, label: string, y: number, tag: string): IExportDoneJson[] {
  const valId = `text-vue-${p}-v-${key}`
  return [
    textItem(`text-vue-${p}-l-${key}`, { text: label, left: 380, top: y, width: 150, height: 28, fill: '#8fa3b8', fontSize: 14 }),
    textItem(valId, { text: '—', left: 540, top: y, width: 140, height: 32, fontSize: 18, bindId: `@dev.${tag}` }),
  ]
}

/**
 * 纯函数组态：家庭用电·参数化（faceplate 样板，devs = 选择器/按钮清单）。
 * 绑定面全部 `@dev.*` + `@meta.dev`——collectBinds devs = []（无具体设备），
 * 运行时按 ?dev=/按钮/选择器激活后才有订阅面。
 */
export function buildHomeFaceplateScreen(devs: Array<{ id: string; label: string }> = [
  { id: 'home-meter-e1', label: '1# 电表' },
  { id: 'home-meter-e2', label: '2# 电表' },
]): ScreenDoc {
  const p = 'hfp'
  const panelId = `ah-meter-panel-${p}`
  const trendId = `ah-trend-chart-${p}`
  const json: IExportDoneJson[] = [
    // 顶栏：标题 + 当前设备回显（@meta.dev 宿主直推）+ 选择器 + 双设备按钮
    textItem('text-vue-hfp-title', { text: '家庭用电·参数化', left: 20, top: 20, width: 220, height: 36, fill: '#e6f7ff', fontSize: 24 }),
    textItem('text-vue-hfp-dev', { text: '未选设备', left: 260, top: 20, width: 140, height: 28, fill: '#58a6ff', fontSize: 15, bindId: '@meta.dev' }),
    {
      active: false, hide: false, lock: false, resize: true, rotate: true,
      id: `ah-dev-selector-${p}`, title: '设备选择器', type: 'vue', tag: 'ah-dev-selector',
      binfo: { angle: 0, height: 40, left: 380, top: 20, width: 200 },
      common_animations: { val: '', delay: 'delay-0s', speed: 'slow', repeat: 'infinite' },
      events: [], ports: [],
      props: { devices: JSON.stringify(devs), value: devs[0]?.id ?? '' },
      binds: [mbind(`ah-dev-selector-${p}`, 'props.value.val')], // @meta.dev 宿主直推回显
    } as IExportDoneJson,
    ...devs.slice(0, 2).map((d, n) => devButton(`tab-dev-${n + 1}`, {
      text: d.label, devid: d.id, left: 600 + n * 100, type: n === 0 ? 'primary' : 'info',
    })),
    // 面板：电表五参数 + 脉冲灯（全部 @dev.*，runtime 重写）
    textItem(`text-vue-${p}-devlbl`, { text: '设备面板', left: 20, top: 100, width: 360, height: 24, fill: '#8fa3b8', fontSize: 13 }),
    svgItem('ah-meter-panel', panelId, {
      left: 20, top: 140, scale: 1.6,
      binds: [
        pbind(panelId, 'voltage', 'props.v.val'),
        pbind(panelId, 'current', 'props.i.val'),
        pbind(panelId, 'power', 'props.p.val'),
        pbind(panelId, 'pf', 'props.pf.val'),
        pbind(panelId, 'frequency', 'props.freq.val'),
        pbind(panelId, 'status', 'props.status.val'),
        pbind(panelId, 'pulse', 'props.pulse.val'),
      ],
    }),
    trendItem(trendId, {
      left: 20, top: 400, scale: 1.2, yUnit: 'kW/A',
      curves: [
        { field: '@dev.power', label: '有功', unit: 'kW', color: '#f5a623' },
        { field: '@dev.current', label: '电流', unit: 'A', color: '#58a6ff' },
      ],
    }),
    ...valueRow(p, 'power', '有功(kW)', 140, 'power'),
    ...valueRow(p, 'pf', '功率因数', 180, 'pf'),
    ...valueRow(p, 'frequency', '频率(Hz)', 220, 'frequency'),
    ...valueRow(p, 'energy', '总电能(kWh)', 260, 'energy'),
    ...valueRow(p, 'today', '今日(kWh)', 300, 'energy_today'),
    ...valueRow(p, 'status', '状态码', 340, 'status'),
    // 导航回页签屏（概览/页签/参数化三族互通）
    svgItem('ah-nav-button', 'ah-nav-button-hfp-1', { left: 700, top: 420, scale: 1.2, props: { target: HOME_E_TABS } }),
  ]
  // meta.devs = 清单权威源（ViewView 默认激活首台；选择器/按钮同源由 devs 参数生成）
  return { name: '家庭用电·参数化', group: HOME_GROUP, devs, ...canvas(), json, eventList: [], eventFlow: [] }
}
