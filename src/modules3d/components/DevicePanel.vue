<script setup lang="ts">
/**
 * 3D 运行页的设备详情面板（右上角）。
 *
 * 交互契约沿用 v1 DEMO（`Scene3DView.vue` 的 `.detail-panel`）：**点设备 → 同页出详情，
 * 不跳页**；面板里的「进入 2D 设备面板」按钮才跳 2D。视觉也沿用同一套深色 chrome：
 * 无渐变、无发光阴影、唯一强调色给实时值（HP-HMI 灰阶，饱和色只给状态）。
 */
import { computed } from 'vue'

const props = defineProps<{
  /** 位号（WM-101） */
  tag: string
  /** 设备名（1# 远传水表） */
  title: string
  /** 区域中文名 */
  area: string
  /** 实时值（null = 暂无数据） */
  value: number | null
  unit: string
  precision: number
  /** 主测点字段（devid.tag） */
  field: string
  /** 设备 id */
  devId: string
  /** 报警优先级 0~4 */
  prio: number
}>()

const emit = defineEmits<{ close: []; enter: [] }>()

const PRIO_TEXT = ['正常', 'P1 严重', 'P2 高', 'P3 中等', 'P4 提示']
const prioText = computed(() => PRIO_TEXT[props.prio] ?? '正常')
const hasValue = computed(() => props.value !== null && Number.isFinite(props.value))
const valueText = computed(() => (hasValue.value ? props.value!.toFixed(props.precision) : ''))
</script>

<template>
  <aside class="dp" aria-label="设备详情">
    <header class="dp-head">
      <div class="dp-ident">
        <span class="dp-tag">{{ tag }}</span>
        <span class="dp-title">{{ title }}</span>
      </div>
      <span class="dp-status" :class="'prio-' + prio">{{ prioText }}</span>
      <button class="dp-close" type="button" aria-label="关闭设备详情" @click="emit('close')">×</button>
    </header>

    <!-- 主数据：标签在上、值在下；屏幕上唯一的强调色 -->
    <div class="dp-figure">
      <span class="dp-label">实时值</span>
      <span v-if="hasValue" class="dp-value">{{ valueText }}<small>{{ unit }}</small></span>
      <span v-else class="dp-value dp-missing">暂无数据</span>
    </div>

    <dl class="dp-rows">
      <div class="dp-row"><dt>区域</dt><dd>{{ area }}</dd></div>
      <div class="dp-row"><dt>点位</dt><dd>{{ field }}</dd></div>
      <div class="dp-row"><dt>设备 ID</dt><dd class="mono">{{ devId }}</dd></div>
    </dl>

    <button class="dp-enter" type="button" @click="emit('enter')">进入 2D 设备面板</button>
  </aside>
</template>

<style scoped>
/* 深色 3D 空间层的 chrome（对齐 v1 Scene3DView 的 .detail-panel 同款视觉） */
.dp {
  position: absolute; right: 20px; top: 20px; width: 292px; padding: 16px;
  border: 1px solid #2a455e; border-radius: 8px; background: rgba(10, 18, 26, .96);
  color: #e8f1f8; font-family: 'Inter', 'Noto Sans SC', system-ui, sans-serif;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .35);
}
.dp-head { display: flex; align-items: flex-start; gap: 8px; }
.dp-ident { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.dp-tag { font-size: 13px; font-weight: 600; color: #eaf6ff; }
.dp-title { font-size: 12px; color: #9dbdd0; }
.dp-status { flex: none; font-size: 12px; line-height: 20px; padding: 0 8px; border-radius: 4px; background: #16242f; color: #9dbdd0; }
.dp-status.prio-1 { background: #2c1a20; color: #ff8f9c; }
.dp-status.prio-2 { background: #2c2318; color: #ffc08a; }
.dp-status.prio-3 { background: #2a2717; color: #f0d98a; }
.dp-status.prio-4 { background: #16242c; color: #9fcaff; }
.dp-close {
  flex: none; width: 28px; height: 28px; margin: -4px -6px 0 0; border: none; border-radius: 4px;
  background: transparent; color: #8aa7ba; font-size: 20px; line-height: 1; cursor: pointer;
}
.dp-close:hover { background: #16242f; color: #ffffff; }

.dp-figure { display: flex; flex-direction: column; gap: 2px; margin: 18px 0 4px; }
.dp-label { font-size: 12px; color: #9dbdd0; }
.dp-value { font-size: 32px; font-weight: 600; color: #1de0ff; line-height: 1.1; font-variant-numeric: tabular-nums; }
.dp-value small { font-size: 13px; font-weight: 400; color: #9dbdd0; margin-left: 4px; }
.dp-value.dp-missing { font-size: 14px; font-weight: 400; color: #8aa7ba; }

.dp-rows { margin: 14px 0 0; padding: 0; border-top: 1px solid #1e3448; }
.dp-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #1e3448; }
.dp-row dt { font-size: 12px; color: #9dbdd0; }
.dp-row dd { margin: 0; font-size: 13px; color: #e8f1f8; text-align: right; }
.dp-row dd.mono { font-family: ui-monospace, monospace; font-size: 12px; }

.dp-enter {
  width: 100%; margin-top: 16px; height: 34px; border: none; border-radius: 6px;
  background: #e8f1f8; color: #0b1420; font-size: 13px; font-weight: 500; cursor: pointer;
}
.dp-enter:hover { background: #ffffff; }
.dp-close:focus-visible, .dp-enter:focus-visible { outline: 2px solid #1de0ff; outline-offset: 2px; }
</style>
