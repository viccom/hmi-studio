import { describe, it, expect } from 'vitest'
import {
  buildHomeTabScreens, HOME_E_TABS, HOME_W_TABS, HOME_G_TABS,
} from './home-tab-screens'
import { HOME_GROUP } from './home-screens'
import { unwrapDoc } from './screens'
import { collectBinds } from './binds'
import { allSymbols } from '../symbols/registry'

/**
 * W10 页签三屏结构防漂移（home-screens.test.ts 同款判据，页签语义特有断言另列）：
 * - 双面板同位叠放是页签的有意语义——**跨面板**重叠不判、面板内部两两不重叠判；
 * - 初始显隐：1# 面板全显、2# 面板全隐（hide=true 出厂）；
 * - 页签 click 事件：change_attr 必须整组收口（对面板全量 hide 翻转 + 双按钮激活态互换）。
 * maotu 机制依据见 home-tab-screens.ts 文件头（Nl 深路径 / G 顶层收 binds / hide v-if）。
 */

const { power, water, gas } = buildHomeTabScreens()
const docs = { power, water, gas } as const
type DocKey = keyof typeof docs

const itemsOf = (d: { json: unknown[] }) => d.json as unknown as Array<Record<string, unknown>>
type Binfo = { left: number; top: number; width: number; height: number }
type ChangeAttr = { target_id: string; target_attr: string; target_value: unknown }
type Ev = { type: string; action: string; change_attr: ChangeAttr[]; custom_code: string }

// 预期规模：chrome（标题+双页签+双导航）恒 5；面板元素数按型不同
const EXPECT = {
  power: { total: 5 + 2 * 17, panel: 17 },
  water: { total: 5 + 2 * 13, panel: 13 },
  gas: { total: 5 + 2 * 17, panel: 17 },
} as const

/** 面板切分：按元素 id 中缀 hpt/hwt/hgt + 序号 1/2 */
const panelItems = (items: Array<Record<string, unknown>>, n: 1 | 2) => {
  const re = new RegExp(`-(?:hpt|hwt|hgt)${n}$|-(?:hpt|hwt|hgt)${n}-`)
  return items.filter((i) => re.test(String(i.id)))
}

describe('home-tab-screens 页签三屏结构', () => {
  it('规模：chrome 5 + 双面板元素数；自绘 ⊆ 注册表（sys-button-vue/text-vue 为 maotu 内置豁免）', () => {
    for (const k of Object.keys(docs) as DocKey[]) {
      const items = itemsOf(docs[k])
      expect(items, `${k} 总图元数`).toHaveLength(EXPECT[k].total)
      expect(panelItems(items, 1), `${k} 1#面板`).toHaveLength(EXPECT[k].panel)
      expect(panelItems(items, 2), `${k} 2#面板`).toHaveLength(EXPECT[k].panel)
      for (const i of items) {
        const tag = String(i.tag)
        if (tag === 'text-vue' || tag === 'sys-button-vue') continue
        expect(allSymbols().some((s) => s.id === tag), `未注册图元 ${tag}`).toBe(true)
      }
    }
  })

  it('id 稳定且屏内唯一（E2E 锚点）：ah-*/text-vue-*/tab-btn-*/tab-nav-* 四族', () => {
    for (const k of Object.keys(docs) as DocKey[]) {
      const ids = itemsOf(docs[k]).map((i) => String(i.id))
      expect(new Set(ids).size, `${k} 屏内唯一`).toBe(ids.length)
      for (const id of ids) {
        expect(id).toMatch(/^(ah-[a-z0-9-]+|text-vue-[a-z0-9-]+|tab-btn-[12]|tab-nav-[12])$/)
      }
    }
  })

  it('初始显隐：1# 面板全显 + 2# 面板全隐（hide 出厂即真）；chrome 全显', () => {
    for (const k of Object.keys(docs) as DocKey[]) {
      const items = itemsOf(docs[k])
      const p1 = panelItems(items, 1)
      const p2 = panelItems(items, 2)
      const chrome = items.filter((i) => !p1.includes(i) && !p2.includes(i))
      expect(p1.every((i) => i.hide === false), `${k} 1# 面板应全显`).toBe(true)
      expect(p2.every((i) => i.hide === true), `${k} 2# 面板应全隐`).toBe(true)
      expect(chrome.every((i) => i.hide === false), `${k} chrome 应全显`).toBe(true)
    }
  })

  it('页签 click 事件：change_attr 整组收口——对面板全量 hide 翻转 + 按钮激活态互换', () => {
    for (const k of Object.keys(docs) as DocKey[]) {
      const items = itemsOf(docs[k])
      const p1 = panelItems(items, 1).map((i) => String(i.id))
      const p2 = panelItems(items, 2).map((i) => String(i.id))
      for (const [n, selfBtn, otherBtn, showIds, hideIds] of [
        ['1', 'tab-btn-1', 'tab-btn-2', p1, p2],
        ['2', 'tab-btn-2', 'tab-btn-1', p2, p1],
      ] as const) {
        const btn = items.find((i) => i.id === selfBtn)!
        const evs = (btn.events ?? []) as Ev[]
        const ev = evs.find((e) => e.type === 'click' && e.action === 'changeAttr')
        expect(ev, `${k} ${selfBtn} click/changeAttr 事件`).toBeDefined()
        const byTarget = new Map(ev!.change_attr.map((c) => [c.target_id, c]))
        for (const tid of showIds) {
          expect(byTarget.get(tid), `${k} ${selfBtn} → ${tid}`).toMatchObject({ target_attr: 'hide', target_value: false })
        }
        for (const tid of hideIds) {
          expect(byTarget.get(tid), `${k} ${selfBtn} → ${tid}`).toMatchObject({ target_attr: 'hide', target_value: true })
        }
        expect(byTarget.get(selfBtn)).toMatchObject({ target_attr: 'props.type.val', target_value: 'primary' })
        expect(byTarget.get(otherBtn)).toMatchObject({ target_attr: 'props.type.val', target_value: 'info' })
        expect(ev!.change_attr).toHaveLength(p1.length + p2.length + 2)
      }
    }
  })

  it('页签按钮形状：sys-button-vue + 初始 1#=primary / 2#=info', () => {
    for (const k of Object.keys(docs) as DocKey[]) {
      const items = itemsOf(docs[k])
      for (const [id, type] of [['tab-btn-1', 'primary'], ['tab-btn-2', 'info']] as const) {
        const btn = items.find((i) => i.id === id)!
        expect(btn.tag).toBe('sys-button-vue')
        expect((btn.props as Record<string, unknown>).type).toBe(type)
      }
    }
  })

  it('导航闭环：customCode $mtEventCallBack 指向另两张页签屏', () => {
    const expectNavs: Record<DocKey, [string, string]> = {
      power: [HOME_W_TABS, HOME_G_TABS],
      water: [HOME_E_TABS, HOME_G_TABS],
      gas: [HOME_E_TABS, HOME_W_TABS],
    }
    for (const k of Object.keys(docs) as DocKey[]) {
      const items = itemsOf(docs[k])
      for (const n of [1, 2] as const) {
        const nav = items.find((i) => i.id === `tab-nav-${n}`)! as { events: Ev[] }
        const code = nav.events.find((e) => e.type === 'click' && e.action === 'customCode')?.custom_code ?? ''
        expect(code).toContain("$mtEventCallBack('nav'")
        expect(code).toContain(`'${expectNavs[k][n - 1]}'`)
      }
    }
  })

  it('绑定面：collectBinds devs = 双表；面板内 bind 全部指向本面板 dev', () => {
    const devOf: Record<DocKey, [string, string]> = {
      power: ['home-meter-e1', 'home-meter-e2'],
      water: ['home-meter-w1', 'home-meter-w2'],
      gas: ['home-meter-g1', 'home-meter-g2'],
    }
    for (const k of Object.keys(docs) as DocKey[]) {
      const { devs } = collectBinds({ json: docs[k].json })
      expect([...devs].sort(), `${k} devs`).toEqual([...devOf[k]].sort())
      for (const n of [1, 2] as const) {
        for (const i of panelItems(itemsOf(docs[k]), n)) {
          for (const b of (i.binds ?? []) as Array<{ bind_id: string }>) {
            expect(b.bind_id.startsWith(devOf[k][n - 1]), `${k} ${i.id} bind ${b.bind_id}`).toBe(true)
          }
        }
      }
    }
  })

  it('布局：面板内部两两不重叠（跨面板同位叠放为页签语义，不判）；全部 20px 网格出界检查', () => {
    for (const k of Object.keys(docs) as DocKey[]) {
      const cfg = docs[k].canvasCfg as { width: number; height: number }
      for (const n of [1, 2] as const) {
        const boxes = panelItems(itemsOf(docs[k]), n).map((i) => i.binfo as Binfo)
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const p = boxes[i], q = boxes[j]
          const overlap = p.left < q.left + q.width && q.left < p.left + p.width
            && p.top < q.top + q.height && q.top < p.top + p.height
          expect(overlap, `${k} 面板${n} 图元 ${i} 与 ${j} 重叠`).toBe(false)
        }
      }
      for (const i of itemsOf(docs[k])) {
        const bx = i.binfo as Binfo
        expect(bx.left % 20, `${String(i.id)} left 网格`).toBe(0)
        expect(bx.top % 20, `${String(i.id)} top 网格`).toBe(0)
        expect(bx.left + bx.width).toBeLessThanOrEqual(cfg.width)
        expect(bx.top + bx.height).toBeLessThanOrEqual(cfg.height)
      }
    }
  })

  it('meta 同体（unwrapDoc round-trip）：页签屏名入 meta、不渗入 done', () => {
    const { done, meta } = unwrapDoc(power)
    expect(meta).toEqual({ name: '家庭用电·页签', group: HOME_GROUP })
    expect(done).not.toHaveProperty('name')
    expect(unwrapDoc(water).meta.name).toBe('家庭用水·页签')
    expect(unwrapDoc(gas).meta.name).toBe('家庭燃气·页签')
  })

  it('趋势契约：电屏双曲线 / 水·气单曲线，tick bind 与 points field 一一对应', () => {
    for (const k of Object.keys(docs) as DocKey[]) {
      for (const n of [1, 2] as const) {
        const trend = panelItems(itemsOf(docs[k]), n).find((i) => i.tag === 'ah-trend-chart')!
        const props = trend.props as Record<string, unknown>
        const curves = JSON.parse(props.points as string) as Array<{ field: string }>
        expect(curves.length, `${k} 面板${n} 曲线数`).toBe(k === 'power' ? 2 : 1)
        const tickBinds = (trend.binds as Array<{ bind_id: string; bind_attr: string }>)
          .filter((b) => b.bind_attr.startsWith('props.tick'))
        expect(tickBinds).toHaveLength(curves.length)
      }
    }
  })

  for (const k of Object.keys(docs) as DocKey[]) {
    it(`全量快照（防漂移基线）：${k}`, () => {
      expect(JSON.stringify(docs[k], null, 2)).toMatchSnapshot()
    })
  }
})
