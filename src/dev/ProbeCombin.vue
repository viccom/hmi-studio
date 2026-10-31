<script setup lang="ts">
// P3a reg-combin 探针页（设计 §6.1 三问，2026-10-31）：
//  (a) registerConfig type:'reg-combin' + combin_json（单 IDoneJson，children 嵌套）
//      → 左面板出现、拖入画布渲染子树
//  (b) maotu 自带「框选→组合」UI（右键菜单/Ctrl+G）产出 type:'group' 项
//  (c) 拖入后子树 binds/props 保留、右面板选中项经 #deviceBind 槽位可读（store 响应式）
// 结论与证据：docs/plans/2026-10-31-reg-combin-probe.md（e2e/probe-combin.spec.ts 自动化取证）
import { onMounted, ref } from 'vue'
import { MtEdit, leftAsideStore } from 'maotu'
import type { IExportJson, IDoneJson } from 'maotu'
import { registerSymbols } from '../symbols'
import { allSymbols } from '../symbols/registry'

const PROBE_GROUP = '探针组合'
/** 探针页暴露面：e2e 直取 store/保存载荷/选中项（/dev/* 免登录，仅研究资产） */
const probe = {
  leftAsideStore,
  lastSave: null as IExportJson | null,
  selectedItem: null as IDoneJson | null,
  combinDragged: false,
}
if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__probeCombin = probe

/** 从 registry 构造**画布形态**的子项：registerConfig 归一化（FP/kf）会把 svg 型
 * 注册项补上私有 symbol 部分（symbol_id/symbol_str/width/height）——画布 svg 图元
 * 渲染必读它（bundle @1044977 i.value.symbol.symbol_id）；再覆写 id/binfo/binds。
 * binfo 用百分比（Ctrl+G 产物的 children 坐标系 = 相对 group bbox 的 0-100）。 */
function canvasChild(symbolId: string, over: {
  id: string; title: string; binfo: { left: number; top: number; width: number; height: number }
  binds?: Array<Record<string, unknown>>
}): Record<string, unknown> {
  const tmp = `探针原料-${symbolId}`
  const def = allSymbols().find((s) => s.id === symbolId)
  if (!def) throw new Error(`probe: registry 无 ${symbolId}`)
  leftAsideStore.registerConfig(tmp, [def])
  const norm = leftAsideStore.config.get(tmp)![0] as unknown as Record<string, unknown>
  return {
    ...JSON.parse(JSON.stringify(norm)),
    id: over.id,
    title: over.title,
    binfo: { ...over.binfo, angle: 0 },
    binds: over.binds ?? [],
    events: [],
  }
}

/** 探针组合模板：一个 group 项（bundle 实证 = Ctrl+G 组合产物同构）内嵌泵+罐两图元。
 *  泵带一条假绑定（验证拖入后 binds 原样保留）。 */
const probeCombin: IDoneJson = {
  id: 'probe-combin',
  title: '泵阀组合',
  type: 'group',
  tag: 'group',
  binfo: { left: 0, top: 0, width: 220, height: 140, angle: 0 },
  resize: true, rotate: true, lock: false, active: true, hide: false,
  use_proportional_scaling: true,
  props: {},
  children: [
    canvasChild('ah-pump', {
      id: 'pc-pump', title: '泵',
      binfo: { left: 0, top: 0, width: 60, height: 60 },
      binds: [{ id: 'pc-b1', bind_id: 'home-meter-e1.power', bind_attr: 'props.fill.val' }],
    }),
    canvasChild('ah-tank', {
      id: 'pc-tank', title: '罐',
      binfo: { left: 70, top: 55, width: 30, height: 45 },
    }),
  ],
  events: [], ports: [],
} as unknown as IDoneJson

function registerProbe(): void {
  leftAsideStore.registerConfig(PROBE_GROUP, [{
    id: 'probe-pump-valve',
    title: '泵阀组合',
    type: 'reg-combin',
    thumbnail: '',
    props: {},
    combin_json: probeCombin,
    width: 220,
    height: 140,
  }])
}

const editRef = ref<InstanceType<typeof MtEdit>>()
onMounted(() => {
  registerSymbols()
  registerProbe()
})
function onSave(payload: IExportJson): void {
  probe.lastSave = payload
}
</script>

<template>
  <div class="probe-page">
    <header class="probe-head">
      <strong>P3a reg-combin 探针</strong>
      <span>① 左面板「{{ PROBE_GROUP }}」拖入画布 ② 框选两图元 Ctrl+G 组合 ③ 点保存取 payload ④ 点选画布项看右面板槽位</span>
    </header>
    <MtEdit
      ref="editRef"
      class="probe-body"
      :use-theme-toggle="false"
      @on-save-click="(payload: IExportJson) => onSave(payload)"
    >
      <template #deviceBind="{ item }">
        <div class="probe-slot" :data-probe-slot="item.id">
          <div>选中项槽位（#deviceBind）</div>
          <div>id={{ item.id }} type={{ item.type }} tag={{ item.tag }}</div>
          <div v-if="item.children?.length">children={{ item.children.length }}</div>
        </div>
      </template>
    </MtEdit>
  </div>
</template>

<style scoped>
.probe-page { height: 100vh; display: flex; flex-direction: column; }
.probe-head { padding: 6px 12px; font-size: 12px; color: var(--el-text-color-secondary); border-bottom: 1px solid var(--el-border-color-light); }
.probe-body { flex: 1; min-height: 0; }
.probe-slot { font-size: 12px; padding: 6px; }
</style>
