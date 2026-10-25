import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5273,
    host: true,
    proxy: {
      '/api': { target: process.env.RSIOT_BASE ?? 'http://127.0.0.1:8790', changeOrigin: true },
    },
  },
})
