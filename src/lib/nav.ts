/**
 * T9 事件分发器 + 历史栈（设计 §5 互跳）：maotu 无原生画面跳转，官方通道为
 * custom_code `$mtEventCallBack(type, $item_info.id, ...args)` → MtPreview emit
 * `onEventCallBack(type, id, ...rest)`（多余参数透传，0.6.5 bundle 实证）→ 本模块小词表分发。
 *
 * 监听拼写注意（Vue 3.5 实测）：emit('onEventCallBack') 按属性名 `onOnEventCallBack` 精确
 * 查找处理器；模板必须写 `@onEventCallBack`（编译为该键）。kebab 写法 `@on-event-callback`
 * 编译为 `onOnEventCallback`（Back 的 b 小写）——大小写不匹配，静默收不到事件
 * （src/dev/Probe.vue 旧监听即属此失效写法）。
 *
 * 词表约定：nav/back/home/alarm/dev（W11：dev = 设备参数化画面切设备，arg2 = devid）。
 * cmd 不进词表——真命令走 `$rsiot.send` 直连
 * （确认框/inst 解析/Tracker 语义不可从词表触发），dispatch(['cmd',...]) 落 onUnknown 计数。
 */
export interface DispatcherHandlers {
  /** 容器内跳转目标画面 slug（target 第一参）+ 触发图元 id */
  onNav: (target: string, itemId: string) => void
  onBack: () => void
  onHome: () => void
  /** 词表 alarm：打开告警抽屉 */
  onAlarm?: () => void
  /** 词表 dev（W11）：设备参数化画面切激活设备（devid 第三参） */
  onDev?: (devid: string, itemId: string) => void
  /** 非词表 type（含 cmd）；缺省静默忽略 */
  onUnknown?: (type: string) => void
}

export interface Dispatcher {
  /** 载荷 = [type, 触发图元 id, ...其余参数]（$mtEventCallBack 透传序） */
  dispatch(args: unknown[]): void
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v))

/**
 * 跳转目标解析（工业画面 L2→L3 带设备上下文）：`slug?dev=<devid>` → `{ slug, dev }`。
 * 兼容：纯 slug（dev 空）、多余查询串忽略、非法 dev（含 `&`/空格/`@`）视为无 dev。
 * navStack 保存完整 target（含查询串），back 回到上一画面时设备上下文随 target 复原。
 */
export function parseNavTarget(target: string): { slug: string; dev: string } {
  const raw = str(target).trim()
  if (!raw) return { slug: '', dev: '' }
  const q = raw.indexOf('?')
  if (q < 0) return { slug: raw, dev: '' }
  const slug = raw.slice(0, q)
  const query = raw.slice(q + 1)
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    if (pair.slice(0, eq) !== 'dev') continue
    try {
      const dev = decodeURIComponent(pair.slice(eq + 1))
      return { slug, dev: /^[A-Za-z0-9_.:-]+$/.test(dev) ? dev : '' }
    } catch {
      return { slug, dev: '' }
    }
  }
  return { slug, dev: '' }
}

export function createDispatcher(h: DispatcherHandlers): Dispatcher {
  return {
    dispatch(args) {
      const type = str(args[0])
      if (type === 'nav') h.onNav(str(args[2]), str(args[1]))
      else if (type === 'back') h.onBack()
      else if (type === 'home') h.onHome()
      else if (type === 'alarm') h.onAlarm?.()
      else if (type === 'dev') h.onDev?.(str(args[2]), str(args[1]))
      else h.onUnknown?.(type)
    },
  }
}

/** 历史栈（容器内跳转语义）：栈顶 = 当前画面；back 弹空返回 '/'（home = 画面列表） */
export interface NavStack {
  /** 记录跳转到达；目标即当前画面 → 不压栈返回 false */
  nav(slug: string): boolean
  /** 返回上一画面：弹当前 → 新栈顶；弹空 → '/' */
  back(): string
  current(): string | undefined
  size(): number
}

export function createNavStack(): NavStack {
  const stack: string[] = []
  return {
    nav(slug) {
      if (stack[stack.length - 1] === slug) return false
      stack.push(slug)
      return true
    },
    back() {
      stack.pop()
      return stack[stack.length - 1] ?? '/'
    },
    current() { return stack[stack.length - 1] },
    size() { return stack.length },
  }
}
