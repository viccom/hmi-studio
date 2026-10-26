/**
 * 触发器目标值归一（质量审查 P1-3）：BindPanel 触发器表单输入恒为字符串，
 * 而 maotu change_attr 对 target_value 仅在**布尔类型**时裸内联、其余一律字符串化——
 * 布尔属性被写 'false' 串后消费方（如 AhStackLight 的 props.red ?? false）恒真。
 * 按目标属性描述符 type 归一：switch → 真 boolean；number → Number（非数字串原样）；
 * 其余（color/input）保持字符串。
 */
export function normalizeTriggerValue(
  targetAttr: string,
  raw: string,
  props: Record<string, { type?: string } | undefined> | undefined,
): unknown {
  const key = targetAttr.match(/^props\.([^.]+)\./)?.[1] ?? ''
  const type = props?.[key]?.type
  if (type === 'switch') return raw === 'true'
  if (type === 'number') {
    const n = Number(raw)
    return Number.isNaN(n) ? raw : n
  }
  return raw
}
