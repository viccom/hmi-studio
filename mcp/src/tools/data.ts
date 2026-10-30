/**
 * 数据读工具族（设计 §4.2）：设备 / 点表 / 历史 / 告警。
 * 全部 R 档直通 rs-iot REST；历史工具内置 ≤32 条/批上限（/history/batch 语义）。
 */
import { z } from 'zod'
import { BI_MAX_BATCH } from '../../../src/lib/bi-contract'
import { HmiBackend } from '../backend'
import { readOnlyAnnotations } from '../risk'
import type { ToolRegistrar } from '../registrar'

function textResult(payload: unknown): { content: Array<Record<string, unknown>> } {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
}

/** devices 聚合视图的紧凑投影（devid → 关键字段 + 点位数；全量 children 太肥喂 LLM）。
 *  非对象条目原样透传（宽松：后端形状漂移不炸工具）。 */
export function compactDevices(devices: unknown): unknown {
  if (typeof devices !== 'object' || devices === null) return devices
  const out: Record<string, unknown> = {}
  for (const [devid, node] of Object.entries(devices as Record<string, unknown>)) {
    if (typeof node !== 'object' || node === null) {
      out[devid] = node
      continue
    }
    const n = node as Record<string, unknown>
    out[devid] = {
      label: n.label,
      value: n.value,
      model: n.model,
      owner_inst: n.owner_inst,
      runtime: n.runtime,
      tag_count: Array.isArray(n.children) ? n.children.length : undefined,
    }
  }
  return out
}

export function registerDataTools(server: ToolRegistrar, backend: HmiBackend): void {
  server.registerTool(
    'hmi_list_devices',
    {
      description: '列出全部设备（GET /api/v1/devices 聚合视图）：devid → label/model/归属实例(owner_inst)/点位数。',
      inputSchema: {},
      annotations: readOnlyAnnotations(),
    },
    async () => {
      const devices = await backend.get('/api/v1/devices')
      return textResult(compactDevices(devices))
    },
  )

  server.registerTool(
    'hmi_list_points',
    {
      description: '列出设备点表词典（GET /api/v1/devreg）：绑定选点的权威数据源——设备的点位描述/单位/覆盖。',
      inputSchema: {
        devid: z.string().optional().describe('可选：只看某台设备（缺省 = 全量）'),
      },
      annotations: readOnlyAnnotations(),
    },
    async (args) => {
      const { devid } = args as { devid?: string }
      const devreg = await backend.get('/api/v1/devreg') as Record<string, unknown>
      if (devid && typeof devreg === 'object' && devreg !== null) {
        const one = devreg[devid]
        if (one === undefined) {
          return textResult({ error: `设备 ${devid} 不在 devreg`, known: Object.keys(devreg) })
        }
        return textResult({ [devid]: one })
      }
      return textResult(devreg)
    },
  )

  server.registerTool(
    'hmi_query_history',
    {
      description: `历史查询直通（POST /api/v1/history/batch）：queries 每条 {dev_id,tag,start,end,agg?,interval?}——start/end 秒级 Unix、窗口 [start,end)；agg+interval 必须同给或同缺（缺 = raw 取点）。单次 ≤${BI_MAX_BATCH} 条。`,
      inputSchema: {
        queries: z.array(z.object({
          dev_id: z.string().describe('设备 id'),
          tag: z.string().describe('点位 tag'),
          start: z.number().describe('窗口起点（秒级 Unix）'),
          end: z.number().describe('窗口终点（秒级 Unix，半开区间）'),
          agg: z.enum(['avg', 'max', 'min', 'sum', 'count', 'last']).optional().describe('聚合口径（与 interval 成对给出）'),
          interval: z.number().optional().describe('桶宽秒（0/缺省 = raw）'),
        })).min(1).max(BI_MAX_BATCH).describe(`查询数组（1..${BI_MAX_BATCH} 条）`),
      },
      annotations: readOnlyAnnotations(),
    },
    async (args) => {
      const { queries } = args as { queries: Array<Record<string, unknown>> }
      // 归一化：agg/interval 缺省语义对齐 wire 契约（同给或同缺，raw 不带字段）
      const wire = queries.map((q) => {
        const raw: Record<string, unknown> = { dev_id: q.dev_id, tag: q.tag, start: q.start, end: q.end }
        if (q.agg !== undefined && q.interval !== undefined) {
          raw.agg = q.agg
          raw.interval = q.interval
        }
        return raw
      })
      const res = await backend.post('/api/v1/history/batch', { queries: wire })
      return textResult(res)
    },
  )

  server.registerTool(
    'hmi_list_alarms',
    {
      description: '列出活动告警（GET /api/v1/alarms，ts 倒序）：key/level/source/message/ts/count。',
      inputSchema: {},
      annotations: readOnlyAnnotations(),
    },
    async () => {
      const alarms = await backend.get('/api/v1/alarms')
      return textResult(alarms)
    },
  )
}
