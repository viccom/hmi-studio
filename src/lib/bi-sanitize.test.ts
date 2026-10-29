// BI 保存态 sanitize 单测（TDD 红→绿）：运行时聚合数据不得污染画面文档。
//
// 背景：通道 B 把聚合结果写进图元 props.data.val。maotu 保存时把 props 拍平
// （bundle ud：r[a] = l.props[a].val），故这份运行态 JSON 会被原样 PUT 进
// rs-iot —— 既是文档膨胀源（rs-iot 单文档 ≤128 KiB），也让下一次加载读到陈旧数据。
// 对策：保存前把 BI 图元的 props.data 复位为 '[]'（纯函数，落在 lib）。
import { describe, it, expect } from 'vitest'
import { sanitizeBiProps } from './bi-sanitize'

/** 取 sanitize 后的 doc.json 首个元素（sanitize 返回 unknown，测试侧显式收窄）。 */
function firstEl(doc: unknown): { props: Record<string, unknown> } {
  const root = doc as { json: Array<{ props: Record<string, unknown> }> }
  return root.json[0]
}

describe('BI 保存态 sanitize', () => {
  it('BI 图元的 props.data 被复位为 []（运行态 JSON 不入库）', () => {
    const doc = {
      json: [{
        id: 'bi-1', tag: 'ah-bi-kpi', type: 'vue',
        props: { fill: '#f5a623', data: '{"v":1,"series":[{"value":123}]}' },
      }],
    }
    const out = sanitizeBiProps(doc)
    expect(firstEl(out).props.data).toBe('[]')
    expect(firstEl(out).props.fill).toBe('#f5a623')
  })

  it('非 BI 图元不动（普通 HMI 图元的 props 原样保留）', () => {
    const doc = {
      json: [{ id: 'p-1', tag: 'ah-pump-centrifugal', type: 'svg', props: { fill: '#52c41a' } }],
    }
    const out = sanitizeBiProps(doc)
    expect(firstEl(out).props).toEqual({ fill: '#52c41a' })
  })

  it('入参不被修改（纯函数：调用方的原 doc 保持不变）', () => {
    const doc = {
      json: [{ id: 'bi-1', tag: 'ah-bi-kpi', type: 'vue', props: { data: '{"v":1}' } }],
    }
    const before = JSON.stringify(doc)
    sanitizeBiProps(doc)
    expect(JSON.stringify(doc)).toBe(before)
  })

  it('无 props / 无 json / 空 json → 原样返回（畸形输入不炸）', () => {
    expect(sanitizeBiProps({})).toEqual({})
    expect(sanitizeBiProps({ json: [] })).toEqual({ json: [] })
    expect(sanitizeBiProps({ json: [{ id: 'x', tag: 'ah-bi-kpi' }] })).toEqual({ json: [{ id: 'x', tag: 'ah-bi-kpi' }] })
  })

  it('组合（group）内的 BI 图元也复位（保存态拍平后 group children 同样入库）', () => {
    const doc = {
      json: [{
        id: 'g1', tag: 'group', type: 'group', props: {},
        children: [{ id: 'bi-in-g', tag: 'ah-bi-kpi', type: 'vue', props: { data: '{"v":1}' } }],
      }],
    }
    const out = sanitizeBiProps(doc)
    const root = out as { json: Array<{ children: Array<{ props: Record<string, unknown> }> }> }
    expect(root.json[0].children[0].props.data).toBe('[]')
  })
})
