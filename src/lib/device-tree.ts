/**
 * 设备树构建（F2 实测）：GET /api/v1/devices → {dev:{children:[{label,value(tag名),type}]}}
 * → maotu IDeviceInfo 级联；叶子 value = `<devid>.<tag>` 即 bind_id / SSE 订阅键（寻址唯一格式）。
 */
// maotu IDeviceInfo（{label,value,children?}，见 node_modules/maotu/dist/src/components/mt-edit/types.d.ts）
// 未从包主入口 re-export（export.d.ts 仅含 store/types + components/types），且 "./*" exports
// 映射在 TS bundler 解析下无法命中无扩展名 .d.ts——此处按 d.ts 原样定义（结构兼容 MtEdit deviceInfo）。
export interface IDeviceInfo {
  label: string
  value: string
  children?: IDeviceInfo[]
}
import { api } from './api'

/** devices 原始形状（宽松：children 可能缺失/非法） */
type RawDevices = Record<string, { children?: { label: string; value?: string }[] | null }>

export function buildDeviceTree(devices: RawDevices): IDeviceInfo[] {
  return Object.entries(devices).map(([devId, node]) => ({
    label: devId,
    value: devId,
    children: Array.isArray(node?.children)
      ? node.children.map((t) => ({ label: t.label, value: `${devId}.${t.value ?? t.label}` }))
      : undefined,
  }))
}

/** 在线拉设备（F5 在线原则）→ IDeviceInfo[]；失败返回 []（编辑器离线仍可用） */
export async function fetchDeviceTree(): Promise<IDeviceInfo[]> {
  try {
    const devices = (await api().get('/api/v1/devices')) as RawDevices
    return buildDeviceTree(devices)
  } catch {
    return []
  }
}
