/**
 * 工具调用审计日志装饰器（设计 §4.3：stderr 结构化 JSON——tool/tier/ok/ms）。
 *
 * 单点覆盖全部工具（2026-10-31 审查修复）：修复前 16 个工具里只有 hmi_screenshot
 * 自行埋点，7 个写工具（改线上内容/信任域）零记录。挂在这里而不是 backend：
 * backend 不知道工具名与风险档，且读工具数量更多、埋点易漏。
 *
 * ok 判定：抛错 = false；返回内容里首段 JSON `ok === false`（结构化拒绝，如
 * validation_failed / version_conflict）同样记 false + code——这些是"工具执行失败"
 * 而非"调用异常"，两者都要能从日志面区分出来。
 */
import { logTool } from './backend'
import type { ToolRegistrar } from './registrar'

/** annotations → 风险档（与 risk.ts 三档同源语义：ReadOnly / Write / CriticalWrite）。 */
function tierOf(config: Record<string, unknown>): string {
  const a = (config.annotations ?? {}) as Record<string, unknown>
  if (a.readOnlyHint === true) return 'ReadOnly'
  return a.destructiveHint === true ? 'CriticalWrite' : 'Write'
}

/** 结果级 ok/code 探测：工具以 {ok:false,code} 返回结构化拒绝时记失败。 */
function outcomeOf(res: { content?: Array<Record<string, unknown>> }): { ok: boolean; err?: string } {
  try {
    const first = res?.content?.[0]
    const text = first && typeof first.text === 'string' ? first.text : undefined
    if (!text) return { ok: true }
    const parsed = JSON.parse(text) as { ok?: unknown; code?: unknown }
    if (parsed && parsed.ok === false) {
      return { ok: false, err: typeof parsed.code === 'string' ? parsed.code : 'tool_rejected' }
    }
    return { ok: true }
  } catch {
    return { ok: true } // 非 JSON 内容（截图文本等）不判定
  }
}

/** 包一层注册器：所有 registerTool 的 handler 自动记一条审计日志。 */
export function withToolLogging(server: ToolRegistrar): ToolRegistrar {
  return {
    registerTool(name, config, cb) {
      const tier = tierOf(config)
      server.registerTool(name, config, async (args) => {
        const started = Date.now()
        try {
          const res = await cb(args)
          const { ok, err } = outcomeOf(res)
          logTool({ tool: name, tier, ok, ms: Date.now() - started, ...(err ? { err } : {}) })
          return res
        } catch (e) {
          logTool({ tool: name, tier, ok: false, ms: Date.now() - started, err: e instanceof Error ? e.message : String(e) })
          throw e
        }
      })
    },
  }
}
