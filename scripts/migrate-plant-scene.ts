/**
 * 厂区 DEMO 场景迁移器：`iot-plant-3d`（v1 语义模型）→ **v2 编辑器产物形态**。
 *
 * 背景（2026-11-27）：`iot-plant-3d` 是 3D 组态编辑器落地之前的 DEMO，文档形态是
 * v1（`nodes`/`links`），新编辑器与新运行页都消费不到它。本脚本用
 * `src/modules3d/adapter/plant-scene.ts` 的生成器重做一份 v2 文档并落库：
 *   1. 先把**现有文档原样备份**到 `<target>-v1`（v1 运行页仍可访问，可回看）
 *   2. 再把生成的 v2 文档 PUT 到 `<target>`
 *   3. 回读校验（对象数 / 绑定数 / 事件数 / 版本号）
 *
 * 用法（本仓根目录）：
 *   RSIOT_BASE=http://127.0.0.1:20000 \
 *     pnpm exec vite build --ssr scripts/migrate-plant-scene.ts --outDir .tmp-migrate \
 *   && node .tmp-migrate/migrate-plant-scene.js [--target iot-plant-3d] [--dry-run] [--force]
 *
 * 参数：
 *   --target <id>   目标场景 id（默认 iot-plant-3d）
 *   --dry-run       只打印将要写入的文档摘要，不落库
 *   --force         允许覆盖已存在的备份（默认不覆盖）
 *
 * 环境变量：RSIOT_BASE（默认 http://127.0.0.1:20000，即本工作路径的 rs-iot 实例）、
 *           RSIOT_USER / RSIOT_PASS（默认 admin/admin）。
 */
import { buildPlantScene } from '../src/modules3d/adapter/plant-scene'

const BASE = process.env.RSIOT_BASE ?? 'http://127.0.0.1:20000'
const USER = process.env.RSIOT_USER ?? 'admin'
const PASS = process.env.RSIOT_PASS ?? 'admin'

const argv = process.argv.slice(2)
const argOf = (name: string): string | undefined => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const TARGET = argOf('--target') ?? 'iot-plant-3d'
const BACKUP = `${TARGET}-v1`
const DRY = argv.includes('--dry-run')
const FORCE = argv.includes('--force')

async function api(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status} ${body.slice(0, 200)}`)
  }
  return res
}

async function login(): Promise<string> {
  const res = await api('/api/v1/user/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: USER, pass: PASS }),
  })
  const body = (await res.json()) as { token?: string; data?: { token?: string } }
  const token = body.token ?? body.data?.token
  if (!token) throw new Error('登录未返回 token')
  return token
}

async function main(): Promise<void> {
  const token = await login()
  const auth = { Authorization: `Bearer ${token}` }

  const next = buildPlantScene()
  const objects = (next.objects ?? []) as unknown[]
  const bindings = (next.bindings ?? []) as unknown[]
  const events = (next.events ?? []) as unknown[]
  const bytes = Buffer.byteLength(JSON.stringify(next), 'utf8')
  console.log(`目标场景   : ${TARGET}`)
  console.log(`生成文档   : objects=${objects.length} bindings=${bindings.length} events=${events.length} 体积=${(bytes / 1024).toFixed(1)} KiB`)

  if (DRY) {
    console.log('--dry-run：未落库')
    return
  }

  // 备份现有文档（v1 原样留存，便于回看与回滚）
  const cur = await fetch(`${BASE}/api/v1/scenes/${TARGET}`, { headers: auth })
  if (cur.ok) {
    const curBody = (await cur.json()) as { doc?: unknown; version?: number }
    const isV1 = !(curBody.doc as { objects?: unknown[] })?.objects
    const backupRes = await fetch(`${BASE}/api/v1/scenes/${BACKUP}`, { headers: auth })
    if (backupRes.ok && !FORCE) {
      console.log(`备份已存在（${BACKUP}），跳过（--force 可覆盖）`)
    } else {
      const put = await api(`/api/v1/scenes/${BACKUP}`, {
        method: 'PUT',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify(curBody.doc),
      })
      const putBody = (await put.json()) as { version?: number }
      console.log(`备份 v1 文档 → ${BACKUP}（version=${putBody.version ?? '?'}，原形态${isV1 ? ' v1' : ' v2'}）`)
    }
  } else {
    console.log(`目标 ${TARGET} 不存在（${cur.status}），跳过备份`)
  }

  // 写入 v2 文档
  const put = await api(`/api/v1/scenes/${TARGET}`, {
    method: 'PUT',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify(next),
  })
  const putBody = (await put.json()) as { version?: number }
  console.log(`写入 v2 文档 → ${TARGET}（version=${putBody.version ?? '?'}）`)

  // 回读校验
  const back = await api(`/api/v1/scenes/${TARGET}`, { headers: auth })
  const body = (await back.json()) as { doc?: { objects?: unknown[]; bindings?: unknown[]; events?: unknown[] }; version?: number }
  const got = body.doc ?? {}
  console.log(
    `回读校验   : objects=${(got.objects ?? []).length} bindings=${(got.bindings ?? []).length} events=${(got.events ?? []).length} version=${body.version ?? '?'}`,
  )
  if ((got.objects ?? []).length !== objects.length) {
    throw new Error('回读对象数与写入不一致，迁移未达成预期')
  }
  console.log('✅ 迁移完成')
}

main().catch((e) => {
  console.error('✗ 迁移失败：', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
