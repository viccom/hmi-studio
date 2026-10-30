import { describe, expect, it } from 'vitest'
import {
  CUSTOM_CODE_IDENTS,
  MAX_DOC_BYTES,
  registryTagIds,
  validateScreenDoc,
} from './screens'

const OK_ID = 'water-demo-m3'

function docText(json: unknown): string {
  return JSON.stringify(json)
}

function baseDoc(items: unknown[] = []): unknown {
  return {
    name: '校验样例',
    canvasCfg: { width: 800, height: 600 },
    json: items,
    eventList: [], eventFlow: [],
  }
}

describe('validateScreenDoc 硬约束镜像（routes_meta.rs）', () => {
  it('valid minimal doc passes with zero issues', () => {
    const r = validateScreenDoc(OK_ID, docText(baseDoc()))
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('rejects invalid id lexically (uppercase / leading dash / too long)', () => {
    for (const id of ['Bad-id', '-abc', '', `${'a'.repeat(65)}`, 'has space', '下划线_x']) {
      const r = validateScreenDoc(id, docText(baseDoc()))
      expect(r.errors.some((e) => e.code === 'invalid_id'), id).toBe(true)
      expect(r.ok).toBe(false)
    }
  })

  it('accepts 64-char id boundary and 128KiB boundary', () => {
    expect(validateScreenDoc('a'.repeat(64), docText(baseDoc())).ok).toBe(true)
    const filler = '{"pad":"'
    const pad = MAX_DOC_BYTES - Buffer.byteLength(docText(baseDoc())) - Buffer.byteLength(filler) - 4
    const big = docText({ ...baseDoc(), pad2: 'x'.repeat(Math.max(0, pad)) })
    const r = validateScreenDoc(OK_ID, big)
    expect(r.errors.some((e) => e.code === 'too_large')).toBe(false)
  })

  it('flags doc over 128KiB as error', () => {
    const big = docText({ ...baseDoc(), pad: 'x'.repeat(MAX_DOC_BYTES) })
    const r = validateScreenDoc(OK_ID, big)
    expect(r.errors.some((e) => e.code === 'too_large')).toBe(true)
    expect(r.ok).toBe(false)
  })

  it('flags broken json as error and stops structural walk', () => {
    const r = validateScreenDoc(OK_ID, '{"json": [')
    expect(r.errors.some((e) => e.code === 'invalid_json')).toBe(true)
    expect(r.warnings).toEqual([])
  })
})

describe('validateScreenDoc 语义 warnings', () => {
  it('unknown tag warns (not in registry nor builtins)', () => {
    const r = validateScreenDoc(OK_ID, docText(baseDoc([
      { id: 'p1', tag: 'not-a-real-tag' },
    ])))
    expect(r.errors).toEqual([])
    expect(r.warnings.some((w) => w.code === 'unknown_tag' && w.message.includes('not-a-real-tag'))).toBe(true)
  })

  it('registry tag (ah-tank) and builtin (text-vue) do not warn', () => {
    expect(registryTagIds().has('ah-tank')).toBe(true)
    const r = validateScreenDoc(OK_ID, docText(baseDoc([
      { id: 'p1', tag: 'ah-tank' },
      { id: 'p2', tag: 'text-vue', props: { text: { val: 'x' } } },
    ])))
    expect(r.warnings).toEqual([])
  })

  it('bad bind_attr and bind_id warn', () => {
    const r = validateScreenDoc(OK_ID, docText(baseDoc([
      {
        id: 'p1', tag: 'text-vue',
        binds: [
          { pel_id: 'p1', bind_id: 'devA.uptime_s', bind_attr: 'props.text' },
          { pel_id: 'p1', bind_id: 'devA-uptime_s', bind_attr: 'props.text.val' },
        ],
      },
    ])))
    expect(r.warnings.some((w) => w.code === 'bad_bind_attr')).toBe(true)
    expect(r.warnings.some((w) => w.code === 'bad_bind_id')).toBe(true)
  })

  it('well-formed bind produces no warnings', () => {
    const r = validateScreenDoc(OK_ID, docText(baseDoc([
      { id: 'p1', tag: 'text-vue', binds: [{ bind_id: 'rsiot.uptime_s', bind_attr: 'props.text.val' }] },
    ])))
    expect(r.warnings).toEqual([])
  })

  it('custom_code ident outside whitelist warns; whitelisted passes', () => {
    const bad = validateScreenDoc(OK_ID, docText(baseDoc([
      { id: 'p1', tag: 'text-vue', events: [{ custom_code: "$evil.send('x');" }] },
    ])))
    expect(bad.warnings.some((w) => w.code === 'custom_code_ident' && w.message.includes('$evil'))).toBe(true)

    const good = validateScreenDoc(OK_ID, docText(baseDoc([
      {
        id: 'p1', tag: 'text-vue',
        events: [{ custom_code: "$rsiot.send('rsiot','x',1); $mtEventCallBack('nav', $item_info.id, 'b');" }],
      },
    ])))
    expect(good.warnings).toEqual([])
    expect([...CUSTOM_CODE_IDENTS]).toContain('$rsiot')
  })

  it('missing json array and missing tag/id warn', () => {
    const r1 = validateScreenDoc(OK_ID, docText({ name: 'x' }))
    expect(r1.warnings.some((w) => w.code === 'no_json_array')).toBe(true)
    const r2 = validateScreenDoc(OK_ID, docText(baseDoc([{ id: 'x' }, { tag: 'text-vue' }])))
    expect(r2.warnings.some((w) => w.code === 'item_no_tag')).toBe(true)
    expect(r2.warnings.some((w) => w.code === 'item_no_id')).toBe(true)
  })
})

describe('validateScreenDoc BI 契约', () => {
  it('panel with empty series warns bi_no_series', () => {
    const r = validateScreenDoc(OK_ID, docText(baseDoc([
      { id: 'k1', tag: 'ah-bi-kpi', props: { series: { val: '[]' } } },
    ])))
    expect(r.warnings.some((w) => w.code === 'bi_no_series')).toBe(true)
  })

  it('panel with valid series (保存态平面值 JSON 串) has no bi warnings', () => {
    const series = JSON.stringify([{ dev_id: 'devA', tag: 'power', label: '功率', unit: 'kW', mode: 'instant', color: '#fff' }])
    const r = validateScreenDoc(OK_ID, docText(baseDoc([
      { id: 'k1', tag: 'ah-bi-kpi', props: { series } },
    ])))
    expect(r.warnings.filter((w) => w.code.startsWith('bi_'))).toEqual([])
  })
})
