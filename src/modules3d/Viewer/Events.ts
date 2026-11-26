/** Viewer 事件名（照 threejs-demo 的 Events.ts：统一事件总线，避免拾取与业务耦合） */
export default {
  click: { raycaster: 'click:raycaster' },
  dblclick: { raycaster: 'dblclick:raycaster' },
  mousemove: { raycaster: 'mousemove:raycaster' },
  dispose: 'dispose',
  orbitChange: 'orbitChange',
} as const
