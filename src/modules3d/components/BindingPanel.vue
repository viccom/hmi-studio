<script setup lang="ts">
/**
 * 3D 场景数据绑定面板（P2）——对齐 2D `BindPanel.vue` 的语义：
 * 设备树 → 选点位 → 选 kind → 配置 → 写回场景文档。
 *
 * 与 2D 的差别：2D 绑到图元 `bind_id`（maotu 直写 bind_attr）；
 * 3D 绑到上游对象的 `bid`（运行页按 bid 找对象改材质/可见性/标签/动画速度）。
 *
 * 悬空绑定（方案 §7 R3）：对象删除重拖会得到新 bid，旧绑定失效。
 * 本面板**显式标红**（不静默丢弃）——静默丢会让用户以为还绑着。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchDeviceTreeRich, type RichDeviceNode } from '../../lib/device-tree'
import {
  addBinding, removeBinding, updateBinding, danglingBindings,
  bindingKindsFor, DEFAULT_CONFIG_BY_KIND,
} from '../adapter/binding-ops'
import type { SceneBinding, SceneDoc } from '../scene3d'

const props = defineProps<{
  /** 当前场景文档（响应式；面板只读它算列表，改动通过事件上抛） */
  doc: SceneDoc
  /** 当前选中的对象 bid（空 = 未选中，不能新增） */
  selectedBid?: string
  /** 选中对象名（展示用） */
  selectedName?: string
  /** 选中对象是否有动画（决定 animationSpeed 是否可选） */
  hasAnimation?: boolean
}>()

const emit = defineEmits<{ (e: 'update-doc', doc: SceneDoc): void }>()

const devices = ref<RichDeviceNode[]>([])
const loading = ref(false)
const pickedField = ref('')
const pickedKind = ref<SceneBinding['kind']>('color')

onMounted(async () => {
  loading.value = true
  devices.value = await fetchDeviceTreeRich()
  loading.value = false
})

/** 选中对象的全部绑定 */
const myBindings = computed(() =>
  (props.doc.bindings ?? []).filter((b) => b.targetBid === props.selectedBid),
)
/** 悬空绑定 id（标红用） */
const dangling = computed(() => new Set(danglingBindings(props.doc)))
/** 可用 kind（无动画则无 animationSpeed） */
const kinds = computed(() => bindingKindsFor({ hasAnimation: !!props.hasAnimation }))

/** 选中的点位元信息（单位/描述，供配置默认值） */
const pickedMeta = computed(() => {
  for (const d of devices.value) {
    const t = d.children.find((c: { id: string }) => c.id === pickedField.value)
    if (t) return { ...t, devLabel: d.desc || d.label }
  }
  return null
})

// 切对象时重置选择（避免把上一台的点位带到新对象）
watch(() => props.selectedBid, () => { pickedField.value = '' })

function onAdd(): void {
  if (!props.selectedBid) { ElMessage.warning('请先在场景树或画布中选中一个对象'); return }
  if (!pickedField.value) { ElMessage.warning('请选择要绑定的点位'); return }
  const cfg = { ...DEFAULT_CONFIG_BY_KIND[pickedKind.value] }
  if (pickedKind.value === 'label' && pickedMeta.value?.unit) cfg.unit = pickedMeta.value.unit
  const next = addBinding(props.doc, {
    targetBid: props.selectedBid,
    field: pickedField.value,
    kind: pickedKind.value,
    config: cfg,
  })
  if (next === props.doc) { ElMessage.info('相同点位与类型已绑定，未重复添加'); return }
  emit('update-doc', next)
  ElMessage.success('已添加绑定，保存后生效')
}

function onRemove(id: string): void {
  emit('update-doc', removeBinding(props.doc, id))
}

function onPatch(id: string, patch: Partial<Omit<SceneBinding, 'id'>>): void {
  emit('update-doc', updateBinding(props.doc, id, patch))
}

/** kind 的中文标签（面板展示） */
const KIND_TEXT: Record<SceneBinding['kind'], string> = {
  color: '颜色',
  emissive: '自发光',
  visible: '显示/隐藏',
  label: '数值标签',
  animationSpeed: '动画速度',
}
</script>

<template>
  <div class="bind-panel">
    <!-- 新增区 -->
    <section class="bind-add">
      <div class="bind-target">
        <span class="bind-label">绑定对象</span>
        <span v-if="selectedBid" class="bind-target-name">{{ selectedName || selectedBid }}</span>
        <span v-else class="bind-target-empty">未选中（先在画布或场景树选一个对象）</span>
      </div>

      <div class="bind-row">
        <span class="bind-label">点位</span>
        <el-select
          v-model="pickedField"
          filterable
          clearable
          size="small"
          placeholder="搜索设备点位…"
          :loading="loading"
          class="bind-select"
        >
          <el-option-group v-for="d in devices" :key="d.id" :label="d.desc || d.id">
            <el-option
              v-for="t in d.children"
              :key="t.id"
              :value="t.id"
              :label="`${t.label}${t.unit ? ' (' + t.unit + ')' : ''}`"
            >
              <span>{{ t.label }}</span>
              <span v-if="t.desc" class="opt-desc">{{ t.desc }}</span>
            </el-option>
          </el-option-group>
        </el-select>
      </div>

      <div class="bind-row">
        <span class="bind-label">作用</span>
        <el-select v-model="pickedKind" size="small" class="bind-select">
          <el-option v-for="k in kinds" :key="k" :value="k" :label="KIND_TEXT[k]" />
        </el-select>
        <el-button size="small" type="primary" :disabled="!selectedBid || !pickedField" @click="onAdd">
          添加
        </el-button>
      </div>
      <p v-if="pickedMeta" class="bind-meta">
        {{ pickedMeta.devLabel }} · {{ pickedMeta.desc || pickedMeta.label }}
      </p>
    </section>

    <!-- 已有绑定 -->
    <section class="bind-list">
      <h4 class="bind-list-title">
        已绑定 <span class="bind-count">{{ myBindings.length }}</span>
      </h4>
      <p v-if="!myBindings.length" class="bind-empty">该对象还没有数据绑定</p>

      <div
        v-for="b in myBindings" :key="b.id"
        class="bind-item" :class="{ dangling: dangling.has(b.id) }"
      >
        <div class="bind-item-head">
          <span class="bind-item-field">{{ b.field }}</span>
          <el-tag v-if="dangling.has(b.id)" size="small" type="danger" effect="dark">悬空</el-tag>
          <el-tag size="small" type="info">{{ KIND_TEXT[b.kind] }}</el-tag>
          <el-button size="small" text type="danger" @click="onRemove(b.id)">删除</el-button>
        </div>

        <!-- kind 专属配置 -->
        <div class="bind-item-cfg">
          <template v-if="b.kind === 'color' || b.kind === 'emissive'">
            <span class="cfg-label">颜色</span>
            <el-color-picker
              :model-value="'#' + Number(b.config.color ?? 0x1de0ff).toString(16).padStart(6, '0')"
              size="small"
              @change="(v: string | null) => onPatch(b.id, { config: { ...b.config, color: parseInt(String(v ?? '#1de0ff').slice(1), 16) } })"
            />
            <template v-if="b.kind === 'emissive'">
              <span class="cfg-label">强度系数</span>
              <el-input-number
                :model-value="Number(b.config.scale ?? 0.1)"
                :step="0.05" :min="0.01" :max="10" size="small" controls-position="right"
                class="cfg-num"
                @change="(v: number | undefined) => onPatch(b.id, { config: { ...b.config, scale: v ?? 0.1 } })"
              />
            </template>
          </template>

          <template v-else-if="b.kind === 'visible'">
            <span class="cfg-label">大于此值显示</span>
            <el-input-number
              :model-value="Number(b.config.truthyAbove ?? 0.5)"
              :step="0.1" size="small" controls-position="right" class="cfg-num"
              @change="(v: number | undefined) => onPatch(b.id, { config: { ...b.config, truthyAbove: v ?? 0.5 } })"
            />
          </template>

          <template v-else-if="b.kind === 'label'">
            <span class="cfg-label">单位</span>
            <el-input
              :model-value="String(b.config.unit ?? '')" size="small" class="cfg-text"
              @update:model-value="(v: string) => onPatch(b.id, { config: { ...b.config, unit: v } })"
            />
            <span class="cfg-label">小数位</span>
            <el-input-number
              :model-value="Number(b.config.precision ?? 1)"
              :min="0" :max="4" size="small" controls-position="right" class="cfg-num"
              @change="(v: number | undefined) => onPatch(b.id, { config: { ...b.config, precision: v ?? 1 } })"
            />
          </template>

          <template v-else-if="b.kind === 'animationSpeed'">
            <span class="cfg-hint">动画速度 = 实时值（钳到 0.1~3）</span>
          </template>
        </div>
      </div>

      <p v-if="dangling.size" class="bind-warn">
        有 {{ dangling.size }} 条绑定指向已不存在的对象（对象删除后重拖会生成新 bid）——删除或重新绑定。
      </p>
    </section>
  </div>
</template>

<style scoped>
.bind-panel { padding: 10px 12px; font-size: 12px; }
.bind-add { border-bottom: 1px solid var(--el-border-color-lighter); padding-bottom: 12px; margin-bottom: 10px; }
.bind-target { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.bind-label { color: var(--el-text-color-secondary); flex: 0 0 52px; }
.bind-target-name { color: var(--el-color-primary); font-weight: 600; }
.bind-target-empty { color: var(--el-text-color-placeholder); }
.bind-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.bind-select { flex: 1; min-width: 0; }
.opt-desc { float: right; color: var(--el-text-color-secondary); font-size: 11px; margin-left: 12px; }
.bind-meta { margin: 0; color: var(--el-text-color-secondary); font-size: 11px; }
.bind-list-title { margin: 0 0 8px; font-size: 12px; font-weight: 600; color: var(--el-text-color-primary); }
.bind-count { color: var(--el-color-primary); }
.bind-empty { margin: 0; color: var(--el-text-color-placeholder); }
.bind-item {
  border: 1px solid var(--el-border-color-lighter); border-radius: 6px;
  padding: 8px; margin-bottom: 8px;
}
.bind-item.dangling { border-color: var(--el-color-danger); background: color-mix(in srgb, var(--el-color-danger) 6%, transparent); }
.bind-item-head { display: flex; align-items: center; gap: 6px; }
.bind-item-field {
  flex: 1; min-width: 0; font-family: ui-monospace, monospace; font-size: 11px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--el-text-color-primary);
}
.bind-item-cfg { display: flex; align-items: center; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.cfg-label { color: var(--el-text-color-secondary); font-size: 11px; }
.cfg-num { width: 92px; }
.cfg-text { width: 72px; }
.cfg-hint { color: var(--el-text-color-secondary); font-size: 11px; }
.bind-warn { margin: 8px 0 0; color: var(--el-color-danger); font-size: 11px; }
</style>
