/** Viewer 事件名（照 threejs-demo 的 Events.ts：统一事件总线，避免拾取与业务耦合） */
export default {
  click: { raycaster: 'click:raycaster' },
  dblclick: { raycaster: 'dblclick:raycaster' },
  mousemove: { raycaster: 'mousemove:raycaster' },
  /** 每帧渲染后发出（屏幕空间标签等跟随相机的投影必须挂这里） */
  render: 'render',
  dispose: 'dispose',
  orbitChange: 'orbitChange',
} as const
