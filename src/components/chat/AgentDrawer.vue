<!-- src/components/chat/AgentDrawer.vue —— 移植自控制台（P2，设计 §5.1 复制优先）。
  差异（相对控制台原版，其余逐行同源）：
  - 裁掉 📎 附件上传与 📁 工作区 @ 引用（设计 v1 裁决：workspace 语义对 hmi 场景不合）
  - ⚙ 供应商管理入口按 agent.providersAvailable 显隐（gateway 未配 [reasonix] → 503 → 隐藏）
  - 空态占位文案 hmi 化（画面/设备/历史语境）
  - 主题变量经 chat-theme.css 注入（hmi-studio 无控制台变量盘）
  AI 面板容器（右侧抽屉 570px，可拖宽 400-800）：
  - 头部：会话下拉 + 状态（思考中/就绪） + ⚙ + 关闭
  - 消息流：MessageItem 列表（user 右对齐 / assistant 思考折叠 + 流式文本 + 工具卡）
  - 输入框：控件工具栏（模型/effort/执行方式/权限）+ textarea + 发送（Enter 发送）
  - 权限弹窗：approval_request 触发 PermissionModal
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useAgentStore, effortLevelsFor } from './agent'
import './chat-theme.css'
import { useChatScroll } from './composables/useChatScroll'
import MessageItem, { runningKey } from './MessageItem.vue'
import PermissionModal from './PermissionModal.vue'
import AskModal from './AskModal.vue'
import ProviderModal from './ProviderModal.vue'
import type { ToolApprovalMode } from './types'

const agent = useAgentStore()
const input = ref('')
/** effort 输入值（serve 不暴露当前 effort，控件无法回读；datalist 下拉 + 自由输入兜底）。 */
const effortInput = ref('')
/** 当前模型的 effort 档位（datalist 候选项，来源官方 effort.go 映射；未知模型为空 → 自由输入）。 */
const effortOptions = computed(() => {
  const active = agent.models.find((m) => m.active) ?? agent.models.find((m) => m.ref === agent.activeModelRef)
  return active ? effortLevelsFor(active.provider, active.model) : []
})
/** 目标输入态（执行方式=目标 且尚未提交目标时，输入框内容将作为目标提交）。 */
const goalDraftMode = ref(false)
/** 目标状态轮询定时器（SSE 无 goal 事件，goalStatus 只在 /status 暴露）。 */
let goalPollTimer: ReturnType<typeof setInterval> | null = null
/** AskModal "稍后再说"后的关闭态：不清 agent.ask（serve 侧 turn 仍挂起等回答），
 *  只折叠弹窗并保留重开入口。 */
const askDismissed = ref(false)
/** 新提问到达时自动重置关闭态（弹出新一轮提问）。 */
watch(() => agent.ask?.id, id => { if (id) askDismissed.value = false })

/** 本地错误提示（submit/会话/控件 失败等，单独显示在输入区上方）。 */
const errorMsg = ref('')
const listRef = ref<HTMLElement | null>(null)
/** 会话下拉展开态（点击外部关闭）。 */
const sessionMenuOpen = ref(false)
/** 会话下拉根元素（点击外部检测用）。 */
const sessionMenuRef = ref<HTMLElement | null>(null)
/** LLM 供应商管理弹窗。 */
const providerModalOpen = ref(false)

const emit = defineEmits<{ close: [] }>()

/** 抽屉宽度（px）：默认 570，支持边缘拖拽调宽 400–800，localStorage 持久化（与控制台共享同一偏好键）。 */
const DRAWER_WIDTH_KEY = 'rsiot_drawer_width'
function readDrawerWidth(): number {
  const saved = Number(window.localStorage.getItem(DRAWER_WIDTH_KEY))
  return saved >= 400 && saved <= 800 ? saved : 570
}
const drawerWidth = ref(readDrawerWidth())
/** 拖拽进行中（临时禁用元素过渡，避免拖拽时抖动）。 */
const dragging = ref(false)

/** 拖拽手柄指针按下：记录起点宽度 + 起点 clientX。 */
function onResizeStart(e: PointerEvent) {
  dragging.value = true
  const startX = e.clientX
  const startW = drawerWidth.value
  const onMove = (ev: PointerEvent) => {
    drawerWidth.value = Math.min(800, Math.max(400, startW + (startX - ev.clientX)))
  }
  const onUp = () => {
    dragging.value = false
    window.localStorage.setItem(DRAWER_WIDTH_KEY, String(drawerWidth.value))
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

const { showBackToBottom, onScroll, snapToBottom, followIfAtBottom } = useChatScroll(listRef)

/** provide running 态给 MessageItem（思考面板活跃色 + 加载占位判断）。 */
provide(runningKey, computed(() => agent.running))

/** 当前显示的会话标题（下拉触发器文案）。 */
const currentSessionLabel = computed(
  () => agent.currentSession?.title || agent.currentSession?.name || '新会话',
)

/** 执行方式三态（对齐 desktop collaborationMode）：常规/计划(plan)/目标(goal)。 */
const execMode = computed<'normal' | 'plan' | 'goal'>(() => {
  if (agent.status?.plan) return 'plan'
  if (agent.status?.goal || goalDraftMode.value) return 'goal'
  return 'normal'
})

/** goalStatus 中文文案（serve goal.go statusForDisplay）。 */
const goalStatusLabel = computed(() => {
  switch (agent.status?.goalStatus) {
    case 'running': return '运行中'
    case 'complete': return '已完成'
    case 'blocked': return '阻塞中'
    case 'stopped': return '已停止'
    default: return '未启动'
  }
})

/** 输入框 placeholder 随执行方式分流（目标 draft 态提示输入目标）。 */
const inputPlaceholder = computed(() => {
  if (goalDraftMode.value && !agent.status?.goal) return '输入目标，AI 将持续工作直到完成或阻塞…'
  if (agent.status?.goal) return '目标执行中，可补充指令…'
  return '问 AI…（如：给 2# 泵加运行状态色绑定）'
})

/** 点击外部关闭会话下拉。 */
function onDocClick(e: MouseEvent) {
  if (sessionMenuRef.value && !sessionMenuRef.value.contains(e.target as Node)) {
    sessionMenuOpen.value = false
  }
}

onMounted(async () => {
  document.addEventListener('click', onDocClick)
  await agent.start().catch(() => { /* 启动恢复失败已在 store 内 warn，不阻塞 UI */ })
  snapToBottom()
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  if (goalPollTimer) clearInterval(goalPollTimer)
  agent.stop()
})

/** goal 非空期间轮询 /status 刷新 goalStatus（SSE 无 goal 事件；HTTP 3s 够）。 */
watch(
  () => agent.status?.goal,
  (goal) => {
    if (goalPollTimer) { clearInterval(goalPollTimer); goalPollTimer = null }
    if (goal) {
      goalPollTimer = setInterval(() => { agent.loadStatus().catch(() => {}) }, 3000)
    }
  },
)

/** 消息列表变化时贴底跟随（用户上翻阅读时暂停跟随，点「回到底部」恢复）。 */
watch(
  () => [
    agent.messages.length,
    agent.messages.at(-1)?.text.length ?? 0,
    agent.messages.at(-1)?.reasoning?.length ?? 0,
    agent.messages.at(-1)?.toolCalls?.length ?? 0,
  ],
  () => followIfAtBottom(),
)

/** Enter 发送（Shift+Enter 换行；IME 组词中的 Enter 不发送——中文输入法防护）。 */
function onEnterKey(e: KeyboardEvent) {
  if (e.isComposing) return
  e.preventDefault()
  void send()
}

/** 发送：目标 draft 态提交为目标（POST /goal），否则普通 submit。失败给 UI 反馈。 */
async function send() {
  const text = input.value.trim()
  if (!text || agent.running) return
  errorMsg.value = ''
  try {
    if (goalDraftMode.value && !agent.status?.goal) {
      await agent.setGoal(text)
      goalDraftMode.value = false  // 目标已提交，输入框回归补充指令
    } else {
      await agent.submit(text)
    }
    input.value = ''
    snapToBottom()
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '发送失败'
  }
}

/** 取消当前 turn。 */
async function cancel() {
  try {
    await agent.cancel()
  } catch {
    /* cancel 失败静默（用户已知 running 态，不强提示） */
  }
}

/** 审批决策（转发给 store，失败不静默——用户在等结果）。 */
async function onApprove(decision: boolean) {
  try {
    await agent.approve(decision)
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '审批提交失败'
  }
}

/** 回答 ask_request（转发给 store，失败不静默——AI 在等回答才能继续）。 */
async function onAskAnswer(answers: { question_id: string; selected: string[] }[]) {
  try {
    await agent.answer(answers)
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '回答提交失败'
  }
}

/** 新建会话。turn 运行中明确拒绝（serve 语义：turn 中切会话混乱）。 */
async function onNewSession() {
  if (agent.running) {
    errorMsg.value = '任务进行中，请先停止或等待完成再新建会话'
    return
  }
  sessionMenuOpen.value = false
  errorMsg.value = ''
  try {
    await agent.newSession()
    snapToBottom()
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '新建会话失败'
  }
}

/** 切换到历史会话（POST /resume）。 */
async function onSwitchSession(path: string) {
  if (agent.running) {
    errorMsg.value = '任务进行中，请先停止或等待完成再切换会话'
    return
  }
  sessionMenuOpen.value = false
  errorMsg.value = ''
  try {
    await agent.switchSession(path)
    snapToBottom()
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '切换会话失败'
  }
}

/** 删除历史会话（删当前活动会话 serve 返 409）。 */
async function onDeleteSession(name: string) {
  if (!confirm(`确定删除会话「${name}」？此操作不可恢复。`)) return
  errorMsg.value = ''
  try {
    await agent.deleteSession(name)
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '删除会话失败'
  }
}

/** 切模型（submit 发 /model）。失败不静默。 */
async function onModelChange(e: Event) {
  const ref = (e.target as HTMLSelectElement).value
  if (!ref || ref === agent.activeModelRef) return
  errorMsg.value = ''
  try {
    await agent.setModel(ref)
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '切换模型失败'
  }
}

/** 设思考深度（submit 发 /effort；候选项来自 effortLevelsFor 映射）。 */
async function onEffortSubmit() {
  const lvl = effortInput.value.trim()
  if (!lvl) return
  errorMsg.value = ''
  try {
    await agent.setEffort(lvl)
    effortInput.value = ''
  } catch (err) {
    // serve 非法 level 返 500 + 合法值文案，直接展示。
    errorMsg.value = err instanceof Error ? err.message : '设置思考深度失败'
  }
}

/** 切执行方式（常规/计划/目标）。 */
async function onExecMode(mode: 'normal' | 'plan' | 'goal') {
  if (agent.controlBusy || mode === execMode.value) return
  errorMsg.value = ''
  try {
    if (mode === 'goal') {
      if (agent.status?.goal) await agent.clearGoal()
      goalDraftMode.value = true
      return
    }
    goalDraftMode.value = false
    if (agent.status?.goal) await agent.clearGoal()
    await agent.setPlanMode(mode === 'plan')
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '切换执行方式失败'
  }
}

/** 清除目标（AI 停止持续工作；清后回到目标输入态可重设）。 */
async function onClearGoal() {
  errorMsg.value = ''
  try {
    await agent.clearGoal()
    goalDraftMode.value = true
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '清除目标失败'
  }
}

/** 切权限模式（ask/auto/yolo 三档）。 */
async function onApprovalModeChange(e: Event) {
  const mode = (e.target as HTMLSelectElement).value as ToolApprovalMode
  if (!mode || mode === agent.status?.toolApprovalMode) return
  errorMsg.value = ''
  try {
    await agent.setApprovalMode(mode)
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '切换权限模式失败'
  }
}
</script>

<template>
  <aside class="drawer agent-drawer" :class="{ dragging }" aria-label="AI 助手面板" :style="{ width: drawerWidth + 'px' }">
    <!-- 拖拽调宽手柄：左缘 6px 热区，指针拖拽改宽，400–800 夹取，松手持久化 -->
    <div
      class="resize-handle"
      title="拖拽调整面板宽度"
      aria-hidden="true"
      @pointerdown="onResizeStart"
    />
    <header class="head">
      <div ref="sessionMenuRef" class="session-picker">
        <button
          class="session-trigger"
          :disabled="agent.sessionBusy"
          :title="currentSessionLabel"
          @click="sessionMenuOpen = !sessionMenuOpen"
        >
          <span class="session-label">{{ currentSessionLabel }}</span>
          <span class="caret">▼</span>
        </button>
        <div v-if="sessionMenuOpen" class="session-menu" role="menu">
          <button class="session-new" @click="onNewSession">+ 新建会话</button>
          <div class="session-list">
            <p v-if="!agent.sessions.length" class="session-empty">暂无历史会话</p>
            <div
              v-for="s in agent.sessions"
              :key="s.path"
              class="session-item"
              :class="{ current: s.current }"
              @click="onSwitchSession(s.path)"
            >
              <span class="session-item-title">{{ s.title || s.name }}</span>
              <span class="session-item-meta">
                <span v-if="s.turns != null">{{ s.turns }} 轮</span>
                <span v-if="s.current" class="session-cur-badge">当前</span>
              </span>
              <button
                v-if="!s.current"
                class="session-del"
                title="删除会话"
                aria-label="删除会话"
                @click.stop="onDeleteSession(s.name)"
              >✕</button>
            </div>
          </div>
        </div>
      </div>
      <span class="status" :class="{ on: agent.running }">
        {{ agent.running ? '思考中…' : '就绪' }}
      </span>
      <!-- ⚙ 供应商管理：providers 端点 503（gateway 未配 [reasonix]）时隐藏（设计 §5.1 降级） -->
      <button
        v-if="agent.providersAvailable"
        class="btn-icon"
        title="LLM 供应商管理（新增/编辑/删除供应商、设置默认模型、配置 API Key）"
        aria-label="LLM 供应商管理"
        @click="providerModalOpen = true"
      >⚙</button>
      <button v-if="agent.running" class="btn-text btn-cancel" @click="cancel">停止</button>
      <button class="btn-icon" aria-label="关闭" @click="emit('close')">✕</button>
    </header>

    <div ref="listRef" class="messages" @scroll="onScroll">
      <p v-if="!agent.messages.length" class="placeholder">
        问 AI 助手任何关于画面/设备/数据的问题。<br />
        例如：「给 2# 泵加运行状态色绑定」「建一个空压机房 KPI 大屏」「1# 电表昨天用电多少？」
      </p>
      <MessageItem v-for="m in agent.messages" :key="m.id" :message="m" />
    </div>

    <button
      v-show="showBackToBottom"
      class="back-to-bottom"
      title="回到底部"
      aria-label="回到底部"
      @click="snapToBottom"
    >↓ 最新</button>

    <div class="input-area">
      <!-- 提问被"稍后再说"折叠后的重开入口（turn 挂起中，不回答 AI 无法继续）。 -->
      <button
        v-if="agent.ask && askDismissed"
        class="ask-reopen"
        @click="askDismissed = false"
      >AI 在等待你的回答（任务挂起中），点击重新打开提问</button>
      <div v-if="errorMsg" class="error-banner" role="alert">
        <span>{{ errorMsg }}</span>
        <button class="btn-text" aria-label="关闭错误提示" @click="errorMsg = ''">✕</button>
      </div>
      <!-- 控件工具栏：模型 / 思考深度 / 执行方式(常规·计划·目标) / 权限模式。 -->
      <div class="control-bar">
        <select
          class="ctrl ctrl-model"
          :value="agent.activeModelRef"
          :disabled="agent.controlBusy || agent.running"
          :title="'模型选择（当前: ' + (agent.activeModelRef || '未知') + '）'"
          @change="onModelChange"
        >
          <option value="" disabled>模型</option>
          <option v-for="m in agent.models" :key="m.ref" :value="m.ref">
            {{ m.active ? '● ' : '' }}{{ m.ref }}
          </option>
        </select>
        <input
          v-model="effortInput"
          class="ctrl ctrl-effort"
          type="text"
          list="effort-levels"
          :placeholder="effortOptions.length ? 'effort(' + effortOptions.join('/') + ')' : 'effort(自由输入)'"
          :disabled="agent.controlBusy || agent.running"
          :title="'思考深度（当前模型档位：' + (effortOptions.join(' / ') || '未知，可手输') + '；回车提交，非法值 serve 会提示合法档位）'"
          @keydown.enter.exact.prevent="onEffortSubmit"
        />
        <datalist id="effort-levels">
          <option v-for="lvl in effortOptions" :key="lvl" :value="lvl" />
        </datalist>
        <div class="ctrl ctrl-mode" role="group" aria-label="执行方式">
          <button
            class="mode-btn"
            :class="{ on: execMode === 'normal' }"
            :disabled="agent.controlBusy"
            :title="'常规：边做边推进'"
            @click="onExecMode('normal')"
          >常规</button>
          <button
            class="mode-btn"
            :class="{ on: execMode === 'plan' }"
            :disabled="agent.controlBusy"
            :title="'计划：确认后执行'"
            @click="onExecMode('plan')"
          >计划</button>
          <button
            class="mode-btn"
            :class="{ on: execMode === 'goal' }"
            :disabled="agent.controlBusy"
            :title="'目标：输入目标后持续推进，直到完成或阻塞'"
            @click="onExecMode('goal')"
          >目标</button>
        </div>
        <select
          class="ctrl ctrl-approval"
          :value="agent.status?.toolApprovalMode ?? 'ask'"
          :disabled="agent.controlBusy"
          title="权限模式（ask 逐项审批 / auto 自动 / yolo 全放行）"
          @change="onApprovalModeChange"
        >
          <option value="ask">权限:审批</option>
          <option value="auto">权限:自动</option>
          <option value="yolo">权限:放行</option>
        </select>
      </div>
      <!-- 目标执行中条：目标文本 + goalStatus 状态徽标 + 清除。 -->
      <div v-if="agent.status?.goal" class="goal-bar">
        <span class="goal-text" :title="agent.status.goal">{{ agent.status.goal }}</span>
        <span class="goal-status" :class="agent.status.goalStatus">{{ goalStatusLabel }}</span>
        <button
          class="goal-clear"
          :disabled="agent.controlBusy"
          title="清除目标（AI 停止持续推进）"
          aria-label="清除目标"
          @click="onClearGoal"
        >✕</button>
      </div>
      <div class="input-row">
        <textarea
          v-model="input"
          class="textarea"
          rows="2"
          :placeholder="inputPlaceholder"
          :disabled="agent.running || agent.sessionBusy"
          @keydown.enter.exact="onEnterKey"
        />
        <button
          class="btn-send"
          :disabled="!input.trim() || agent.running || agent.sessionBusy"
          @click="send"
        >{{ goalDraftMode && !agent.status?.goal ? '设目标' : '发送' }}</button>
      </div>
    </div>

    <PermissionModal v-if="agent.approval" :approval="agent.approval" @approve="onApprove" />
    <AskModal
      v-else-if="agent.ask && !askDismissed"
      :ask="agent.ask"
      @answer="onAskAnswer"
      @close="askDismissed = true"
    />
    <ProviderModal v-if="providerModalOpen" @close="providerModalOpen = false" />
  </aside>
</template>

<style scoped>
.drawer {
  position: fixed; right: 0; top: 0; bottom: 0;
  width: 570px; max-width: 100vw;
  background: var(--panel-bg);
  border-left: 1px solid var(--panel-border);
  display: grid;
  grid-template-rows: 44px 1fr auto;
  z-index: 100;
  box-shadow: -20px 0 60px color-mix(in srgb, var(--color-surface) 70%, black 30%);
  transition: width 0.12s ease-out;
}
.drawer.dragging { transition: none; }
.resize-handle {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 5;
}
.resize-handle:hover { background: color-mix(in srgb, var(--color-primary) 22%, transparent); }

/* 头部 */
.head {
  display: flex; align-items: center; gap: 8px;
  padding: 0 12px;
  border-bottom: 1px solid var(--color-divider);
  background: var(--card-bg);
}
.status {
  font-size: 12px;
  color: var(--color-ink-muted);
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--soft-overlay);
}
.status.on {
  color: var(--chip-ink);
  background: var(--chip-bg);
}
.btn-text {
  background: transparent; border: none;
  font-size: 12px; color: var(--color-ink-muted);
  padding: 2px 4px; cursor: pointer;
}
.btn-text:hover { color: var(--color-ink-secondary); }
.btn-cancel { color: var(--color-danger); }
.btn-icon {
  background: transparent; border: none;
  font-size: 14px; color: var(--color-ink-muted);
  padding: 4px 8px; cursor: pointer; border-radius: 4px;
}
.btn-icon:hover { background: var(--color-surface-hover); color: var(--color-ink); }

/* 消息流 */
.messages {
  overflow-y: auto;
  padding: 12px;
  background:
    radial-gradient(circle at top left, var(--panel-highlight), transparent 22%),
    var(--page-bg);
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.6) transparent;
}
.placeholder {
  margin: 40px 16px;
  font-size: 13px; line-height: 1.7;
  color: var(--color-ink-muted);
  text-align: center;
}

/* 回到底部悬浮按钮 */
.back-to-bottom {
  position: absolute;
  bottom: 130px; right: 16px;
  padding: 7px 12px;
  font-size: 12px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 999px;
  box-shadow: var(--shadow-soft);
  color: var(--color-ink-secondary);
  cursor: pointer;
  z-index: 10;
}
.back-to-bottom:hover { background: var(--color-surface-hover); }

/* 输入区 */
.input-area {
  border-top: 1px solid var(--color-divider);
  background: var(--card-bg);
}
.ask-reopen {
  display: block; width: 100%;
  padding: 8px 12px;
  font-size: 12px; font-family: inherit;
  color: var(--color-warning);
  background: rgba(254, 243, 199, 0.5);
  border: none; border-bottom: 1px solid rgba(252, 211, 77, 0.4);
  cursor: pointer; text-align: center;
}
.ask-reopen:hover { background: rgba(254, 243, 199, 0.8); }
.error-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 6px 12px;
  font-size: 12px; color: var(--color-danger);
  background: rgba(220, 38, 38, 0.06);
  border-bottom: 1px solid rgba(220, 38, 38, 0.15);
}
.input-row { display: flex; gap: 8px; padding: 10px; padding-top: 0; }
.textarea {
  flex: 1; resize: none;
  padding: 12px 14px;
  font-size: 13px; line-height: 1.5;
  font-family: inherit;
  border-radius: 14px;
}
.textarea:focus { outline: none; border-color: var(--color-primary); }
.textarea:disabled { background: var(--color-surface-hover); cursor: not-allowed; }
.btn-send {
  align-self: stretch;
  padding: 0 16px;
  font-size: 13px; font-weight: 500;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-strong));
  color: var(--shell-theme-active-ink);
  border: none; border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s;
  box-shadow: var(--shadow-soft);
}
.btn-send:hover:not(:disabled) { background: var(--color-primary-hover); }
.btn-send:disabled { opacity: 0.5; cursor: not-allowed; }

/* 头部会话下拉 */
.session-picker { position: relative; flex: 1; min-width: 0; }
.session-trigger {
  display: flex; align-items: center; gap: 6px;
  max-width: 100%;
  background: transparent; border: 1px solid transparent;
  padding: 4px 8px; border-radius: 6px;
  font-size: 13px; font-weight: 600; color: var(--color-ink);
  cursor: pointer; white-space: nowrap;
}
.session-trigger:hover:not(:disabled) { background: var(--color-surface-hover); }
.session-trigger:disabled { opacity: 0.5; cursor: not-allowed; }
.session-label { overflow: hidden; text-overflow: ellipsis; }
.caret { font-size: 9px; color: var(--color-ink-muted); }
.session-menu {
  position: absolute; top: 36px; left: 0;
  min-width: 260px; max-width: 360px;
  max-height: 360px; display: flex; flex-direction: column;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  box-shadow: var(--shadow-soft), 0 8px 24px rgba(0,0,0,0.12);
  z-index: 50; overflow: hidden;
}
.session-new {
  padding: 9px 12px; text-align: left;
  font-size: 13px; font-weight: 500; color: var(--color-primary);
  background: transparent; border: none; border-bottom: 1px solid var(--color-divider);
  cursor: pointer;
}
.session-new:hover { background: var(--color-surface-hover); }
.session-list { overflow-y: auto; }
.session-empty {
  padding: 16px 12px; margin: 0;
  font-size: 12px; color: var(--color-ink-muted); text-align: center;
}
.session-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; cursor: pointer;
  border-bottom: 1px solid var(--color-divider);
}
.session-item:hover { background: var(--color-surface-hover); }
.session-item.current { background: color-mix(in srgb, var(--color-primary) 8%, transparent); }
.session-item-title {
  flex: 1; min-width: 0;
  font-size: 12px; color: var(--color-ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.session-item-meta {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; color: var(--color-ink-muted); flex-shrink: 0;
}
.session-cur-badge {
  color: var(--chip-ink); background: var(--chip-bg);
  padding: 1px 6px; border-radius: 999px;
}
.session-del {
  flex-shrink: 0; width: 20px; height: 20px;
  background: transparent; border: none; border-radius: 4px;
  font-size: 11px; color: var(--color-ink-muted); cursor: pointer;
  opacity: 0;
}
.session-item:hover .session-del { opacity: 1; }
.session-del:hover { background: rgba(220,38,38,0.12); color: var(--color-danger); }

/* 控件工具栏：flex 换行——控件多窄窗下换行保持全部可见。 */
.control-bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-divider);
  background: var(--panel-bg);
}
.ctrl {
  font-size: 12px; font-family: inherit;
  padding: 4px 8px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 6px;
  color: var(--color-ink-secondary);
  cursor: pointer;
}
.ctrl:focus { outline: none; border-color: var(--color-primary); }
.ctrl:disabled { opacity: 0.5; cursor: not-allowed; }
.ctrl-model { min-width: 110px; max-width: 170px; flex: 0 1 auto; }
.ctrl-effort { width: 88px; flex: 0 1 auto; }
.ctrl-approval { min-width: 96px; }
/* 执行方式三态分段（常规/计划/目标） */
.ctrl-mode {
  display: flex; padding: 2px; gap: 2px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 6px;
}
.mode-btn {
  font-size: 12px; font-family: inherit;
  padding: 2px 8px;
  background: transparent;
  border: none; border-radius: 4px;
  color: var(--color-ink-secondary);
  cursor: pointer; white-space: nowrap;
}
.mode-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mode-btn.on {
  color: var(--chip-ink); background: var(--chip-bg);
}
/* 目标执行中条 */
.goal-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  border-bottom: 1px solid var(--color-divider);
  background: var(--panel-bg);
}
.goal-text {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--color-ink-primary);
}
.goal-status {
  flex: none;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: var(--card-bg);
  color: var(--color-ink-secondary);
}
.goal-status.running { background: rgba(34,197,94,0.15); color: #16a34a; }
.goal-status.complete { background: rgba(59,130,246,0.15); color: #2563eb; }
.goal-status.blocked { background: rgba(234,179,8,0.15); color: #ca8a04; }
.goal-status.stopped { background: var(--card-bg); color: var(--color-ink-secondary); }
.goal-clear {
  flex: none;
  border: none; background: transparent;
  color: var(--color-ink-tertiary);
  cursor: pointer; font-size: 12px;
  padding: 0 2px;
}
.goal-clear:hover { color: var(--color-danger); }
.goal-clear:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
