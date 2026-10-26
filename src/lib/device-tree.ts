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

// ---- W8 富设备树（BindPanel 专用）：devreg 单点齐活设备描述+点位描述/单位 ----
// 实测（2026-10-26 curl /api/v1/devreg）：
// {rsiot:{desc:null|str, devid:'rsiot', effective:{uptime_s:{desc:'运行时长秒',unit:null,...}}}}
// 系统设备 desc 可能为 null，此处归一为空串（UI 侧不再判空）。

/** 点位节点：id=完整 field（bind_id 寻址唯一格式），unit 缺省空串 */
export interface RichTagNode { id: string; label: string; desc: string; unit: string }
/** 设备节点：desc 缺省空串 */
export interface RichDeviceNode { id: string; label: string; desc: string; children: RichTagNode[] }

/** devreg 原始形状（宽松：desc/effective 可能缺失或 null；其余字段不关心） */
type RawDevreg = Record<string, {
  desc?: string | null
  devid?: string
  effective?: Record<string, { desc?: string | null; unit?: string | null } | undefined> | null
} | undefined>

export function buildDeviceTreeRich(devreg: RawDevreg): RichDeviceNode[] {
  return Object.entries(devreg).map(([key, node]) => {
    const devid = node?.devid ?? key
    const children = Object.entries(node?.effective ?? {}).map(([tag, t]) => ({
      id: `${devid}.${tag}`,
      label: tag,
      desc: t?.desc ?? '',
      unit: t?.unit ?? '',
    }))
    return { id: devid, label: devid, desc: node?.desc ?? '', children }
  })
}

/** 在线拉富设备树（失败返回 []，与 fetchDeviceTree 同降级策略） */
export async function fetchDeviceTreeRich(): Promise<RichDeviceNode[]> {
  try {
    const devreg = (await api().get('/api/v1/devreg')) as RawDevreg
    return buildDeviceTreeRich(devreg)
  } catch {
    return []
  }
}
