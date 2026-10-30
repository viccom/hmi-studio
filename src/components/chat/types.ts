/**
 * AI 面板类型（P2 移植自控制台 frontend/src/types.ts 的 serve/chat 子集——
 * 只保留面板消费面；rs-iot 实例/告警/lua 等类型在 hmi-studio 有自己的 lib 形态）。
 * 字段契约注释与上游一致（serve eventwire / serve.go），勿单方面改名。
 */

/**
 * serve 事件流帧（无 `event:` 头，kind 在 JSON body 内）。
 * 与 rs-iot 的 SSE 不同（rs-iot 每帧带 `event:` 头），serve 是裸 NDJSON——前端
 * `onmessage` 接全部帧后按 body 内 `kind` 分发。索引签名保留未知字段。
 */
export interface ServeEvent {
  /** turn_started / reasoning / text / tool_dispatch / tool_result / approval_request / ask_request / turn_done 等 */
  kind: string
  /** text / reasoning kind 的文本片段（增量）。 */
  text?: string
  phase?: string
  /** tool_dispatch / tool_result 的工具调度元信息（serve eventwire.Tool）。 */
  tool?: {
    id: string
    name: string
    args?: string
    output?: string
    err?: string
    readOnly?: boolean
    partial?: boolean
    durationMs?: number
    [k: string]: unknown
  }
  /** approval_request 的审批载荷（写操作触发）。 */
  approval?: { id: string; tool: string; subject?: string; reason?: string; kind?: string }
  /** ask_request 的结构化提问载荷（回答前 turn 挂起）。 */
  ask?: { id: string; questions: AskQuestion[] }
  [k: string]: unknown
}

/** serve `eventwire.AskOption`：一个选项（label/description）。 */
export interface AskOption {
  label: string
  description?: string
}

/** serve `eventwire.AskQuestion`：一个问题（多选/单选）。 */
export interface AskQuestion {
  id: string
  header?: string
  prompt: string
  options: AskOption[]
  multi?: boolean
}

/** serve `eventwire.AskAnswer`：对单个问题的回答（selected = 选中的 label 列表）。 */
export interface AskAnswer {
  question_id: string
  selected: string[]
}

/** LLM 供应商视图（gateway /api/agent/providers；密钥只报有无，不回传内容）。 */
export interface LLMProvider {
  name: string
  /** 协议族："openai" | "anthropic"（openai 兼容缺省）。 */
  kind: string
  base_url: string
  models: string[]
  default?: string
  /** 密钥环境变量名（.env 键）。 */
  api_key_env: string
  has_key: boolean
}

/** 单条聊天消息。一条 assistant 消息聚合一个 turn。 */
export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  reasoning?: string
  /** 系统提示（notice 事件归集，随思考过程折叠展示）。 */
  notices?: string[]
  /** 本轮调用的工具列表（tool_dispatch 建立、tool_result 填充结果）。 */
  toolCalls?: ToolCallEntry[]
}

/** ChatMessage.toolCalls 元素类型（serve eventwire.Tool 的前端投影）。 */
export interface ToolCallEntry {
  id: string
  name: string
  args?: string
  result?: string
  error?: boolean
  errorMsg?: string
  durationMs?: number
}

/** serve 历史会话条目（GET /sessions；serve 单会话进程，current 标记活动会话）。 */
export interface ServeSession {
  /** 会话名（文件名去 .jsonl 后缀）。 */
  name: string
  /** 会话文件绝对路径（POST /resume 用它定位）。 */
  path: string
  title?: string
  turns?: number
  current?: boolean
}

/** serve 可选模型条目（GET /models）。 */
export interface ServeModel {
  /** 模型引用（`provider/model` 格式）。 */
  ref: string
  provider: string
  model: string
  kind?: string
  active?: boolean
  default?: boolean
}

/** serve 工具审批模式三档（POST /tool-approval-mode）。 */
export type ToolApprovalMode = 'ask' | 'auto' | 'yolo'

/** serve 当前会话状态快照（GET /status）。effort 不在其内（无法回读，UI 自由文本）。 */
export interface ServeStatus {
  label: string
  running: boolean
  plan: boolean
  autoApproveTools: boolean
  bypass: boolean
  toolApprovalMode: ToolApprovalMode
  goal?: string
  goalStatus?: string
  cwd?: string
  used?: number
  window?: number
  cacheHit?: number
  cacheMiss?: number
  [k: string]: unknown
}

/** serve history 的工具调用项（GET /history；字段名是 **arguments** 且无 output）。 */
export interface ServeHistoryToolCall {
  id: string
  name: string
  arguments?: string
}

/** serve 历史消息条目（GET /history；tool 角色靠 toolCallId 配对回填）。 */
export interface ServeHistoryMessage {
  role: string
  content: string
  reasoning?: string
  toolCalls?: ServeHistoryToolCall[]
  toolCallId?: string
  toolName?: string
}
