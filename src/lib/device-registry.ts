/**
 * T7 设备归属注册表：devid → inst_id（命令路由 key）。
 * 数据源 GET /api/v1/devices（2026-10-25 curl 实测）：每设备条目含 owner_inst
 * （宿主实例 ID，多宿主逗号串——routes_device.rs aggregate D-OWN-3）；rsiot 系统
 * 设备 owner_inst="self"（self_monitor 实例，/api/v1/inst/roster 实测 running）。
 */
import { api } from './api'

/** devices 原始形状（宽松：owner_inst 可能缺失；其余字段 label/value/model/children… 不关心） */
type RawDevices = Record<string, { owner_inst?: string | null; [k: string]: unknown }>

/** 纯函数：devices 聚合 → 归属表；多宿主取首段；无 owner_inst 跳过 */
export function buildRegistry(devices: RawDevices): Map<string, string> {
  const reg = new Map<string, string>()
  for (const [devid, node] of Object.entries(devices)) {
    const first = (node?.owner_inst ?? '').split(',')[0]?.trim()
    if (first) reg.set(devid, first)
  }
  return reg
}

/** 在线拉取归属表；失败抛错（send 前台提示——区别于设备树的可离线降级） */
export async function fetchDeviceRegistry(): Promise<Map<string, string>> {
  const devices = (await api().get('/api/v1/devices')) as RawDevices
  return buildRegistry(devices)
}
