/**
 * 画布智能助手路由级测试（llmRouteAgentJson）
 * 规范：AI开发规范.prompt.md 第七章
 * 适应度函数：任何异常路径绝不 500 ——
 *   LLM 失败 / 解析失败 / 契约外输出 全部收敛为 HTTP 200 {ok:false, placeholder:true}；
 *   仅审核拦截（输入侧）与风险门控返回 403 blocked。
 * 另锁定核心不变量：客户端走私 body.model 也无法选择模型（callLlmJson 恒收 undefined）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'
import { llmRouteAgentJson } from '../src/mank-core/llm/llmRouteHelper'
import { callLlmJson } from '../src/mank-core/llm/llmProvider'
import { moderateText, checkUserRiskGate } from '../src/mank-core/moderation/moderation'

vi.mock('../src/mank-core/llm/llmProvider', () => ({
  callLlm: vi.fn(),
  callLlmJson: vi.fn(),
}))

vi.mock('../src/mank-core/moderation/moderation', () => ({
  moderateText: vi.fn(),
  recordViolation: vi.fn(),
  checkUserRiskGate: vi.fn(),
}))

function makeReqRes(body: unknown, userId?: string) {
  const req = {
    body,
    path: '/canvas-agent',
    user: userId ? { userId } : undefined,
  } as unknown as Request
  const res: any = { statusCode: 0, body: null }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((payload: unknown) => {
    res.body = payload
    return res
  })
  return { req, res: res as unknown as Response, raw: res }
}

beforeEach(() => vi.clearAllMocks())

describe('canvasAgentRoute - llmRouteAgentJson 路由级容错（绝不 500）', () => {
  it('正常路径：LLM 返回合法建议 → 200 ok:true，且 model 字段被剥离', async () => {
    vi.mocked(callLlmJson).mockResolvedValue({
      reply: '好的，已整理',
      commands: [{ type: 'image', prompt: 'cat', model: 'gpt-image-1' }],
    })
    const { req, res, raw } = makeReqRes({ message: '画一只猫' })
    await llmRouteAgentJson()(req, res)
    expect(raw.statusCode).toBe(0) // 从未调用 status() → 默认 200
    const payload = raw.body as Record<string, any>
    expect(payload.ok).toBe(true)
    expect(payload.source).toBe('llm')
    expect(payload.data.commands[0]).not.toHaveProperty('model')
  })

  it('LLM 返回无法解析的垃圾 → 200 ok:false 兜底（绝不 500）', async () => {
    vi.mocked(callLlmJson).mockResolvedValue({ nonsense: true })
    const { req, res, raw } = makeReqRes({ message: 'm' })
    await llmRouteAgentJson()(req, res)
    const payload = raw.body as Record<string, any>
    expect(raw.statusCode).toBe(0)
    expect(payload.ok).toBe(false)
    expect(payload.placeholder).toBe(true)
    expect(payload.data.commands).toEqual([])
    expect(typeof payload.data.reply).toBe('string')
  })

  it('LLM 调用抛错（网络/超时）→ 200 ok:false 兜底，且不回显内部错误细节（绝不 500）', async () => {
    vi.mocked(callLlmJson).mockRejectedValue(new Error('upstream timeout secret'))
    const { req, res, raw } = makeReqRes({ message: 'm' })
    await llmRouteAgentJson()(req, res)
    const payload = raw.body as Record<string, any>
    expect(raw.statusCode).toBe(0)
    expect(payload.ok).toBe(false)
    expect(payload.data.reply).not.toContain('upstream timeout secret')
  })

  it('LLM 返回契约外类型（数组/字符串）→ 200 ok:false 兜底（绝不 500）', async () => {
    vi.mocked(callLlmJson).mockResolvedValueOnce(['not', 'an', 'object'])
    vi.mocked(callLlmJson).mockResolvedValueOnce('plain string')
    const { req, res, raw } = makeReqRes({ message: 'm' })
    await llmRouteAgentJson()(req, res)
    expect((raw.body as Record<string, any>).ok).toBe(false)
    await llmRouteAgentJson()(req, res)
    expect((raw.body as Record<string, any>).ok).toBe(false)
  })

  it('客户端走私 body.model 也无法选择模型：callLlmJson 恒收 undefined model', async () => {
    vi.mocked(callLlmJson).mockResolvedValue({ reply: 'r', commands: [] })
    const { req, res } = makeReqRes({ message: 'm', model: 'veo-3' })
    await llmRouteAgentJson()(req, res)
    expect(vi.mocked(callLlmJson)).toHaveBeenCalledWith(expect.any(String), expect.any(String), undefined)
  })
})

describe('canvasAgentRoute - 审核与风险门控（登录用户）', () => {
  it('输入审核拦截 → 403 blocked（stage: input），LLM 未被调用', async () => {
    vi.mocked(checkUserRiskGate).mockResolvedValue({ allowed: true, riskLevel: 1 } as never)
    vi.mocked(moderateText).mockResolvedValue({ passed: false, reason: '违规内容', riskLevel: 'high' } as never)
    const { req, res, raw } = makeReqRes({ message: '违规' }, 'u1')
    await llmRouteAgentJson()(req, res)
    expect(raw.statusCode).toBe(403)
    const payload = raw.body as Record<string, any>
    expect(payload.blocked).toBe(true)
    expect(payload.stage).toBe('input')
    expect(callLlmJson).not.toHaveBeenCalled()
  })

  it('风险门控拒绝（riskLevel≥3）→ 403 blocked，LLM 未被调用', async () => {
    vi.mocked(checkUserRiskGate).mockResolvedValue({ allowed: false, message: '账号已被限制', riskLevel: 4 } as never)
    const { req, res, raw } = makeReqRes({ message: 'm' }, 'u1')
    await llmRouteAgentJson()(req, res)
    expect(raw.statusCode).toBe(403)
    expect((raw.body as Record<string, any>).blocked).toBe(true)
    expect(callLlmJson).not.toHaveBeenCalled()
  })

  it('输出审核拦截 → 200 降级兜底（输出侧不 block，走 fallback），不回显违规细节', async () => {
    vi.mocked(checkUserRiskGate).mockResolvedValue({ allowed: true, riskLevel: 1 } as never)
    vi.mocked(moderateText)
      .mockResolvedValueOnce({ passed: true } as never)
      .mockResolvedValueOnce({ passed: false, reason: 'output violation detail', riskLevel: 'medium' } as never)
    vi.mocked(callLlmJson).mockResolvedValue({ reply: 'r', commands: [] })
    const { req, res, raw } = makeReqRes({ message: 'm' }, 'u1')
    await llmRouteAgentJson()(req, res)
    expect(raw.statusCode).toBe(0)
    const payload = raw.body as Record<string, any>
    expect(payload.ok).toBe(false)
    expect(payload.fallbackReason).toBe('输出内容违规被拦截')
    expect(JSON.stringify(payload.data)).not.toContain('output violation detail')
  })
})
