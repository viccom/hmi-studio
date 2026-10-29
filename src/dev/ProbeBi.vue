<script setup lang="ts">
// BI 数据通道探针（P2 前置风险门，2026-10-28）：验证 setItemAttrByID 能否把
// 大 JSON（聚合 series）稳定写入 vue 型图元 props——宿主聚合收集器喂数方案的
// 机制前提。历史探针（Probe.vue）只实证过字符串/颜色的小值写入。
// 断言面（window.__probeBi → Playwright）：
//  - 阶梯写入 4KB/40KB/120KB：组件收到的 JSON 完整（点数/首尾值）且可 parse
//  - 连写 10 次（模拟多图元刷新周期压缩）：seq 全到、有序、无丢帧
//  - 每档记录写入→组件 watch 的时延（数据参考，不做阈值断言）
// vue 型渲染链：done_json item.tag='probe-bi-chart' → maotu bs() 解析全局组件
// （kebab→PascalCase 归一）——本页经 appContext 注册，不进 main.ts 正式注册面。
import { defineComponent, getCurrentInstance, onMounted, ref, watch } from 'vue'
import { MtPreview } from 'maotu'
import type { IExportJson } from 'maotu'

/** 探针载荷形状（宿主写入的大 JSON 串解析结果）。 */
interface ProbePayload {
  series?: Array<{ points?: unknown[] }>
  seq?: number
}

/** 探针图元：series 为大 JSON 串（宿主写入），watch 记录到达与完整性。
 *  用 defineComponent 而非裸对象：裸对象的 props 声明无法匹配 maotu 的
 *  Component 类型（app.component 注册处报错 TS2345）。 */
const ProbeBiChart = defineComponent({
  props: { series: { type: String, default: '[]' } },
  setup(p: { series: string }) {
    watch(() => p.series, (s) => {
      const t1 = performance.now()
      const probe = (window as Window & { __probeBi?: ProbeBiState }).__probeBi
      if (!probe) return
      let parsed: ProbePayload | null = null
      try { parsed = JSON.parse(s) as ProbePayload } catch { probe.result = { ok: false, err: 'JSON.parse 失败', len: s.length }; return }
      const n = parsed?.series?.reduce((a: number, x: { points?: unknown[] }) => a + (x.points?.length ?? 0), 0) ?? 0
      probe.result = {
        ok: true, len: s.length, points: n,
        seq: typeof parsed?.seq === 'number' ? parsed.seq : undefined,
        latencyMs: Math.round((t1 - probe.t0) * 100) / 100,
      }
    }, { immediate: true })
    return () => null // 纯数据探针，无渲染面
  },
})

interface ProbeBiState {
  t0: number
  result: { ok: boolean; len?: number; points?: number; seq?: number; latencyMs?: number; err?: string } | null
  setBig: (pointsPerSeries: number, seq?: number) => { ok: boolean; len: number }
  setRaw: (s: string) => void
}

const exportJson: IExportJson = {
  canvasCfg: { width: 600, height: 300, scale: 1, color: '#1f1f1f', img: '', guide: false, adsorp: false, adsorp_diff: 3, transform_origin: { x: 0, y: 0 }, drag_offset: { x: 0, y: 0 } },
  gridCfg: { enabled: false, align: false, size: 10 },
  json: [{
    active: false, hide: false, lock: false, resize: true, rotate: true,
    id: 'c1', title: 'BI 探针图元', type: 'vue', tag: 'probe-bi-chart',
    binfo: { angle: 0, width: 320, height: 180, left: 100, top: 60 },
    common_animations: { val: '', delay: '', speed: '', repeat: '' },
    events: [], ports: [],
    // props = 描述符形状（title/type/val）——maotu 渲染时平面化 .val 传给 vue 组件
    //（VUE_EMPTY_STR 先例）；setItemAttrByID 写 'props.series.val' 正是改这里
    props: { series: { title: '序列', type: 'textArea', val: '[]' } } as never,
    binds: [],
  }] as never,
  eventList: [],
}

const pv = ref<InstanceType<typeof MtPreview>>()

/** 构造聚合 series 大 JSON（3 序列 × n 点，[ts,value] 对） */
function buildSeries(pointsPerSeries: number, seq?: number): string {
  const t0 = 1793166000
  const series = ['a', 'b', 'c'].map((name, si) => ({
    name,
    points: Array.from({ length: pointsPerSeries }, (_, i) => [t0 + i * 60, Number((si * 10 + Math.sin(i / 7) * 5).toFixed(3))]),
  }))
  return JSON.stringify(seq === undefined ? { series } : { seq, series })
}

const state: ProbeBiState = {
  t0: 0,
  result: null,
  setBig(pointsPerSeries: number, seq?: number) {
    const s = buildSeries(pointsPerSeries, seq)
    state.t0 = performance.now()
    state.result = null
    pv.value?.setItemAttrByID('c1', 'props.series.val', s)
    return { ok: true, len: s.length }
  },
  setRaw(s: string) {
    state.t0 = performance.now()
    state.result = null
    pv.value?.setItemAttrByID('c1', 'props.series.val', s)
  },
}

onMounted(() => {
  ;(window as Window & { __probeBi?: ProbeBiState }).__probeBi = state
  // 全局组件注册（dev 自包含：不进 main.ts registerSymbolComponents 正式面）
  getCurrentInstance()?.appContext.app.component('ProbeBiChart', ProbeBiChart)
  pv.value?.setImportJson(exportJson)
})
</script>
<template>
  <main style="padding: 12px">
    <h3 style="color: #aaa">BI 数据通道探针（setItemAttrByID 大 JSON）</h3>
    <MtPreview ref="pv" :show-popover="false" style="width: 600px; height: 300px" />
  </main>
</template>
