// 创作画布 · 智能对话助手 — LLM 命令解析（只建议，不执行）
//
// 设计铁律（ADR「模型提议，应用裁决」）：
//   1. LLM 输出契约中不存在 model 字段——模型永远由用户在界面中亲自选择
//   2. LLM 只输出命令建议；唯一执行入口是前端既有 runImageGen / runVideoGen
//   3. 解析结果要么是合法命令集，要么是纯文本降级，任何异常路径绝不 500
//
// 与小说 LLM 接口（llmRouteJson）的差异：
//   不继承 WRITING_SYSTEM_PROMPT（画布命令解析与小说方法论无关）、
//   不注入 buildWorkContext 作品上下文（body 无作品字段）、不读取 body.model

import { z } from 'zod'
import type { Request, Response, NextFunction } from 'express'
import { cfgBool } from '../../mank-infra/config/siteConfig'

// 提示词版本：改动 CANVAS_AGENT_SYSTEM_PROMPT 时必须同步递增（日志可追踪提示词迭代）
export const CANVAS_AGENT_PROMPT_VERSION = '1'

/** 单条命令建议（不含 model 字段——契约禁止，归一化时会剥离一切契约外字段） */
export interface AgentCommand {
  type: 'image' | 'video'
  prompt: string
  ratio?: string
  batch?: number
  duration?: number
  resolution?: string
  negativePrompt?: string
  useReference?: boolean
}

export interface AgentData {
  reply: string
  commands: AgentCommand[]
}

// 宽进严出：schema 只做「结构合法性」守门（类型/必填），紧缩（截断/钳制）由 normalizeAgentData 统一执行。
// 若把上限写进 schema，LLM 输出 batch=99 这类越界参数会导致整条命令被丢弃——钳制保留用户意图比丢弃更合理。
const AgentCommandSchema = z.object({
  type: z.enum(['image', 'video']),
  prompt: z.string().min(1),
  ratio: z.string().optional(),
  batch: z.number().finite().optional(),
  duration: z.number().finite().optional(),
  resolution: z.string().optional(),
  negativePrompt: z.string().optional(),
  useReference: z.boolean().optional(),
})

// ===== 系统提示词（版本化；「三条铁律」受单测锁定，改动前先看 canvasAgent.test.ts） =====
export const CANVAS_AGENT_SYSTEM_PROMPT = [
  '你是 Man TV 创作画布的智能助手。你的唯一职责：把用户的自然语言创作需求解析为图像/视频生成命令建议（JSON）。命令会展示给用户确认，确认后由用户在界面中亲自选择模型并执行。',
  '',
  '【三条铁律（违反任何一条即视为失败）】',
  '1. 你不能选择模型：输出中绝不允许出现任何模型名称或 model 字段。',
  '2. 你不能执行任何操作：你只输出建议，绝不说"已生成/已完成"。',
  '3. 你只输出一个 JSON 对象：不要 markdown 代码围栏、不要解释文字。',
  '',
  '【输出格式】',
  '{"reply": "中文简短说明（不超过300字）", "commands": [{"type": "image或video", "prompt": "英文提示词", "ratio": "1:1", "batch": 1, "duration": 5, "negativePrompt": "", "useReference": false}]}',
  '',
  '【字段规则】',
  '- type：静态画面用 "image"，动态视频/动画用 "video"。',
  '- prompt：必须写成高质量英文提示词（主体+场景+光影+构图+风格+质量词）；用户明确要求画面中出现文字时，文字内容保留原语言。',
  '- ratio：画面比例（如 1:1 / 16:9 / 9:16 / 4:3 / 3:4），仅在用户明确提及时填写。',
  '- batch：生成张数（1-9 整数），仅用于 image，仅在用户明确提及时填写。',
  '- duration：时长秒数（1-120 整数），仅用于 video，仅在用户明确提及时填写。',
  '- negativePrompt：英文负面提示词，仅在用户明确提及时填写。',
  '- useReference：仅当用户要求"参考当前选中节点/这张图/这段视频"时填 true，否则省略。',
  '- 未提及的参数一律省略，禁止编造默认值。',
  '',
  '【数量与降级】',
  '- commands 最多 5 条；用户要求数量超出时，在 reply 中说明只保留前 5 条。',
  '- 用户闲聊、提问、要求改写文字或无法映射为生成命令时：commands 返回空数组 []，用 reply 正常回答。',
  '- 用户要求生成违规内容时：commands 返回空数组 []，用 reply 礼貌说明无法协助。',
].join('\n')

// ===== 用户提示词构造（防御性处理：所有字段来自不可信 body，一律转型 + 截断） =====
export function buildAgentUserPrompt(body: any): string {
  const b = body && typeof body === 'object' ? body : {}
  const message = String(b.message ?? '').slice(0, 2000)
  const selected = b.selectedNodeType === 'image' || b.selectedNodeType === 'video' ? b.selectedNodeType : 'none'
  const lines: string[] = []
  if (selected === 'image') {
    lines.push('【当前选中节点】图像节点（用户说"参考它/这个画面"时指这张图）')
  } else if (selected === 'video') {
    lines.push('【当前选中节点】视频节点（用户说"参考它/这个画面"时指这段视频）')
  } else {
    lines.push('【当前选中节点】无（用户说"参考它"但未选中节点时，请在 reply 中请他先在画布中选中一个节点）')
  }
  const history: unknown[] = Array.isArray(b.history) ? b.history.slice(-10) : []
  if (history.length > 0) {
    lines.push('【对话历史】（仅供理解上下文）')
    for (const h of history) {
      const role = h && typeof h === 'object' && (h as any).role === 'assistant' ? '助手' : '用户'
      const content = String(h && typeof h === 'object' ? (h as any).content ?? '' : '').slice(0, 500)
      if (content) lines.push(`${role}: ${content}`)
    }
  }
  lines.push(`【用户最新消息】\n${message}`)
  return lines.join('\n\n')
}

// ===== 命令清洗：LLM 常见脏数据（字符串数字 / 大小写 type / null 字段 / 纯数字 prompt） =====
function coerceCommand(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const c = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}
  if (typeof c.type === 'string') out.type = c.type.trim().toLowerCase()
  if (typeof c.prompt === 'string') out.prompt = c.prompt.trim()
  else if (typeof c.prompt === 'number') out.prompt = String(c.prompt)
  for (const k of ['ratio', 'resolution', 'negativePrompt'] as const) {
    const v = c[k]
    if (typeof v === 'string' && v.trim()) out[k] = v.trim()
  }
  for (const k of ['batch', 'duration'] as const) {
    const v = c[k]
    if (v == null || v === '') continue
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    if (Number.isFinite(n)) out[k] = n
  }
  if (typeof c.useReference === 'boolean') out.useReference = c.useReference
  else if (c.useReference === 'true') out.useReference = true
  else if (c.useReference === 'false') out.useReference = false
  return out
}

// ===== 解析 LLM 原始输出 → AgentData（命令级容错：坏命令丢弃不影响好命令；不可解析返回 null，由调用方兜底） =====
export function normalizeAgentData(raw: unknown): AgentData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const reply = typeof obj.reply === 'string' ? obj.reply.trim().slice(0, 2000) : ''
  const rawCommands = Array.isArray(obj.commands) ? obj.commands.slice(0, 5) : []
  const commands: AgentCommand[] = []
  for (const rc of rawCommands) {
    const coerced = coerceCommand(rc)
    if (!coerced) continue
    const parsed = AgentCommandSchema.safeParse(coerced)
    if (!parsed.success) continue
    const c = parsed.data
    commands.push({
      type: c.type,
      prompt: c.prompt.slice(0, 2000),
      ratio: c.ratio?.slice(0, 16),
      resolution: c.resolution?.slice(0, 16),
      negativePrompt: c.negativePrompt?.slice(0, 500),
      batch: c.batch != null ? Math.min(9, Math.max(1, Math.round(c.batch))) : undefined,
      duration: c.duration != null ? Math.min(120, Math.max(1, Math.round(c.duration))) : undefined,
      useReference: c.useReference,
    })
  }
  const finalReply = reply || (commands.length > 0 ? '已根据你的需求整理出以下命令建议，请确认参数后执行。' : '')
  if (!finalReply) return null
  return { reply: finalReply, commands }
}

// ===== 兜底数据工厂（无 API Key / LLM 失败 / 解析失败统一走此文案，不回显内部错误细节） =====
export function agentFallbackData(_body: any, _err: Error): AgentData {
  return {
    reply: '智能助手暂时不可用（AI 服务未配置或调用失败）。你可以先在画布节点面板中手动填写提示词并选择模型生成，稍后再来找我。',
    commands: [],
  }
}

// ===== Kill switch（站点配置 safety.canvas_agent_enabled，关闭后接口立即 403 下线） =====
const CANVAS_AGENT_SWITCH_KEY = 'safety.canvas_agent_enabled'

export async function canvasAgentGuard(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const enabled = await cfgBool(CANVAS_AGENT_SWITCH_KEY, true)
    if (!enabled) {
      res.status(403).json({ ok: false, error: '画布智能助手已暂时关闭' })
      return
    }
    next()
  } catch (e) {
    next(e)
  }
}
