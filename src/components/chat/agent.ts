// src/components/chat/agent.ts —— 移植自控制台 frontend/src/stores/agent.ts（P2，设计 §5.1）
// 适配三处：api → 本仓 agent-api（同源 /api/agent/*，无 /api/v1 前缀）；页面上下文 →
// lib/agent-context（hmi 形态：route/slug/mode）；裁掉附件与工作区（设计 v1 裁决）。
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  AskAnswer,
  AskQuestion,
  ChatMessage,
  LLMProvider,
  ServeEvent,
  ServeHistoryMessage,
  ServeModel,
  ServeSession,
  ServeStatus,
  ToolApprovalMode,
} from './types'
import { agentApi } from './agent-api'
import { buildAgentContextBlock, parseHmiLocation } from '../../lib/agent-context'

/**
 * effort 档位映射（来源：Reasonix internal/config/effort.go:48 EffortCapabilityForEntry
 * 及其分支函数——词汇表随版本演进，改动需同步官方源码）。
 *
 * serve 的 HTTP 契约不暴露 effort 词汇表（/status /models 均无该字段）：官方 desktop
 * 是进程内直接调 config 层函数渲染下拉。词汇表输入只有 provider + model（/models 正好返回），
 * 故在此维护同款映射供前端下拉；未知 provider/model 返回空数组 → UI 退化为自由文本
 * （serve 非法值 500 提示合法档位）。
 */
export function effortLevelsFor(provider: string, model: string): string[] {
  const p = provider.toLowerCase()
  const m = model.toLowerCase()
  // deepseek-v4-flash 独有 low 档（effortCapabilityFromModel）；其余 deepseek 无 low/medium。
  if (m.includes('deepseek-v4-flash')) return ['auto', 'disabled', 'low', 'high', 'max']
  if (m.includes('deepseek')) return ['auto', 'disabled', 'high', 'max']
  // MiniMax-M3 只有二进制思考旋钮 adaptive|disabled。
  if (p.includes('minimax') || m.includes('minimax') || m.includes('-m3')) return ['auto', 'adaptive', 'disabled']
  // Zhipu GLM / LongCat：二进制思考旋钮。
  if (p.includes('zhipu') || m.includes('glm') || m.includes('longcat')) return ['auto', 'enabled', 'disabled']
  // Ollama Cloud：low|medium|high|max + none 省略字段。
  if (p.includes('ollama') || m.includes('ollama')) return ['auto', 'none', 'low', 'medium', 'high', 'max']
  // Anthropic：深度档位 + xhigh。
  if (p.includes('anthropic') || m.includes('claude')) return ['auto', 'low', 'medium', 'high', 'xhigh', 'max']
  // 通用 OpenAI 兼容端点（openAIEffortCapability）。
  return ['auto', 'low', 'medium', 'high']
}

/**
 * @ 引用路径转义（对标 Reasonix internal/control/refs.go EscapeRefPath）：
 * 空格/制表符前加反斜杠——@token 以空白分界。本面板已裁工作区引用（设计 v1），
 * 保留此纯函数与上游一致（消息文本里的 @ 转义历史回放仍可能遇到）。
 */
export function escapeRefPath(path: string): string {
  return path.replace(/[ \t]/g, (ch) => `\\${ch}`)
}

/**
 * agent store：serve SSE kind 分发 + submit / approve / cancel。
 *
 * serve SSE 是**无 `event:` 头的裸 NDJSON**，kind 在 JSON body 内——前端
 * `onmessage` 收全部帧 → `JSON.parse` → 按 body 内 `kind` 分发。
 * 字段路径对标 serve eventwire 契约（`DeepSeek-Reasonix/internal/eventwire/wire.go`）。
 *
 * 事件路径走 gateway `/api/agent/*`（**不带** `/api/v1/`，serve 端点本身无该前缀）。
 */
/**
 * 剥离 Reasonix 注入用户消息的 transient 块（会话标题/预览/rewind 选择器同款，
 * 源码 internal/agent/preview.go TransientUserBlockTags——单一权威清单）。
 * execution-policy 特殊：追加在 user 文本之后（尾缀块），按上游 reTrailingExecutionPolicy 剥尾。
 */
const TRANSIENT_BLOCK_TAGS = [
  'response-language', 'reasoning-language', 'memory-update', 'background-jobs',
  'active-goal', 'autoresearch-runtime', 'hook-context', 'capability-route',
  'interrupted-turn-recovery',
] as const
const TRANSIENT_LEADING_RE = new RegExp(
  `^\\s*(?:<(?:${TRANSIENT_BLOCK_TAGS.join('|')})(?:\\s+[^>]*)?>[\\s\\S]*?</(?:${TRANSIENT_BLOCK_TAGS.join('|')})>[\\r\\n]*)+`,
)
const TRAILING_EXECUTION_POLICY_RE = /\n*<execution-policy(?:\s+[^>]*)?>[\s\S]*?<\/execution-policy>\s*$/

function stripTransientBlocks(content: string): string {
  return content
    .replace(TRANSIENT_LEADING_RE, '')
    .replace(TRAILING_EXECUTION_POLICY_RE, '')
}

/**
 * plan 模式标记（上游 internal/planmode/policy.go Marker + control/input.go
 * legacy 变体，Compose 在 plan 模式下前缀注入 user turn）。两串字面量由脚本从
 * Go 源码直接生成（字节级校验），勿手改。
 */
export const PLAN_MODE_MARKERS = [
  '[Plan mode — planning workflow. Gather context, ask clarifying questions with ask, maintain planning state with todo_write, and delegate focused research when useful. Do not begin implementation in this mode: avoid file writes, unsafe shell commands, capability installation, memory mutation, writer-capable delegation, long-lived process control, or execution-step completion. This is a workflow instruction, not a permission boundary; every tool call remains governed by the active Permissions and Sandbox policy. Before planning, if a decision that is genuinely the user\'s — tech stack, an ambiguous requirement, scope, an irreversible choice — would materially shape the plan and you can\'t settle it from the codebase or a sensible default, use the ask tool to clarify it first; otherwise pick the obvious default and state the assumption in the plan instead of asking. Then present a LAYERED plan as your reply and stop. Structure the plan as a two-level markdown list so it becomes a layered task list: each PHASE is a top-level numbered list item (a coherent milestone, e.g. "1. Add the config loader"), and each phase\'s concrete, verifiable sub-steps are bullets indented beneath it (e.g. "   - parse the TOML into Config"). Use plain numbered list items for phases — do NOT write phases as markdown headings (##, ###) — so both levels parse. Keep phases few (about 2-6). The user will be asked to approve the plan before the workflow switches to implementation.]',
  '[Plan mode — read-only. Explore the codebase first (read_file, ls, grep, glob, web_fetch, task, ask are available; writers are refused by the harness). Before planning, if a decision that is genuinely the user\'s — tech stack, an ambiguous requirement, scope, an irreversible choice — would materially shape the plan and you can\'t settle it from the codebase or a sensible default, use the ask tool to clarify it first; otherwise pick the obvious default and state the assumption in the plan instead of asking. Then present a LAYERED plan as your reply and stop — do not write files, edit, or run side-effecting bash. Structure the plan as a two-level markdown list so it becomes a layered task list: each PHASE is a top-level numbered list item (a coherent milestone, e.g. "1. Add the config loader"), and each phase\'s concrete, verifiable sub-steps are bullets indented beneath it (e.g. "   - parse the TOML into Config"). Use plain numbered list items for phases — do NOT write phases as markdown headings (##, ###) — so both levels parse. Keep phases few (about 2-6). The user will be asked to approve before any changes are made.]',
]

function stripPlanModeMarker(content: string): string {
  let s = content
  for (const marker of PLAN_MODE_MARKERS) {
    if (s.startsWith(marker + '\n\n')) s = s.slice(marker.length + 2)
    else if (s.startsWith(marker)) s = s.slice(marker.length)
  }
  return s
}

/**
 * 剥 `Referenced context:` 前导块（上游 control/input.go StripReferencedContextPrefix
 * 的 TS 移植）：@ 引用解析后 serve 把 `Referenced context:\n\n<file ...>...</file>\n\n
 * + 原输入` 整体持久化，显示层剥掉。块标签多含 path-instructions
 * （resolveReferencedInstructions 注入，上游清单遗漏——此处补上）。
 */
function stripReferencedContextPrefix(content: string): string {
  const preamble = 'Referenced context:'
  let s = content.trim()
  if (!s.startsWith(preamble)) return content
  s = s.slice(preamble.length).trim()
  for (;;) {
    s = s.trim()
    if (!s) return ''
    const open = /^<(file|dir|resource|image|path-instructions) /.exec(s)
    if (!open) break
    const closeTag = `</${open[1]}>`
    const closeIdx = s.indexOf(closeTag)
    if (closeIdx < 0) break
    s = s.slice(closeIdx + closeTag.length).trim()
  }
  return s
}

/** hmi 页面上下文尾缀（buildAgentContextBlock 追加在 user 输入之后）。 */
const PAGE_CONTEXT_SUFFIX_RE = /\n\n\[页面上下文\]\n[\s\S]*$/

/**
 * 历史回放的用户气泡文本 = 用户实时所见（对标桌面端显示管线
 * StripReferencedContextPrefix(StripComposePrefixes(content))）：
 * 瞬态块 → plan 标记 → Referenced context 前缀逐层剥，再剥页面上下文尾缀。
 */
function userDisplayText(content: string): string {
  return stripReferencedContextPrefix(stripPlanModeMarker(stripTransientBlocks(content)))
    .replace(PAGE_CONTEXT_SUFFIX_RE, '')
    .trim()
}

export const useAgentStore = defineStore('agent', () => {
  /** 聊天消息列表（user 输入 + assistant 聚合 turn）。 */
  const messages = ref<ChatMessage[]>([])
  /** 当前 turn 是否进行中（turn_started → turn_done）。 */
  const running = ref(false)
  /** 待审批请求（写操作触发，由 UI 决策 approve/deny）。 */
  const approval = ref<{ id: string; tool: string; subject?: string; reason?: string } | null>(null)
  /** 待回答的结构化提问（ask_request 事件）。 */
  const ask = ref<{ id: string; questions: AskQuestion[] } | null>(null)

  /** 历史会话列表（GET /sessions）。serve 单会话进程：current 标记当前活动会话。 */
  const sessions = ref<ServeSession[]>([])
  /** 当前活动会话（启动恢复据此定位）。 */
  const currentSession = ref<ServeSession | null>(null)
  /** 可选模型列表（GET /models，控件下拉数据源）。 */
  const models = ref<ServeModel[]>([])
  /** 当前会话状态（GET /status，控件初始态来源）。 */
  const status = ref<ServeStatus | null>(null)
  /** 会话切换/新建/删除进行中（UI 全 disable）。 */
  const sessionBusy = ref(false)
  /** 控件操作进行中（4 控件 disable）。 */
  const controlBusy = ref(false)
  /** LLM 供应商列表（gateway /api/agent/providers，密钥只报有无）。 */
  const providers = ref<LLMProvider[]>([])
  /** 新会话默认模型（"<provider>/<model>"，reasonix config default_model）。 */
  const defaultModel = ref('')
  /** 供应商管理操作进行中（弹窗 disable + 重启等待态）。 */
  const providerBusy = ref(false)
  /** providers 端点可用（gateway [reasonix] 段已配）。不可用时隐藏 ⚙ 入口（设计 §5.1 降级）。 */
  const providersAvailable = ref(false)

  let nextId = 1
  /** SSE 连接（重连场景 start 前先关）。 */
  let sse: EventSource | null = null
  /** 本次连接是否在 turn 进行中重连（start 时 /status.running=true 置位）。
   *  置位期间关闭面板错过的事件无法经 SSE replay——turn_done 后重拉 /history 自愈。 */
  let resumedMidTurn = false

  /** 处理 serve SSE 事件（无 `event:` 头，kind 在 JSON body）。
   *  一条 assistant 消息聚合一个 turn：turn_started 建空消息，text/reasoning
   *  增量拼接，tool_dispatch 建立工具槽位由 tool_result 填充 output/err。 */
  function onEvent(e: ServeEvent) {
    const cur = () => messages.value.at(-1)
    switch (e.kind) {
      case 'turn_started':
        messages.value.push({ id: nextId++, role: 'assistant', text: '', toolCalls: [] })
        running.value = true
        break
      case 'text': {
        // 缓存 last 一次：消除 cur()! 非空断言链的 NPE 风险（控制台 review I2 同款）。
        const last = cur()
        if (last?.role === 'assistant') last.text += e.text || ''
        break
      }
      case 'reasoning': {
        const last = cur()
        if (last?.role === 'assistant') last.reasoning = (last.reasoning || '') + (e.text || '')
        break
      }
      case 'notice': {
        const last = cur()
        if (e.text && last?.role === 'assistant') {
          last.notices = [...(last.notices || []), e.text]
        }
        break
      }
      case 'tool_dispatch': {
        const last = cur()
        if (e.tool && last?.role === 'assistant' && last.toolCalls) {
          last.toolCalls.push({ id: e.tool.id, name: e.tool.name, args: e.tool.args })
        }
        break
      }
      case 'tool_result': {
        const tid = e.tool?.id
        const last = cur()
        const tc = last?.toolCalls?.find(t => t.id === tid)
        if (tc && e.tool) {
          tc.result = e.tool.output
          tc.error = !!e.tool.err
          tc.errorMsg = e.tool.err || undefined
          tc.durationMs = e.tool.durationMs
        }
        break
      }
      case 'approval_request':
        if (e.approval) {
          approval.value = {
            id: e.approval.id,
            tool: e.approval.tool,
            subject: e.approval.subject,
            reason: e.approval.reason,
          }
        }
        break
      case 'ask_request':
        if (e.ask) {
          ask.value = { id: e.ask.id, questions: e.ask.questions }
        }
        break
      case 'turn_done':
        running.value = false
        ask.value = null  // turn 结束清残留提问（防御：未答即结束的 turn）
        void maybeHealHistory()
        break
    }
  }

  /** 发任务。附页面上下文（hmi 形态：当前路由/画面 slug/view|edit 模式——设计 §5.1）。
   *  非 2xx 抛错（错误带响应体，AgentDrawer 的 errorMsg 展示）。 */
  async function submit(input: string) {
    messages.value.push({ id: nextId++, role: 'user', text: input })
    const loc = parseHmiLocation()
    const contextBlock = buildAgentContextBlock(loc)
    const requestInput = contextBlock
      ? `${input}\n\n[页面上下文]\n${contextBlock}`
      : input
    const r = await agentApi('/api/agent/submit', {
      method: 'POST',
      body: JSON.stringify({ input: requestInput }),
    })
    if (!r.ok) throw new Error(`submit failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
  }

  /** 提交审批决策（写操作）：true 放行 / false 拒绝。
   *  body 契约对标 serve `POST /approve`（serve.go）：`{id, allow}`。
   *  非 2xx 抛错（approve 失败死锁防护：若 gateway/serve 返错且不检查就清 approval，
   *  agent 仍在等决策但 UI 已无弹窗 → 用户无法重发 → 死锁）。仅 2xx 才清 approval。 */
  async function approve(decision: boolean) {
    if (!approval.value) return
    const r = await agentApi('/api/agent/approve', {
      method: 'POST',
      body: JSON.stringify({ id: approval.value.id, allow: decision }),
    })
    if (!r.ok) throw new Error(`approve failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
    approval.value = null
  }

  /** 取消当前 turn（用户中止）。失败不抛：turn_done SSE 会复位 running。 */
  async function cancel() {
    await agentApi('/api/agent/cancel', { method: 'POST', body: '{}' })
  }

  /** 回答 ask_request（POST /api/agent/answer，body {id, answers}）。
   *  2xx 后清 ask（serve 继续 turn）；失败不抛（ask 保持，用户可重选）。 */
  async function answer(answers: AskAnswer[]) {
    if (!ask.value) return
    const r = await agentApi('/api/agent/answer', {
      method: 'POST',
      body: JSON.stringify({ id: ask.value.id, answers }),
    })
    if (!r.ok) throw new Error(`answer failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
    ask.value = null
  }

  /**
   * serve 历史消息 → ChatMessage 映射（loadHistory 用）。
   * 规则（对标 serve.go historyMessage）：user/assistant → 新建消息（arguments→args
   * 映射）；tool → 回溯配对到上一条 assistant 的 toolCalls；notice/system → 跳过。
   */
  function historyToChatMessages(hist: ServeHistoryMessage[]): ChatMessage[] {
    const out: ChatMessage[] = []
    for (const m of hist) {
      if (m.role === 'notice' || m.role === 'system') continue
      if (m.role === 'tool') {
        const last = out.at(-1)
        const tc = last?.role === 'assistant' ? last.toolCalls?.find(t => t.id === m.toolCallId) : undefined
        if (tc) {
          tc.result = m.content
          tc.error = false
        }
        continue
      }
      out.push({
        id: nextId++,
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.role === 'user' ? userDisplayText(m.content || '') : m.content || '',
        reasoning: m.reasoning,
        toolCalls: m.toolCalls?.map(t => ({ id: t.id, name: t.name, args: t.arguments })),
      })
    }
    return out
  }

  /** 读历史会话列表。失败不抛（容错：serve 暂不可达不阻塞 SSE），仅 warn。 */
  async function loadSessions() {
    try {
      const r = await agentApi('/api/agent/sessions')
      if (!r.ok) return
      sessions.value = await r.json()
      currentSession.value = sessions.value.find(s => s.current) ?? null
    } catch (e) {
      console.warn('agent: loadSessions failed', e)
    }
  }

  /** 读当前会话历史消息回填 messages。nextId 取 max+1 防与后续实时 SSE 帧 id 冲突。 */
  async function loadHistory() {
    try {
      const r = await agentApi('/api/agent/history')
      if (!r.ok) return
      const hist = (await r.json()) as ServeHistoryMessage[]
      messages.value = historyToChatMessages(hist)
      nextId = messages.value.reduce((mx, m) => Math.max(mx, m.id), 0) + 1
    } catch (e) {
      console.warn('agent: loadHistory failed', e)
    }
  }

  /** 读控件态：模型列表 + 状态。失败不抛（控件降级）。 */
  async function loadModels() {
    try {
      const r = await agentApi('/api/agent/models')
      if (!r.ok) return
      // /models 包一层 object：{current, default, label, models:[...]}（serve.go:1258）。
      const data = await r.json()
      models.value = Array.isArray(data) ? data : (data?.models ?? [])
    } catch (e) {
      console.warn('agent: loadModels failed', e)
    }
  }
  async function loadStatus() {
    try {
      const r = await agentApi('/api/agent/status')
      if (r.ok) status.value = await r.json()
    } catch (e) {
      console.warn('agent: loadStatus failed', e)
    }
  }

  /** providers 端点探测 + 拉取（gateway 未配 [reasonix] → 503 → providersAvailable=false）。 */
  async function loadProviders() {
    const r = await agentApi('/api/agent/providers')
    if (!r.ok) throw new Error(`load providers failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
    const data = await r.json()
    providers.value = data.providers ?? []
    defaultModel.value = data.default_model ?? ''
  }
  async function probeProviders() {
    try {
      await loadProviders()
      providersAvailable.value = true
    } catch {
      providersAvailable.value = false
    }
  }

  /** 会话切换后并行重拉四件套 + 供应商态（history 串行依赖 nextId）。 */
  async function reloadSessionState() {
    await Promise.all([loadSessions(), loadStatus(), loadModels()])
    await loadHistory()
    void probeProviders()
  }

  /** 新建会话（POST /new）。防重入。成功后清 messages/approval/ask + 重拉。 */
  async function newSession() {
    if (sessionBusy.value || running.value) return
    sessionBusy.value = true
    try {
      const r = await agentApi('/api/agent/new', { method: 'POST', body: '{}' })
      if (!r.ok) throw new Error(`new session failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
      messages.value = []
      approval.value = null
      ask.value = null
      nextId = 1
      await reloadSessionState()
    } finally {
      sessionBusy.value = false
    }
  }

  /** 切换到历史会话（POST /resume {path}）。409=租约冲突。 */
  async function switchSession(path: string) {
    if (sessionBusy.value) return
    sessionBusy.value = true
    try {
      const r = await agentApi('/api/agent/resume', { method: 'POST', body: JSON.stringify({ path }) })
      if (r.status === 409) throw new Error('该会话正被其他窗口使用（租约冲突），请稍后再试')
      if (!r.ok) throw new Error(`switch session failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
      approval.value = null
      ask.value = null
      await reloadSessionState()
    } finally {
      sessionBusy.value = false
    }
  }

  /** 删除历史会话。409=不能删当前活动会话。 */
  async function deleteSession(name: string) {
    if (sessionBusy.value) return
    const r = await agentApi('/api/agent/delete-session', { method: 'POST', body: JSON.stringify({ name }) })
    if (r.status === 409) throw new Error('不能删除当前活动会话，请先切换到其他会话')
    if (!r.ok) throw new Error(`delete session failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
    await loadSessions()
  }

  /** 设置模型（submit 发 `/model <ref>`，gateway 跳 HINT 透传）。turn 运行中拒绝。 */
  async function setModel(ref: string) {
    if (controlBusy.value || running.value) return
    controlBusy.value = true
    try {
      const r = await agentApi('/api/agent/submit', { method: 'POST', body: JSON.stringify({ input: `/model ${ref}` }) })
      if (!r.ok) throw new Error(`set model failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
      await Promise.all([loadModels(), loadStatus()])
    } finally {
      controlBusy.value = false
    }
  }

  /** 设置思考深度（submit 发 `/effort <level>`）。非法值 serve 返 500 + 合法值文案。 */
  async function setEffort(level: string) {
    const lvl = level.trim()
    if (!lvl || controlBusy.value || running.value) return
    controlBusy.value = true
    try {
      const r = await agentApi('/api/agent/submit', { method: 'POST', body: JSON.stringify({ input: `/effort ${lvl}` }) })
      if (!r.ok) throw new Error(`set effort failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
      await loadStatus()
    } finally {
      controlBusy.value = false
    }
  }

  /** 切换 Plan Mode（POST /plan {on}）。独立端点，不拒 turn 运行中切换。 */
  async function setPlanMode(on: boolean) {
    if (controlBusy.value) return
    controlBusy.value = true
    try {
      const r = await agentApi('/api/agent/plan', { method: 'POST', body: JSON.stringify({ on }) })
      if (!r.ok) throw new Error(`set plan mode failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
      await loadStatus()
    } finally {
      controlBusy.value = false
    }
  }

  /** 设置目标（POST /goal {goal}）——serve 设置时自动关 plan，AI 持续工作直到完成/阻塞。 */
  async function setGoal(goal: string) {
    const text = goal.trim()
    if (!text || controlBusy.value) return
    controlBusy.value = true
    try {
      const r = await agentApi('/api/agent/goal', { method: 'POST', body: JSON.stringify({ goal: text }) })
      if (!r.ok) throw new Error(`set goal failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
      await loadStatus()
    } finally {
      controlBusy.value = false
    }
  }

  /** 清除目标（POST /goal {goal:""}）。 */
  async function clearGoal() {
    if (controlBusy.value) return
    controlBusy.value = true
    try {
      const r = await agentApi('/api/agent/goal', { method: 'POST', body: JSON.stringify({ goal: '' }) })
      if (!r.ok) throw new Error(`clear goal failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
      await loadStatus()
    } finally {
      controlBusy.value = false
    }
  }

  /** 设置权限模式（POST /tool-approval-mode {mode}，ask/auto/yolo）。 */
  async function setApprovalMode(mode: ToolApprovalMode) {
    if (controlBusy.value) return
    controlBusy.value = true
    try {
      const r = await agentApi('/api/agent/tool-approval-mode', { method: 'POST', body: JSON.stringify({ mode }) })
      if (!r.ok) throw new Error(`set approval mode failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
      await loadStatus()
    } finally {
      controlBusy.value = false
    }
  }

  /** 中途重连后的 turn 完成自愈：重拉 /history 补全关面板期间错过的流式内容。
   *  仅当尾消息是 assistant 时替换（尾是 user = 有新提交在途，防吞本地乐观气泡）。 */
  async function maybeHealHistory() {
    if (!resumedMidTurn) return
    resumedMidTurn = false
    if (messages.value.at(-1)?.role === 'assistant') await loadHistory()
  }

  /** 启动 SSE 订阅 + 拉会话/历史/控件态（启动恢复）。打开抽屉时调用。
   *  重连恢复：/status.running 是权威运行态——后台 turn 可能仍在执行，据此恢复
   *  running 并补一条空 assistant 占位消息接续流式。 */
  async function start() {
    if (sse) stop() // 重入守卫（如重连场景）
    resumedMidTurn = false
    // 鉴权走同源 HttpOnly cookie（EventSource 自动携带，无须 query token）。
    sse = new EventSource('/api/agent/events')
    // onmessage 接全部帧（无 event: 头）→ safe 包 parse（畸形帧不让 onmessage 抛错，
    // 抛错后该 listener 被 EventSource 摘除）。
    sse.onmessage = ev => safe(() => onEvent(JSON.parse((ev as MessageEvent).data) as ServeEvent))
    sse.onerror = () => {} // 浏览器自动重连，静默
    try {
      await Promise.all([loadSessions(), loadStatus(), loadModels()])
      await loadHistory()
      running.value = !!status.value?.running
      if (running.value) {
        resumedMidTurn = true
        const last = messages.value.at(-1)
        if (!last || last.role !== 'assistant' || last.text || last.toolCalls?.length) {
          messages.value.push({ id: nextId++, role: 'assistant', text: '', toolCalls: [] })
        }
      }
    } catch (e) {
      console.warn('agent: startup recovery failed', e)
    }
    // ⚙ 可见性探测（设计 §5.1：未配 [reasonix] 的站点 503 → 隐藏供应商入口）
    void probeProviders()
  }

  /** SSE 帧 parse/handle 容错：畸形帧 warn 并跳过，不冒泡到 onmessage。 */
  function safe(fn: () => void) {
    try { fn() } catch (e) { console.warn('agent: drop malformed SSE frame', e) }
  }

  /** 停止 SSE。
   *  双语义（serve 是独立进程，turn 生命周期不随抽屉开合改变）：
   *  - `stop()`（默认，关抽屉）：只断 SSE 不取消后台 turn——重开抽屉经 /status.running 恢复。
   *  - `stop(true)`（登出）：同时取消进行中的 turn。 */
  function stop(cancelTurn = false) {
    sse?.close()
    sse = null
    resumedMidTurn = false
    if (cancelTurn && running.value) {
      running.value = false
      void cancel().catch(() => { /* cancel 失败静默：本地已复位 */ })
    }
  }

  /** 新增/更新供应商。api_key 留空 = 不动现有密钥。返回 {created, restarted}。 */
  async function saveProvider(payload: {
    name: string
    kind?: string
    base_url: string
    models: string[]
    api_key_env?: string
    api_key?: string
  }) {
    providerBusy.value = true
    try {
      const r = await agentApi('/api/agent/providers', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!r.ok) throw new Error(`save provider failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
      const data = await r.json()
      await loadProviders()
      return data as { created: boolean; restarted: boolean; restart_error?: string }
    } finally {
      providerBusy.value = false
    }
  }

  /** 删除供应商（条目 + .env 密钥；URL 名字 encode 防 `/`）。 */
  async function deleteProvider(name: string) {
    providerBusy.value = true
    try {
      const r = await agentApi(`/api/agent/providers/${encodeURIComponent(name)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(`delete provider failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
      await loadProviders()
    } finally {
      providerBusy.value = false
    }
  }

  /** 设新会话默认模型。变更后 reasonix 需重启生效（gateway 已触发）。 */
  async function setDefaultModel(model: string) {
    providerBusy.value = true
    try {
      const r = await agentApi('/api/agent/providers/default', {
        method: 'POST',
        body: JSON.stringify({ model }),
      })
      if (!r.ok) throw new Error(`set default model failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
      defaultModel.value = model
    } finally {
      providerBusy.value = false
    }
  }

  /** 从上游拉模型 id 列表（勾选代替手填）。编辑场景 name 传供应商名用已存密钥。 */
  async function fetchUpstreamModels(payload: {
    base_url: string
    kind?: string
    api_key?: string
    name?: string
  }) {
    const r = await agentApi('/api/agent/providers/fetch-models', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (!r.ok) throw new Error(`fetch models failed: ${r.status} ${await r.text().catch(() => '')}`.trim())
    const data = await r.json()
    return (data.models ?? []) as string[]
  }

  /** 当前活动模型 ref（模型下拉绑定）。 */
  const activeModelRef = computed(() => models.value.find(m => m.active)?.ref ?? '')

  return {
    messages, running, approval, ask,
    sessions, currentSession, models, status, sessionBusy, controlBusy, activeModelRef,
    providers, defaultModel, providerBusy, providersAvailable,
    loadProviders, saveProvider, deleteProvider, setDefaultModel, fetchUpstreamModels, probeProviders,
    onEvent, submit, approve, cancel, answer,
    loadSessions, loadHistory, loadModels, loadStatus,
    newSession, switchSession, deleteSession,
    setModel, setEffort, setPlanMode, setGoal, clearGoal, setApprovalMode,
    start, stop,
  }
})
