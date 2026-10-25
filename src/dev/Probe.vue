<script setup lang="ts">
// 0.6.5 数据绑定模型探针（黑盒行为测试）：
//  A. setItemAttrByID 直改属性；B. bind + setDevicePointByID 触发规则求值；
//  C. click 事件 onEventCallBack 回传宿主；D. custom_code 执行上下文。
// 断言经 window.__probe 暴露给 Playwright。
import { ref } from 'vue'
import { MtPreview } from 'maotu'
import type { IExportJson } from 'maotu'

const svg = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="56" height="56" rx="6" fill="#52c41a"/><text x="32" y="36" text-anchor="middle" font-size="10" fill="#fff">PUMP</text></svg>`

// 待测文档：泵图元 + fill 属性 + click(custom) 事件 + rsiot.cpu 绑定（>80 变红）
const exportJson: IExportJson = {
  canvasCfg: { width: 600, height: 300, scale: 1, color: '#1f1f1f', img: '', guide: false, adsorp: false, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 } },
  gridCfg: { enabled: false, align: false, size: 10 },
  json: [{
    id: 'p1',
    title: '泵',
    type: 'svg',
    symbol: { symbol_id: 'probe-pump', symbol_str: svg, width: '64', height: '64' },
    binfo: { left: 100, top: 100, width: 120, height: 120, angle: 0 },
    props: { fill: { title: '填充', type: 'color', val: '#52c41a' } } as never,
    resize: true, rotate: true, lock: false, active: false, hide: false,
    common_animations: { val: '', delay: '', speed: '', repeat: '' },
    events: [{
      id: 'ev1', type: 'click', action: 'customCode', change_attr: [],
      custom_code: 'window.__probe.customCodeRan = true;',
      event_flow_ids: [], trigger_rule: {},
    }],
    ports: [],
    binds: [{
      id: 'bd1', pel_id: 'p1', bind_id: 'rsiot.cpu_percent', bind_name: 'CPU', bind_attr: 'props.fill.val',
      bind_mapping: [],
      triggers: [{
        id: 'tg1',
        rule: { operator: '>', value: 80 },
        action: 'changeAttr',
        change_attr: [{ id: 'ca1', target_id: 'p1', target_attr: 'props.fill.val', target_value: '#ff4d4f' }],
        custom_code: '',
      }],
    }],
  }] as never,
  eventList: [],
}

const pv = ref<InstanceType<typeof MtPreview>>()
const probe = {
  customCodeRan: false,
  eventCb: [] as unknown[],
  async setAttr(id: string, key: string, val: unknown) { return pv.value?.setItemAttrByID(id, key, val) },
  setPoint(id: string, val: unknown) { return pv.value?.setDevicePointByID(id, val) },
  readAttr(id: string, key: string) {
    const doc = (pv.value as unknown as { done_json?: Array<Record<string, unknown>> }) ?? null
    return JSON.stringify((exportJson.json as unknown as Array<Record<string, unknown>>).find(n => n.id === id)?.[(key.split('.')[0])])
  },
  getPelFill(): string {
    // svg 图元经 dataURL 渲染成 <img>——DOM 无 rect；从 done_json 对象直读（preview 就地改写）
    const p = (exportJson.json as unknown as Array<{ id: string; props?: { fill?: { val: string } } }>).find(n => n.id === 'p1')
    return p?.props?.fill?.val ?? 'no-prop'
  },
  pelBox(): { x: number; y: number; w: number; h: number } | null {
    const el = document.querySelector('img') as HTMLElement | null
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  },
}
;(window as unknown as Record<string, unknown>).__probe = probe
</script>

<template>
  <div>
    <MtPreview ref="pv" :export-json="exportJson" :show-popover="false" style="height: 100vh" @on-event-callback="(...a: unknown[]) => probe.eventCb.push(a)" />
  </div>
</template>
