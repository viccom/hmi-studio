import { describe, it, expect } from 'vitest'
import { buildDemoScreen, DEMO_A, DEMO_B } from './demo-screen'
import { unwrapDoc } from './screens'
import { collectBinds } from './binds'
import { allSymbols } from '../symbols/registry'

/**
 * T14 水处理演示画面（取水泵房）结构防漂移：快照全量冻结 + 关键契约断言。
 * 形状来源：e2e/fixtures.ts 种子实证（binfo/props 平面值/binds 结构）+ store/types.d.ts。
 * 这些断言是 T15 段2「结构层降级判据」的直接背书——bind+trigger 三元组（operator/value/
 * target_value）在此冻结，行为层由 65 单测 + T11/T12 像素实证背书。
 */

const { a, b } = buildDemoScreen()
const itemsA = a.json as unknown as Array<Record<string, unknown>>
const itemsB = b.json as unknown as Array<Record<string, unknown>>

const svgItems = (items: Array<Record<string, unknown>>) => items.filter((i) => i.type === 'svg')
const textItems = (items: Array<Record<string, unknown>>) => items.filter((i) => i.tag === 'text-vue')

describe('demo-screen 取水泵房（A）', () => {
  it('G-M3 规模：≥12 图元 = 10 自绘 svg（9 类全覆盖）+ ≥2 值牌文本', () => {
    expect(svgItems(itemsA)).toHaveLength(10)
    expect(textItems(itemsA).length).toBeGreaterThanOrEqual(4) // 值牌×2 + 标题/标签
    expect(itemsA.length).toBeGreaterThanOrEqual(12)
    // 9 类注册图元全部上画（每类 ≥1）
    const tags = new Set(svgItems(itemsA).map((i) => i.tag))
    expect([...tags].sort()).toEqual(allSymbols().map((s) => s.id).sort())
  })

  it('Jr 导入契约：svg 图元 props 平面键 ⊆ 注册表默认键（多键导入即抛 undefined.val）', () => {
    for (const item of svgItems(itemsA)) {
      const sym = allSymbols().find((s) => s.id === item.tag)
      expect(sym, `未注册图元 ${String(item.tag)}`).toBeDefined()
      const defKeys = new Set(Object.keys(sym!.props))
      for (const k of Object.keys(item.props as object)) {
        expect(defKeys.has(k), `${String(item.id)} 多出未注册 prop ${k}`).toBe(true)
      }
    }
  })

  it('id 稳定（长期资产 + E2E 锚点）：全部 id 唯一且带 wdm3 标记', () => {
    const ids = [...itemsA, ...itemsB].map((i) => String(i.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^((ah-[a-z-]+)|text-vue)-wdm3[ab]-[a-z0-9-]+$/)
  })

  it('绑定面：cpu_percent/uptime_s/alarm_active 三点，devs=[rsiot]（collectBinds 集成）', () => {
    const { fields, devs } = collectBinds({ json: a.json })
    expect(fields).toEqual(['rsiot.alarm_active', 'rsiot.cpu_percent', 'rsiot.uptime_s'])
    expect(devs).toEqual(['rsiot'])
  })

  it('阈值触发链三元组齐：泵 fill >80 红 / <=80 绿（每泵两触发互斥收口）', () => {
    const pumps = itemsA.filter((i) => i.tag === 'ah-pump')
    expect(pumps).toHaveLength(2)
    for (const p of pumps) {
      const binds = p.binds as Array<{ bind_id: string; bind_attr: string; triggers: Array<{
        rule: { operator: string; value: unknown }
        change_attr: Array<{ target_attr: string; target_value: unknown }>
      }> }>
      expect(binds).toHaveLength(1)
      expect(binds[0].bind_id).toBe('rsiot.cpu_percent')
      expect(binds[0].bind_attr).toBe('props.fill.val')
      const hot = binds[0].triggers.find((t) => t.rule.operator === '>')
      const ok = binds[0].triggers.find((t) => t.rule.operator === '<=')
      expect(hot?.rule.value).toBe(80)
      expect(hot?.change_attr[0]).toMatchObject({ target_attr: 'props.fill.val', target_value: '#f5222d' })
      expect(ok?.rule.value).toBe(80)
      expect(ok?.change_attr[0]).toMatchObject({ target_attr: 'props.fill.val', target_value: '#52c41a' })
    }
    // 一台泵动画常开（animation=true）
    expect((pumps.map((p) => (p.props as Record<string, unknown>).animation))).toContain(true)
  })

  it('液位链：罐/液位计 h 直写 cpu_percent（bind_attr=props.h.val，无触发）', () => {
    for (const tag of ['ah-tank', 'ah-level-gauge']) {
      const item = itemsA.find((i) => i.tag === tag)
      expect(item, tag).toBeDefined()
      const binds = item!.binds as Array<{ bind_id: string; bind_attr: string; triggers: unknown[] }>
      expect(binds).toHaveLength(1)
      expect(binds[0].bind_id).toBe('rsiot.cpu_percent')
      expect(binds[0].bind_attr).toBe('props.h.val')
      expect(binds[0].triggers).toEqual([])
    }
  })

  it('二值链：蝶阀/隔离开关 fill 绑 alarm_active（=1/=0 两档触发）', () => {
    for (const tag of ['ah-butterfly-valve', 'ah-dis-switch']) {
      const item = itemsA.find((i) => i.tag === tag)!
      const binds = item.binds as Array<{ bind_id: string; triggers: Array<{ rule: { operator: string; value: unknown } }> }>
      expect(binds[0].bind_id).toBe('rsiot.alarm_active')
      expect(binds[0].triggers.map((t) => `${t.rule.operator}${String(t.rule.value)}`).sort()).toEqual(['=0', '=1'])
    }
  })

  it('电机整件旋转：common_animations.val=rotate360（F17②/F19② 注册不可预设，组态直写）', () => {
    const motor = itemsA.find((i) => i.tag === 'ah-motor')!
    expect((motor.common_animations as Record<string, unknown>).val).toBe('rotate360')
  })

  it('值牌 ×2：uptime_s + cpu_percent 文本直显（props.text.val 直写，F12/vP）', () => {
    const tags = textItems(itemsA).filter((i) => Array.isArray(i.binds) && (i.binds as unknown[]).length > 0)
    expect(tags.map((i) => String(i.id))).toEqual(['text-vue-wdm3a-val-up', 'text-vue-wdm3a-val-cpu'])
    for (const t of tags) {
      const bind = (t.binds as Array<{ bind_attr: string; triggers: unknown[] }>)[0]
      expect(bind.bind_attr).toBe('props.text.val')
      expect(bind.triggers).toEqual([])
    }
  })

  it('布局防重叠出界：A 画面全部 binfo 在 800x600 内且两两不相交', () => {
    const boxes = itemsA.map((i) => i.binfo as { left: number; top: number; width: number; height: number })
    for (const bx of boxes) {
      expect(bx.left).toBeGreaterThanOrEqual(0)
      expect(bx.top).toBeGreaterThanOrEqual(0)
      expect(bx.left + bx.width).toBeLessThanOrEqual(800)
      expect(bx.top + bx.height).toBeLessThanOrEqual(600)
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i], q = boxes[j]
      const overlap = p.left < q.left + q.width && q.left < p.left + p.width
        && p.top < q.top + q.height && q.top < p.top + p.height
      expect(overlap, `图元 ${i} 与 ${j} 重叠`).toBe(false)
    }
  })
})

describe('demo-screen 互跳闭环（B）', () => {
  it('B 极简：标题 + 值牌 + 返回标签 + nav-button（4 图元，1 自绘）', () => {
    expect(itemsB).toHaveLength(4)
    expect(svgItems(itemsB)).toHaveLength(1)
  })

  it('闭环：A 的 nav-button target=B 且带默认事件模板；B 的 target=A', () => {
    const navA = itemsA.find((i) => i.tag === 'ah-nav-button')!
    expect((navA.props as Record<string, unknown>).target).toBe(DEMO_B)
    const events = navA.events as Array<{ type: string; action: string; custom_code: string }>
    expect(events).toHaveLength(1)
    expect(events[0].custom_code).toContain("$mtEventCallBack('nav'")
    const navB = itemsB.find((i) => i.tag === 'ah-nav-button')!
    expect((navB.props as Record<string, unknown>).target).toBe(DEMO_A)
  })

  it('meta 同体（wrapDoc/unwrapDoc round-trip）：name/group 不渗入 done', () => {
    const { done, meta } = unwrapDoc(a)
    expect(meta.name).toBe('取水泵房（M3 演示）')
    expect(meta.group).toBe('水处理演示')
    expect(done).not.toHaveProperty('name')
  })
})

it('全量快照（防漂移基线）', () => {
  expect(JSON.stringify({ a, b }, null, 2)).toMatchSnapshot()
})
