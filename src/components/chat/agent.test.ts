import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// agent.ts 静态 import agentApi → 同仓 lib/api（读 localStorage，jsdom 有）——
// 仍 mock 掉 agent-api：测试需要逐端点控制响应，与控制台 agent.test.ts 同款策略。
vi.mock('./agent-api', () => ({ agentApi: vi.fn(async () => new Response('{}')) }))

import { agentApi } from './agent-api'
import { useAgentStore, effortLevelsFor, escapeRefPath, PLAN_MODE_MARKERS } from './agent'

const mockedApi = vi.mocked(agentApi)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockedApi.mockReset()
  mockedApi.mockImplementation(async () => jsonResponse({}))
  window.history.pushState({}, '', '/')
})

describe('effortLevelsFor（官方 effort.go 映射移植）', () => {
  it('deepseek-v4-flash has low tier', () => {
    expect(effortLevelsFor('deepseek', 'deepseek-v4-flash')).toEqual(['auto', 'disabled', 'low', 'high', 'max'])
  })
  it('plain deepseek lacks low/medium', () => {
    expect(effortLevelsFor('deepseek', 'deepseek-v3')).toEqual(['auto', 'disabled', 'high', 'max'])
  })
  it('anthropic/claude includes xhigh', () => {
    expect(effortLevelsFor('anthropic', 'claude-x')).toContain('xhigh')
  })
  it('unknown provider falls back to generic openai tiers', () => {
    expect(effortLevelsFor('mystery', 'gpt-x')).toEqual(['auto', 'low', 'medium', 'high'])
  })
})

describe('escapeRefPath', () => {
  it('escapes spaces and tabs only', () => {
    expect(escapeRefPath('a b/c d')).toBe('a\\ b/c\\ d')
    expect(escapeRefPath('a\tb')).toBe('a\\\tb')
  })
})

describe('SSE 事件聚合', () => {
  it('text appends to current assistant message', () => {
    const s = useAgentStore()
    s.onEvent({ kind: 'turn_started' })
    s.onEvent({ kind: 'text', text: 'hello ' })
    s.onEvent({ kind: 'text', text: 'world' })
    expect(s.messages.at(-1)?.role).toBe('assistant')
    expect(s.messages.at(-1)?.text).toBe('hello world')
    expect(s.running).toBe(true)
  })

  it('reasoning accumulates separately', () => {
    const s = useAgentStore()
    s.onEvent({ kind: 'turn_started' })
    s.onEvent({ kind: 'reasoning', text: '想' })
    s.onEvent({ kind: 'reasoning', text: '一下' })
    s.onEvent({ kind: 'text', text: '答案' })
    expect(s.messages.at(-1)?.reasoning).toBe('想一下')
    expect(s.messages.at(-1)?.text).toBe('答案')
  })

  it('notice lands in notices (folded with reasoning)', () => {
    const s = useAgentStore()
    s.onEvent({ kind: 'turn_started' })
    s.onEvent({ kind: 'notice', text: 'routed via proxy' })
    expect(s.messages.at(-1)?.notices).toEqual(['routed via proxy'])
  })

  it('tool_dispatch then tool_result populates toolCalls', () => {
    const s = useAgentStore()
    s.onEvent({ kind: 'turn_started' })
    s.onEvent({ kind: 'tool_dispatch', tool: { id: 'c1', name: 'hmi_get_screen', args: '{"id":"x"}' } })
    s.onEvent({ kind: 'tool_result', tool: { id: 'c1', name: 'hmi_get_screen', output: '{"ok":1}', durationMs: 12 } })
    const tc = s.messages.at(-1)?.toolCalls?.[0]
    expect(tc?.name).toBe('hmi_get_screen')
    expect(tc?.args).toBe('{"id":"x"}')
    expect(tc?.result).toBe('{"ok":1}')
    expect(tc?.error).toBe(false)
    expect(tc?.durationMs).toBe(12)
  })

  it('tool_result with err marks failure', () => {
    const s = useAgentStore()
    s.onEvent({ kind: 'turn_started' })
    s.onEvent({ kind: 'tool_dispatch', tool: { id: 'c1', name: 't' } })
    s.onEvent({ kind: 'tool_result', tool: { id: 'c1', name: 't', err: 'boom' } })
    const tc = s.messages.at(-1)?.toolCalls?.[0]
    expect(tc?.error).toBe(true)
    expect(tc?.errorMsg).toBe('boom')
  })

  it('approval_request sets approval payload', () => {
    const s = useAgentStore()
    s.onEvent({ kind: 'approval_request', approval: { id: 'a1', tool: 'hmi_put_screen', subject: 's', reason: 'r' } })
    expect(s.approval).toEqual({ id: 'a1', tool: 'hmi_put_screen', subject: 's', reason: 'r' })
  })

  it('ask_request sets ask; turn_done clears residual ask and stops running', () => {
    const s = useAgentStore()
    s.onEvent({ kind: 'turn_started' })
    s.onEvent({ kind: 'ask_request', ask: { id: 'q1', questions: [{ id: 'x', prompt: '?', options: [] }] } })
    expect(s.ask?.id).toBe('q1')
    s.onEvent({ kind: 'turn_done' })
    expect(s.running).toBe(false)
    expect(s.ask).toBeNull()
  })

  it('malformed-shaped frames do not throw (defensive no-op)', () => {
    const s = useAgentStore()
    expect(() => {
      s.onEvent({ kind: 'text' })
      s.onEvent({ kind: 'tool_result', tool: { id: 'ghost', name: 't' } })
    }).not.toThrow()
    expect(s.messages).toEqual([])
  })
})

describe('approve 死锁防护', () => {
  beforeEach(() => {
    const s = useAgentStore()
    s.onEvent({ kind: 'approval_request', approval: { id: 'a1', tool: 'hmi_put_screen' } })
  })

  it('2xx clears approval', async () => {
    mockedApi.mockImplementation(async () => jsonResponse({ status: 'ok' }))
    const s = useAgentStore()
    await s.approve(true)
    expect(s.approval).toBeNull()
    const [path, init] = mockedApi.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/agent/approve')
    expect(JSON.parse(init.body as string)).toEqual({ id: 'a1', allow: true })
  })

  it('non-2xx keeps approval and throws with body (no deadlock)', async () => {
    mockedApi.mockImplementation(async () => jsonResponse({ error: 'missing id' }, 400))
    const s = useAgentStore()
    await expect(s.approve(true)).rejects.toThrow('400')
    expect(s.approval).not.toBeNull()
  })
})

describe('submit 上下文注入（hmi 形态）', () => {
  it('appends [页面上下文] with mode/slug/path from location', async () => {
    window.history.pushState({}, '', '/view/water-demo-m3')
    const s = useAgentStore()
    await s.submit('给 2# 泵加状态色')
    const [path, init] = mockedApi.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/agent/submit')
    const sent = JSON.parse(init.body as string) as { input: string }
    expect(sent.input).toContain('给 2# 泵加状态色')
    expect(sent.input).toContain('[页面上下文]')
    expect(sent.input).toContain('模式: view')
    expect(sent.input).toContain('画面: water-demo-m3')
    // 用户气泡仍显示原文（上下文只进请求体）
    expect(s.messages[0].text).toBe('给 2# 泵加状态色')
  })

  it('no context block off screen pages', async () => {
    window.history.pushState({}, '', '/')
    const s = useAgentStore()
    await s.submit('hi')
    const [, init] = mockedApi.mock.calls[0] as unknown as [string, RequestInit]
    expect((JSON.parse(init.body as string) as { input: string }).input).toBe('hi')
  })

  it('non-2xx throws with status and body', async () => {
    mockedApi.mockImplementation(async () => jsonResponse('agent down', 503))
    const s = useAgentStore()
    await expect(s.submit('x')).rejects.toThrow('503')
  })
})

describe('answer', () => {
  it('2xx clears ask and posts id+answers', async () => {
    const s = useAgentStore()
    s.onEvent({ kind: 'ask_request', ask: { id: 'q1', questions: [] } })
    mockedApi.mockImplementation(async () => jsonResponse({ status: 'ok' }))
    await s.answer([{ question_id: 'x', selected: ['a'] }])
    expect(s.ask).toBeNull()
    const [path, init] = mockedApi.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/agent/answer')
    expect(JSON.parse(init.body as string)).toEqual({ id: 'q1', answers: [{ question_id: 'x', selected: ['a'] }] })
  })

  it('failure keeps ask for retry', async () => {
    const s = useAgentStore()
    s.onEvent({ kind: 'ask_request', ask: { id: 'q1', questions: [] } })
    mockedApi.mockImplementation(async () => jsonResponse({}, 500))
    await expect(s.answer([{ question_id: 'x', selected: ['a'] }])).rejects.toThrow('500')
    expect(s.ask).not.toBeNull()
  })
})

describe('历史回放清洗（loadHistory → historyToChatMessages）', () => {
  it('maps user/assistant/tool; skips notice/system; pairs tool results by id', async () => {
    mockedApi.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/history')) {
        return jsonResponse([
          { role: 'system', content: 'sys prompt' },
          { role: 'notice', content: 'steer' },
          { role: 'user', content: '用户的话' },
          { role: 'assistant', content: '回答', toolCalls: [{ id: 't1', name: 'hmi_query_history', arguments: '{"q":1}' }] },
          { role: 'tool', content: '{"rows":[]}', toolCallId: 't1' },
        ])
      }
      return jsonResponse({})
    })
    const s = useAgentStore()
    await s.loadHistory()
    // system/notice 跳过；tool 配对进 assistant——5 条历史 → 2 条消息
    expect(s.messages).toHaveLength(2)
    expect(s.messages[0].role).toBe('user')
    expect(s.messages[1].text).toBe('回答')
    expect(s.messages[1].toolCalls?.[0].args).toBe('{"q":1}')
    expect(s.messages[1].toolCalls?.[0].result).toBe('{"rows":[]}')
    expect(s.messages[1].toolCalls?.[0].error).toBe(false)
  })

  it('strips transient blocks / plan markers / referenced-context / page-context from user bubbles', async () => {
    const marker = PLAN_MODE_MARKERS[0]
    mockedApi.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/history')) {
        return jsonResponse([
          { role: 'user', content: `<capability-route>route hints</capability-route>\n${marker}\nReferenced context:\n<file /x>a</file>\n真正的输入\n\n[页面上下文]\n模式: view\n画面: x` },
        ])
      }
      return jsonResponse({})
    })
    const s = useAgentStore()
    await s.loadHistory()
    expect(s.messages[0].text).toBe('真正的输入')
  })
})

describe('供应商探测（⚙ 显隐降级）', () => {
  it('probeProviders ok → available', async () => {
    mockedApi.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/providers')) return jsonResponse({ providers: [{ name: 'p', kind: 'openai', base_url: 'u', models: ['m'], api_key_env: 'K', has_key: true }], default_model: 'p/m' })
      return jsonResponse({})
    })
    const s = useAgentStore()
    await s.probeProviders()
    expect(s.providersAvailable).toBe(true)
    expect(s.providers).toHaveLength(1)
    expect(s.defaultModel).toBe('p/m')
  })

  it('probeProviders 503 → hidden, no throw', async () => {
    mockedApi.mockImplementation(async (path: string) => {
      if (String(path).endsWith('/providers')) return jsonResponse('no reasonix', 503)
      return jsonResponse({})
    })
    const s = useAgentStore()
    await expect(s.probeProviders()).resolves.toBeUndefined()
    expect(s.providersAvailable).toBe(false)
  })
})

describe('附件与工作区（2026-10-31 功能对齐控制台）', () => {
  it('uploadAttachment POST FormData → 返回 @ 引用路径', async () => {
    let seenPath = ''
    let seenForm = false
    mockedApi.mockImplementation(async (path: string, opts?: RequestInit) => {
      seenPath = String(path)
      seenForm = typeof FormData !== 'undefined' && opts?.body instanceof FormData
      return jsonResponse({ files: [{ path: '.reasonix/attachments/upload-1.txt' }] })
    })
    const s = useAgentStore()
    const file = new File(['hi'], 'note.txt', { type: 'text/plain' })
    await expect(s.uploadAttachment(file)).resolves.toBe('.reasonix/attachments/upload-1.txt')
    expect(seenPath).toBe('/api/agent/attachments')
    expect(seenForm).toBe(true)
  })

  it('uploadAttachment 失败（413）→ 抛错带状态码', async () => {
    mockedApi.mockImplementation(async () => jsonResponse('too large', 413))
    const s = useAgentStore()
    await expect(s.uploadAttachment(new File(['x'], 'big.bin'))).rejects.toThrow(/413/)
  })

  it('uploadAttachment 响应缺 path → 抛错（不静默产出空 @ 引用）', async () => {
    mockedApi.mockImplementation(async () => jsonResponse({ files: [{}] }))
    const s = useAgentStore()
    await expect(s.uploadAttachment(new File(['x'], 'x.txt'))).rejects.toThrow(/missing path/)
  })

  it('listWorkspace 编码路径并返回条目', async () => {
    let seenPath = ''
    mockedApi.mockImplementation(async (path: string) => {
      seenPath = String(path)
      return jsonResponse({ entries: [{ name: 'docs', is_dir: true }, { name: 'a.txt', is_dir: false }] })
    })
    const s = useAgentStore()
    const entries = await s.listWorkspace('docs/sub dir')
    expect(seenPath).toBe('/api/agent/workspace?path=docs%2Fsub%20dir')
    expect(entries).toEqual([{ name: 'docs', is_dir: true }, { name: 'a.txt', is_dir: false }])
  })

  it('listWorkspace 503 → 抛错（选择器展示错误而非空目录）', async () => {
    mockedApi.mockImplementation(async () => jsonResponse('no reasonix', 503))
    const s = useAgentStore()
    await expect(s.listWorkspace('')).rejects.toThrow(/503/)
  })
})
