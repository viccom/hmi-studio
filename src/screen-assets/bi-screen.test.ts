// 监控站 BI 大屏画面资产单测：结构契约 + 布局防漂移。
//
// 该画面是「registry 全量覆盖」判据之外的**长期资产**（slug 恒定 bi-station，
// 不入 e2e 清扫）。单测冻结三类契约：
// 1. 结构：图元都是已注册 BI 符号、props 平面键 ⊆ 注册表默认键（Jr 导入契约）
// 2. 布局：全部 binfo 在画布内且两两不重叠
// 3. 语义：累计量序列带 mode=cumulative（否则宿主会按瞬时量口径求值，数字错）
import { describe, it, expect } from 'vitest'
import { buildBiStationScreen, BI_STATION, BI_GROUP } from './bi-screen'
import { allSymbols } from '../symbols/registry'

const doc = buildBiStationScreen()
const items = doc.json as Array<{
  id: string; tag: string; type: string
  binfo: { left: number; top: number; width: number; height: number }
  props: Record<string, unknown>
}>

describe('监控站 BI 大屏（bi-station）', () => {
  it('slug/组名稳定（长期资产 + 导航分区）', () => {
    expect(BI_STATION).toBe('bi-station')
    expect(BI_GROUP).toBe('BI 大屏演示')
    expect(doc.name).toBe('监控站数据大屏')
    expect(doc.group).toBe(BI_GROUP)
  })

  it('画布 1920×1080（监控站大屏形态）', () => {
    expect(doc.canvasCfg.width).toBe(1920)
    expect(doc.canvasCfg.height).toBe(1080)
  })

  it('含 BI 图元且全部已注册（tag 前缀 ah-bi-）', () => {
    const bi = items.filter((i) => i.tag.startsWith('ah-bi-'))
    expect(bi.length).toBeGreaterThanOrEqual(8)
    for (const it of bi) {
      expect(allSymbols().some((s) => s.id === it.tag), `未注册图元 ${it.tag}`).toBe(true)
    }
  })

  it('Jr 导入契约：props 平面键 ⊆ 注册表默认键（多键导入即抛 undefined.val）', () => {
    for (const it of items) {
      const sym = allSymbols().find((s) => s.id === it.tag)
      if (!sym) continue // text-vue 是 maotu 内置图元，不在本仓注册表
      const defKeys = new Set(Object.keys(sym.props))
      for (const k of Object.keys(it.props)) {
        expect(defKeys.has(k), `${it.id} 多出未注册 prop ${k}`).toBe(true)
      }
    }
  })

  it('id 唯一且 BI 图元 id 带 bist 标记（E2E 锚点）', () => {
    const ids = items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const it of items.filter((i) => i.tag.startsWith('ah-bi-'))) {
      expect(it.id).toMatch(/^ah-bi-[a-z-]+-bist-\d+$/)
    }
  })

  it('布局防重叠出界：全部 binfo 在画布内且两两不相交', () => {
    const cfg = doc.canvasCfg as { width: number; height: number }
    items.forEach((b) => {
      expect(b.binfo.left + b.binfo.width).toBeLessThanOrEqual(cfg.width)
      expect(b.binfo.top + b.binfo.height).toBeLessThanOrEqual(cfg.height)
    })
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i].binfo
        const b = items[j].binfo
        const overlap = a.left < b.left + b.width && b.left < a.left + a.width
          && a.top < b.top + b.height && b.top < a.top + a.height
        expect(overlap, `图元 ${items[i].id} 与 ${items[j].id} 重叠`).toBe(false)
      }
    }
  })

  it('语义：累计量序列声明 mode（daily=周期计数器取当前值 / cumulative=累计表分段累加）', () => {
    // 现场口径（2026-10-29 实测）：
    // - energy_today 是**周期累计计数器**（当日/当周期累计）→ daily（取当前值，不做差）
    // - energy / gas_total / flow_total 是**累计表**（可跨周期累加）→ cumulative（分段累加）
    const DAILY = new Set(['energy_today'])
    const CUMULATIVE = new Set(['energy', 'gas_total', 'flow_total', 'flow_reverse', 'balance'])
    for (const it of items.filter((i) => i.tag.startsWith('ah-bi-'))) {
      const raw = String(it.props.series ?? '')
      const rows = JSON.parse(raw) as Array<{ dev_id: string; tag: string; mode?: string }>
      for (const r of rows) {
        if (DAILY.has(r.tag)) {
          expect(r.mode, `${it.id} 的 ${r.tag} 应声明 mode=daily`).toBe('daily')
        } else if (CUMULATIVE.has(r.tag)) {
          expect(r.mode, `${it.id} 的 ${r.tag} 应声明 mode=cumulative`).toBe('cumulative')
        }
      }
    }
  })

  it('语义：序列条目含 dev_id + tag（宿主据此定位 series）', () => {
    for (const it of items.filter((i) => i.tag.startsWith('ah-bi-'))) {
      const rows = JSON.parse(String(it.props.series ?? '')) as Array<{ dev_id?: string; tag?: string }>
      expect(rows.length).toBeGreaterThan(0)
      for (const r of rows) {
        expect(r.dev_id).toBeTruthy()
        expect(r.tag).toBeTruthy()
      }
    }
  })

  it('语义：BI 图元不绑 SSE 点位（通道 B 走宿主聚合，不占订阅面）', () => {
    for (const it of items.filter((i) => i.tag.startsWith('ah-bi-'))) {
      const binds = (it as unknown as { binds?: unknown[] }).binds ?? []
      expect(binds, `${it.id} 不应绑 SSE 点位`).toHaveLength(0)
    }
  })

  it('全量快照（防漂移基线）', () => {
    expect(JSON.stringify(doc, null, 2)).toMatchSnapshot()
  })
})
