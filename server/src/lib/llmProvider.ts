// LLM 供应商抽象层 — 统一接口，底层可切换 智谱 GLM-4-Flash / Pollinations / OpenAI 兼容端点
//
// 当前实现：多供应商支持，通过 LLM_PROVIDER 环境变量切换：
//   - zhipu       智谱 GLM-4-Flash（永久免费，中文最强，推荐）— https://open.bigmodel.cn
//   - pollinations Pollinations API（匿名免费）
// 切换供应商：设置 LLM_PROVIDER=<provider> + 对应 API Key

import fetch from 'node-fetch'

// ---- 供应商配置 ----
type LlmProviderName = 'zhipu' | 'pollinations'

const LLM_PROVIDER = (process.env.LLM_PROVIDER as LlmProviderName) || 'zhipu'

// 智谱配置 — GLM-4-Flash 永久免费、无 Token 上限
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || ''
const ZHIPU_BASE_URL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'
const ZHIPU_MODEL = process.env.ZHIPU_LLM_MODEL || 'glm-4-flash'

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
 * @returns 模型返回的文本
 */
export async function callLlm(systemPrompt: string, userPrompt: string): Promise<string> {
  // 无 API Key 时走 fallback 模板
  if (!ACTIVE.key) {
    console.warn(`[LLM] ${ACTIVE.name} 供应商未配置 API Key，走模板兜底`)
    return fallbackTemplate(systemPrompt, userPrompt)
  }

  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const res = await fetch(`${ACTIVE.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ACTIVE.key}`,
    },
    body: JSON.stringify({
      model: ACTIVE.model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error(`[LLM] ${ACTIVE.name} API error:`, res.status, errText)
    return fallbackTemplate(systemPrompt, userPrompt)
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
export async function callLlmJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const text = await callLlm(systemPrompt, userPrompt)
  // 提取 JSON 块：优先 ```json``` 围栏，否则用平衡括号提取（H14）
  const fenced = text.match(/```json\s*([\s\S]*?)```/)
  const jsonStr = (fenced ? fenced[1] : extractBalancedJson(text) ?? text).trim()
  try {
    return JSON.parse(jsonStr) as T
  } catch {
    console.error('[LLM] JSON parse failed, raw:', text.slice(0, 200))
    throw new Error('LLM 返回内容无法解析为 JSON')
  }
}

/**
 * 获取可用模型列表（免鉴权；智谱无公开列表端点，返回静态配置）
 */
export async function listModels(): Promise<{ id: string; type: string }[]> {
  if (ACTIVE.name === 'zhipu') {
    return [{ id: ZHIPU_MODEL, type: 'chat' }]
  }
  try {
    const res = await fetch(`${ACTIVE.baseUrl}/models`)
    if (!res.ok) return []
    const data = await res.json() as any[]
    return (data || []).map((m) => ({ id: m.id || m.name || '', type: m.type || m.object || '' }))
  } catch {
    return []
  }
}

// 无 API Key 时的模板兜底（保证接口可用，但结果为占位文本）
function fallbackTemplate(system: string, user: string): string {
  return `（LLM 未配置 API Key，返回占位内容）\n系统提示：${system.slice(0, 50)}…\n用户输入：${user.slice(0, 50)}…`
}
