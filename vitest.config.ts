import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // 批 B 起组件单测直接 import .vue（jsdom 实挂载）——插件仅进测试管线，不动构建配置
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    // scripts 面：install-plugin 的 lint/合并纯函数单测（P3b，2026-10-31）
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
