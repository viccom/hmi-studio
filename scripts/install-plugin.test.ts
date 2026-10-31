import { describe, expect, it } from 'vitest'
import { findBareImports, lintManifest, mergeIndex, entryUrl, ID_RE } from './install-plugin.mjs'

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

describe('ID_RE 边界', () => {
  it('accepts 64-char and rejects empty/uppercase/ah- reserved', () => {
    expect(ID_RE.test('a'.repeat(64))).toBe(true)
    expect(ID_RE.test('')).toBe(false)
    expect(ID_RE.test('A-b')).toBe(false)
    expect(ID_RE.test('ah-x')).toBe(false)
  })
})
