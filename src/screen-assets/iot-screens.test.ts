// 工业 SCADA 画面集：结构契约（slug 登记/id 唯一/画布内/props 子集/绑定合法）+ 快照。
import { describe, it, expect } from 'vitest'
import type { IExportDoneJson } from 'maotu'
import { buildIotScreens } from './iot-screens'
import { IOT_DEVICES, DEVICE_BY_ID, faceplateSlug } from './iot-catalog'
import { IOT_FACEPLATES, IOT_L1, IOT_WATER, IOT_POWER, IOT_GAS, IOT_ENV, PROTECTED_SLUGS } from './protected'
import { allSymbols } from '../symbols/registry'

const BUILT = buildIotScreens()
const SCREENS: Array<[string, ReturnType<typeof buildIotScreens>['l1']]> = [
  [IOT_L1, BUILT.l1],
  [IOT_WATER, BUILT.water],
  [IOT_POWER, BUILT.power],
  [IOT_GAS, BUILT.gas],
  [IOT_ENV, BUILT.env],
  ...Object.entries(BUILT.faceplates),
]

const SYMBOL_PROPS = new Map(allSymbols().map((s) => [s.id, new Set(Object.keys(s.props))]))

function walk(items: unknown[], fn: (el: IExportDoneJson) => void): void {
  for (const p of items) {
    if (!p || typeof p !== 'object') continue
    const el = p as IExportDoneJson
    fn(el)
    const kids = (el as unknown as { children?: unknown[] }).children
    if (Array.isArray(kids)) walk(kids, fn)
  }
}

describe('iot 画面集：清单与登记', () => {
  it('L1 + 4 个 L2 + 10 个 L3，slug 全量在 protected 清单内（长期资产）', () => {
    expect(SCREENS.length).toBe(15)
    const faceplateSlugs = Object.keys(BUILT.faceplates).sort()
    expect(faceplateSlugs).toEqual([...IOT_FACEPLATES].sort())
    for (const [slug] of SCREENS) {
      expect(PROTECTED_SLUGS).toContain(slug as (typeof PROTECTED_SLUGS)[number])
    }
  })

  it('L3 slug 与设备一一对应（每台设备一张面板：限值随设备不同）', () => {
    for (const d of IOT_DEVICES) {
      expect(BUILT.faceplates[faceplateSlug(d.devid)]).toBeDefined()
    }
  })

  it('全部画面 group 一致、画布宽 1280、灰阶底按层级（L3 更高：参数表 + 历史趋势带）', () => {
    for (const [slug, doc] of SCREENS) {
      expect(doc.group).toBe('工业 SCADA 演示')
      expect(doc.canvasCfg.width).toBe(1280)
      const expectH = slug.startsWith('iot-faceplate-') ? 900 : 800
      expect(doc.canvasCfg.height, slug).toBe(expectH)
    }
    expect(BUILT.l1.canvasCfg.color).toBe('#F0F0F0')
    expect(BUILT.water.canvasCfg.color).toBe('#DCDCDC')
    expect(Object.values(BUILT.faceplates)[0].canvasCfg.color).toBe('#F5F5F5')
  })
})

describe.each(SCREENS)('%s 结构契约', (_slug, doc) => {
  it('元素 id 唯一', () => {
    const ids = new Set<string>()
    walk(doc.json, (el) => {
      const id = String(el.id)
      expect(ids.has(id), `重复 id: ${id}`).toBe(false)
      ids.add(id)
    })
  })

  it('图元全部在注册表；props 键 ⊆ 描述符键（多余键会让 maotu 导入失败）', () => {
    walk(doc.json, (el) => {
      const key = String(el.tag)
      // 内置系统图元不在 allSymbols：text-vue / sys-button-vue / group
      if (key === 'text-vue' || key === 'sys-button-vue') return
      const allowed = SYMBOL_PROPS.get(key)
      expect(allowed, `未注册图元 ${key}`).toBeDefined()
      for (const k of Object.keys((el.props ?? {}) as Record<string, unknown>)) {
        expect(allowed!.has(k), `${key} 多余 props 键 ${k}`).toBe(true)
      }
    })
  })

  it('元素框在画布内', () => {
    const h = doc.canvasCfg.height
    walk(doc.json, (el) => {
      const b = (el as unknown as { binfo: { left: number; top: number; width: number; height: number } }).binfo
      expect(b.left).toBeGreaterThanOrEqual(0)
      expect(b.top).toBeGreaterThanOrEqual(0)
      expect(b.left + b.width).toBeLessThanOrEqual(1280)
      expect(b.top + b.height).toBeLessThanOrEqual(h)
    })
  })

  it('绑定合法：<devid>.<tag> / @dev.<tag> / @meta.dev / __ 合成点；bind_attr 以 .val 结尾；触发链成对', () => {
    const hasDevBinds = doc.json.some((el) => (el.binds ?? []).some((b) => String(b.bind_id).startsWith('@dev.')))
    walk(doc.json, (el) => {
      for (const b of el.binds ?? []) {
        const id = String(b.bind_id)
        expect(String(b.bind_attr).endsWith('.val'), `bind_attr ${b.bind_attr}`).toBe(true)
        if (id === '@meta.dev') continue
        if (id.startsWith('__')) continue
        if (id.startsWith('@dev.')) {
          expect(hasDevBinds, `非参数化画面出现 @dev 绑定 ${id}`).toBe(true)
          const tag = id.slice('@dev.'.length)
          if (tag !== '__prio' && tag !== '__alarms') {
            // faceplate 画面只有一台设备：用 meta.devs 首项校验 tag 存在
            const devid = doc.devs?.[0]?.id
            expect(devid, `@dev 绑定缺 devs: ${id}`).toBeTruthy()
            const dev = DEVICE_BY_ID[devid!]
            expect(dev.tags.some((t) => t.tag === tag), `${devid} 无点位 ${tag}`).toBe(true)
          }
          continue
        }
        const dot = id.indexOf('.')
        expect(dot > 0, `非法 bind_id ${id}`).toBe(true)
        const devid = id.slice(0, dot)
        const tag = id.slice(dot + 1)
        // 合成点：<devid>.__prio / <devid>.<tag>.__prio（宿主注入，不是 rs-iot 点位）
        if (tag === '__prio' || tag === '__alarms' || tag.endsWith('.__prio') || tag.endsWith('.__alarms')) continue
        const dev = DEVICE_BY_ID[devid]
        expect(dev, `未知 devid ${devid}`).toBeDefined()
        expect(dev.tags.some((t) => t.tag === tag), `${devid} 无点位 ${tag}`).toBe(true)
        // 触发链：0 或 2 条（互斥收口）
        const n = (b.triggers ?? []).length
        expect(n === 0 || n === 2, `${id} 触发链 ${n} 条`).toBe(true)
      }
    })
  })
})

describe('BI 通道面板（ah-hist-trend / ah-bi-*）', () => {
  it('L1/L3 的历史趋势件平铺在顶层，series 规格合法且绑定真实点位', () => {
    const l1 = BUILT.l1.json.filter((el) => el.tag === 'ah-hist-trend')
    expect(l1.length).toBe(1)
    for (const el of l1) {
      const raw = (el.props as Record<string, unknown>).series as string
      const rows = JSON.parse(raw) as Array<{ dev_id: string; tag: string }>
      expect(rows.length).toBeGreaterThan(0)
      for (const r of rows) {
        const dev = DEVICE_BY_ID[r.dev_id]
        expect(dev, `未知 devid ${r.dev_id}`).toBeDefined()
        expect(dev.tags.some((t) => t.tag === r.tag), `${r.dev_id} 无点位 ${r.tag}`).toBe(true)
      }
    }
    // 每张 L3 一条历史趋势（面板在本机设备上）
    for (const [slug, doc] of Object.entries(BUILT.faceplates)) {
      const hist = doc.json.filter((el) => el.tag === 'ah-hist-trend')
      expect(hist.length, slug).toBe(1)
      const rows = JSON.parse((hist[0].props as Record<string, unknown>).series as string) as Array<{ dev_id: string }>
      expect(rows[0].dev_id).toBe(doc.devs?.[0]?.id)
    }
  })
})

describe('L2 控制点预算（ISA-101：单屏 ≤50~60）', () => {
  it.each([
    [IOT_WATER, BUILT.water],
    [IOT_POWER, BUILT.power],
    [IOT_GAS, BUILT.gas],
    [IOT_ENV, BUILT.env],
  ] as const)('%s 元素数 ≤ 60', (_slug, doc) => {
    expect(doc.json.length).toBeLessThanOrEqual(60)
  })
})

describe('L3 faceplate 关键件', () => {
  it('每张 L3 恰有一个 ah-dev-faceplate，且 PV 绑定 @dev.<主测点>', () => {
    for (const [slug, doc] of Object.entries(BUILT.faceplates)) {
      const fps = doc.json.filter((el) => el.tag === 'ah-dev-faceplate')
      expect(fps.length, slug).toBe(1)
      const devid = doc.devs?.[0]?.id
      expect(devid).toBeTruthy()
      const dev = DEVICE_BY_ID[devid!]
      const pvBind = (fps[0].binds ?? []).find((b) => b.bind_attr === 'props.pv.val')
      expect(pvBind?.bind_id).toBe(`@dev.${dev.primary}`)
    }
  })
})

// 快照：L1 + 4 L2 + 每类设备各一张 L3（同类型结构一致，只差点位/限值）
describe('组态快照（防漂移基线）', () => {
  it.each([
    [IOT_L1, BUILT.l1],
    [IOT_WATER, BUILT.water],
    [IOT_POWER, BUILT.power],
    [IOT_GAS, BUILT.gas],
    [IOT_ENV, BUILT.env],
    ['iot-faceplate-wm1', BUILT.faceplates['iot-faceplate-wm1']],
    ['iot-faceplate-gm1', BUILT.faceplates['iot-faceplate-gm1']],
    ['iot-faceplate-em1', BUILT.faceplates['iot-faceplate-em1']],
    ['iot-faceplate-env1', BUILT.faceplates['iot-faceplate-env1']],
    ['iot-faceplate-pt1', BUILT.faceplates['iot-faceplate-pt1']],
  ] as const)('%s', (_slug, doc) => {
    expect(JSON.stringify(doc, null, 2)).toMatchSnapshot()
  })
})
