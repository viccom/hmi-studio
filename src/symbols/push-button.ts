/**
 * 操作按钮（批 B vue 型注册项）：工业蘑菇头按钮 + 按下视觉反馈（组件内 pointerdown/up）。
 * **默认 click 事件模板**（types.ts ⑦ 实证：events 深拷贝随注册项实例化）——运行页点击即
 * `$rsiot.send(devid, tag, value)`：cmd 不进宿主事件词表，命令一律走 $rsiot.send 桥
 * （设计 D2，bridge.ts）；编辑态 D6 守卫（ElMessageBox「真实下发」二次确认）宿主已有。
 * devid/tag/value 三 prop 供组态填写，custom_code 用 $getItemAttrByID 运行时读取
 * （F19① nav-button target 同款通路）。
 * - fill(color)：按钮帽色；label(input)：帽下标签
 * - ports：[]（操作件不接工艺线）
 */
import type { HmiSymbol } from './types'
import { svgThumbnail } from './kit'

const THUMB = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <circle cx="40" cy="40" r="36" fill="#30363d" stroke="#1c2128" stroke-width="2"/>
  <circle cx="40" cy="40" r="28" fill="#1c2128"/>
  <circle cx="40" cy="38" r="24" fill="#1677ff"/>
  <ellipse cx="40" cy="30" rx="14" ry="7" fill="rgba(255,255,255,0.22)"/>
</svg>`

/** 默认命令模板：devid/tag/value 运行时读取（组态改 prop 即生效，无需改代码） */
export const PUSH_EVENT_CODE =
  "$rsiot.send($getItemAttrByID($item_info.id, 'props.devid.val'), $getItemAttrByID($item_info.id, 'props.tag.val'), $getItemAttrByID($item_info.id, 'props.value.val'));"

export const pushButton: HmiSymbol = {
  id: 'ah-push-button', title: '操作按钮', type: 'vue', thumbnail: svgThumbnail(THUMB, 'ah-push-button'),
  width: 80, height: 80,
  props: {
    fill: { title: '按钮帽色', type: 'color', val: '#1677ff' },
    label: { title: '标签', type: 'input', val: '启动' },
    devid: { title: '目标设备 ID', type: 'input', val: 'rsiot' },
    tag: { title: '目标点位', type: 'input', val: 'uptime_s' },
    value: { title: '下发值', type: 'number', val: 1 },
  },
  ports: [],
  events: [{
    id: 'ev-cmd',
    type: 'click',
    action: 'customCode',
    change_attr: [],
    custom_code: PUSH_EVENT_CODE,
    event_flow_ids: [],
    trigger_rule: {},
  }],
}
