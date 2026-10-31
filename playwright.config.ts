import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  // 120s：单测试内轮询预算总和可超 60s（home-meters 双采样 10+60s 全相位窗口 + 趋势 20s
  // ≈ 100s——60s 测试级超时会先到，慢数据场景的失败形态是不可诊断的 timeout 而非断言失败）
  timeout: 120_000,
  // 串行（2026-10-31 定）：e2e 打真实 rs-iot、画面列表是**共享活态**——并发 worker
  // 的播种/删除会重排列表（m4 卡片滚动脱附）与挤兑 CPU（重型编辑器 spec 拖拽丢帧）。
  // 第 3 轮新增 3 个 MtEdit 重型 spec 后 2 worker 仍稳定翻车（同对失败×2 轮），
  // 收敛为 1：门禁确定性优先（全量 ~4min）。
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://127.0.0.1:5290' },
  webServer: {
    command: 'pnpm exec vite --port 5290 --strictPort',
    url: 'http://127.0.0.1:5290',
    // CI 下不复用残留 server（worktree 并行时 5290 残留会静默测到 worktree 代码）；本地保留复用提速
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
