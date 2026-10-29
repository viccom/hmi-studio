<!--
  BI 时间窗口切换器（ah-bi-window，vue 型）。
  ┌─ 上行控制（通道 B 的反向路径）───────────────────────────────────
  │ 点击 → 发全局 DOM 事件 BI_WINDOW_EVENT（'ah-bi-window-change'，detail.secs）；
  │ 宿主 ViewView 监听 → 收集器覆盖窗生效 → 写回 props.data.val
  │ （`{"activeSecs":N}`，0=默认）→ 本组件高亮回显。图元零 import、零 maotu API。
  └────────────────────────────────────────────────────────────────────
  回显权威在宿主写回；本地 activeSecs 乐观置位只为消「点击 → 写回」间隙的闪烁。
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/** 本地档位形状（与 lib 契约 BiWindowOption 同形；symbols 层独立声明）。 */
interface WinOption {
  label: string
  secs: number
}

const props = defineProps<{
  fill?: string    // 选中态底色
  title?: string   // 标题（可空=不显示）
  options?: string // 档位 JSON 串
  data?: string    // 回显通道（宿主写 `{"activeSecs":N}`）
}>()

const DEFAULT_OPTIONS: WinOption[] = [
  { label: '默认', secs: 0 },
  { label: '1时', secs: 3600 },
  { label: '24时', secs: 86400 },
  { label: '7天', secs: 604800 },
]

const opts = computed<WinOption[]>(() => {
  const raw = props.options
  if (typeof raw !== 'string' || !raw.trim()) return DEFAULT_OPTIONS
  try {
    const arr: unknown = JSON.parse(raw)
    if (!Array.isArray(arr)) return DEFAULT_OPTIONS
    const out: WinOption[] = []
    for (const it of arr) {
      const o = (it ?? {}) as Record<string, unknown>
      const label = typeof o.label === 'string' ? o.label : ''
      const secs = Number(o.secs)
      if (!label || !Number.isFinite(secs) || secs < 0) continue
      out.push({ label, secs: Math.floor(secs) })
    }
    return out.length ? out : DEFAULT_OPTIONS
  } catch {
    return DEFAULT_OPTIONS
  }
})

/** 宿主写回的生效档（0/缺失 = 默认）。 */
const hostSecs = ref(0)
watch(
  () => props.data,
  (raw) => {
    if (typeof raw !== 'string' || !raw.trim()) return
    try {
      const o = JSON.parse(raw) as { activeSecs?: unknown }
      const n = Number(o?.activeSecs)
      if (Number.isFinite(n) && n >= 0) hostSecs.value = Math.floor(n)
    } catch { /* 坏回显不炸——保持上一态 */ }
  },
  { immediate: true },
)

/** 乐观置位：点击即亮，宿主写回后对齐（写回的是权威值）。 */
const localSecs = ref<number | null>(null)
const activeSecs = computed(() => localSecs.value ?? hostSecs.value)

function pick(o: WinOption): void {
  localSecs.value = o.secs
  window.dispatchEvent(new CustomEvent('ah-bi-window-change', { detail: { secs: o.secs } }))
}
</script>

<template>
  <div class="ah-bwd">
    <span v-if="props.title" class="ah-bwd-title">{{ props.title }}</span>
    <div class="ah-bwd-seg">
      <button
        v-for="o in opts"
        :key="o.secs"
        type="button"
        class="ah-bwd-btn"
        :class="{ on: activeSecs === o.secs }"
        :style="activeSecs === o.secs ? { background: props.fill ?? '#f5a623', borderColor: props.fill ?? '#f5a623', color: '#0b0e14' } : {}"
        @click="pick(o)"
      >{{ o.label }}</button>
    </div>
  </div>
</template>

<style scoped>
.ah-bwd {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px;
  box-sizing: border-box;
  font-family: Consolas, Menlo, monospace;
}
.ah-bwd-title { font-size: 11px; color: #8b949e; flex: none; }
.ah-bwd-seg { display: flex; gap: 6px; }
.ah-bwd-btn {
  height: 28px;
  padding: 0 14px;
  border-radius: 4px;
  border: 1px solid #30363d;
  background: #161b22;
  color: #8b949e;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.ah-bwd-btn:hover { border-color: #8b949e; color: #c9d1d9; }
.ah-bwd-btn.on {
  font-weight: 700;
}
</style>
