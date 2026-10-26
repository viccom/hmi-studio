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
      '/api': { target: process.env.RSIOT_BASE ?? 'http://127.0.0.1:8790', changeOrigin: true },
    },
  },
}))
