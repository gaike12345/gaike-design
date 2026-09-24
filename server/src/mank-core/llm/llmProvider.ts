// LLM 供应商抽象层 — 统一接口，底层可切换 智谱 GLM-4.7-Flash / Pollinations / OpenAI 兼容端点
//
// 当前实现：多供应商支持，通过 LLM_PROVIDER 环境变量切换：
//   - zhipu       智谱 GLM-4.7-Flash（免费，中文最强，推荐）— https://open.bigmodel.cn
//   - pollinations Pollinations API（匿名免费）
// 切换供应商：设置 LLM_PROVIDER=<provider> + 对应 API Key

import fetch from 'node-fetch'
import logger from '../../mank-infra/logging/logger'
import { BusinessError, ForbiddenError } from '../../mank-common/errors'
import { detectPromptInjection, wrapSystemPromptWithBoundary } from './promptInjection'

// ---- 供应商配置 ----
type LlmProviderName = 'zhipu' | 'pollinations'

const LLM_PROVIDER = (process.env.LLM_PROVIDER as LlmProviderName) || 'zhipu'

// 智谱配置 — GLM-4.7-Flash 免费（200K 上下文 / 128K 输出）
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || ''
const ZHIPU_BASE_URL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'
const ZHIPU_MODEL = process.env.ZHIPU_LLM_MODEL || 'glm-4.7-flash'

// Pollinations 配置（备用）
const API_KEY = process.env.POLLINATIONS_API_KEY || ''
const BASE_URL = process.env.POLLINATIONS_BASE_URL || 'https://gen.pollinations.ai/v1'
const MODEL = process.env.POLLINATIONS_LLM_MODEL || 'openai'

// 当前生效供应商的最终配置
const ACTIVE = LLM_PROVIDER === 'zhipu'
  ? { key: ZHIPU_API_KEY, baseUrl: ZHIPU_BASE_URL, model: ZHIPU_MODEL, name: 'zhipu' as const }
  : { key: API_KEY, baseUrl: BASE_URL, model: MODEL, name: 'pollinations' as const }

interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 调用 LLM 生成文本（OpenAI 兼容格式）
 * @param systemPrompt 系统提示词
 * @param userPrompt 用户输入
 * @param model 可选：指定模型名称，覆盖默认配置
 * @returns 模型返回的文本
 */
export async function callLlm(systemPrompt: string, userPrompt: string, model?: string): Promise<string> {
  // === Prompt Injection 检测（确定性防御层）===
  // 检测高严重度的注入模式 → 直接抛错拦截，不会到达 LLM
  const injectionCheck = detectPromptInjection(userPrompt)
  if (injectionCheck.detected && injectionCheck.severity === 'high') {
    logger.warn('LLM 调用被 prompt injection 拦截', {
      pattern: injectionCheck.matchedPattern,
      severity: injectionCheck.severity,
    })
    throw new ForbiddenError('请求包含可疑的系统指令覆盖尝试，请修改后重试')
  }

  // 中/低严重度：记录日志但继续（避免误杀正常创作）
  if (injectionCheck.detected && injectionCheck.severity !== 'high') {
    logger.info('LLM 调用检测到弱信号注入模式，已审计放行', {
      pattern: injectionCheck.matchedPattern,
      severity: injectionCheck.severity,
    })
  }

  // === System prompt 边界标记 ===
  // 在 system prompt 前后加入显式边界 + 指令覆盖声明
  // 这是 defense-in-depth，真正的安全靠上面的确定性检测
  const safeSystemPrompt = wrapSystemPromptWithBoundary(systemPrompt)

  // 无 API Key 时走 fallback 模板
  if (!ACTIVE.key) {
    logger.warn('LLM 供应商未配置 API Key，使用模板兜底', { provider: ACTIVE.name })
    return fallbackTemplate(safeSystemPrompt, userPrompt)
  }

  const messages: LlmMessage[] = [
    { role: 'system', content: safeSystemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const activeModel = model || ACTIVE.model

  // GLM-4.5+ 系列默认开启深度思考，命令解析类任务无需推理链，
  // 显式关闭（实测响应 ~7s → ~0.5s）；旧模型不认识该字段，按模型名判断是否下发
  const disableThinking = ACTIVE.name === 'zhipu' && /glm-4\.[5-9]/.test(activeModel)

  let res: Awaited<ReturnType<typeof fetch>>
  let attempt = 0
  for (;;) {
    res = await fetch(`${ACTIVE.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACTIVE.key}`,
      },
      body: JSON.stringify({
        model: activeModel,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        ...(disableThinking ? { thinking: { type: 'disabled' } } : {}),
      }),
    })
    // 免费模型高峰期常见 429（错误码 1305）与网关瞬时错误：退避重试后仍失败才降级
    if (res.ok || ![429, 502, 503].includes(res.status) || attempt >= 2) break
    attempt++
    const backoffMs = 1500 * attempt
    logger.warn('LLM API 瞬时错误，退避重试', {
      provider: ACTIVE.name,
      model: activeModel,
      status: res.status,
      attempt,
      backoffMs,
    })
    await new Promise((resolve) => setTimeout(resolve, backoffMs))
  }

  if (!res.ok) {
    const errText = await res.text()
    logger.error('LLM API 调用失败', { provider: ACTIVE.name, status: res.status, error: errText.slice(0, 200) })
    return fallbackTemplate(safeSystemPrompt, userPrompt)
  }

  const data = await res.json() as any
  return data?.choices?.[0]?.message?.content || ''
}

/**
 * 从文本中提取第一个平衡的 JSON 块（H14：替代贪婪正则）
 *
 * 旧实现 `\{[\s\S]*\}` 是贪婪匹配，遇到「JSON + 尾部含 } 的说明文字」
 * 会把中间的非 JSON 文本一并吞掉导致解析失败；改非贪婪 `\{[\s\S]*?\}`
 * 又会在嵌套对象 `{"a":{"b":1}}` 上截断到第一个 `}`。
 *
 * 此函数用括号深度计数找到第一个结构平衡的 `{...}` / `[...]`，
 * 正确处理嵌套对象/数组与尾部文本。
 */
function extractBalancedJson(text: string): string | null {
  const start = text.search(/[\[{]/)
  if (start === -1) return null
  const open = text[start] as '{' | '['
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (escape) { escape = false }
      else if (ch === '\\') { escape = true }
      else if (ch === '"') { inStr = false }
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/**
 * 调用 LLM 并解析为 JSON
 * 在 prompt 中要求模型返回 JSON，此处自动解析
 */
export async function callLlmJson<T>(systemPrompt: string, userPrompt: string, model?: string): Promise<T> {
  const text = await callLlm(systemPrompt, userPrompt, model)
  // 提取 JSON 块：优先 ```json``` 围栏，否则用平衡括号提取（H14）
  const fenced = text.match(/```json\s*([\s\S]*?)```/)
  const jsonStr = (fenced ? fenced[1] : extractBalancedJson(text) ?? text).trim()
  try {
    return JSON.parse(jsonStr) as T
  } catch {
    logger.error('LLM 返回 JSON 解析失败', { raw: text.slice(0, 200) })
    throw new BusinessError('LLM 返回内容无法解析为 JSON')
  }
}

// 无 API Key 或 API 调用失败时的安全兜底
// 不回显任何 system prompt 或用户输入，防止敏感创作内容泄露到前端
function fallbackTemplate(_system: string, _user: string): string {
  return '（AI 服务暂未配置或调用失败，返回占位内容）请联系管理员开通 AI 功能。'
}
