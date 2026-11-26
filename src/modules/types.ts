/**
 * 可选功能模块的契约（中性层，不含任何具体模块信息）。
 *
 * 目的（2026-11-26 用户要求）：3D 组态/浏览是**独立模块**——剔除它，原有 2D 功能不受影响。
 * 做法：具体模块由 `registry.ts` 动态发现，2D 代码只依赖本契约与注册表，
 * **不出现任何 3D 路径**（否则删除模块即编译失败）。
 */
import type { RouteRecordRaw } from 'vue-router'

export interface ModuleNavItem {
  /** 顶部导航文案 */
  label: string
  /** 路由目标 */
  to: string
  /** 其它导航项的 element-plus 等价位置（预留） */
  order?: number
}

export interface HmiOptionalModule {
  /** 模块标识（调试/日志用） */
  id: string
  /** 贡献到画面管理页顶部导航的条目 */
  nav?: ModuleNavItem[]
  /** 贡献到路由表的记录（须自带 path，禁止通配吞路径） */
  routes?: RouteRecordRaw[]
}
