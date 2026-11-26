/**
 * Viewer —— 3D 引擎封装（完全借鉴 threejs-demo 的 modules/Viewer 设计）。
 *
 * 把 three.js 的样板（renderer / scene / camera / light / controls / rAF /
 * raycaster / mitt 事件总线 / destroy）收敛到一个类，业务组件只调 viewer.xxx()。
 * 与参考项目的差异：① r187 API（outputColorSpace 而非 outputEncoding）；
 * ② setRaycasterObjects 用 Set 去重；③ destroy 幂等；④ 按需渲染 + 动画队列。
 */
import {
  Scene, PerspectiveCamera, WebGLRenderer, Camera, SRGBColorSpace,
  AmbientLight, DirectionalLight, Raycaster, Vector2, MOUSE, Color, Fog,
  type Material, type Object3D, type Intersection,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { throttle } from 'lodash-es'
import mitt, { type Emitter } from 'mitt'
import Events from './Events'

const C_BG = 0x0b1420 // 深色科技风（对齐 threejs-demo 参考项目）

export type Animate = { fun: (...args: never[]) => void; content: unknown }

export default class Viewer {
  public readonly host: HTMLElement
  public scene!: Scene
  public camera!: PerspectiveCamera
  public renderer!: WebGLRenderer
  public controls!: OrbitControls
  public emitter!: Emitter<{
    'click:raycaster': import('three').Intersection[]
    'dblclick:raycaster': import('three').Intersection[]
    'mousemove:raycaster': import('three').Intersection[]
    dispose: undefined
    orbitChange: undefined
  }>
  public raycaster!: Raycaster
  public mouse!: Vector2
  public mouseEvent: MouseEvent | undefined
  public animateList: Animate[] = []
  public raycasterObjects: Object3D[] = []
  public isDestroy = false

  private raf = 0
  private ro: ResizeObserver | null = null

  constructor(idOrHost: string | HTMLElement) {
    this.host = typeof idOrHost === 'string'
      ? (document.getElementById(idOrHost) as HTMLElement)
      : idOrHost
    if (!this.host) throw new Error(`Viewer: host not found (${String(idOrHost)})`)
    this.emitter = mitt()
    this.initRenderer()
    this.initScene()
    this.initLight()
    this.initCamera()
    this.initControl()
    this.raycaster = new Raycaster()
    this.mouse = new Vector2()
    this.observeResize()
    this.loop()
  }

  /** 注册全局动画回调（每帧统一执行；与 threejs-demo 的 addAnimate 同语义） */
  public addAnimate(a: Animate): void { this.animateList.push(a) }

  /** 射线只检测给定对象组（不扫全场景；机柜/设备拾取的关键） */
  public setRaycasterObjects(objs: Object3D[]): void { this.raycasterObjects = objs }

  /** 注册鼠标事件 → mitt 总线（click / dblclick / mousemove，throttle 50ms） */
  public initRaycaster(): void {
    for (const name of ['click', 'dblclick', 'mousemove'] as const) {
      const handler = throttle((evt: Event) => {
        if (this.isDestroy) return
        const event = evt as MouseEvent
        this.mouseEvent = event
        const r = this.renderer.domElement.getBoundingClientRect()
        this.mouse.set(
          ((event.clientX - r.left) / r.width) * 2 - 1,
          -((event.clientY - r.top) / r.height) * 2 + 1,
        )
        this.emitter.emit(
          Events[name].raycaster,
          this.getRaycasterIntersectObjects(),
        )
      }, 50)
      this.host.addEventListener(name, handler, false)
      // 与 destroy 中的清理对应
      this._listeners.push([name, handler])
    }
  }

  private _listeners: Array<[string, EventListener]> = []

  private getRaycasterIntersectObjects(): Intersection[] {
    if (!this.raycasterObjects.length) return []
    this.raycaster.setFromCamera(this.mouse, this.camera)
    return this.raycaster.intersectObjects(this.raycasterObjects, true)
  }

  private initRenderer(): void {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.shadowMap.enabled = false // 灰阶示意，阴影是最大开销
    this.host.appendChild(this.renderer.domElement)
  }

  private initScene(): void {
    this.scene = new Scene()
    this.scene.background = new Color(C_BG)
    this.scene.fog = new Fog(C_BG, 55, 130)
  }

  private initCamera(): void {
    this.camera = new PerspectiveCamera(50, 1, 0.1, 400)
    this.camera.position.set(26, 15, 28)
    this.camera.lookAt(0, 1, 0)
  }

  private initLight(): void {
    this.scene.add(new AmbientLight(0xffffff, 1.9))
    const sun = new DirectionalLight(0xffffff, 2.0)
    sun.position.set(24, 34, 18)
    this.scene.add(sun)
  }

  private initControl(): void {
    this.controls = new OrbitControls(this.camera as Camera, this.renderer.domElement)
    this.controls.target.set(0, 1, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI / 2.15
    this.controls.minPolarAngle = 0.15
    this.controls.minDistance = 8
    this.controls.maxDistance = 100
    // 与 threejs-demo 一致：左键旋转 / 中键缩放 / 右键平移
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }
    this.controls.addEventListener('change', () => this.render())
    this.controls.update()
  }

  private observeResize(): void {
    this.ro = new ResizeObserver(() => {
      if (this.isDestroy) return
      const w = this.host.clientWidth, h = this.host.clientHeight
      if (!w || !h) return
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(w, h)
      this.render()
    })
    this.ro.observe(this.host)
  }

  /** 立即渲染一帧（静态模式 / 数据变化时调用） */
  public render(): void {
    if (this.isDestroy) return
    this.renderer.render(this.scene, this.camera)
  }

  /** 渲染循环：controls + 动画队列（isDestroy 时退出） */
  private loop(): void {
    const step = () => {
      if (this.isDestroy) return
      this.raf = requestAnimationFrame(step)
      this.controls.update()
      for (const a of this.animateList) {
        if (a.fun && a.content) (a.fun as (c: unknown) => void)(a.content)
      }
      this.render()
    }
    this.raf = requestAnimationFrame(step)
  }

  /** 停止动画循环（静态模式用：只保留事件驱动的按需渲染） */
  public stopLoop(): void { cancelAnimationFrame(this.raf); this.raf = 0 }

  /** 完整销毁（照 threejs-demo：dispose + forceContextLoss + scene.clear） */
  public destroy(): void {
    if (this.isDestroy) return
    this.isDestroy = true
    cancelAnimationFrame(this.raf)
    this.ro?.disconnect()
    for (const [name, fn] of this._listeners) this.host.removeEventListener(name, fn)
    this._listeners.length = 0
    this.controls.dispose()
    this.scene.traverse((o) => {
      const mesh = o as Object3D & { geometry?: { dispose(): void }; material?: Material | Material[] }
      mesh.geometry?.dispose()
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose())
      else mesh.material?.dispose()
    })
    this.scene.clear()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
    this.emitter.emit(Events.dispose, undefined)
    this.emitter.all.clear()
  }
}
