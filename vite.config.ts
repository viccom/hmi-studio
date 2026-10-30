import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// T18 部署形态：build（production mode）base='/hmi/'——gateway hmi_dist 挂 /hmi 前缀
// （router.ts 用 import.meta.env.BASE_URL 同源对齐）；dev/test 维持 '/'（e2e baseURL 不受影响）。
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/hmi/' : '/',
  plugins: [vue()],
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
