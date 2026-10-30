import { afterEach, describe, expect, it } from 'vitest'
import {
  buildAgentContextBlock,
  parseHmiLocation,
  setAgentPageSelection,
} from './agent-context'

/** 上下文注入契约（设计 §5.1）：提交时附「[页面上下文] 当前路由/画面 slug/view|edit 模式」。 */
describe('parseHmiLocation', () => {
  const orig = window.location

  afterEach(() => {
    jsdomReset(orig)
  })

  it('parses view route and slug', () => {
    jsdomPush('/view/water-demo-m3')
    expect(parseHmiLocation()).toEqual({ mode: 'view', slug: 'water-demo-m3', path: '/view/water-demo-m3' })
  })

  it('parses edit route and slug', () => {
    jsdomPush('/edit/bi-station')
    expect(parseHmiLocation()?.mode).toBe('edit')
    expect(parseHmiLocation()?.slug).toBe('bi-station')
  })

  it('parses gateway /hmi base prefix', () => {
    jsdomPush('/hmi/view/home-meter-power')
    expect(parseHmiLocation()?.mode).toBe('view')
    expect(parseHmiLocation()?.slug).toBe('home-meter-power')
  })

  it('returns null off screen pages', () => {
    jsdomPush('/')
    expect(parseHmiLocation()).toBeNull()
    jsdomPush('/login')
    expect(parseHmiLocation()).toBeNull()
    jsdomPush('/dev/probe')
    expect(parseHmiLocation()).toBeNull()
  })
})

describe('setAgentPageSelection', () => {
  afterEach(() => {
    jsdomReset(window.location)
    setAgentPageSelection(undefined)
  })

  it('appends selected widget line into context block', () => {
    setAgentPageSelection({ selectedWidgetId: 'text-vue-1' })
    const block = buildAgentContextBlock({ mode: 'edit', slug: 's1', path: '/edit/s1' })
    expect(block).toContain('选中图元: text-vue-1')
  })

  it('omits selection line when unset', () => {
    const block = buildAgentContextBlock({ mode: 'view', slug: 's1', path: '/view/s1' })
    expect(block).not.toContain('选中图元')
  })
})

describe('buildAgentContextBlock', () => {
  it('renders mode/slug/path lines', () => {
    const block = buildAgentContextBlock({ mode: 'view', slug: 'water-demo-m3', path: '/view/water-demo-m3' })
    const lines = block.split('\n')
    expect(lines).toContain('模式: view')
    expect(lines).toContain('画面: water-demo-m3')
    expect(lines).toContain('页面路径: /view/water-demo-m3')
  })

  it('renders empty string without any context', () => {
    expect(buildAgentContextBlock(null)).toBe('')
  })
})

// ---- jsdom location 控制（vitest jsdom 环境无真实导航） ----
function jsdomPush(path: string): void {
  window.history.pushState({}, '', path)
}
function jsdomReset(orig: Location): void {
  if (window.location !== orig) {
    window.history.pushState({}, '', orig.pathname + orig.search)
  }
}
