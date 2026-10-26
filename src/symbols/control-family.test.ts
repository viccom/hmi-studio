// T13 批 2 三图元（电机/隔离开关/跳转按钮）结构契约：
// 快照 + lint + fill 继承同 T12 族；nav-button 额外固化默认事件模板（F6 落锤的机械化保障）。
import { describe, it, expect } from 'vitest'
import { motor } from './motor'
import { disSwitch } from './dis-switch'
import { navButton, NAV_EVENT_CODE } from './nav-button'
import { lintSymbol } from '../lib/symbol-lint'
import type { HmiSymbol } from './types'

const FAMILY: [name: string, s: HmiSymbol][] = [
  ['电机', motor],
  ['隔离开关', disSwitch],
  ['跳转按钮', navButton],
]

describe.each(FAMILY)('%s（批 2）', (_name, s) => {
  it('结构快照（ILeftAsideConfigItemPublic）', () => {
    expect(s).toMatchSnapshot()
  })

  it('过约定 lint（fill 继承 / ports 锚位 / viewBox / 描述符 / 注释无双连字符）', () => {
    expect(lintSymbol(s)).toEqual([])
  })

  it('fill 继承：svg 主体不写死填充（定色仅 rgba 叠加轮廓/件）', () => {
    const solidFills = (s.svg ?? '').match(/fill="(?!none)[^"]*"/g) ?? []
    for (const f of solidFills) expect(f).toMatch(/^fill="rgba\(/)
  })
})

describe('电机整件动画路径（F17② + types.ts ⑦）', () => {
  it('props 仅 fill——common_animations 注册项无法预设（registerConfig 无条件覆写），文档指引抽屉/triggers', () => {
    expect(Object.keys(motor.props ?? {})).toEqual(['fill'])
  })
})

describe('跳转按钮默认事件模板（F6：拖入实例携带）', () => {
  it('注册项自带 click customCode 事件：$mtEventCallBack nav + $getItemAttrByID 点路径读 target', () => {
    const ev = navButton.events?.[0]
    expect(ev?.type).toBe('click')
    expect(ev?.action).toBe('customCode')
    expect(ev?.custom_code).toBe(NAV_EVENT_CODE)
    // 模板要素：nav 词表项 + item id 透传 + 点路径读 props.target.val（yi 点路径解析实证）
    expect(NAV_EVENT_CODE).toContain("$mtEventCallBack('nav', $item_info.id")
    expect(NAV_EVENT_CODE).toContain("$getItemAttrByID($item_info.id, 'props.target.val')")
  })

  it('target 为 input 描述符（右面板可填目标 slug）', () => {
    expect(navButton.props.target?.type).toBe('input')
  })
})
