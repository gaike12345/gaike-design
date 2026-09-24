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
import { CANVAS_AGENT_SYSTEM_PROMPT, buildAgentUserPrompt, normalizeAgentData, agentFallbackData, type AgentData } from './canvasAgent'
import { moderateText, recordViolation, checkUserRiskGate } from '../../mank-core/moderation/moderation'
import logger from '../../mank-infra/logging/logger'
import { BusinessError } from '../../mank-common/errors'

/**
 * 构建作品上下文前缀（Phase 5：上下文注入机制）
 *
 * 从 req.body 中读取所有已有的作品信息（topic, synopsis, masterOutline,
 * characters, characterRelations, worldview, lorebook, timeline, foreshadowing），
 * 拼接成结构化上下文前缀，注入到 userPrompt 之前，让 LLM 在生成时间线、
 * 伏笔等后续接口时能够引用已有元素编号（JS1 / T1 / F1 等）。
 *
 * 该函数返回的字符串会作为 userPrompt 的前缀，后接 `---` 分隔符。
 * 当 body 中没有任何可识别的作品字段时，返回空字符串，避免产生无意义的前缀。
 */
function buildWorkContext(body: any): string {
  if (!body || typeof body !== 'object') return ''
  const lines: string[] = []
  if (body.topic) lines.push(`【创作主题】\n${body.topic}`)
  if (body.synopsis) lines.push(`【故事方向】\n${body.synopsis}`)
  if (body.masterOutline) lines.push(`【总纲】\n${JSON.stringify(body.masterOutline)}`)
  if (body.characters) lines.push(`【角色列表】\n${JSON.stringify(body.characters)}`)
  if (body.characterRelations) lines.push(`【角色关系】\n${JSON.stringify(body.characterRelations)}`)
  if (body.worldview) lines.push(`【世界观】\n${JSON.stringify(body.worldview)}`)
  if (body.lorebook) lines.push(`【设定库】\n${JSON.stringify(body.lorebook)}`)
  if (body.timeline) lines.push(`【时间线】\n${JSON.stringify(body.timeline)}`)
  if (body.foreshadowing) lines.push(`【伏笔表】\n${JSON.stringify(body.foreshadowing)}`)
  return lines.length > 0 ? lines.join('\n\n') + '\n\n---\n\n' : ''
}

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

interface PipelineContext {
  req: Request
  res: Response
  userId: string | undefined
  endpoint: string
  userPrompt: string
  systemPrompt: string
  fallback: (body: any, err: Error) => any
}

/**
 * 构建风控拦截响应
 */
function buildBlockedResponse(
  stage: 'input' | 'output',
  reason: string,
  riskLevel: 'low' | 'medium' | 'high',
  riskUserLevel?: number,
): LlmBlockedResponse {
  return {
    ok: false,
    source: 'moderation',
    blocked: true,
    stage,
    error: stage === 'input' ? `输入内容违规：${reason}` : `输出内容违规：${reason}`,
    riskLevel,
    riskUserLevel,
  }
}

/**
 * 构建兜底响应
 */
function buildFallbackResponse<T>(
  data: T,
  reason: string,
): LlmFallbackResponse<T> {
  return {
    ok: false,
    source: 'template',
    placeholder: true,
    fallbackReason: reason,
    error: reason,
    data,
  }
}

/**
 * 构建成功响应
 */
function buildSuccessResponse<T>(data: T, placeholder = false): LlmSuccessResponse<T> {
  return {
    ok: true,
    source: 'llm',
    placeholder,
    data,
  }
}

/**
 * 执行 LLM 调用前的公共检查：风险门控 + 输入审核
 * 返回 null 表示通过；返回 LlmBlockedResponse 表示被拦截
 */
async function runPreChecks(ctx: PipelineContext): Promise<LlmBlockedResponse | null> {
  const { userId, endpoint, userPrompt } = ctx

  // 风险等级门控：riskLevel≥3 拒绝 AI 生成
  if (userId) {
    const gate = await checkUserRiskGate(userId)
    if (!gate.allowed) {
      return buildBlockedResponse('input', gate.message || '账号已被限制 AI 生成', 'high', gate.riskLevel)
    }
  }

  // 输入审核：用户 prompt 发送给模型之前
  if (userId) {
    const inputMod = await moderateText(userPrompt, { stage: 'input', endpoint, userId })
    if (!inputMod.passed) {
      await recordViolation({ userId, stage: 'input', endpoint, content: userPrompt, result: inputMod })
      return buildBlockedResponse('input', inputMod.reason, inputMod.riskLevel)
    }
  }

  return null
}

/**
 * 执行 LLM 调用后的公共检查：输出审核
 * 返回 null 表示通过；返回 LlmFallbackResponse 表示被拦截
 */
async function runPostChecks(
  ctx: PipelineContext,
  outputText: string,
): Promise<LlmFallbackResponse<any> | null> {
  const { userId, endpoint, fallback, req } = ctx

  if (userId) {
    const outputMod = await moderateText(outputText, { stage: 'output', endpoint, userId })
    if (!outputMod.passed) {
      await recordViolation({ userId, stage: 'output', endpoint, content: outputText, result: outputMod })
      const data = fallback(req.body || {}, new Error('输出内容违规被拦截'))
      return buildFallbackResponse(data, '输出内容违规被拦截')
    }
  }

  return null
}

/**
 * 统一的 LLM 管道执行器
 * @param ctx 管道上下文
 * @param callFn 实际的 LLM 调用函数（JSON 模式或文本模式），返回最终 data
 * @param getOutputText 从 LLM 结果中提取用于输出审核的文本
 */
async function runLlmPipeline<T>(
  ctx: PipelineContext,
  callFn: () => Promise<T>,
  getOutputText: (result: T) => string,
): Promise<LlmSuccessResponse<T> | LlmFallbackResponse<T> | LlmBlockedResponse> {
  // 前置检查：风控 + 输入审核
  const blocked = await runPreChecks(ctx)
  if (blocked) return blocked

  // 调用 LLM
  const result = await callFn()

  // 后置检查：输出审核
  const fallbackResp = await runPostChecks(ctx, getOutputText(result))
  if (fallbackResp) return fallbackResp as LlmFallbackResponse<T>

  return buildSuccessResponse(result)
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
    const fullPrompt = `${WRITING_SYSTEM_PROMPT}\n\n---\n\n${systemPrompt}`
    // Phase 5：在 userPrompt 前注入已有作品上下文（topic/synopsis/characters/worldview/timeline/foreshadowing 等），
    // 让 LLM 在生成时间线、伏笔等后续接口时能够引用已有元素编号（JS1 / T1 / F1 等）。
    const userPrompt = userPromptBuilder
      ? buildWorkContext(req.body || {}) + userPromptBuilder(req.body || {})
      : buildWorkContext(req.body || {}) + JSON.stringify(req.body || {})
    const model = (req.body?.model as string) || undefined

    const ctx: PipelineContext = { req, res, userId, endpoint, userPrompt, systemPrompt: fullPrompt, fallback }

    try {
      const result = await runLlmPipeline<T>(
        ctx,
        () => callLlmJson<T>(fullPrompt, userPrompt, model),
        (data) => JSON.stringify(data),
      )

      if ((result as LlmBlockedResponse).blocked) {
        return res.status(403).json(result)
      }
      return res.json(result)
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e))
      logger.debug('LLM 路由返回兜底内容', { endpoint, reason: err.message })
      return res.json(buildFallbackResponse(fallback(req.body || {}, err), err.message))
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
    const fullPrompt = `${WRITING_SYSTEM_PROMPT}\n\n---\n\n${systemPrompt}`
    // Phase 5：在 userPrompt 前注入已有作品上下文（topic/synopsis/characters/worldview/timeline/foreshadowing 等），
    // 让 LLM 在生成时间线、伏笔等后续接口时能够引用已有元素编号（JS1 / T1 / F1 等）。
    const userPrompt = userPromptBuilder
      ? buildWorkContext(req.body || {}) + userPromptBuilder(req.body || {})
      : buildWorkContext(req.body || {}) + JSON.stringify(req.body || {})
    const model = (req.body?.model as string) || undefined

    const ctx: PipelineContext = { req, res, userId, endpoint, userPrompt, systemPrompt: fullPrompt, fallback }

    try {
      const result = await runLlmPipeline<string>(
        ctx,
        async () => {
          const text = await callLlm(fullPrompt, userPrompt, model)
          // 检测是否走了 fallback 模板（无 API Key）
          if (text.startsWith('（LLM 未配置 API Key')) {
            throw new BusinessError('LLM 未配置 API Key，返回占位内容')
          }
          return text
        },
        (text) => text,
      )

      if ((result as LlmBlockedResponse).blocked) {
        return res.status(403).json(result)
      }

      // 文本模式：将 LLM 返回的字符串转换为最终 data 结构
      if (result.ok) {
        const data = transform
          ? transform(result.data as string, req.body || {})
          : ({ content: result.data } as unknown as T)
        return res.json(buildSuccessResponse(data))
      }

      return res.json(result)
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e))
      logger.debug('LLM 路由返回兜底内容', { endpoint, reason: err.message })
      return res.json(buildFallbackResponse(fallback(req.body || {}, err), err.message))
    }
  }
}

/**
 * 创建"画布智能助手"专用的 LLM 路由 handler（llmRouteJson 的画布变体）
 *
 * 与 llmRouteJson 的三点差异（画布命令解析不能被小说写作前置污染）：
 *   1. 系统提示词原样使用，不拼接 WRITING_SYSTEM_PROMPT
 *   2. userPrompt 由 buildAgentUserPrompt 构造，不注入 buildWorkContext 作品上下文
 *   3. 不读取 req.body.model —— 画布助手契约中不存在 model 字段，模型永远由用户亲自选择
 *
 * 容错链路：callLlmJson 返回未校验的任意 JSON → normalizeAgentData 逐命令清洗/裁剪/校验
 * → 归一化失败（null）或任何异常 → agentFallbackData 兜底（HTTP 200 ok:false，绝不 500）
 */
export function llmRouteAgentJson() {
  return async (req: Request, res: Response) => {
    const userId = (req as any).user?.userId as string | undefined
    const endpoint = req.path
    const systemPrompt = CANVAS_AGENT_SYSTEM_PROMPT
    const userPrompt = buildAgentUserPrompt(req.body || {})
    const fallback = agentFallbackData

    const ctx: PipelineContext = { req, res, userId, endpoint, userPrompt, systemPrompt, fallback }

    try {
      const result = await runLlmPipeline<AgentData>(
        ctx,
        async () => {
          const raw = await callLlmJson<unknown>(systemPrompt, userPrompt, undefined)
          const normalized = normalizeAgentData(raw)
          if (!normalized) {
            throw new BusinessError('LLM 返回内容无法解析为画布命令建议')
          }
          return normalized
        },
        (data) => JSON.stringify(data),
      )

      if ((result as LlmBlockedResponse).blocked) {
        return res.status(403).json(result)
      }
      return res.json(result)
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e))
      logger.debug('画布助手路由返回兜底内容', { endpoint, reason: err.message })
      return res.json(buildFallbackResponse(fallback(req.body || {}, err), err.message))
    }
  }
}
