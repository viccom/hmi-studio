import { describe, it, expect, beforeEach } from 'vitest'
import { navButton, setNavTargetOptions, upgradeNavTargets, flattenNavSections, type ScreenOpt } from './nav-button'

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

  it('flattenNavSections：组头（▼ 哨兵值）+ 子项（全角缩进），未分组殿后——maotu select 扁平约束下的树形视觉', () => {
    const flat = flattenNavSections([
      { group: '水处理演示', cards: [{ value: 'water-demo-m3', label: '取水泵房' }] },
      { group: undefined, cards: [{ value: 'loose-1', label: '散画面' }] },
    ])
    expect(flat).toEqual([
      { value: '__group__:水处理演示', label: '▼ 水处理演示' },
      { value: 'water-demo-m3', label: '　　取水泵房' },
      { value: '__group__:未分组', label: '▼ 未分组' },
      { value: 'loose-1', label: '　　散画面' },
    ])
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

  it('upgradeNavTargets：误选组头的哨兵值清洗为空（运行时 nav 对哨兵已忽略，加载期再兜底）', () => {
    setNavTargetOptions(OPTS)
    const done = { json: [{ id: 'ah-nav-button-1', props: { target: { type: 'select', val: '__group__:水处理演示' } } }] }
    upgradeNavTargets(done as never)
    expect((done.json[0].props as { target: { val: string } }).target.val).toBe('')
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
