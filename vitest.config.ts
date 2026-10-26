import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // 批 B 起组件单测直接 import .vue（jsdom 实挂载）——插件仅进测试管线，不动构建配置
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
