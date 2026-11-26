import { describe, it, expect } from 'vitest'
import { docToUpstream, upstreamToDoc, ConflictError, ScenesDbManager } from './store-adapter'
import { blankScene3D } from '../store'

/**
 * 适配器是"上游 DBManager 形状"与"SceneDoc v2"之间的翻译层。
 *
 * 关键防线（都是实测踩过的坑）：
 *   1. 上游 saveScene 载荷是**顶层字段**（lightingConfig 在 payload.lightingConfig），
 *      不是 metadata 包裹——按 metadata 解析会静默丢灯光（"场景重开黑场"）。
 *   2. 上游 restoreScene 读 `metadata.lightingConfig` / `metadata.initialView` /
 *      `metadata.nodeGraph`，故 doc.scene 必须摊平进 metadata。
 *   3. 409 必须转成 ConflictError（带 currentVersion），否则 UI 无法提示"已被其他窗口修改"。
 */
describe('store-adapter 字段映射', () => {
  const upstreamPayload = {
    id: 'iot-plant-3d',
    name: '全厂 3D 总览',
    objects: [{ bid: 'b1', type: 'BoxGeometry', position: { x: 1, y: 2, z: 3 } }],
    cameraFar: 1000000,
    environmentUrl: null,
    lightingConfig: { enabled: true, ambient: 0.85 },
    gisConfig: null,
    nodeGraph: [{ bid: 'b1', parentBid: null }],
    deletedSourceNodes: [],
    lastModified: 123,
    objectCount: 1,
  }

  it('upstreamToDoc：顶层字段进 scene，meta.name 取 payload.name', () => {
    const doc = upstreamToDoc(upstreamPayload) as unknown as {
      meta: { name: string }; scene: Record<string, unknown>; objects: unknown[]
    }
    expect(doc.meta.name).toBe('全厂 3D 总览')
    expect(doc.scene.lightingConfig).toEqual({ enabled: true, ambient: 0.85 })
    expect(doc.scene.nodeGraph).toHaveLength(1)
    expect(doc.objects).toHaveLength(1)
    // 上游的过程字段不得进 SceneDoc
    expect(doc.scene).not.toHaveProperty('lastModified')
    expect(doc.scene).not.toHaveProperty('objectCount')
  })

  it('docToUpstream：scene 摊平进 metadata（restoreScene 直接读这些键）', () => {
    const doc = upstreamToDoc(upstreamPayload)
    const { objects, metadata } = docToUpstream(doc)
    expect(objects).toHaveLength(1)
    expect(metadata.name).toBe('全厂 3D 总览')
    expect(metadata.lightingConfig).toEqual({ enabled: true, ambient: 0.85 })
    expect(metadata.cameraFar).toBe(1000000)
    expect(metadata.nodeGraph).toHaveLength(1)
  })

  it('往返保真：关键字段一个不丢（灯光/相机/节点图/初始视角）', () => {
    const doc = upstreamToDoc({
      ...upstreamPayload,
      initialView: { position: { x: 15, y: 11, z: 17 }, target: { x: -2, y: 1, z: -1 } },
    })
    const back = docToUpstream(doc).metadata
    expect(back.lightingConfig).toEqual({ enabled: true, ambient: 0.85 })
    expect(back.initialView).toEqual({ position: { x: 15, y: 11, z: 17 }, target: { x: -2, y: 1, z: -1 } })
    expect(back.nodeGraph).toHaveLength(1)
  })

  it('空场景也能往返（不因缺字段抛错）', () => {
    const doc = upstreamToDoc({ id: 'new', objects: [] })
    expect(docToUpstream(doc).metadata.name).toBe('new')
  })
})

describe('保存保真：上游不传的字段必须保留', () => {
  /**
   * 实测缺陷（2026-11-26，迁移 DEMO 后发现）：
   * 上游 `PersistenceManager.saveScene` 只把 objects/lighting/cameraFar 等传给 DBManager，
   * **不传 initialView，也不传 nodeGraph**（它自己算了 nodeGraph 却没放进 payload）。
   * 适配器若无脑用 payload 重建 doc，保存一次就把这两项抹掉：
   *   iot-robot-hall-3d 实测 nodeGraph 292 → 0、initialView true → false。
   * 修法：适配器缓存加载时的 doc，保存时以"旧 scene 打底 + 新字段覆盖"合并。
   */
  const loadedDoc = {
    $schema: 'agent-hmi.scene3d/1',
    meta: { name: '展厅', group: '空间层', unit_m: 1, home: { pos: [15, 11, 17], target: [-2, 1, -1] } },
    nodes: [], links: [],
    objects: [{ bid: 'b1', type: 'BoxGeometry' }],
    scene: {
      lightingConfig: { enabled: true, ambient: 0.85 },
      initialView: { position: { x: 11, y: 6.5, z: 15 }, target: { x: 0, y: 1.4, z: 0 } },
      nodeGraph: [{ bid: 'b1', parentBid: null }, { bid: 'b2', parentBid: 'b1' }],
      cameraFar: 1000000,
    },
    bindings: [], events: [],
  }

  function dbWith(loaded: unknown) {
    const puts: unknown[] = []
    const db = new ScenesDbManager()
    ;(db as unknown as { store: unknown }).store = {
      get: async () => ({ doc: loaded, version: 1 }),
      put: async (_id: string, doc: unknown) => { puts.push(doc); return { status: 'ok', version: 2 } },
    }
    return { db, puts }
  }

  it('保存（payload 不含 initialView/nodeGraph）后二者仍在', async () => {
    const { db, puts } = dbWith(loadedDoc)
    await db.getSceneData('x')                 // 先加载（缓存 doc）
    await db.saveScene({
      id: 'x',
      objects: [{ bid: 'b1', type: 'BoxGeometry' }],
      name: '展厅',
      lightingConfig: { enabled: true, ambient: 0.9 }, // 新值应覆盖旧值
    })
    const saved = puts[0] as { scene: Record<string, unknown> }
    expect(saved.scene.initialView).toEqual(loadedDoc.scene.initialView)
    expect(saved.scene.nodeGraph).toHaveLength(2)
    expect(saved.scene.lightingConfig).toEqual({ enabled: true, ambient: 0.9 }) // payload 覆盖
  })

  it('未加载就保存（无缓存）时不崩，按 payload 建文档', async () => {
    const { db, puts } = dbWith(loadedDoc)
    await db.saveScene({ id: 'x', objects: [], lightingConfig: { enabled: true } })
    const saved = puts[0] as { scene: Record<string, unknown> }
    expect(saved.scene.lightingConfig).toEqual({ enabled: true })
  })
})

describe('ScenesDbManager 乐观锁', () => {
  function fake(putImpl: () => Promise<unknown>) {
    const db = new ScenesDbManager()
    // 替换内部 store（测试双）
    ;(db as unknown as { store: unknown }).store = {
      get: async () => ({ doc: blankScene3D('x'), version: 7 }),
      put: putImpl,
    }
    return db
  }

  it('getSceneData 记住服务端版本号', async () => {
    const db = fake(async () => ({ status: 'ok', version: 8 }))
    await db.getSceneData('x')
    expect(db.getVersion()).toBe(7)
  })

  it('保存成功更新版本号；返回 {success, version}', async () => {
    const db = fake(async () => ({ status: 'ok', version: 8 }))
    const r = await db.saveScene({ id: 'x', objects: [] })
    expect(r).toEqual({ success: true, version: 8 })
    expect(db.getVersion()).toBe(8)
  })

  it('409 → ConflictError（带服务端当前版本），版本号同步', async () => {
    const db = fake(async () => {
      throw Object.assign(new Error('version conflict'), { status: 409, body: { current_version: 9 } })
    })
    await expect(db.saveScene({ id: 'x', objects: [] })).rejects.toBeInstanceOf(ConflictError)
    expect(db.getVersion()).toBe(9)
  })

  it('非 409 错误原样抛出（不吞成冲突）', async () => {
    const db = fake(async () => { throw Object.assign(new Error('boom'), { status: 500 }) })
    await expect(db.saveScene({ id: 'x', objects: [] })).rejects.toThrow('boom')
  })
})
