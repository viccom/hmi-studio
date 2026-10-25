import { describe, it, expect } from 'vitest'
import { parseCell, toPoint, backoff, buildSubscribeUrl, parseFrame } from './sse'

// T5 纯函数契约（流层 EventSource 不进 jsdom——E2E 真实验证）。
// 帧形状来自 2026-10-25 curl 实测（见 docs/plans 实施方案 T5 与 F 表）：
//   event: snapshot   data = {dev, points:{"dev.tag":[ts,localTime,"valueStr"]}}
//   event: datachange data = {changes:{"dev.tag":cell}, removed:[], ts}
// 值一律是字符串化 JSON（"0"/"true"/"55279616"）——客户端职责：尝试 JSON 解析，失败保留原串。

describe('parseCell：字符串值归一化', () => {
  it('数字串→number，JSON 串→对应类型，非 JSON 串保持原样', () => {
    expect(parseCell('12.5')).toBe(12.5)
    expect(parseCell('"RUN"')).toBe('RUN')
    expect(parseCell('true')).toBe(true)
    expect(parseCell('{"a":1}')).toEqual({ a: 1 })
    expect(parseCell('abc')).toBe('abc')
  })
})

describe('toPoint：cell 行 [ts,localTime,value] → {field,value}', () => {
  it('值经 parseCell 归一化（"0"→0），ts/localTime 不进点位', () => {
    expect(toPoint('rsiot.cpu_percent', [1792941675, '2026-10-25 23:21:15', '0']))
      .toEqual({ field: 'rsiot.cpu_percent', value: 0 })
  })
  it('非字符串值原样透传（防御未来版本/内部调用）', () => {
    expect(toPoint('d.x', [1, 't', 42])).toEqual({ field: 'd.x', value: 42 })
  })
  it('畸形 cell（非数组/长度不足）返回 undefined 由调用方丢弃', () => {
    expect(toPoint('d.x', 'oops' as unknown as unknown[])).toBeUndefined()
    expect(toPoint('d.x', [1, 't'])).toBeUndefined()
  })
})

describe('backoff：指数退避 1s 起步、封顶 30s、reset 复位', () => {
  it('1s,2s,4s…封顶 30s；成功后复位回 1s', () => {
    const b = backoff()
    expect(b.next()).toBe(1000)
    expect(b.next()).toBe(2000)
    expect(b.next()).toBe(4000)
    for (let i = 0; i < 10; i++) b.next()
    expect(b.next()).toBe(30000)
    b.reset()
    expect(b.next()).toBe(1000)
  })
})

describe('buildSubscribeUrl：devs → 同源订阅 URL（排序去重，token 走 Cookie 不进 URL）', () => {
  it('devs 去重排序拼接 dev_id，interval 缺省 1000', () => {
    expect(buildSubscribeUrl({ devs: ['rsiot'] }))
      .toBe('/api/v1/rtdatas/subscribe?dev_id=rsiot&interval=1000')
    expect(buildSubscribeUrl({ devs: ['devB', 'devA', 'devB'] }))
      .toBe('/api/v1/rtdatas/subscribe?dev_id=devA,devB&interval=1000')
  })
  it('base 前缀可选（网关/直连形态），interval 可覆盖', () => {
    expect(buildSubscribeUrl({ devs: ['a'], base: 'http://x:1', interval: 5000 }))
      .toBe('http://x:1/api/v1/rtdatas/subscribe?dev_id=a&interval=5000')
  })
})

describe('parseFrame：snapshot/datachange 帧 → 点位数组（实测形状）', () => {
  it('snapshot：points 逐项 → {field,value}', () => {
    const raw = '{"dev":"rsiot","points":{"rsiot.uptime_s":[1792969356,"2026-10-26 07:02:36","51597"],"rsiot.cpu_percent":[1792969356,"2026-10-26 07:02:36","0"]}}'
    expect(parseFrame('snapshot', raw)).toEqual([
      { field: 'rsiot.uptime_s', value: 51597 },
      { field: 'rsiot.cpu_percent', value: 0 },
    ])
  })
  it('datachange：changes 逐项 → {field,value}（removed/ts 忽略）', () => {
    const raw = '{"changes":{"rsiot.pipeline_processed_count":[1792969361,"2026-10-26 07:02:41","10318"],"rsiot.uptime_s":[1792969361,"2026-10-26 07:02:41","51602"]},"removed":[],"ts":"2026-10-25T23:02:42.095376688+00:00"}'
    expect(parseFrame('datachange', raw)).toEqual([
      { field: 'rsiot.pipeline_processed_count', value: 10318 },
      { field: 'rsiot.uptime_s', value: 51602 },
    ])
  })
  it('坏帧不抛：非 JSON / 形状不符 → []；畸形 cell 逐项丢弃', () => {
    expect(parseFrame('snapshot', 'not-json')).toEqual([])
    expect(parseFrame('snapshot', '{"dev":"d"}')).toEqual([])
    expect(parseFrame('datachange', '{"changes":{"ok":[1,"t","1"],"bad":"x"}}')).toEqual([{ field: 'ok', value: 1 }])
    expect(parseFrame('whatever', '{}')).toEqual([])
  })
})
