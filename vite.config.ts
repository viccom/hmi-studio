import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// T18 部署形态：build（production mode）base='/hmi/'——gateway hmi_dist 挂 /hmi 前缀
// （router.ts 用 import.meta.env.BASE_URL 同源对齐）；dev/test 维持 '/'（e2e baseURL 不受影响）。
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/hmi/' : '/',
  plugins: [
    vue(),
    // P3b 插件目录 dev 面板（prod 由 gateway hmi_widgets_dir 挂 /hmi/widgets；dev base='/'
    // → loader 取 /widgets/*，vite 静态服务仓根 widgets/，与 install-plugin.mjs 同一目录）
    {
      name: 'hmi-widgets-dev',
      configureServer(server) {
        const root = fileURLToPath(new URL('./widgets', import.meta.url))
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith('/widgets/')) req.url = `/@fs${root}${req.url.slice('/widgets'.length)}`
          next()
        })
      },
    },
  ],
  server: {
    port: 5273,
    host: true,
    proxy: {
      // proxy 按声明顺序匹配——'/api/agent'、'/api/gw' 必须写在通配 '/api' 之前
      // （设计修订记录 #6：通配在前会吃掉 agent 面）。agent 面（reasonix 反代 +
      // providers/attachments 本地实现）与 gateway 登录端点都在 dev-gateway :18080，
      // 其余 /api 仍直连 rs-iot（dev 形态登录走 /api/v1/user/login，不受影响）。
      '/api/agent': { target: 'http://127.0.0.1:18080', changeOrigin: true },
      '/api/gw': { target: 'http://127.0.0.1:18080', changeOrigin: true },
      '/api': { target: process.env.RSIOT_BASE ?? 'http://127.0.0.1:8790', changeOrigin: true },
    },
  },
}))
