// LLM 路由通用 helper — 消除 21 个 LLM 接口的重复 try/catch + fallback 模式
//
// 设计目标：
//   1. 单点封装 try/catch + fallback 结构（H1：消除 600+ 行重复）
//   2. demo 模式（无 API Key）下统一返回 placeholder: true（H17：占位标识一致）
//   3. 每个接口都通过 withGeneration 中间件预扣额度（H13：补齐缺失的扣额度）
//   4. 内容安全双审核：输入审核（preModerate）+ 输出审核（postModerate）
//      风险等级门控 + 本地敏感词兜底 + 服务商 API（MODERATION_API_KEY 配置后启用）
//
// 用法：
//   router.post('/foo', withGeneration('novel', 500), llmRouteJson<FooData>(sysPrompt, fallback))
//   router.post('/bar', withGeneration('novel', 200), llmRouteText(sysPrompt, fallback))

import { Response, Request } from 'express'
import { callLlm, callLlmJson } from './llmProvider'
import { WRITING_SYSTEM_PROMPT } from './writingPrompt'
import { moderateText, recordViolation, checkUserRiskGate } from './moderation'

/**
 * 统一的 fallback 响应结构（demo 模式 / LLM 调用失败时返回）
 * - ok: false 表示非 LLM 直接结果
 * - source: 'template' 表示走的是占位模板
 * - placeholder: true 让前端可统一识别"这是占位数据"（与 image/audio/video 路由的 placeholder 语义一致）
 */
export interface LlmFallbackResponse<T> {
  ok: false
  source: 'template'
  placeholder: true
  fallbackReason: string
  error: string
  data: T
}

export interface LlmSuccessResponse<T> {
  ok: true
  source: 'llm'
  placeholder: boolean // true = 无 API Key 走模板；false = 真实 LLM 调用
  data: T
}

/** 风险拦截响应（输入/输出审核未通过） */
export interface LlmBlockedResponse {
  ok: false
  source: 'moderation'
  blocked: true
  stage: 'input' | 'output'
  error: string
  riskLevel: 'low' | 'medium' | 'high'
  riskUserLevel?: number
}

/**
 * 创建一个"返回 JSON 结构"的 LLM 路由 handler
 *
 * @param systemPrompt 系统提示词
 * @param fallback 兜底数据工厂（接收 req.body 与错误对象，返回兜底 data）
 * @param userPromptBuilder 可选的用户提示词构造器；默认 JSON.stringify(body)。
 *   用于把 body 中的关键字段（如章纲、主线、角色）显式拼接为结构化文本，
 *   避免 LLM 在原始 JSON 中遗漏对前置设定的引用（H18：链路一致性）。
 * @returns Express 路由 handler
 */
export function llmRouteJson<T>(
  systemPrompt: string,
  fallback: (body: any, err: Error) => T,
  userPromptBuilder?: (body: any) => string,
) {
  return async (req: Request, res: Response) => {
    const userId = (req as any).user?.userId as string | undefined
    const endpoint = req.path

    try {
      // 风险等级门控：riskLevel≥3 拒绝 AI 生成
      if (userId) {
        const gate = await checkUserRiskGate(userId)
        if (!gate.allowed) {
          const blocked: LlmBlockedResponse = {
            ok: false, source: 'moderation', blocked: true, stage: 'input',
            error: gate.message || '账号已被限制 AI 生成',
            riskLevel: 'high', riskUserLevel: gate.riskLevel,
          }
          return res.status(403).json(blocked)
        }
      }

      const fullPrompt = `${WRITING_SYSTEM_PROMPT}\n\n---\n\n${systemPrompt}`
      const userPrompt = userPromptBuilder ? userPromptBuilder(req.body || {}) : JSON.stringify(req.body || {})

      // 输入审核：用户 prompt 发送给模型之前
      if (userId) {
        const inputMod = await moderateText(userPrompt, { stage: 'input', endpoint, userId })
        if (!inputMod.passed) {
          await recordViolation({ userId, stage: 'input', endpoint, content: userPrompt, result: inputMod })
          const blocked: LlmBlockedResponse = {
            ok: false, source: 'moderation', blocked: true, stage: 'input',
            error: `输入内容违规：${inputMod.reason}`, riskLevel: inputMod.riskLevel,
          }
          return res.status(403).json(blocked)
        }
      }

      const result = await callLlmJson<T>(fullPrompt, userPrompt)
      // callLlmJson 在无 API Key 时会抛错（fallbackTemplate 无法解析为 JSON），不会走到这里
      // 只有真实 LLM 调用成功才会到这里

      // 输出审核：模型生成内容返回用户之前
      if (userId) {
        const outStr = JSON.stringify(result)
        const outputMod = await moderateText(outStr, { stage: 'output', endpoint, userId })
        if (!outputMod.passed) {
          await recordViolation({ userId, stage: 'output', endpoint, content: outStr, result: outputMod })
          // 输出违规：不返回违规内容，返回兜底数据 + 拦截标记
          const data = fallback(req.body || {}, new Error('输出内容违规被拦截'))
          const response: LlmFallbackResponse<T> = {
            ok: false, source: 'template', placeholder: true,
            fallbackReason: '输出内容违规被拦截', error: '输出内容违规被拦截', data,
          }
          return res.json(response)
        }
      }

      const response: LlmSuccessResponse<T> = {
        ok: true,
        source: 'llm',
        placeholder: false,
        data: result,
      }
      return res.json(response)
    } catch (e: any) {
      const err = e instanceof Error ? e : new Error(String(e))
      const data = fallback(req.body || {}, err)
      const response: LlmFallbackResponse<T> = {
        ok: false,
        source: 'template',
        placeholder: true,
        fallbackReason: err.message,
        error: err.message,
        data,
      }
      return res.json(response)
    }
  }
}

/**
 * 创建一个"返回纯文本"的 LLM 路由 handler
 *
 * callLlm 在无 API Key 时会返回 fallbackTemplate 字符串（不抛错），
 * 此 helper 在此情况下也标记 placeholder: true，保证 demo 模式占位标识一致（H17）
 *
 * @param systemPrompt 系统提示词
 * @param fallback 兜底数据工厂
 * @param transform 可选的文本后处理（如解析书名列表）
 * @param userPromptBuilder 可选的用户提示词构造器；默认 JSON.stringify(body)。
 *   用于把 body 中的关键字段（如章纲、主线、当前正文）显式拼接为结构化文本，
 *   避免 LLM 在原始 JSON 中遗漏对前置设定的引用（H18：链路一致性）。
 */
export function llmRouteText<T>(
  systemPrompt: string,
  fallback: (body: any, err: Error) => T,
  transform?: (text: string, body: any) => T,
  userPromptBuilder?: (body: any) => string,
) {
  return async (req: Request, res: Response) => {
    const userId = (req as any).user?.userId as string | undefined
    const endpoint = req.path

    try {
      // 风险等级门控
      if (userId) {
        const gate = await checkUserRiskGate(userId)
        if (!gate.allowed) {
          const blocked: LlmBlockedResponse = {
            ok: false, source: 'moderation', blocked: true, stage: 'input',
            error: gate.message || '账号已被限制 AI 生成',
            riskLevel: 'high', riskUserLevel: gate.riskLevel,
          }
          return res.status(403).json(blocked)
        }
      }

      const fullPrompt = `${WRITING_SYSTEM_PROMPT}\n\n---\n\n${systemPrompt}`
      const userPrompt = userPromptBuilder ? userPromptBuilder(req.body || {}) : JSON.stringify(req.body || {})

      // 输入审核
      if (userId) {
        const inputMod = await moderateText(userPrompt, { stage: 'input', endpoint, userId })
        if (!inputMod.passed) {
          await recordViolation({ userId, stage: 'input', endpoint, content: userPrompt, result: inputMod })
          const blocked: LlmBlockedResponse = {
            ok: false, source: 'moderation', blocked: true, stage: 'input',
            error: `输入内容违规：${inputMod.reason}`, riskLevel: inputMod.riskLevel,
          }
          return res.status(403).json(blocked)
        }
      }

      const text = await callLlm(fullPrompt, userPrompt)
      // 检测是否走了 fallback 模板（无 API Key）
      const isPlaceholder = text.startsWith('（LLM 未配置 API Key')
      if (isPlaceholder) {
        throw new Error('LLM 未配置 API Key，返回占位内容')
      }

      // 输出审核：真实 LLM 输出文本
      if (userId) {
        const outputMod = await moderateText(text, { stage: 'output', endpoint, userId })
        if (!outputMod.passed) {
          await recordViolation({ userId, stage: 'output', endpoint, content: text, result: outputMod })
          const data = fallback(req.body || {}, new Error('输出内容违规被拦截'))
          const response: LlmFallbackResponse<T> = {
            ok: false, source: 'template', placeholder: true,
            fallbackReason: '输出内容违规被拦截', error: '输出内容违规被拦截', data,
          }
          return res.json(response)
        }
      }

      const data = transform ? transform(text, req.body || {}) : ({ content: text } as unknown as T)
      const response: LlmSuccessResponse<T> = {
        ok: true,
        source: 'llm',
        placeholder: false,
        data,
      }
      return res.json(response)
    } catch (e: any) {
      const err = e instanceof Error ? e : new Error(String(e))
      const data = fallback(req.body || {}, err)
      const response: LlmFallbackResponse<T> = {
        ok: false,
        source: 'template',
        placeholder: true,
        fallbackReason: err.message,
        error: err.message,
        data,
      }
      return res.json(response)
    }
  }
}
