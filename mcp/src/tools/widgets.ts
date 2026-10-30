/**
 * 图元词典工具（设计 §4.2 `hmi_describe_widget_kit`）：registry + groups 投影——
 * 每图元一行能力（id/title/type/尺寸/props 契约/所属分组），喂给 LLM 的组态词典。
 * 单源引用 registry.ts/groups.ts（D1）：AI 看到的图元目录 = 编辑器真实目录，永不漂移。
 */
import { allSymbols } from '../../../src/symbols/registry'
import { SYMBOL_GROUP_DEFS } from '../../../src/symbols/groups'
import { readOnlyAnnotations } from '../risk'
import type { ToolRegistrar } from '../registrar'

export interface WidgetRow {
  id: string
  title: string
  /** 渲染类型：svg / vue / custom-svg / img / model / reg-combin */
  type: string
  width: number | null
  height: number | null
  /** props 契约：name → {title, type}（数据绑定走 props.<name>.val） */
  props: Record<string, { title: string; type: string }>
  /** 所属分组（groups.ts SYMBOL_GROUP_DEFS 投影；未分组为 null） */
  group: string | null
}

export interface WidgetKitDescription {
  count: number
  groups: Array<{ title: string; ids: string[] }>
  widgets: WidgetRow[]
  /** maotu 内置标签（不在 registry——本仓画面实证在用，AI 组态的事实依赖） */
  builtin_tags: Array<{ tag: string; note: string }>
  /** 数据绑定约定摘要（types.ts ⑤ 保存态归一化契约） */
  bind_convention: string[]
}

export function describeWidgets(): WidgetKitDescription {
  const groupOf = new Map<string, string>()
  for (const g of SYMBOL_GROUP_DEFS) {
    for (const id of g.ids) groupOf.set(id, g.title)
  }
  const widgets: WidgetRow[] = allSymbols().map((s) => {
    const props: Record<string, { title: string; type: string }> = {}
    const defs = (s.props ?? {}) as Record<string, { title?: unknown; type?: unknown }>
    for (const [name, def] of Object.entries(defs)) {
      props[name] = { title: String(def?.title ?? name), type: String(def?.type ?? 'unknown') }
    }
    return {
      id: s.id,
      title: s.title,
      type: s.type,
      width: s.width ?? null,
      height: s.height ?? null,
      props,
      group: groupOf.get(s.id) ?? null,
    }
  })
  return {
    count: widgets.length,
    groups: SYMBOL_GROUP_DEFS.map((g) => ({ title: g.title, ids: [...g.ids] })),
    widgets,
    builtin_tags: [
      { tag: 'text-vue', note: 'maotu 内置文本图元（type=vue）：props text/fill/fontFamily/fontSize/vertical；数值显示一律用它 + binds（bind_attr=props.text.val）' },
    ],
    bind_convention: [
      'bind_id = <devid>.<tag>（唯一 field 格式，SSE 订阅键同形）',
      'bind_attr = props.<name>.val（保存态平面值经 maotu 归一化为描述符形，绑定必须指到 .val）',
      'BI 图元（ah-bi-*）走通道 B：宿主聚合收集器写 props.data.val（信封契约），图元自身不发请求；series 规格写在 props.series',
    ],
  }
}

export function registerWidgetTools(server: ToolRegistrar): void {
  server.registerTool(
    'hmi_describe_widget_kit',
    {
      description: '图元词典：全部可用图元（id/title/尺寸/props 契约/分组）+ maotu 内置标签 + 绑定约定。组态/改画面任务开工前先调它。',
      inputSchema: {},
      annotations: readOnlyAnnotations(),
    },
    async () => {
      return { content: [{ type: 'text', text: JSON.stringify(describeWidgets(), null, 2) }] }
    },
  )
}
