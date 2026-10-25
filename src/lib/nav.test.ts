import { describe, it, expect, vi } from 'vitest'
import { createDispatcher, createNavStack } from './nav'

// T9 事件分发器：maotu 侧 $mtEventCallBack(type, $item_info.id, ...args) → MtPreview
// emit onEventCallBack(type, id, ...rest) → dispatch([type, id, ...rest]) 小词表分发。
// 参数序约定：dispatch 载荷 = [type, 触发图元 id, target, ...]——onNav 反转 target 第一。

describe('createDispatcher 词表分发', () => {
  it('nav：[type, itemId, target] → onNav(target, itemId)（target 第一）', () => {
    const onNav = vi.fn()
    const d = createDispatcher({ onNav, onBack: vi.fn(), onHome: vi.fn() })
    d.dispatch(['nav', 'item-1', 'water-2'])
    expect(onNav).toHaveBeenCalledWith('water-2', 'item-1')
  })

  it('back / home 命中（载荷不参与语义）', () => {
    const onBack = vi.fn()
    const onHome = vi.fn()
    const d = createDispatcher({ onNav: vi.fn(), onBack, onHome })
    d.dispatch(['back', 'item-9'])
    expect(onBack).toHaveBeenCalledOnce()
    d.dispatch(['home'])
    expect(onHome).toHaveBeenCalledOnce()
  })

  it('alarm：打开告警抽屉语义命中 onAlarm', () => {
    const onAlarm = vi.fn()
    const d = createDispatcher({ onNav: vi.fn(), onBack: vi.fn(), onHome: vi.fn(), onAlarm })
    d.dispatch(['alarm', 'item-1'])
    expect(onAlarm).toHaveBeenCalledOnce()
  })

  it('未知 type 不 throw；onUnknown 收到 type 且逐次回调（计数由调用方经回调完成）', () => {
    const onUnknown = vi.fn()
    const d = createDispatcher({ onNav: vi.fn(), onBack: vi.fn(), onHome: vi.fn(), onUnknown })
    expect(() => { d.dispatch(['fly', 'x']); d.dispatch(['cmd', 'y']) }).not.toThrow()
    expect(onUnknown).toHaveBeenCalledTimes(2)
    expect(onUnknown).toHaveBeenCalledWith('fly')
    expect(onUnknown).toHaveBeenCalledWith('cmd')
  })
})

describe('createNavStack 历史栈', () => {
  it('nav 压栈；back 弹栈返回上一画面', () => {
    const s = createNavStack()
    s.nav('a')
    s.nav('b')
    expect(s.back()).toBe('a')
  })

  it('栈仅剩一幅时 back 弹空 → 回 home（"/"）', () => {
    const s = createNavStack()
    s.nav('a')
    expect(s.back()).toBe('/')
  })

  it('空栈 back → "/"（home）', () => {
    const s = createNavStack()
    expect(s.back()).toBe('/')
  })

  it('nav 到当前画面不压栈（返回 false，栈长不变）', () => {
    const s = createNavStack()
    expect(s.nav('a')).toBe(true)
    expect(s.nav('a')).toBe(false)
    expect(s.size()).toBe(1)
  })

  it('back 后再 nav 同一画面 → 重新压栈（往返 a→b→a→back 回 b）', () => {
    const s = createNavStack()
    s.nav('a')
    s.nav('b')
    expect(s.back()).toBe('a')
    expect(s.nav('b')).toBe(true)
    expect(s.back()).toBe('a')
  })
})
