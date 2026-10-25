import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:5290' },
  webServer: {
    command: 'pnpm exec vite --port 5290 --strictPort',
    url: 'http://127.0.0.1:5290',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
