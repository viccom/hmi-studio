/**
 * 工具注册器结构型：tools/* 的注册函数面向此接口编程（测试用假实现直调 handler）。
 * SDK 的 McpServer 泛型 registerTool 与本接口在泛型逆变下不可直接互相赋值——
 * index.ts 处做**单点**边界断言（唯一允许 unknown-as 的位置）。
 */
export interface ToolRegistrar {
  registerTool(
    name: string,
    config: Record<string, unknown>,
    cb: (args: unknown) => Promise<{ content: Array<Record<string, unknown>> }>,
  ): void
}
