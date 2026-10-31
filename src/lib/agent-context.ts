/**
 * AI 面板页面上下文（P2，设计 §5.1「上下文注入」）：提交对话时附「[页面上下文]」块，
 * 让 AI 知道用户正在看什么。对标控制台 lib/agentContext.ts，数据源换成本仓形态：
 * route / 画面 slug / view|edit 模式从 window.location 解析（零路由器依赖——lib 层
 * 不可 import app 壳的 router）；画面元数据（名称/组/版本）与编辑器选中图元走可选的
 * 模块态注入（setAgentPageScreenInfo / setAgentPageSelection，由 views 层 GET 后调用）。
 *
 * 纯函数 + 模块态，无网络/无 maotu——jsdom 单测直接覆盖。
 */
import { isProtectedSlug } from '../screen-assets/protected'

/** 编辑器运行态可选补充（views 层注入；缺省 = 无选中信息）。 */
export interface AgentPageSelection {
  selectedWidgetId?: string
}

let pageSelection: AgentPageSelection | undefined

/** views 层注入编辑器选中态（EditView 择机调用；undefined = 清除）。 */
export function setAgentPageSelection(sel: AgentPageSelection | undefined): void {
  pageSelection = sel
}

/** 当前画面元数据（views 层 GET 成功后注入；undefined = 清除/未知画面）。 */
export interface AgentPageScreenInfo {
  /** doc.name（画面显示名） */
  name?: string
  /** doc.group（画面所属组） */
  group?: string
  /** GET 返回的版本号（P0 乐观锁口径；0 = 版本机制上线前的遗留画面） */
  version?: number
}

let pageScreen: AgentPageScreenInfo | undefined

/** views 层注入画面元数据（切换/刷新画面时更新；卸载或加载失败传 undefined）。 */
export function setAgentPageScreenInfo(info: AgentPageScreenInfo | undefined): void {
  pageScreen = info
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
 * （store 侧不追加尾缀）。画面元数据/保护状态/选中图元行来自模块态注入——
 * 测试可 set/clear 控制。
 */
export function buildAgentContextBlock(input: AgentContextInput | null): string {
  const lines: string[] = []
  if (input?.mode) lines.push(`模式: ${input.mode}`)
  if (input?.slug) lines.push(`画面: ${input.slug}`)
  if (pageScreen?.name) lines.push(`画面名称: ${pageScreen.name}`)
  if (pageScreen?.group) lines.push(`分组: ${pageScreen.group}`)
  if (pageScreen?.version !== undefined) lines.push(`版本: ${pageScreen.version}`)
  // 保护状态由 slug 单一权威源判定（不依赖注入——画面元数据缺失时也要给对）：
  // 长期资产画面只能经 hmi_put_protected_screen 修改、禁止删除。
  if (input?.slug && isProtectedSlug(input.slug)) {
    lines.push('保护画面: 是（长期资产，修改须用 hmi_put_protected_screen，禁止删除）')
  }
  if (input?.path) lines.push(`页面路径: ${input.path}`)
  if (pageSelection?.selectedWidgetId) lines.push(`选中图元: ${pageSelection.selectedWidgetId}`)
  return lines.join('\n')
}
