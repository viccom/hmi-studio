import { describe, it, expect } from 'vitest'
import { buildHomeScreens, HOME_E, HOME_W, HOME_G, HOME_GROUP } from './home-screens'
import { unwrapDoc } from './screens'
import { collectBinds } from './binds'
import { allSymbols } from '../symbols/registry'

/**
 * P3 家庭三表三屏结构防漂移：快照全量冻结 + 关键契约断言（demo-screen.test.ts 同款判据）。
 * 数据面 = 真实活数据 home-meter-e/w/g 系列（周期 2s）；触发器布尔语义（规则值 true/false，
 * bundle Lc 实证）与余额预警链（<20/>=20 Number 通道）在此冻结——行为层由 e2e/home-meters 背书。
 */

const { power, water, gas } = buildHomeScreens()
const docs = { power, water, gas } as const
type DocKey = keyof typeof docs

const itemsOf = (d: { json: unknown[] }) => d.json as unknown as Array<Record<string, unknown>>
const symItems = (items: Array<Record<string, unknown>>) => items.filter((i) => i.tag !== 'text-vue') // 含 svg/custom-svg/vue 三路线
const textItems = (items: Array<Record<string, unknown>>) => items.filter((i) => i.tag === 'text-vue')
type Bind = { bind_id: string; bind_attr: string; triggers: Array<{ rule: { operator: string; value: unknown }; change_attr: Array<{ target_id: string; target_attr: string; target_value: unknown }> }> }

// 预期规模（svg 型含 vue 型趋势/面板——按 tag ≠ text-vue 统计）+ 预期绑定面
const EXPECT = {
  power: { sym: 7, text: 13, devs: ['home-meter-e1', 'home-meter-e2'], binds: 22 },
  water: { sym: 5, text: 17, devs: ['home-meter-w1', 'home-meter-w2'], binds: 14 },
  gas: { sym: 6, text: 15, devs: ['home-meter-g1', 'home-meter-g2'], binds: 15 },
} as const

describe('home-screens 三屏结构', () => {
  it('规模：图元计数 + 全部自绘 ⊆ 注册表（Jr 导入契约前提）', () => {
    for (const k of Object.keys(docs) as DocKey[]) {
      const items = itemsOf(docs[k])
      expect(symItems(items), `${k} 自绘图元数`).toHaveLength(EXPECT[k].sym)
      expect(textItems(items), `${k} 文本图元数`).toHaveLength(EXPECT[k].text)
      for (const i of symItems(items)) {
        expect(allSymbols().some((s) => s.id === i.tag), `未注册图元 ${String(i.tag)}`).toBe(true)
      }
    }
  })

  it('Jr 导入契约：props 平面键 ⊆ 注册表默认键（多键导入即抛 undefined.val）', () => {
    for (const k of Object.keys(docs) as DocKey[]) {
      for (const item of itemsOf(docs[k])) {
        if (item.tag === 'text-vue') continue
        const s = allSymbols().find((x) => x.id === item.tag)
        expect(s, `未注册图元 ${String(item.tag)}`).toBeDefined()
        const defKeys = new Set(Object.keys(s!.props))
        for (const key of Object.keys(item.props as object)) {
          expect(defKeys.has(key), `${String(item.id)} 多出未注册 prop ${key}`).toBe(true)
        }
      }
    }
  })

  it('id 稳定（E2E 锚点）：三屏全量唯一且带 hm 前缀标记', () => {
    const ids = (Object.keys(docs) as DocKey[]).flatMap((k) => itemsOf(docs[k]).map((i) => String(i.id)))
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^((ah-[a-z0-9-]+)|text-vue)-hm[pgw]-[a-z0-9-]+$/)
  })

  it('绑定面：devs/绑定数与数据面对齐（collectBinds 集成）', () => {
    for (const k of Object.keys(docs) as DocKey[]) {
      const { fields, devs } = collectBinds({ json: docs[k].json })
      expect(devs, `${k} devs`).toEqual(EXPECT[k].devs)
      expect(fields.every((f) => devs.some((d) => f.startsWith(`${d}.`)))).toBe(true)
      const n = itemsOf(docs[k]).reduce((n, i) => n + ((i.binds as unknown[]) ?? []).length, 0)
      expect(n, `${k} 绑定条数`).toBe(EXPECT[k].binds)
    }
  })

  it('触发链纪律：每条 bind 触发要么 0 条要么 2 条（互斥收口成对，§2.3）', () => {
    for (const k of Object.keys(docs) as DocKey[]) {
      for (const i of itemsOf(docs[k])) {
        for (const b of (i.binds ?? []) as Array<{ triggers: unknown[] }>) {
          expect([0, 2]).toContain(b.triggers.length)
        }
      }
    }
  })

  it('布尔开关链语义：规则值 = 布尔原样 true/false（Lc 串比较实证——勿改 1/0）', () => {
    const chains: Array<Bind> = []
    for (const k of Object.keys(docs) as DocKey[]) {
      for (const i of itemsOf(docs[k])) {
        for (const b of (i.binds ?? []) as Bind[]) {
          if (b.triggers.length === 2 && b.triggers.every((t) => t.rule.operator === '=')) chains.push(b)
        }
      }
    }
    expect(chains.length).toBeGreaterThanOrEqual(12) // 面板脉冲×2/功率盘/水表逆流×2/阀门牌×2/气表阀×2/泄漏×2/三色灯×2
    for (const c of chains) {
      const vals = c.triggers.map((t) => t.rule.value).sort()
      expect(vals).toEqual([false, true])
      for (const t of c.triggers) {
        expect(t.change_attr[0].target_id).toBeTruthy()
        expect(typeof t.change_attr[0].target_value === 'boolean' || typeof t.change_attr[0].target_value === 'string').toBe(true)
      }
    }
  })

  it('余额预警链：balance 绑 text 直写 + <20 橙 / >=20 白（Number 通道）', () => {
    for (const [id, bindId] of [
      ['text-vue-hmg-val-bal1', 'home-meter-g1.balance'],
      ['text-vue-hmg-val-bal2', 'home-meter-g2.balance'],
    ] as const) {
      const item = itemsOf(gas).find((i) => i.id === id)!
      const b = (item.binds as Bind[])[0]
      expect(b.bind_id).toBe(bindId)
      expect(b.bind_attr).toBe('props.text.val')
      const low = b.triggers.find((t) => t.rule.operator === '<')!
      const ok = b.triggers.find((t) => t.rule.operator === '>=')!
      expect(low.rule.value).toBe(20)
      expect(low.change_attr[0]).toMatchObject({ target_attr: 'props.fill.val', target_value: '#faad14' })
      expect(ok.rule.value).toBe(20)
      expect(ok.change_attr[0]).toMatchObject({ target_attr: 'props.fill.val', target_value: '#FFF700' })
    }
  })

  it('趋势契约：points JSON ≤3 条且 field 与 tick bind 一一对应，bind_attr=props.tickN.val', () => {
    for (const k of Object.keys(docs) as DocKey[]) {
      const trend = itemsOf(docs[k]).find((i) => i.tag === 'ah-trend-chart')!
      const props = trend.props as Record<string, unknown>
      const curves = JSON.parse(props.points as string) as Array<{ field: string; label: string; unit: string; color: string }>
      expect(curves.length).toBeGreaterThanOrEqual(1)
      expect(curves.length).toBeLessThanOrEqual(3)
      expect(props.windowSecs).toBe(600)
      expect(String(props.yUnit)).not.toBe('') // VUE_EMPTY_STR 禁令（jT）
      const tickBinds = (trend.binds as Bind[]).filter((b) => b.bind_attr.startsWith('props.tick'))
      expect(tickBinds).toHaveLength(curves.length)
      curves.forEach((c, n) => {
        expect(c.field).toBeTruthy()
        expect(c.color).toMatch(/^#[0-9a-f]{6}$/)
        expect(tickBinds.find((b) => b.bind_attr === `props.tick${n}.val`)?.bind_id).toBe(c.field)
      })
    }
  })

  it('值牌：绑定文本一律 props.text.val 直写；无绑定的文本 = 标签', () => {
    for (const k of Object.keys(docs) as DocKey[]) {
      for (const t of textItems(itemsOf(docs[k]))) {
        for (const b of (t.binds ?? []) as Bind[]) {
          expect(b.bind_attr, String(t.id)).toBe('props.text.val')
        }
      }
      const bound = textItems(itemsOf(docs[k])).filter((i) => ((i.binds as unknown[]) ?? []).length > 0)
      expect(bound.length, `${k} 值牌数`).toBeGreaterThanOrEqual(3)
    }
  })

  it('导航闭环：每屏双 nav-button target=另两屏（select 值=slug）', () => {
    const targets = (k: DocKey) =>
      itemsOf(docs[k]).filter((i) => i.tag === 'ah-nav-button').map((i) => (i.props as Record<string, unknown>).target)
    expect(targets('power')).toEqual([HOME_W, HOME_G])
    expect(targets('water')).toEqual([HOME_E, HOME_G])
    expect(targets('gas')).toEqual([HOME_E, HOME_W])
    // nav-button 默认 click 事件模板随注册项实例化（运行页跳转载体）
    for (const k of Object.keys(docs) as DocKey[]) {
      for (const nav of itemsOf(docs[k]).filter((i) => i.tag === 'ah-nav-button')) {
        const events = nav.events as Array<{ custom_code: string }>
        expect(events.some((e) => e.custom_code.includes("$mtEventCallBack('nav'"))).toBe(true)
      }
    }
  })

  it('meta 同体（unwrapDoc round-trip）：name/group 不渗入 done', () => {
    const { done, meta } = unwrapDoc(power)
    expect(meta).toEqual({ name: '家庭用电监控', group: HOME_GROUP })
    expect(done).not.toHaveProperty('name')
    expect(unwrapDoc(water).meta.name).toBe('家庭用水监控')
    expect(unwrapDoc(gas).meta.name).toBe('家庭燃气监控')
  })

  for (const k of Object.keys(docs) as DocKey[]) {
    it(`布局防重叠出界 + 20px 网格：${k} 全部 binfo 在画布内、两两不相交、坐标对齐网格`, () => {
      const cfg = docs[k].canvasCfg as { width: number; height: number }
      const boxes = itemsOf(docs[k]).map((i) => i.binfo as { left: number; top: number; width: number; height: number })
      for (const bx of boxes) {
        expect(bx.left).toBeGreaterThanOrEqual(0)
        expect(bx.top).toBeGreaterThanOrEqual(0)
        expect(bx.left + bx.width).toBeLessThanOrEqual(cfg.width)
        expect(bx.top + bx.height).toBeLessThanOrEqual(cfg.height)
        expect(bx.left % 20, `left 未对齐 20px 网格: ${bx.left}`).toBe(0)
        expect(bx.top % 20, `top 未对齐 20px 网格: ${bx.top}`).toBe(0)
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i], q = boxes[j]
        const overlap = p.left < q.left + q.width && q.left < p.left + p.width
          && p.top < q.top + q.height && q.top < p.top + p.height
        expect(overlap, `图元 ${i} 与 ${j} 重叠`).toBe(false)
      }
    })
  }

  it('全量快照（防漂移基线）', () => {
    expect(JSON.stringify({ power, water, gas }, null, 2)).toMatchSnapshot()
  })
})
