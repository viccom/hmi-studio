import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  // 120s：单测试内轮询预算总和可超 60s（home-meters 双采样 10+60s 全相位窗口 + 趋势 20s
  // ≈ 100s——60s 测试级超时会先到，慢数据场景的失败形态是不可诊断的 timeout 而非断言失败）
  timeout: 120_000,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://127.0.0.1:5290' },
  webServer: {
    command: 'pnpm exec vite --port 5290 --strictPort',
    url: 'http://127.0.0.1:5290',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
