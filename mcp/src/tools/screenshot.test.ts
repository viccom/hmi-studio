import { describe, expect, it } from 'vitest'
import {
  buildCookieSpec,
  buildLoginStateScript,
  defaultBrowsersDir,
  pickChromium,
  resolveChromiumCandidates,
} from './screenshot'

/** 截图工具只测纯函数（浏览器执行体走真链路验收——plan §3 显式声明不在此覆盖）。 */
describe('resolveChromiumCandidates', () => {
  it('sorts chromium-* dirs descending and yields chrome/headless_shell paths', () => {
    const paths = resolveChromiumCandidates('/cache', () => ['chromium-1000', 'chromium-998', 'noise', 'chromium-1248'])
    expect(paths[0]).toBe('/cache/chromium-1248/chrome-linux/chrome')
    expect(paths[1]).toBe('/cache/chromium-1248/chrome-linux/headless_shell')
    expect(paths[2]).toBe('/cache/chromium-1000/chrome-linux/chrome')
    expect(paths.some((p) => p.includes('noise'))).toBe(false)
  })

  it('returns [] on unreadable dir', () => {
    expect(resolveChromiumCandidates('/nope', () => { throw new Error('enoent') })).toEqual([])
  })
})

describe('pickChromium', () => {
  it('env override wins when it exists, null when missing', () => {
    const exists = (p: string) => p === '/explicit/chrome'
    expect(pickChromium('/explicit/chrome', ['/cache/chrome'], exists)).toBe('/explicit/chrome')
    expect(pickChromium('/missing', ['/cache/chrome'], exists)).toBeNull()
  })

  it('falls back to first existing candidate', () => {
    const exists = (p: string) => p.endsWith('headless_shell')
    expect(pickChromium(undefined, ['/a/chrome', '/a/headless_shell'], exists)).toBe('/a/headless_shell')
    expect(pickChromium(undefined, [], exists)).toBeNull()
  })
})

describe('登录态注入', () => {
  it('init script sets webhmi_token and user mirror', () => {
    const s = buildLoginStateScript('jwt-abc')
    expect(s).toContain(`localStorage.setItem('webhmi_token', "jwt-abc")`)
    expect(s).toContain('webhmi_user')
    expect(s).toContain('hmi-mcp')
  })

  it('cookie spec targets origin host with token=<jwt>', () => {
    const c = buildCookieSpec('jwt-abc', 'http://127.0.0.1:18080/hmi')
    expect(c).toEqual({ name: 'token', value: 'jwt-abc', domain: '127.0.0.1', path: '/' })
    const c2 = buildCookieSpec('x', 'https://field.ai.dongx.site/hmi')
    expect(c2.domain).toBe('field.ai.dongx.site')
  })

  it('default browsers dir honors PLAYWRIGHT_BROWSERS_PATH', () => {
    const prev = process.env.PLAYWRIGHT_BROWSERS_PATH
    process.env.PLAYWRIGHT_BROWSERS_PATH = '/custom/dir'
    expect(defaultBrowsersDir()).toBe('/custom/dir')
    if (prev === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH
    else process.env.PLAYWRIGHT_BROWSERS_PATH = prev
  })
})
