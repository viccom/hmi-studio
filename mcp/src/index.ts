/**
 * hmi-mcp stdio 入口（设计 §4.1，形态对齐 rsiot-mcp main.rs）。
 *
 * 读工具族 9 个（本轮）：hmi_list_screens / hmi_get_screen / hmi_validate_screen /
 * hmi_describe_widget_kit / hmi_list_devices / hmi_list_points / hmi_query_history /
 * hmi_list_alarms / hmi_screenshot。
 * 写工具族（create/put/rename/rollback/delete/install）第 3 轮——挂 P0 乐观锁 +
 * 审批闸 + 保护 slug 硬拒后才交付。
 *
 * 配置（§4.3，全部环境变量）：HMI_BASE_URL（默认 127.0.0.1:8790）、HMI_JWT
 * （sub=hmi-mcp）、HMI_VIEW_ORIGIN（截图，默认 gateway /hmi）。reasonix 侧以
 * [[plugins]] spawn 本文件编译产物接入（25+N 工具同会话共存）。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { HmiBackend } from './backend'
import type { ToolRegistrar } from './registrar'
import { registerScreenTools } from './tools/screens'
import { registerWidgetTools } from './tools/widgets'
import { registerDataTools } from './tools/data'
import { registerScreenshotTools } from './tools/screenshot'

const VERSION = '0.1.0'

async function main(): Promise<void> {
  const server = new McpServer({ name: 'hmi-mcp', version: VERSION })
  const backend = new HmiBackend()

  // SDK 的泛型 registerTool 与 ToolRegistrar 结构型在泛型逆变下不可直赋——全仓唯一的边界断言点
  const registrar = server as unknown as ToolRegistrar

  registerScreenTools(registrar, backend)
  registerWidgetTools(registrar)
  registerDataTools(registrar, backend)
  registerScreenshotTools(registrar)

  await server.connect(new StdioServerTransport())
  // stderr 是日志面（stdout 是 MCP 协议面）——启动事实落 stderr
  process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), msg: 'hmi-mcp ready', tools: 9, version: VERSION }) + '\n')
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), msg: 'hmi-mcp fatal', err: e instanceof Error ? e.message : String(e) }) + '\n')
  process.exit(1)
})
