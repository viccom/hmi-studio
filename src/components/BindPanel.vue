<script setup lang="ts">
// W8 绑定面板（deviceBind 官方插槽）：MtEdit 绑定 tab 内插槽替换默认面板——
// bundle 实证：item = store.done_json[n] 的响应式对象（IDoneJson），插槽内容直接变异
// item（item.binds = [...]）即驱动 UI 与保存链路（onSaveClick 全量 PUT 读同一 store）。
// 已知代价（评估已交代，见面板底部注释）：不提供 bind_mapping 映射规则；绑定变更不进 maotu 撤销历史。
// bind/trigger 形状唯一真相 = e2e/fixtures.ts 实证种子 + maotu IDoneJsonBindList（store/types.d.ts）。
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { CompareOperator, IDoneJson, IDoneJsonBindList } from 'maotu'
import { fetchDeviceTreeRich, type RichDeviceNode, type RichTagNode } from '../lib/device-tree'
import { uid } from '../lib/uid'
import { normalizeTriggerValue } from '../lib/trigger-value'

const props = defineProps<{ item: IDoneJson }>()

// —— 富点位树（devreg：设备 desc + 点位 desc/unit）——
const tree = ref<RichDeviceNode[]>([])
onMounted(async () => { tree.value = await fetchDeviceTreeRich() })

const filterText = ref('')
const treeRef = ref<{ filter: (v: string) => void }>()
watch(filterText, (v) => treeRef.value?.filter(v))

function isDev(d: RichDeviceNode | RichTagNode): d is RichDeviceNode {
  return Array.isArray((d as RichDeviceNode).children)
}
function filterNode(value: string, data: RichDeviceNode | RichTagNode): boolean {
  if (!value) return true
  const v = value.toLowerCase()
  return data.label.toLowerCase().includes(v)
    || data.desc.toLowerCase().includes(v)
    || (!isDev(data) && data.unit.toLowerCase().includes(v))
}

const selectedPoint = ref<RichTagNode | null>(null)
function onNodeClick(data: RichDeviceNode | RichTagNode) {
  if (isDev(data)) return // 设备节点仅容器
  selectedPoint.value = data
}

// —— 属性选择（运行时 props 是描述符表：{title,type,val}，见规范 §2.2/F12）——
interface PropOption { key: string; path: string; title: string }
const propOptions = computed<PropOption[]>(() => {
  const p = props.item.props as Record<string, unknown> | undefined
  return Object.keys(p ?? {}).map((k) => {
    const d = p?.[k]
    const title = d && typeof d === 'object' && typeof (d as { title?: unknown }).title === 'string'
      ? (d as { title: string }).title
      : k
    return { key: k, path: `props.${k}.val`, title }
  })
})

// 默认智能猜：有 fill 选 fill、有 text 选 text、否则首个
function guessAttr(): string {
  const keys = propOptions.value.map((o) => o.key)
  if (keys.includes('fill')) return 'props.fill.val'
  if (keys.includes('text')) return 'props.text.val'
  return propOptions.value[0]?.path ?? ''
}
const attrPath = ref(guessAttr())
watch(() => props.item.id, () => { // 切换选中图元 → 重置选择
  selectedPoint.value = null
  expanded.value = null
  attrPath.value = guessAttr()
})

const binds = computed<IDoneJsonBindList[]>(() => props.item.binds ?? [])

// W11 模板绑定：勾选后 bind_id 写 @dev.<tag>（所选设备仅用于浏览标签清单），
// 运行页 ViewView 按激活设备重写（dev-context.ts，传统 HMI 画面模板 + 标签前缀模式）
const templateMode = ref(false)

function addBind() {
  const pt = selectedPoint.value
  if (!pt || !attrPath.value) return
  const bindId = templateMode.value ? `@dev.${pt.id.split('.')[1] ?? pt.id}` : pt.id
  if (binds.value.some((b) => b.bind_id === bindId && b.bind_attr === attrPath.value)) {
    ElMessage.warning('该点位已绑定此属性')
    return
  }
  const nb: IDoneJsonBindList = {
    id: uid(),
    pel_id: props.item.id,
    bind_id: bindId, // <devid>.<tag>；模板模式 = @dev.<tag>（W11）
    bind_name: pt.label, // tag 名
    bind_attr: attrPath.value, // 铁律：一律 props.<name>.val
    bind_mapping: [],
    triggers: [],
  }
  props.item.binds = [...binds.value, nb] // 整组重赋值触发响应式（直改 store 对象）
  selectedPoint.value = null
}
function removeBind(i: number) {
  const arr = [...binds.value]
  arr.splice(i, 1)
  props.item.binds = arr
}

// —— 触发器（每绑定可展开；形状照抄 demo-screen trig()：rule+changeAttr+change_attr）——
const OPERATORS: CompareOperator[] = ['>', '<', '>=', '<=', '=', '!=']
const expanded = ref<string | null>(null)
const draft = reactive({ operator: '>' as CompareOperator, value: '', target_attr: '', target_value: '' })

function toggleTrig(b: IDoneJsonBindList) {
  if (expanded.value === b.id) { expanded.value = null; return }
  expanded.value = b.id
  draft.operator = '>'
  draft.value = ''
  draft.target_attr = b.bind_attr
  draft.target_value = ''
}
function addTrigger(b: IDoneJsonBindList) {
  if (draft.value === '' || !draft.target_attr) return
  const num = Number(draft.value)
  const t: IDoneJsonBindList['triggers'][number] = {
    id: uid(),
    rule: { operator: draft.operator, value: Number.isNaN(num) ? draft.value : num },
    action: 'changeAttr',
    change_attr: [{
      id: uid(),
      target_id: props.item.id,
      target_attr: draft.target_attr,
      // 按目标属性类型归一（switch→bool/number→num）：布尔写 'false' 串会恒真（审查 P1-3）
      target_value: normalizeTriggerValue(draft.target_attr, draft.target_value, props.item.props as Record<string, { type?: string }>),
    }],
    custom_code: '',
  }
  b.triggers = [...(b.triggers ?? []), t]
  draft.value = ''
  draft.target_value = ''
}
function removeTrigger(b: IDoneJsonBindList, i: number) {
  const arr = [...(b.triggers ?? [])]
  arr.splice(i, 1)
  b.triggers = arr
}
/** 高级模式切换：action 在 changeAttr/customCode 间切换；customCode 态直编 custom_code */
function toggleCustom(t: IDoneJsonBindList['triggers'][number]) {
  t.action = t.action === 'customCode' ? 'changeAttr' : 'customCode'
  if (t.action === 'changeAttr') t.custom_code = ''
}
function trigDesc(t: IDoneJsonBindList['triggers'][number]): string {
  const ca = t.change_attr[0]
  return `${t.rule.operator} ${String(t.rule.value)} → ${ca?.target_attr ?? '?'} = ${String(ca?.target_value ?? '')}`
}
</script>

<template>
  <div class="bind-panel">
    <section class="bp-section">
      <div class="bp-label">设备点位</div>
      <el-input
        v-model="filterText" class="bp-search" size="small" clearable
        placeholder="搜索点位 / 描述…"
      />
      <div class="bp-tree-box">
        <el-tree
          ref="treeRef" :data="tree" node-key="id" default-expand-all
          :props="{ children: 'children', label: 'label' }"
          :expand-on-click-node="false" :filter-node-method="filterNode"
          @node-click="onNodeClick"
        >
          <template #default="{ data }">
            <span class="bp-node" :class="{ 'is-leaf': !isDev(data), 'is-selected': selectedPoint?.id === data.id }">
              <template v-if="isDev(data)">
                <span class="bp-dev-label">{{ data.label }}</span>
                <span v-if="data.desc" class="bp-dev-desc">{{ data.desc }}</span>
              </template>
              <template v-else>
                <span class="bp-tag-label">{{ data.label }}</span>
                <span v-if="data.desc" class="bp-tag-desc">{{ data.desc }}</span>
                <span v-if="data.unit" class="bp-tag-unit">{{ data.unit }}</span>
              </template>
            </span>
          </template>
        </el-tree>
        <div v-if="!tree.length" class="bp-empty">设备树不可用（离线仍可组态）</div>
      </div>
    </section>

    <section class="bp-section">
      <div class="bp-label">选中点位</div>
      <div v-if="selectedPoint" class="bp-selected">
        <span class="bp-field">{{ selectedPoint.id }}</span>
        <span class="bp-desc">{{ selectedPoint.desc }}</span>
        <button class="bp-x" title="取消选择" @click="selectedPoint = null">×</button>
      </div>
      <div v-else class="bp-empty">点击上方点位叶子选择</div>
    </section>

    <section class="bp-section">
      <div class="bp-label">绑定属性</div>
      <div class="bp-prop-row">
        <el-select v-model="attrPath" size="small" class="bp-prop" placeholder="选择图元属性">
          <el-option v-for="o in propOptions" :key="o.path" :label="o.title" :value="o.path">
            <span class="bp-opt-title">{{ o.title }}</span>
            <span class="bp-opt-path">{{ o.path }}</span>
          </el-option>
        </el-select>
        <el-button type="primary" size="small" :disabled="!selectedPoint || !attrPath" @click="addBind">
          添加绑定
        </el-button>
      </div>
      <label class="bp-tpl" title="bind_id 写为 @dev.<tag>；运行页按激活设备重写（传统 HMI 画面模板+标签前缀）。所选设备仅用于浏览标签清单">
        <input v-model="templateMode" type="checkbox" />
        模板绑定 @dev（参数化画面）
      </label>
    </section>

    <section class="bp-section">
      <div class="bp-label">绑定列表（{{ binds.length }}）</div>
      <div v-for="(b, i) in binds" :key="b.id" class="bp-bind">
        <div class="bp-bind-row">
          <span class="bp-bind-main">
            <span class="bp-field">{{ b.bind_id }}</span>
            <span class="bp-arrow">→</span>
            <span class="bp-path">{{ b.bind_attr }}</span>
          </span>
          <span class="bp-trig-badge" title="触发器数">{{ b.triggers?.length ?? 0 }}</span>
          <button class="bp-x" title="删除绑定" @click="removeBind(i)">×</button>
        </div>
        <button class="bp-trig-toggle" @click="toggleTrig(b)">
          {{ expanded === b.id ? '▾' : '▸' }} 触发器（{{ b.triggers?.length ?? 0 }}）
        </button>
        <div v-if="expanded === b.id" class="bp-trig-editor">
          <div class="bp-trig-form">
            <el-select v-model="draft.operator" size="small" class="bp-op">
              <el-option v-for="op in OPERATORS" :key="op" :label="op" :value="op" />
            </el-select>
            <el-input v-model="draft.value" size="small" class="bp-th" placeholder="阈值" />
            <span class="bp-arrow">→</span>
            <el-select v-model="draft.target_attr" size="small" class="bp-prop" placeholder="目标属性">
              <el-option v-for="o in propOptions" :key="o.path" :label="o.title" :value="o.path">
                <span class="bp-opt-title">{{ o.title }}</span>
                <span class="bp-opt-path">{{ o.path }}</span>
              </el-option>
            </el-select>
            <el-input v-model="draft.target_value" size="small" class="bp-tv" placeholder="目标值" />
            <el-button size="small" :disabled="!draft.value || !draft.target_attr" @click="addTrigger(b)">
              加触发
            </el-button>
          </div>
          <div v-for="(t, ti) in b.triggers" :key="t.id" class="bp-trig-item">
            <div class="bp-trig-row">
              <span class="bp-trig-desc">{{ trigDesc(t) }}</span>
              <button
                class="bp-mini" :class="{ 'is-on': t.action === 'customCode' }"
                title="高级模式：action 切 customCode 直编代码" @click="toggleCustom(t)"
              >
                custom_code
              </button>
              <button class="bp-x" title="删除触发器" @click="removeTrigger(b, ti)">×</button>
            </div>
            <el-input
              v-if="t.action === 'customCode'" v-model="t.custom_code"
              type="textarea" :rows="3" size="small" class="bp-code" placeholder="custom_code JS"
            />
          </div>
        </div>
      </div>
      <div v-if="!binds.length" class="bp-empty">暂无绑定：选点位 → 选属性 → 添加绑定</div>
    </section>

    <div class="bp-note">注：不提供 bind_mapping 映射规则；绑定变更不进 maotu 撤销历史。</div>
  </div>
</template>

<style scoped>
/* 紧凑工业风：对齐全局深色主题（--el-* 变量随 html.dark 双主题）；宽度随右栏 */
.bind-panel {
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bp-section { border-bottom: 1px solid var(--el-border-color-lighter); padding-bottom: 8px; }
.bp-label {
  color: var(--el-text-color-secondary); font-size: 11px;
  margin-bottom: 6px; letter-spacing: 0.05em;
}
.bp-search { margin-bottom: 6px; }
.bp-tree-box {
  max-height: 200px; overflow: auto;
  border: 1px solid var(--el-border-color-lighter); border-radius: 4px;
  background: var(--el-fill-color-blank);
}
.bp-tree-box :deep(.el-tree) { --el-tree-node-content-height: 24px; font-size: 12px; background: transparent; }
.bp-node {
  display: inline-flex; align-items: baseline; gap: 6px;
  min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  padding: 0 4px; border-radius: 3px; line-height: 20px;
}
.bp-node.is-selected { background: var(--el-color-primary-light-9); outline: 1px solid var(--el-color-primary); }
.bp-dev-label { font-weight: 600; }
.bp-dev-desc { color: var(--el-text-color-secondary); font-size: 11px; }
.bp-tag-label { font-family: monospace; }
.bp-tag-desc { color: var(--el-text-color-secondary); font-size: 11px; }
.bp-tag-unit { color: var(--el-color-primary); font-size: 11px; }
.bp-empty { color: var(--el-text-color-secondary); font-size: 11px; padding: 4px 2px; }
.bp-selected {
  display: flex; align-items: baseline; gap: 6px;
  padding: 4px 6px; border: 1px solid var(--el-color-primary); border-radius: 4px;
  background: var(--el-color-primary-light-9);
}
.bp-field { font-family: monospace; font-weight: 600; }
.bp-desc { color: var(--el-text-color-secondary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.bp-x {
  border: none; background: transparent; color: var(--el-text-color-secondary);
  cursor: pointer; font-size: 13px; line-height: 1; padding: 0 2px; flex-shrink: 0;
}
.bp-x:hover { color: var(--el-color-danger); }
.bp-prop-row { display: flex; gap: 6px; }
.bp-prop { flex: 1; min-width: 0; }
.bp-prop-row .el-button { flex-shrink: 0; }
.bp-opt-title { float: left; }
.bp-opt-path { float: right; color: var(--el-text-color-secondary); font-size: 11px; font-family: monospace; }
.bp-bind { border: 1px solid var(--el-border-color-lighter); border-radius: 4px; padding: 4px 6px; margin-bottom: 6px; }
.bp-bind-row { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.bp-bind-main { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bp-arrow { color: var(--el-text-color-secondary); }
.bp-path { font-family: monospace; font-size: 11px; color: var(--el-color-primary); }
.bp-trig-badge {
  flex-shrink: 0; min-width: 16px; text-align: center;
  background: var(--el-fill-color); border-radius: 8px; font-size: 10px; padding: 0 5px;
  color: var(--el-text-color-secondary);
}
.bp-trig-toggle {
  border: none; background: transparent; cursor: pointer; padding: 2px 0;
  color: var(--el-text-color-secondary); font-size: 11px;
}
.bp-trig-toggle:hover { color: var(--el-color-primary); }
.bp-trig-editor { padding: 4px 0 2px; }
.bp-trig-form { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
.bp-op { width: 64px; flex-shrink: 0; }
.bp-th { width: 70px; flex-shrink: 0; }
.bp-tv { width: 80px; flex-shrink: 0; }
.bp-trig-item { border-top: 1px dashed var(--el-border-color-lighter); padding-top: 4px; margin-top: 4px; }
.bp-trig-row { display: flex; align-items: baseline; gap: 6px; }
.bp-trig-desc { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-family: monospace; font-size: 11px; }
.bp-mini {
  border: 1px solid var(--el-border-color-lighter); background: transparent;
  color: var(--el-text-color-secondary); font-size: 10px; border-radius: 3px;
  cursor: pointer; padding: 0 4px; flex-shrink: 0;
}
.bp-mini.is-on { color: var(--el-color-warning); border-color: var(--el-color-warning); }
.bp-code { margin-top: 4px; }
.bp-code :deep(textarea) { font-family: monospace; font-size: 11px; }
.bp-note { color: var(--el-text-color-secondary); font-size: 10px; opacity: 0.8; }
</style>
<style scoped>
.bp-tpl {
  display: flex; align-items: center; gap: 6px; margin-top: 6px;
  font-size: 12px; color: var(--el-text-color-secondary); cursor: pointer;
}
</style>
