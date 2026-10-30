import { describe, expect, it } from 'vitest'
import { sanitizeMarkdown } from './sanitizeMarkdown'

/**
 * XSS 消毒契约（控制台同款）：incremark 对 raw HTML 走 innerHTML 直插零过滤，
 * 进入渲染器前必须剥掉注入载荷。断言「载荷消失 + 正文保留」双层。
 */
describe('sanitizeMarkdown', () => {
  it('strips script tags entirely', () => {
    const out = sanitizeMarkdown('hello <script>alert(1)</script> world')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
    expect(out).toContain('hello')
    expect(out).toContain('world')
  })

  it('strips iframe including srcdoc payloads', () => {
    const out = sanitizeMarkdown('<iframe srcdoc="<script>steal()</script>"></iframe>')
    expect(out).not.toContain('<iframe')
    expect(out).not.toContain('srcdoc')
    expect(out).not.toContain('steal()')
  })

  it('strips style tags and style attributes', () => {
    const out = sanitizeMarkdown('<style>body{}</style><p style="color:red">t</p>')
    expect(out).not.toContain('<style')
    expect(out).not.toContain('style=')
    expect(out).toContain('t')
  })

  it('strips on* event attributes', () => {
    const out = sanitizeMarkdown('<img src=x onerror="alert(1)">')
    expect(out).not.toContain('onerror')
    expect(out).toContain('img')
  })

  it('keeps plain markdown intact (code-fence < escapes to &lt; per ported contract)', () => {
    const src = '# 标题\n\n- 列表项\n\n```lua\nprint(1 < 2)\n```\n'
    const out = sanitizeMarkdown(src)
    expect(out).toContain('# 标题')
    expect(out).toContain('print(1 &lt; 2)')
  })

  // 已知边界（登记见 plan §4）：DOMPurify 是文本级消毒，markdown 链接语法
  // [x](javascript:…) 里的 scheme 不在覆盖面——incremark 渲染 href 无白名单，
  // 控制台同款管线同样如此。移植契约保持一致，修复属两仓后续加固项。
})
