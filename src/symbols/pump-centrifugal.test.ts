// 离心泵图元结构快照：ILeftAsideConfigItemPublic 全量（svg/props/ports/尺寸）——
// 改动图元即改快照，review 时 diff 即审阅面；同时守 lint 约定不破。
import { describe, it, expect } from 'vitest'
import { pumpCentrifugal } from './pump-centrifugal'
import { lintSymbol } from '../lib/symbol-lint'

describe('离心泵（首图元）', () => {
  it('结构快照（ILeftAsideConfigItemPublic）', () => {
    expect(pumpCentrifugal).toMatchSnapshot()
  })

  it('过约定 lint（fill 继承 / ports 锚位 / viewBox / 描述符）', () => {
    expect(lintSymbol(pumpCentrifugal)).toEqual([])
  })

  it('动画控制链要素齐备（types.ts ③：影子树样式 + use 属性选择器 + play-state 变量）', () => {
    expect(pumpCentrifugal.svg).toContain('.ah-rotor')
    expect(pumpCentrifugal.svg).toContain('use[animation="true"]')
    expect(pumpCentrifugal.svg).toContain('animation-play-state: var(--ah-run, paused)')
    expect(pumpCentrifugal.props.animation?.type).toBe('switch')
  })
})
