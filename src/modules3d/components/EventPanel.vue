<script setup lang="ts">
/**
 * 3D 场景事件编辑面板（P2）：选中对象 → 配置点击动作。
 *
 * 与 2D 的对齐：`navigate` 的 `slug?dev=` 语义复用 `lib/nav.ts`；此处只编辑规则，
 * 求值/执行在运行页（`adapter/events.ts` + `Scene3DRunView`）。
 *
 * 悬空事件同样标红（事件也引用 bid，对象重拖后失效）。
 */
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { danglingEvents } from '../adapter/binding-ops'
import type { SceneDoc, SceneEventRule } from '../scene3d'

const props = defineProps<{
  doc: SceneDoc
  selectedBid?: string
  selectedName?: string
}>()
const emit = defineEmits<{ (e: 'update-doc', doc: SceneDoc): void }>()

const ACTION_TEXT: Record<SceneEventRule['do']['type'], string> = {
  navigate: '跳转 2D 画面',
  focus: '相机聚焦对象',
  setCamera: '切到指定视角',
  command: '下发命令',
}

const myEvents = computed(() => (props.doc.events ?? []).filter((e) => e.on?.targetBid === props.selectedBid))
const dangling = computed(() => new Set(danglingEvents(props.doc)))

/** 有事件的对象的绑定（命令动作要反查 devId） */
const myBindings = computed(() => (props.doc.bindings ?? []).filter((b) => b.targetBid === props.selectedBid))

function write(next: SceneEventRule[]): void {
  emit('update-doc', { ...props.doc, events: next })
}

function onAdd(type: SceneEventRule['do']['type']): void {
  if (!props.selectedBid) { ElMessage.warning('请先选中一个对象'); return }
  if (myEvents.value.length) { ElMessage.info('该对象已有点击规则（一个对象一条）'); return }
  const id = `evt_${String(props.selectedBid).replace(/^bid_/, '').slice(-6)}`
  const doAction: SceneEventRule['do'] =
    type === 'focus' ? { type: 'focus', targetBid: props.selectedBid }
    : type === 'navigate' ? { type: 'navigate', slug: '' }
    : type === 'command' ? { type: 'command', targetBid: props.selectedBid, cmd: '' }
    : { type: 'setCamera', view: { position: [8, 6, 8], target: [0, 1, 0] } }
  write([...(props.doc.events ?? []), { id, on: { type: 'click', targetBid: props.selectedBid }, do: doAction }])
}

function onRemove(id: string): void {
  write((props.doc.events ?? []).filter((e) => e.id !== id))
}

function onPatch(id: string, doAction: SceneEventRule['do']): void {
  write((props.doc.events ?? []).map((e) => (e.id === id ? { ...e, do: doAction } : e)))
}
</script>

<template>
  <div class="evt-panel">
    <div class="evt-target">
      <span class="evt-label">对象</span>
      <span v-if="selectedBid" class="evt-name">{{ selectedName || selectedBid }}</span>
      <span v-else class="evt-empty">未选中</span>
    </div>

    <div v-if="!myEvents.length" class="evt-add">
      <p class="evt-hint">为选中对象添加点击动作：</p>
      <el-button
        v-for="(text, type) in ACTION_TEXT" :key="type"
        size="small" class="evt-add-btn" :disabled="!selectedBid"
        @click="onAdd(type as SceneEventRule['do']['type'])"
      >{{ text }}</el-button>
    </div>

    <div
      v-for="e in myEvents" :key="e.id"
      class="evt-item" :class="{ dangling: dangling.has(e.id) }"
    >
      <div class="evt-item-head">
        <span class="evt-kind">{{ ACTION_TEXT[e.do.type] }}</span>
        <el-tag v-if="dangling.has(e.id)" size="small" type="danger" effect="dark">悬空</el-tag>
        <el-button size="small" text type="danger" @click="onRemove(e.id)">删除</el-button>
      </div>

      <!-- navigate：目标画面 + 可选设备上下文 -->
      <div v-if="e.do.type === 'navigate'" class="evt-cfg">
        <span class="evt-cfg-label">目标</span>
        <el-input
          :model-value="e.do.slug" size="small" placeholder="画面 slug，如 iot-faceplate-wm1"
          class="evt-input"
          @update:model-value="(v: string) => onPatch(e.id, { type: 'navigate', slug: v, dev: (e.do as { dev?: string }).dev })"
        />
        <span class="evt-cfg-label">设备</span>
        <el-input
          :model-value="(e.do as { dev?: string }).dev ?? ''" size="small" placeholder="可选 dev_wm1"
          class="evt-input"
          @update:model-value="(v: string) => onPatch(e.id, { type: 'navigate', slug: (e.do as { slug: string }).slug, dev: v })"
        />
      </div>

      <!-- command：命令名（devId 由绑定反查） -->
      <div v-else-if="e.do.type === 'command'" class="evt-cfg">
        <span class="evt-cfg-label">命令</span>
        <el-input
          :model-value="e.do.cmd" size="small" placeholder="如 start / stop"
          class="evt-input"
          @update:model-value="(v: string) => onPatch(e.id, { type: 'command', targetBid: (e.do as { targetBid: string }).targetBid, cmd: v })"
        />
        <p v-if="!myBindings.length" class="evt-cfg-warn">
          该对象未绑定设备，命令无法反查 devId——先加一条数据绑定。
        </p>
      </div>

      <!-- focus / setCamera：只读说明 -->
      <p v-else class="evt-cfg-hint">
        {{ e.do.type === 'focus' ? '点击后相机飞向该对象' : '点击后切到固定视角（在编辑器里调好视角后保存即生效）' }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.evt-panel { padding: 10px 12px; font-size: 12px; }
.evt-target { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.evt-label { color: var(--el-text-color-secondary); flex: 0 0 40px; }
.evt-name { color: var(--el-color-primary); font-weight: 600; }
.evt-empty { color: var(--el-text-color-placeholder); }
.evt-hint { margin: 0 0 8px; color: var(--el-text-color-secondary); }
.evt-add-btn { margin: 0 6px 6px 0; }
.evt-item {
  border: 1px solid var(--el-border-color-lighter); border-radius: 6px;
  padding: 8px; margin-bottom: 8px;
}
.evt-item.dangling { border-color: var(--el-color-danger); background: color-mix(in srgb, var(--el-color-danger) 6%, transparent); }
.evt-item-head { display: flex; align-items: center; gap: 6px; }
.evt-kind { flex: 1; font-weight: 600; color: var(--el-text-color-primary); }
.evt-cfg { display: flex; align-items: center; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.evt-cfg-label { color: var(--el-text-color-secondary); font-size: 11px; }
.evt-input { flex: 1; min-width: 120px; }
.evt-cfg-hint { margin: 6px 0 0; color: var(--el-text-color-secondary); font-size: 11px; }
.evt-cfg-warn { margin: 6px 0 0; color: var(--el-color-warning); font-size: 11px; width: 100%; }
</style>
