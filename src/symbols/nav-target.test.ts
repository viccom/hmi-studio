import { describe, it, expect, beforeEach } from 'vitest'
import { navButton, setNavTargetOptions, upgradeNavTargets, type ScreenOpt } from './nav-button'

const OPTS: ScreenOpt[] = [
  { value: 'water-demo-m3', label: '取水泵房' },
  { value: 'water-demo-m3-b', label: '清水池 B' },
]

describe('nav-button 目标画面选择器（W9 反馈：slug 手输 → 面板下拉）', () => {
  beforeEach(() => setNavTargetOptions([]))

  it('setNavTargetOptions：注册项描述符变 select 型并携带 options（新拖实例带下拉）', () => {
    setNavTargetOptions(OPTS)
    expect(navButton.props.target?.type).toBe('select')
    expect(navButton.props.target?.options).toEqual(OPTS)
  })

  it('upgradeNavTargets：已放置实例（input 旧描述符）升级为 select，val 保留', () => {
    setNavTargetOptions(OPTS)
    const done = {
      json: [
        { id: 'ah-nav-button-1', props: { target: { title: '目标画面 slug', type: 'input', val: 'water-demo-m3' } } },
        { id: 'ah-pump-1', props: { fill: { title: '主体色', type: 'color', val: '#52c41a' } } },
      ],
    }
    upgradeNavTargets(done as never)
    const t = (done.json[0].props as { target: { type: string; val: string } }).target
    expect(t.type).toBe('select')
    expect(t.val).toBe('water-demo-m3') // 既有目标不丢
    expect((done.json[1].props as { fill: unknown }).fill).toBeDefined() // 非导航件不动
  })

  it('upgradeNavTargets：无 props.target 的实例与空 json 容错', () => {
    setNavTargetOptions(OPTS)
    const done = { json: [{ id: 'ah-nav-button-2' }, { id: 'ah-nav-button-3', props: {} }] }
    expect(() => upgradeNavTargets(done as never)).not.toThrow()
  })

  it('options 为空（未加载画面列表）时 select 描述符 options 为空数组——面板仍可用（val 保留显示）', () => {
    setNavTargetOptions([])
    expect(navButton.props.target?.type).toBe('select')
    expect(navButton.props.target?.options).toEqual([])
  })
})
