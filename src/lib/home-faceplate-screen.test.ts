import { describe, expect, it } from 'vitest'
import { buildHomeFaceplateScreen, HOME_E_FACEPLATE } from './home-faceplate-screen'
import { unwrapDoc } from './screens'
import { collectBinds } from './binds'
import { applyDevContext, isDevParamScreen } from './dev-context'
import { allSymbols } from '../symbols/registry'

// W11 参数化样板屏结构防漂移：绑定面 = 纯 @dev.* / @meta.dev（无具体设备），
// collectBinds devs = []；切换入口（选择器 + 双设备按钮 customCode dev）与
// 运行时重映射（applyDevContext）在此冻结契约，行为层 e2e/w11-faceplate 背书。

const doc = buildHomeFaceplateScreen()
const items = doc.json as unknown as Array<Record<string, unknown>>
type Bind = { bind_id: string; bind_attr: string }

describe('home-faceplate-screen 参数化屏', () => {
  it('slug/名称：faceplate slug 恒定，group = 家庭三表演示', () => {
    expect(HOME_E_FACEPLATE).toBe('home-meter-power-faceplate')
    const { meta, done } = unwrapDoc(doc)
    expect(meta).toEqual({ name: '家庭用电·参数化', group: '家庭三表演示' })
    expect(done).not.toHaveProperty('name')
    expect(isDevParamScreen(done)).toBe(true)
  })

  it('绑定面：全部 @ 前缀（@dev.*/@meta.dev）→ collectBinds devs = []（无具体设备订阅）', () => {
    const all = items.flatMap((i) => (i.binds ?? []) as Bind[])
    expect(all.length).toBeGreaterThanOrEqual(12)
    expect(all.every((b) => b.bind_id.startsWith('@'))).toBe(true)
    expect(all.some((b) => b.bind_id === '@meta.dev')).toBe(true)
    const { fields, devs } = collectBinds({ json: doc.json })
    expect(devs).toEqual([])
    expect(fields).toEqual([])
    // 运行时重映射后即是真实订阅面
    const inst = applyDevContext(unwrapDoc(doc).done, 'home-meter-e2')
    const remapped = collectBinds({ json: inst.json })
    expect(remapped.devs).toEqual(['home-meter-e2'])
    expect(remapped.fields.every((f) => f.startsWith('home-meter-e2.'))).toBe(true)
  })

  it('切换入口：设备选择器（devices JSON）+ 双设备按钮 customCode dev 词表', () => {
    const sel = items.find((i) => i.tag === 'ah-dev-selector')!
    const devices = JSON.parse((sel.props as Record<string, string>).devices) as Array<{ id: string }>
    expect(devices.map((d) => d.id)).toEqual(['home-meter-e1', 'home-meter-e2'])
    for (const [n, devid] of [['1', 'home-meter-e1'], ['2', 'home-meter-e2']] as const) {
      const btn = items.find((i) => i.id === `tab-dev-${n}`)!
      expect(btn.tag).toBe('sys-button-vue')
      const ev = (btn.events as Array<{ custom_code: string }>)[0]
      expect(ev.custom_code).toContain("$mtEventCallBack('dev'")
      expect(ev.custom_code).toContain(`'${devid}'`)
    }
  })

  it('图元注册：ah-dev-selector ⊆ 注册表（Jr 导入契约前提）', () => {
    for (const i of items) {
      const tag = String(i.tag)
      if (tag === 'text-vue' || tag === 'sys-button-vue') continue
      expect(allSymbols().some((s) => s.id === tag), `未注册图元 ${tag}`).toBe(true)
    }
  })

  it('布局：20px 网格 + 画布内出界检查（面板元素同位族不判重叠——参数屏单面板）', () => {
    const cfg = doc.canvasCfg as { width: number; height: number }
    for (const i of items) {
      const bx = i.binfo as { left: number; top: number; width: number; height: number }
      expect(bx.left % 20, `${String(i.id)} left 网格`).toBe(0)
      expect(bx.top % 20, `${String(i.id)} top 网格`).toBe(0)
      expect(bx.left + bx.width).toBeLessThanOrEqual(cfg.width)
      expect(bx.top + bx.height).toBeLessThanOrEqual(cfg.height)
    }
  })

  it('全量快照（防漂移基线）', () => {
    expect(JSON.stringify(doc, null, 2)).toMatchSnapshot()
  })
})
