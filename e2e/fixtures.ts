import { rsiotPutScreen } from './helpers'

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

export function textPelId(): string { return TEXT_PEL_ID }

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
