// LLM 供应商抽象层 — 统一接口，底层可切换 DeepSeek / 通义千问 / OpenAI
//
// 当前实现：DeepSeek API（chat/completions）
// 切换供应商：只需修改本文件的 callLlm 方法

import fetch from 'node-fetch'

const API_KEY = process.env.DEEPSEEK_API_KEY || ''
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'

interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 调用 LLM 生成文本
 * @param systemPrompt 系统提示词
 * @param userPrompt 用户输入
 * @returns 模型返回的文本
 */
export async function callLlm(systemPrompt: string, userPrompt: string): Promise<string> {
  // 无 API Key 时走 fallback 模板
  if (!API_KEY) {
    return fallbackTemplate(systemPrompt, userPrompt)
  }

  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('[LLM] API error:', res.status, errText)
    return fallbackTemplate(systemPrompt, userPrompt)
  }

  const data = await res.json() as any
  return data?.choices?.[0]?.message?.content || ''
}

/**
 * 调用 LLM 并解析为 JSON
 * 在 prompt 中要求模型返回 JSON，此处自动解析
 */
export async function callLlmJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const text = await callLlm(systemPrompt, userPrompt)
  // 提取 JSON 块（模型可能包裹在 ```json ... ``` 中）
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/)
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]).trim() : text.trim()
  try {
    return JSON.parse(jsonStr) as T
  } catch {
    console.error('[LLM] JSON parse failed, raw:', text.slice(0, 200))
    throw new Error('LLM 返回内容无法解析为 JSON')
  }
}

// 无 API Key 时的模板兜底（保证接口可用，但结果为占位文本）
function fallbackTemplate(system: string, user: string): string {
  return `（LLM 未配置 API Key，返回占位内容）\n系统提示：${system.slice(0, 50)}…\n用户输入：${user.slice(0, 50)}…`
}
