<script setup lang="ts">
// T17 列表缩略图：MtPreview 小尺寸渲染（exportJson prop 挂载即导入——bundle Pe() 实读）。
// - 缩放：画布按 canvasCfg 尺寸原样渲染，外层 transform:scale(卡宽/画布宽)——CSS 缩放
//   不改内部分辨率，SVG→dataURI 图元天然矢量清晰。
// - 懒挂载：useIntersectionObserver 进入视口才挂 MtPreview（离屏卡片零成本）；
//   rootMargin 120px 预挂载缓冲（贴边快速滚动时边缘卡片也能命中）。
// - 兼容守卫：done 必须 {json: 数组, canvasCfg}（maotu 形状）才挂 MtPreview——
//   rs-iot 里存有 agent-hmi 旧格式画面（$schema: agent-hmi.screen/1），MtPreview
//   mounted hook 对其抛 TypeError 且**中断同批兄弟挂载**（实测），降级占位块+计数徽章。
// - pointer-events:none：缩略图只读——防 nav-button 等默认事件模板被点发（F19）。
// - 自绘图元注册由父页 registerSymbols() 保证（幂等）。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'
import { MtPreview } from 'maotu'
import type { IExportJson } from 'maotu'

const props = defineProps<{ done?: IExportJson }>()

const cfg = props.done?.canvasCfg as { width?: number; height?: number } | undefined
const w = cfg?.width ?? 800
const h = cfg?.height ?? 600
const compatible = computed(() => Array.isArray(props.done?.json) && !!props.done?.canvasCfg)
const pelCount = computed(() => (Array.isArray(props.done?.json) ? props.done?.json?.length ?? 0 : 0))

const wrapRef = ref<HTMLElement>()
const visible = ref(false)
const scale = ref(0.2)

const { stop } = useIntersectionObserver(wrapRef, ([entry]) => {
  if (entry?.isIntersecting) { visible.value = true; stop() }
}, { rootMargin: '120px' })

// 卡片栅格 el-col 随窗口宽度换列（xs/sm/md/lg 断点）——scale 须跟随容器宽变化
// （原只在 mounted 量一次：跨断点后缩略图裁切/留白）。jsdom 无 RO 时降级一次量宽。
let ro: ResizeObserver | undefined
onMounted(() => {
  const el = wrapRef.value
  if (!el) return
  scale.value = el.clientWidth / w
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => { scale.value = el.clientWidth / w })
    ro.observe(el)
  }
})
onBeforeUnmount(() => { ro?.disconnect(); ro = undefined })
</script>

<template>
  <div
    ref="wrapRef"
    class="thumb"
    :style="{ aspectRatio: `${w} / ${h}` }"
    data-testid="card-thumb"
  >
    <div
      v-if="visible && compatible"
      class="thumb-scale"
      :style="{ width: `${w}px`, height: `${h}px`, transform: `scale(${scale})` }"
    >
      <MtPreview :export-json="done" :show-popover="false" :can-drag="false" :can-zoom="false" />
    </div>
    <!-- 非 maotu 画面（如 agent-hmi 旧格式）：占位块 + 徽章（兼容守卫降级） -->
    <div v-else-if="visible" class="thumb-fallback">
      <span class="thumb-badge">{{ compatible ? pelCount : '?' }} 图元</span>
      <span v-if="!compatible" class="thumb-note">非组态画面</span>
    </div>
    <div v-else class="thumb-ph" />
  </div>
</template>

<style scoped>
.thumb {
  position: relative; width: 100%; overflow: hidden;
  margin-bottom: 8px; border-radius: 4px;
  background: var(--el-fill-color-darker);
  border: 1px solid var(--el-border-color-lighter);
}
.thumb-scale { position: absolute; top: 0; left: 0; transform-origin: top left; pointer-events: none; }
.thumb-ph { position: absolute; inset: 0; }
.thumb-fallback {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  color: var(--el-text-color-secondary); font-size: 12px;
}
.thumb-badge {
  padding: 1px 8px; border-radius: 8px;
  background: var(--el-fill-color); border: 1px solid var(--el-border-color);
}
</style>
