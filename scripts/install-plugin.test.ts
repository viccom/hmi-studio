import { describe, expect, it } from 'vitest'
import {
  findBareImports, findRelativeImports, lintManifest, mergeIndex, entryUrl, ID_RE, entryIsSafe, parseIndex,
} from './install-plugin.mjs'

const ok = { id: 'hello-card', name: 'Hello 卡片', version: '0.1.0', entry: 'dist.js' }

describe('lintManifest（安装闸）', () => {
  it('accepts the scaffold manifest', () => {
    expect(lintManifest(ok)).toEqual([])
  })

  it('rejects ah- prefix（上游内置命名空间）', () => {
    const errs = lintManifest({ ...ok, id: 'ah-tank' })
    expect(errs.join('\n')).toMatch(/ah-/)
  })

  it('rejects bad id lexics / missing name / bad version / missing entry', () => {
    expect(lintManifest({ ...ok, id: 'Bad_Id' }).length).toBeGreaterThan(0)
    expect(lintManifest({ ...ok, name: '' }).join()).toMatch(/name/)
    expect(lintManifest({ ...ok, version: '1.2' }).join()).toMatch(/version/)
    expect(lintManifest(ok, { entryMissing: 'dist.js' }).join()).toMatch(/entry/)
  })

  it('rejects entry traversal / absolute entry（读源目录、写 widgets/<id> 两次解析各自越界）', () => {
    expect(lintManifest({ ...ok, entry: '../../escape.js' }).join()).toMatch(/entry 非法/)
    expect(lintManifest({ ...ok, entry: '/etc/hostname' }).join()).toMatch(/entry 非法/)
    expect(lintManifest({ ...ok, entry: 'sub/dist.js' })).toEqual([]) // 子目录相对路径合法
    expect(entryIsSafe('dist.js')).toBe(true)
    expect(entryIsSafe('a/b/c.js')).toBe(true)
    expect(entryIsSafe('a/../b.js')).toBe(false)
    expect(entryIsSafe('C:/x.js')).toBe(false)
    expect(entryIsSafe('')).toBe(false)
  })

  it('rejects relative imports（安装只复制 entry 单文件，相对依赖装后必丢）', () => {
    expect(findRelativeImports("import './a.js'\nimport x from '../y.js'").sort()).toEqual(['../y.js', './a.js'])
    const errs = lintManifest(ok, { entryText: "import './helper.js'\nimport x from '../y.js'" })
    expect(errs.join('\n')).toMatch(/相对 import/)
    // 无 import 的 entry 不受影响；裸 import 仍按原规则拒
    expect(lintManifest(ok, { entryText: 'export default (h) => {}' })).toEqual([])
    expect(lintManifest(ok, { entryText: "import { h } from 'vue'" }).join()).toMatch(/裸 import/)
  })
})

describe('findBareImports（裸 import 构建期检查）', () => {
  it('flags bare specifiers across static/side-effect/re-export/dynamic forms', () => {
    const text = [
      "import { h } from 'vue'",
      "import 'echarts'",
      "export { x } from 'lodash'",
      "const m = await import('d3')",
    ].join('\n')
    expect(findBareImports(text).sort()).toEqual(['d3', 'echarts', 'lodash', 'vue'])
  })

  it('allows relative / absolute / URL specifiers', () => {
    const text = [
      "import a from './x.js'",
      "import b from '../y.js'",
      "import c from '/z.js'",
      "import d from 'https://cdn.example/e.js'",
    ].join('\n')
    expect(findBareImports(text)).toEqual([])
  })

  it('namespace import spec form is flagged too', () => {
    expect(findBareImports("import * as ns from 'vue'")).toEqual(['vue'])
  })
})

describe('mergeIndex / entryUrl', () => {
  it('upserts by id and sorts ascending', () => {
    const a = mergeIndex({ plugins: [{ id: 'b-plug', name: 'B', version: '1.0.0', entry: 'dist.js' }] }, ok)
    expect(a.plugins.map((p) => p.id)).toEqual(['b-plug', 'hello-card'])
    const b = mergeIndex(a, { ...ok, version: '0.2.0' })
    expect(b.plugins).toHaveLength(2)
    expect(b.plugins.find((p) => p.id === 'hello-card')?.version).toBe('0.2.0')
  })

  it('entryUrl carries version query（非哈希名的缓存 bust）', () => {
    expect(entryUrl(ok)).toBe('widgets/hello-card/dist.js?v=0.1.0')
  })
})

describe('parseIndex（损坏绝不当作空清单）', () => {
  it('missing = empty; corrupt / non-array = null（拒绝写入，防抹掉已装表项）', () => {
    expect(parseIndex(null)).toEqual({ plugins: [] })
    expect(parseIndex('{ "plugins": [] }')).toEqual({ plugins: [] })
    expect(parseIndex('{"plugins": [{"id":"a"}]}')).toEqual({ plugins: [{ id: 'a' }] })
    expect(parseIndex('{ "plugins": [ {"id":"old-a"}')).toBeNull() // 半写截断
    expect(parseIndex('null')).toBeNull()
    expect(parseIndex('{"plugins": "x"}')).toBeNull()
  })
})

describe('ID_RE 边界', () => {
  it('accepts 64-char and rejects empty/uppercase/ah- reserved', () => {
    expect(ID_RE.test('a'.repeat(64))).toBe(true)
    expect(ID_RE.test('')).toBe(false)
    expect(ID_RE.test('A-b')).toBe(false)
    expect(ID_RE.test('ah-x')).toBe(false)
  })
})
