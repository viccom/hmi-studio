/**
 * `@sparkjsdev/spark` 降级桩（高斯泼溅渲染器）。
 *
 * 上游 `core/PersistenceManager.js` 在加载 GaussianSplat 资产时动态 `import()` 该包。
 * 本项目不启用高斯泼溅（方案 §6.2 档 C：该包体积大、工业组态用不到），故用 alias
 * 指向本桩：**构建期**不再要求安装该依赖；**运行期**若真有人加载泼溅资产，
 * 这里抛明确错误而不是静默失败或白屏。
 *
 * 启用方式（将来需要时）：卸载本 alias + `pnpm add @sparkjsdev/spark`。
 */
const notEnabled = () => {
  throw new Error('高斯泼溅（Gaussian Splatting）未在本项目启用：请移除 vite.config 的 spark 降级 alias 并安装 @sparkjsdev/spark')
}

export class SparkRenderer {
  constructor() { notEnabled() }
}

export class SplatMesh {
  constructor() { notEnabled() }
}
