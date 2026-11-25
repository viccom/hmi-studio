/**
 * iot-demo 设备与点位目录（画面生成的单一事实源之一）：10 台设备、按类型的点位表
 * （标签/描述/单位/精度/工程量程），以及**每台设备**的报警限值。
 *
 * 为什么按设备存限值：同型表计的量程/工况不同（wm2 压力基准 0.42 MPa、wm3 0.45 MPa），
 * 统一阈值会让其中若干台长期处于报警态（违背 HP-HMI"正常态灰阶"）。判定端
 * `rs-iot/scripts/limit-alarm/main.lua` 的 RULES 必须与本文件 LIMITS 一致——两处注释互指，
 * 改一处同步另一处（计划文档 §6 已知取舍）。
 *
 * 点位名来自 rs-iot 设备模型（devid + tag），desc/unit 与 `GET /api/v1/devreg` 对齐；
 * 画面只消费 TagMeta，不直接读模型。
 */

export type DeviceType = 'water' | 'gas' | 'power' | 'env' | 'pt'
export type Area = 'water' | 'power' | 'gas' | 'env'

export interface Limits { ll?: number; l?: number; h?: number; hh?: number }

export interface TagMeta {
  tag: string
  /** 中文描述（表头/值块标签） */
  label: string
  unit: string
  /** 小数位 */
  dec: number
  min: number
  max: number
  /** 布尔点位（开关/故障） */
  bool?: boolean
  limits?: Limits
}

export interface DeviceMeta {
  devid: string
  type: DeviceType
  /** ISA-5.1 风格位号 */
  pos: string
  /** 设备名（画面标题/面板标题） */
  title: string
  area: Area
  /** 主测点 tag（faceplate PV / L1 KPI） */
  primary: string
  tags: TagMeta[]
}

// ---- 按设备的报警限值（与 rs-iot/scripts/limit-alarm/main.lua RULES 同步）----
const LIMITS: Record<string, Record<string, Limits>> = {
  dev_wm1: { flow_rate: { h: 31.5, hh: 31.9 }, pressure: { h: 0.428 } },
  dev_wm2: { flow_rate: { h: 36.5, hh: 37 }, pressure: { h: 0.468 } },
  dev_wm3: { flow_rate: { h: 41.5, hh: 42 }, pressure: { h: 0.508 } },
  dev_gm1: { flow_rate: { h: 21.7, hh: 22 }, pressure: { l: 1.75, h: 3.05 } },
  dev_gm2: { flow_rate: { h: 26.5, hh: 27 }, pressure: { l: 1.85, h: 3.55 } },
  dev_em1: { active_power: { h: 51.8, hh: 52 }, thd_voltage: { h: 2.95 } },
  dev_em2: { active_power: { h: 57.8, hh: 58 }, thd_voltage: { h: 3.45 } },
  dev_em3: { active_power: { h: 63.5, hh: 64 }, thd_voltage: { h: 3.95 } },
  dev_env1: { co2: { h: 810, hh: 830 }, temperature: { h: 28.8 } },
  dev_pt1: { pressure_1: { h: 1.69, hh: 1.695 }, vibration: { h: 3.8 } },
}

// ---- 按类型的点位模板（14 / 14 / 20 / 12 / 12）----
// 注：min/max 是**画面显示量程**（HP-HMI 限值带可读性），与 devmodel 的 x_range 可不同——
// 变送器全量程 0–5 MPa 但工况 1.5–1.7，显示 0–2.5 才能看清限值带；模型量程仍以 devmodel 为准。
type TagSpec = Omit<TagMeta, 'limits'> & { tag: string }

const WATER_TAGS: TagSpec[] = [
  { tag: 'flow_rate', label: '瞬时流量', unit: 'm³/h', dec: 2, min: 0, max: 50 },
  { tag: 'total_volume', label: '累计流量', unit: 'm³', dec: 1, min: 0, max: 100000 },
  { tag: 'pressure', label: '管网压力', unit: 'MPa', dec: 3, min: 0, max: 0.8 },
  { tag: 'inlet_press', label: '进水压力', unit: 'MPa', dec: 3, min: 0, max: 0.8 },
  { tag: 'outlet_press', label: '出水压力', unit: 'MPa', dec: 3, min: 0, max: 0.8 },
  { tag: 'temp', label: '水温', unit: '°C', dec: 1, min: -10, max: 60 },
  { tag: 'battery', label: '电池电量', unit: '%', dec: 0, min: 0, max: 100 },
  { tag: 'signal', label: '信号强度', unit: '%', dec: 0, min: 0, max: 100 },
  { tag: 'daily_volume', label: '日累计', unit: 'm³', dec: 2, min: 0, max: 1000 },
  { tag: 'flow_velocity', label: '流速', unit: 'm/s', dec: 2, min: 0, max: 3 },
  { tag: 'valve_status', label: '阀门', unit: '', dec: 0, min: 0, max: 1, bool: true },
  { tag: 'leak_alarm', label: '泄漏报警', unit: '', dec: 0, min: 0, max: 1, bool: true },
  { tag: 'reverse_flow', label: '逆向流', unit: '', dec: 0, min: 0, max: 1, bool: true },
  { tag: 'cover_tamper', label: '开盖防拆', unit: '', dec: 0, min: 0, max: 1, bool: true },
]

const GAS_TAGS: TagSpec[] = [
  { tag: 'flow_rate', label: '瞬时流量', unit: 'm³/h', dec: 2, min: 0, max: 40 },
  { tag: 'volume_total', label: '累计流量', unit: 'm³', dec: 1, min: 0, max: 100000 },
  { tag: 'pressure', label: '管道压力', unit: 'kPa', dec: 2, min: 0, max: 5 },
  { tag: 'temp', label: '温度', unit: '°C', dec: 1, min: -20, max: 60 },
  { tag: 'battery', label: '电池电量', unit: '%', dec: 0, min: 0, max: 100 },
  { tag: 'signal', label: '信号强度', unit: '%', dec: 0, min: 0, max: 100 },
  { tag: 'daily_volume', label: '日累计', unit: 'm³', dec: 2, min: 0, max: 1000 },
  { tag: 'calorific', label: '热值', unit: 'MJ/m³', dec: 1, min: 30, max: 40 },
  { tag: 'valve_status', label: '阀门', unit: '', dec: 0, min: 0, max: 1, bool: true },
  { tag: 'leak_alarm', label: '泄漏报警', unit: '', dec: 0, min: 0, max: 1, bool: true },
  { tag: 'low_battery', label: '低电量', unit: '', dec: 0, min: 0, max: 1, bool: true },
  { tag: 'cover_tamper', label: '开盖防拆', unit: '', dec: 0, min: 0, max: 1, bool: true },
  { tag: 'overpressure', label: '超压', unit: '', dec: 0, min: 0, max: 1, bool: true },
  { tag: 'meter_error', label: '表计故障码', unit: '', dec: 0, min: 0, max: 99 },
]

const POWER_TAGS: TagSpec[] = [
  { tag: 'ua', label: 'A 相电压', unit: 'V', dec: 1, min: 0, max: 300 },
  { tag: 'ub', label: 'B 相电压', unit: 'V', dec: 1, min: 0, max: 300 },
  { tag: 'uc', label: 'C 相电压', unit: 'V', dec: 1, min: 0, max: 300 },
  { tag: 'ia', label: 'A 相电流', unit: 'A', dec: 1, min: 0, max: 200 },
  { tag: 'ib', label: 'B 相电流', unit: 'A', dec: 1, min: 0, max: 200 },
  { tag: 'ic', label: 'C 相电流', unit: 'A', dec: 1, min: 0, max: 200 },
  { tag: 'active_power', label: '有功功率', unit: 'kW', dec: 2, min: -100, max: 100 },
  { tag: 'reactive_power', label: '无功功率', unit: 'kvar', dec: 2, min: -100, max: 100 },
  { tag: 'apparent_power', label: '视在功率', unit: 'kVA', dec: 2, min: 0, max: 150 },
  { tag: 'power_factor', label: '功率因数', unit: '', dec: 3, min: 0, max: 1 },
  { tag: 'frequency', label: '频率', unit: 'Hz', dec: 2, min: 45, max: 55 },
  { tag: 'energy_total', label: '正向有功电能', unit: 'kWh', dec: 1, min: 0, max: 100000 },
  { tag: 'energy_peak', label: '峰段电能', unit: 'kWh', dec: 1, min: 0, max: 100000 },
  { tag: 'energy_valley', label: '谷段电能', unit: 'kWh', dec: 1, min: 0, max: 100000 },
  { tag: 'voltage_l1_l2', label: '线电压 Uab', unit: 'V', dec: 1, min: 0, max: 500 },
  { tag: 'current_neutral', label: '中性线电流', unit: 'A', dec: 2, min: 0, max: 20 },
  { tag: 'thd_voltage', label: '电压谐波', unit: '%', dec: 2, min: 0, max: 10 },
  { tag: 'load_status', label: '负荷投入', unit: '', dec: 0, min: 0, max: 1, bool: true },
  { tag: 'overload_alarm', label: '过载报警', unit: '', dec: 0, min: 0, max: 1, bool: true },
  { tag: 'breaker_status', label: '断路器合闸', unit: '', dec: 0, min: 0, max: 1, bool: true },
]

const ENV_TAGS: TagSpec[] = [
  { tag: 'temperature', label: '温度', unit: '°C', dec: 1, min: -20, max: 60 },
  { tag: 'humidity', label: '湿度', unit: '%RH', dec: 0, min: 0, max: 100 },
  { tag: 'dew_point', label: '露点', unit: '°C', dec: 1, min: -20, max: 40 },
  { tag: 'co2', label: 'CO₂ 浓度', unit: 'ppm', dec: 0, min: 300, max: 1200 },
  { tag: 'pm25', label: 'PM2.5', unit: 'µg/m³', dec: 0, min: 0, max: 500 },
  { tag: 'pm10', label: 'PM10', unit: 'µg/m³', dec: 0, min: 0, max: 1000 },
  { tag: 'air_pressure', label: '大气压', unit: 'hPa', dec: 0, min: 900, max: 1100 },
  { tag: 'light', label: '照度', unit: 'lx', dec: 0, min: 0, max: 2000 },
  { tag: 'noise', label: '噪声', unit: 'dB', dec: 0, min: 30, max: 100 },
  { tag: 'vibration', label: '振动', unit: 'mm/s', dec: 2, min: 0, max: 10 },
  { tag: 'fan_status', label: '风机运行', unit: '', dec: 0, min: 0, max: 1, bool: true },
  { tag: 'alarm', label: '环境报警', unit: '', dec: 0, min: 0, max: 1, bool: true },
]

const PT_TAGS: TagSpec[] = [
  { tag: 'pressure_1', label: '压力1', unit: 'MPa', dec: 3, min: 0, max: 2.5 },
  { tag: 'pressure_2', label: '压力2', unit: 'MPa', dec: 3, min: 0, max: 2.5 },
  { tag: 'pressure_3', label: '压力3', unit: 'MPa', dec: 3, min: 0, max: 2.5 },
  { tag: 'temperature', label: '介质温度', unit: '°C', dec: 1, min: -20, max: 120 },
  { tag: 'level', label: '液位', unit: '%', dec: 0, min: 0, max: 100 },
  { tag: 'flow', label: '流量', unit: 'm³/h', dec: 2, min: 0, max: 100 },
  { tag: 'vibration', label: '振动', unit: 'mm/s', dec: 2, min: 0, max: 10 },
  { tag: 'strain', label: '应变', unit: 'µε', dec: 0, min: 0, max: 1000 },
  { tag: 'battery', label: '电池电量', unit: '%', dec: 0, min: 0, max: 100 },
  { tag: 'signal', label: '信号强度', unit: '%', dec: 0, min: 0, max: 100 },
  { tag: 'valve_open', label: '阀门开', unit: '', dec: 0, min: 0, max: 1, bool: true },
  { tag: 'fault', label: '变送器故障', unit: '', dec: 0, min: 0, max: 1, bool: true },
]

const TYPE_TAGS: Record<DeviceType, TagSpec[]> = {
  water: WATER_TAGS, gas: GAS_TAGS, power: POWER_TAGS, env: ENV_TAGS, pt: PT_TAGS,
}

/** 每类设备的主测点（faceplate PV / L1 KPI）：不要用"首个 tag"——电表首个是 Ua，
 *  操作员要看的基线是 active_power。 */
const PRIMARY: Record<DeviceType, string> = {
  water: 'flow_rate', gas: 'flow_rate', power: 'active_power', env: 'temperature', pt: 'pressure_1',
}

const DEVS: Array<{ devid: string; type: DeviceType; pos: string; title: string; area: Area }> = [
  { devid: 'dev_wm1', type: 'water', pos: 'WM-101', title: '1# 远传水表', area: 'water' },
  { devid: 'dev_wm2', type: 'water', pos: 'WM-102', title: '2# 远传水表', area: 'water' },
  { devid: 'dev_wm3', type: 'water', pos: 'WM-103', title: '3# 远传水表', area: 'water' },
  { devid: 'dev_gm1', type: 'gas', pos: 'GM-201', title: '1# 燃气表', area: 'gas' },
  { devid: 'dev_gm2', type: 'gas', pos: 'GM-202', title: '2# 燃气表', area: 'gas' },
  { devid: 'dev_em1', type: 'power', pos: 'EM-301', title: '1# 三相电表', area: 'power' },
  { devid: 'dev_em2', type: 'power', pos: 'EM-302', title: '2# 三相电表', area: 'power' },
  { devid: 'dev_em3', type: 'power', pos: 'EM-303', title: '3# 三相电表', area: 'power' },
  { devid: 'dev_env1', type: 'env', pos: 'ENV-401', title: '环境监测一体机', area: 'env' },
  { devid: 'dev_pt1', type: 'pt', pos: 'PT-501', title: '压力变送器', area: 'env' },
]

/** 10 台设备（每台带完整点位表 + 限值） */
export const IOT_DEVICES: DeviceMeta[] = DEVS.map((d) => ({
  ...d,
  primary: PRIMARY[d.type],
  tags: TYPE_TAGS[d.type].map((t) => ({
    ...t,
    limits: LIMITS[d.devid]?.[t.tag],
  })),
}))

export const DEVICE_BY_ID: Record<string, DeviceMeta> = Object.fromEntries(
  IOT_DEVICES.map((d) => [d.devid, d]),
)

/** 取单点元数据（找不到抛错——生成器硬编码了 tag 名，静默缺行比崩溃更难查） */
export function tagOf(devid: string, tag: string): TagMeta {
  const dev = DEVICE_BY_ID[devid]
  if (!dev) throw new Error(`iot-catalog: 未知设备 ${devid}`)
  const t = dev.tags.find((x) => x.tag === tag)
  if (!t) throw new Error(`iot-catalog: ${devid} 无点位 ${tag}`)
  return t
}

/** 区域设备清单（L2/ L1 卡用） */
export function devidsOfArea(area: Area): string[] {
  return IOT_DEVICES.filter((d) => d.area === area).map((d) => d.devid)
}

/** faceplate slug：按设备（每台设备限值不同，一张面板对应一台） */
export function faceplateSlug(devid: string): string {
  return `iot-faceplate-${devid.replace(/^dev_/, '')}`
}
