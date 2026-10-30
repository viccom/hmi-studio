/**
 * 风险分级（设计 §4.1/§4.2）：对齐 rsiot-mcp server.rs 的三档范式——
 * ReadOnly（读，零审批）/ Write（写内容）/ CriticalWrite（改线上内容/信任域）。
 * 本轮只交付读工具族（9 个 R）；W/CW 档第 3 轮接入（届时挂 P0 乐观锁 + 审批闸）。
 * MCP 侧以 annotations 表达：readOnlyHint 是给客户端（reasonix）的提示信号。
 */

export type RiskTier = 'ReadOnly' | 'Write' | 'CriticalWrite'

export function readOnlyAnnotations(): Record<string, unknown> {
  return { readOnlyHint: true }
}

export function writeAnnotations(critical: boolean): Record<string, unknown> {
  return { readOnlyHint: false, destructiveHint: critical }
}
