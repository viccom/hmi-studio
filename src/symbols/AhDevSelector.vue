<script setup lang="ts">
// W11 设备选择器（vue 型图元）：下拉切换参数化画面的激活设备。
// devices = textArea JSON 串 [{id,label}]（趋势 points 同款契约）；value prop 可由
// 宿主直写（bind @meta.dev）驱动回显当前设备。选择即 window.$mtEventCallBack('dev',
// '', devid) → ViewView 词表分发（守卫可选链：编辑器画布无该全局则 no-op）。
// 直调而非默认事件模板：change 的 $args 依赖 attrs 透传落点（vue 组件根元素），
// 直调窗口全局最短路径且与实例数解耦（ViewView 单 MtPreview，无 sign 冲突场景）。
import { computed, ref, watch } from 'vue'

interface DevOpt { id: string; label?: string }

const props = defineProps<{
  fill?: string
  devices?: string
  value?: string
}>()

const opts = computed<DevOpt[]>(() => {
  try {
    const arr = JSON.parse(props.devices ?? '[]') as DevOpt[]
    return Array.isArray(arr) ? arr.filter((d) => d && typeof d.id === 'string') : []
  } catch {
    return []
  }
})

const current = ref(props.value ?? '')
watch(() => props.value, (v) => { current.value = v ?? '' })

function onChange(v: string | number | boolean): void {
  current.value = String(v)
  const w = window as Window & { $mtEventCallBack?: (type: string, id: string, ...rest: unknown[]) => void }
  w.$mtEventCallBack?.('dev', '', String(v))
}
</script>

<template>
  <div class="ah-sel" data-testid="ah-dev-selector" :style="{ border: `1px solid ${fill ?? '#409eff'}` }">
    <el-select v-model="current" size="small" class="ah-sel-ctl" @change="onChange">
      <el-option v-for="d in opts" :key="d.id" :value="d.id" :label="d.label ?? d.id" />
    </el-select>
  </div>
</template>

<style scoped>
.ah-sel { width: 100%; height: 100%; display: flex; align-items: center; border-radius: 4px; }
.ah-sel-ctl { width: 100%; }
</style>
