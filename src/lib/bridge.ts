/**
 * T7 $rsiot 桥：图元 custom_code 的受控 API 面（设计 D2/D6——custom_code 只写一行调用，
 * 复杂度收在桥里）。window.$rsiot = { send / nav / back / home }。
 * - send：ElMessageBox 二次确认（编辑态按钮「取消/真实下发」防误触，运行态普通「确定」）
 *   → owner_inst 解析 → POST /api/v1/command/send → CommandTracker 跟踪（5s 超时）
 *   → ElMessage 结果 → 命令历史环形 20 条（状态栏消费）。
 * - nav/back/home：经 navHandler（ViewView 注入的事件分发器——与 $mtEventCallBack('nav')
 *   同源同栈）；编辑态缺省直连 vue-router。
 */
import { ref, type Ref } from 'vue'
import type { Router } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, ApiError } from './api'
import { buildCommandReq, CommandError, CommandTracker, resolveInstance, type TrackerState } from './command'
import { fetchDeviceRegistry } from './device-registry'

export interface CmdHistoryEntry {
  id: string
  devid: string
  tag: string
  value: unknown
  state: TrackerState
  ts: number
  message: string
}

export interface RsiotBridgeApi {
  send: (devid: string, tag: string, value: unknown) => Promise<void>
  nav: (target: string) => void
  back: () => void
  home: () => void
}

export interface BridgeOptions {
  /** view=运行态（普通确认）；edit=编辑态（D6 显式「真实下发」） */
  mode: 'view' | 'edit'
  router: Router
  /** T9 容器内导航回调（ViewView 注入，与 $mtEventCallBack('nav') 同源同栈——设计 §5 等价别名）；
   *  缺省（编辑态）直连 router */
  navHandler?: Pick<RsiotBridgeApi, 'nav' | 'back' | 'home'>
}

export interface BridgeHandle {
  history: Ref<CmdHistoryEntry[]>
  uninstall: () => void
}

const HISTORY_CAP = 20
const SEND_TIMEOUT_MS = 5000

/** 安装 window.$rsiot（幂等覆盖）；返回句柄供状态栏/卸载 */
export function installBridge(opts: BridgeOptions): BridgeHandle {
  const history = ref<CmdHistoryEntry[]>([])
  let registry: ReadonlyMap<string, string> | null = null
  let seq = 0

  const pushHistory = (e: CmdHistoryEntry): void => {
    history.value = [e, ...history.value].slice(0, HISTORY_CAP)
  }
  const settleHistory = (id: string, state: TrackerState, message: string): void => {
    history.value = history.value.map((e) => (e.id === id ? { ...e, state, message } : e))
  }
  /** 终态竞态兜底：超时先到后再 confirm/error 抛 CommandError——吞掉，以实际终态提示 */
  const safeTransition = (fn: () => void): void => {
    try { fn() } catch (e) { if (!(e instanceof CommandError)) throw e }
  }

  const apiFace: RsiotBridgeApi = {
    async send(devid, tag, value) {
      const confirmText = opts.mode === 'edit' ? '真实下发' : '确定'
      try {
        await ElMessageBox.confirm(`下发命令：${devid}.${tag} = ${JSON.stringify(value)}`, '命令确认', {
          confirmButtonText: confirmText,
          cancelButtonText: '取消',
          type: 'warning',
        })
      } catch { return } // 用户取消——静默
      let inst: string
      try {
        registry ??= await fetchDeviceRegistry()
        try {
          inst = resolveInstance(registry, devid)
        } catch (e) {
          if (!(e instanceof CommandError)) throw e
          // 注册表是安装时的快照——运行期接入的新设备未命中时强制刷新一次再试
          // （长时运行的操作页不因缓存拒发）；仍未命中则按原语义落错误提示
          registry = await fetchDeviceRegistry()
          inst = resolveInstance(registry, devid)
        }
      } catch (e) {
        ElMessage.error(e instanceof Error ? e.message : '命令失败')
        return
      }

      const id = `cmd-${++seq}`
      const tracker = new CommandTracker(id)
      pushHistory({ id, devid, tag, value, state: tracker.state, ts: Date.now(), message: '' })
      try {
        await Promise.race([
          api().post('/api/v1/command/send', buildCommandReq({ inst, devid, tag, value })).then(() => 'ok' as const),
          new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), SEND_TIMEOUT_MS)),
        ]).then((outcome) => {
          safeTransition(() => (outcome === 'timeout' ? tracker.timeout() : tracker.confirm()))
        }).catch((e: unknown) => {
          const msg = e instanceof ApiError ? `HTTP ${e.status}` : '发送失败'
          safeTransition(() => tracker.error(msg))
        })
      } catch { /* 不可能的路径（race 内已消化）——保底 */ }
      settleHistory(id, tracker.state, tracker.message)
      if (tracker.state === 'confirmed') ElMessage.success(`命令已下发：${devid}.${tag}`)
      else if (tracker.state === 'timeout') ElMessage.warning(`命令超时（${SEND_TIMEOUT_MS / 1000}s 未确认）：${devid}.${tag}`)
      else ElMessage.error(`命令失败：${devid}.${tag}（${tracker.message}）`)
    },
    nav(target) {
      if (opts.navHandler) opts.navHandler.nav(target)
      else void opts.router.push(`/view/${target}`)
    },
    back() {
      if (opts.navHandler) opts.navHandler.back()
      else opts.router.back()
    },
    home() {
      if (opts.navHandler) opts.navHandler.home()
      else void opts.router.push('/')
    },
  }

  ;(window as Window & { $rsiot?: RsiotBridgeApi }).$rsiot = apiFace
  return { history, uninstall: () => { delete (window as Window & { $rsiot?: RsiotBridgeApi }).$rsiot } }
}
