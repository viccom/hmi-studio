import { describe, it, expect, beforeEach, vi } from 'vitest'
import { THEME_KEY, readTheme, applyTheme } from './theme'

// T16 主题契约：dark 默认（工业深色）；localStorage hmi_theme 持久化；
// 应用面 = html.dark class（element-plus dark css-vars 与 maotu .dark 祖先选择器共消费）。

describe('readTheme：localStorage 原始串 → Theme（dark 默认）', () => {
  it('合法值透传；null/非法值回落 dark（默认工业深色）', () => {
    expect(readTheme('dark')).toBe('dark')
    expect(readTheme('light')).toBe('light')
    expect(readTheme(null)).toBe('dark')
    expect(readTheme('blue')).toBe('dark')
    expect(readTheme('')).toBe('dark')
  })
})

describe('applyTheme：html class 切换', () => {
  it('dark 挂 html.dark；light 摘除', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})

describe('useTheme：单例状态 + 持久化 + toggle', () => {
  // 单例模块：每测重置模块注册表，动态 import 取全新实例（纯函数段的静态导入不受影响）
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('无存储时初始 dark 并应用到 html', async () => {
    const { useTheme } = await import('./theme')
    const t = useTheme()
    expect(t.theme.value).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('已存 light 时初始 light（刷新保真）', async () => {
    localStorage.setItem(THEME_KEY, 'light')
    const { useTheme } = await import('./theme')
    const t = useTheme()
    expect(t.theme.value).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('toggle 翻转主题 + 写回 localStorage', async () => {
    const { useTheme } = await import('./theme')
    const t = useTheme()
    t.toggle()
    expect(t.theme.value).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    t.toggle()
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('多次调用共享同一单例状态', async () => {
    const { useTheme } = await import('./theme')
    const a = useTheme()
    const b = useTheme()
    a.toggle()
    expect(b.theme.value).toBe('light')
  })
})
