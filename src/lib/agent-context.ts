/**
 * AI 面板页面上下文（P2，设计 §5.1「上下文注入」）：提交对话时附「[页面上下文]」块，
 * 让 AI 知道用户正在看什么。对标控制台 lib/agentContext.ts，数据源换成本仓形态：
 * route / 画面 slug / view|edit 模式从 window.location 解析（零路由器依赖——lib 层
 * 不可 import app 壳的 router）；编辑器选中图元 id 走可选的模块态注入
 * （setAgentPageSelection，由 views 层择机调用，v1 缺省无）。
 *
 * 纯函数 + 模块态，无网络/无 maotu——jsdom 单测直接覆盖。
 */

/** 编辑器运行态可选补充（views 层注入；缺省 = 无选中信息）。 */
export interface AgentPageSelection {
  selectedWidgetId?: string
}

let pageSelection: AgentPageSelection | undefined

/** views 层注入编辑器选中态（EditView 择机调用；undefined = 清除）。 */
export function setAgentPageSelection(sel: AgentPageSelection | undefined): void {
  pageSelection = sel
}

export interface HmiLocationInfo {
  /** 'view' | 'edit'（仅这两类页面返回非 null） */
  mode: 'view' | 'edit'
  /** 画面 slug（路由参数） */
  slug: string
  /** 原始 pathname（gateway /hmi 前缀已含） */
  path: string
}

/**
 * 从 location.pathname 解析画面页上下文。兼容 dev（/view/:id）与 gateway
 * 部署（/hmi/view/:id）两种 base；其余路径（/、/login、/dev/*）返回 null。
 */
export function parseHmiLocation(): HmiLocationInfo | null {
  const path = window.location.pathname
  const m = /\/(view|edit)\/([^/?#]+)/.exec(path)
  if (!m) return null
  return { mode: m[1] as 'view' | 'edit', slug: decodeURIComponent(m[2]), path }
}

export interface AgentContextInput {
  mode?: 'view' | 'edit'
  slug?: string
  path?: string
}

/**
 * 组装上下文块（store 的 submit 拼在用户输入之后）。无任何信息返回 ''
 * （store 侧不追加尾缀）。选中图元行来自模块态注入——测试可 set/clear 控制。
 */
export function buildAgentContextBlock(input: AgentContextInput | null): string {
  const lines: string[] = []
  if (input?.mode) lines.push(`模式: ${input.mode}`)
  if (input?.slug) lines.push(`画面: ${input.slug}`)
  if (input?.path) lines.push(`页面路径: ${input.path}`)
  if (pageSelection?.selectedWidgetId) lines.push(`选中图元: ${pageSelection.selectedWidgetId}`)
  return lines.join('\n')
}
