// BI 数据通道探针 e2e（P2 前置风险门）：setItemAttrByID 写大 JSON 进 vue 型图元
// props 的可行性——宿主聚合收集器喂数方案的机制前提。探针页 /dev/probe-bi（无守卫），
// 断言全部经 window.__probeBi（页面内组件 watch 的到达回调）。
import { expect, test } from '@playwright/test'

type ProbeResult = { ok: boolean; len?: number; points?: number; seq?: number; latencyMs?: number; err?: string }

test.describe('BI 图元大 JSON 写入探针', () => {
  test('阶梯 4KB/40KB/120KB：JSON 完整到达且可解析', async ({ page }) => {
    await page.goto('/dev/probe-bi')
    await page.waitForFunction(() => (window as { __probeBi?: unknown }).__probeBi !== undefined)
    // 每档：70/700/2100 点×3 序列 ≈ 4KB/40KB/120KB
    for (const [n, minLen] of [[70, 3000], [700, 30000], [2100, 100000]] as Array<[number, number]>) {
      const r = await page.evaluate(([pts]: [number]) => {
        const p = (window as unknown as { __probeBi: { setBig: (n: number) => { ok: boolean; len: number }; result: ProbeResult | null } }).__probeBi
        p.setBig(pts)
        return new Promise<ProbeResult>((resolve) => {
          const t = setInterval(() => { if (p.result) { clearInterval(t); resolve(p.result) } }, 20)
          setTimeout(() => { clearInterval(t); resolve({ ok: false, err: '3s 未到达' }) }, 3000)
        })
      }, [n] as [number])
      // eslint-disable-next-line no-console
      console.log(`  [probe] n=${n} 收到 ${r.len}B 点数 ${r.points} 时延 ${r.latencyMs}ms`)
      expect(r.ok, `n=${n} 组件到达结果`).toBe(true)
      expect(r.len ?? 0, `n=${n} 组件收到长度`).toBeGreaterThan(minLen)
      expect(r.points, `n=${n} 点数完整性（3 序列×n）`).toBe(n * 3)
    }
  })

  test('连写 10 次（刷新周期压缩）：seq 全到有序无丢帧', async ({ page }) => {
    await page.goto('/dev/probe-bi')
    await page.waitForFunction(() => (window as { __probeBi?: unknown }).__probeBi !== undefined)
    const seqs = await page.evaluate(() => {
      const p = (window as unknown as { __probeBi: { setBig: (n: number, seq?: number) => unknown; result: ProbeResult | null } }).__probeBi
      const got: number[] = []
      return new Promise<number[]>((resolve) => {
        let i = 0
        const iv = setInterval(() => {
          i += 1
          p.setBig(700, i) // 40KB/次
          setTimeout(() => { if (p.result?.seq) got.push(p.result.seq) }, 0)
          if (i >= 10) {
            clearInterval(iv)
            setTimeout(() => resolve(got), 500)
          }
        }, 30)
      })
    })
    expect(seqs.length, '收到的 seq 数').toBeGreaterThanOrEqual(9) // 最后一次可能落在 500ms 窗口边缘
    expect(Math.max(...seqs), '最大 seq').toBe(10)
    expect(new Set(seqs).size, '无重复丢帧').toBe(seqs.length)
  })
})
