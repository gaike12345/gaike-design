// 创作画布智能助手 — 会话状态
//
// 设计要点（ADR「模型提议，应用裁决」）：
// - 会话仅本地持久化（localStorage，v1 不上 DB），清除浏览器数据即清除
// - LLM 只产出命令建议，执行必须经确认制命令卡片 → agentExecutor
// - 任何请求异常都降级为一条普通助手消息，绝不让面板崩溃

import { create } from 'zustand'
import { canvasAgentChat, type AgentCommand } from '../services/textApi'
import { uid } from './canvasBase'

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** assistant 消息携带的命令建议（仅 LLM 正常响应时有值） */
  commands?: AgentCommand[]
  /** true = 后端降级（模板兜底）响应，UI 显示降级标记 */
  degraded?: boolean
  /** true = 内容审核拦截 */
  blocked?: boolean
}

const STORAGE_KEY = 'manktv_canvas_agent_session_v1'
const MAX_PERSISTED_MESSAGES = 60
const HISTORY_WINDOW = 10
const HISTORY_CONTENT_LIMIT = 500
const MESSAGE_LIMIT = 2000

interface PersistedSession {
  v: 1
  messages: AgentMessage[]
}

function isValidMessage(m: unknown): m is AgentMessage {
  if (!m || typeof m !== 'object') return false
  const msg = m as Partial<AgentMessage>
  return (
    (msg.role === 'user' || msg.role === 'assistant') &&
    typeof msg.content === 'string' &&
    typeof msg.id === 'string'
  )
}

function loadSession(): AgentMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PersistedSession
    if (parsed?.v !== 1 || !Array.isArray(parsed.messages)) return []
    return parsed.messages.filter(isValidMessage).slice(-MAX_PERSISTED_MESSAGES)
  } catch {
    return []
  }
}

function saveSession(messages: AgentMessage[]) {
  try {
    const payload: PersistedSession = { v: 1, messages: messages.slice(-MAX_PERSISTED_MESSAGES) }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // 配额超限或隐私模式：本地持久化失败不影响核心功能
  }
}

interface AgentState {
  open: boolean
  messages: AgentMessage[]
  sending: boolean
  setOpen: (v: boolean) => void
  send: (text: string, selectedNodeType?: 'image' | 'video') => Promise<void>
  clearSession: () => void
}

export const useAgentStore = create<AgentState>((set, get) => ({
  open: false,
  messages: loadSession(),
  sending: false,

  setOpen: (v) => set({ open: v }),

  clearSession: () => {
    saveSession([])
    set({ messages: [] })
  },

  send: async (text, selectedNodeType) => {
    const trimmed = text.trim().slice(0, MESSAGE_LIMIT)
    if (!trimmed || get().sending) return

    // 上下文：最近 10 条历史（与后端 buildAgentUserPrompt 的窗口一致）
    const history = get()
      .messages.filter((m) => !m.blocked && m.content)
      .slice(-HISTORY_WINDOW)
      .map((m) => ({ role: m.role, content: m.content.slice(0, HISTORY_CONTENT_LIMIT) }))

    const userMsg: AgentMessage = { id: uid('am'), role: 'user', content: trimmed }
    const assistantId = uid('am')
    const withPending: AgentMessage[] = [
      ...get().messages,
      userMsg,
      { id: assistantId, role: 'assistant', content: '' },
    ]
    set({ messages: withPending, sending: true })

    const patchAssistant = (patch: Partial<AgentMessage>) => {
      const messages = get().messages.map((m) => (m.id === assistantId ? { ...m, ...patch } : m))
      set({ messages, sending: false })
      saveSession(messages)
    }

    try {
      const resp = await canvasAgentChat({ message: trimmed, selectedNodeType, history })
      if (resp.blocked) {
        patchAssistant({ content: resp.error || '内容未通过安全审核，请调整表述后重试。', blocked: true })
        return
      }
      if (resp.data) {
        patchAssistant({
          content: resp.data.reply || '（助手没有返回内容，请换个说法再试。）',
          commands: Array.isArray(resp.data.commands) ? resp.data.commands : [],
          degraded: !resp.ok,
        })
        return
      }
      patchAssistant({ content: resp.error || '请求失败，请稍后重试。' })
    } catch {
      // canvasAgentChat 内部已兜底，理论不会走到这里；防御性处理
      patchAssistant({ content: '网络异常，请稍后重试。' })
    }
  },
}))
