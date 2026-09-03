// 全局客服助手悬浮组件 — AI 驱动的在线客服
//
// 功能：
// - 右下角浮动气泡按钮，点击展开聊天窗口
// - 支持 AI 对话（复用 /api/support/chat）+ 常见问题快捷入口
// - 多轮上下文（保留最近 6 条历史）
// - 演示模式标记（LLM 未配置 Key 时显示 DemoBadge）
// - 全局挂载在 main.tsx，所有页面可用

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageCircle, X, Send, Sparkles, ChevronRight } from 'lucide-react'
import { api } from '../services/api'
import DemoBadge from './ui/DemoBadge'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface FaqItem {
  id: string
  q: string
  a: string
}

const WELCOME: ChatMessage = {
  role: 'assistant',
  content: '你好！我是小漫，Man TV 的智能客服助手。有什么可以帮你的吗？你可以直接提问，或点击下方常见问题快速了解。',
}

export default function SupportWidget() {
  // 客服助手显示规则：
  // - 显示：首页(/)、三大创作预览页(/novel /audio /canvas)、社区(/community)、公开信息页(pricing/about/login/register)
  // - 不显示：所有真正的功能工作区（任何 /workspace/*、/admin、/settings 里的「内部功能区域」）
  const { pathname } = useLocation()
  const isWorkspaceInternal =
    pathname.startsWith('/workspace') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/settings' ||
    pathname.startsWith('/settings/')
  const showWidget = !isWorkspaceInternal
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [faqs, setFaqs] = useState<FaqItem[]>([])
  const [showDemo, setShowDemo] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 加载常见问题
  useEffect(() => {
    api
      .get<{ faqs: FaqItem[] }>('/api/support/faq')
      .then((res) => setFaqs(res?.faqs || []))
      .catch(() => {})
  }, [])

  // 自动滚到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, open])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || loading) return

      const userMsg: ChatMessage = { role: 'user', content: trimmed }
      const history = [...messages.slice(-6), userMsg]
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setLoading(true)

      try {
        const res = await api.post<{ reply: string; placeholder: boolean }>(
          '/api/support/chat',
          { message: trimmed, history: history.map((m) => ({ role: m.role, content: m.content })) },
        )
        setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }])
        if (res.placeholder) setShowDemo(true)
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '抱歉，服务暂时不可用，请稍后再试或联系 13372729368@163.com' },
        ])
      } finally {
        setLoading(false)
      }
    },
    [messages, loading],
  )

  // 点击常见问题
  const handleFaqClick = (faq: FaqItem) => {
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: faq.q },
      { role: 'assistant', content: faq.a },
    ])
  }

  if (!showWidget) return null

  return (
    <>
      {/* 悬浮按钮 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30 transition-all hover:scale-110 hover:shadow-xl"
          aria-label="在线客服"
        >
          <MessageCircle className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-green-500" />
          </span>
        </button>
      )}

      {/* 聊天窗口 */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[520px] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl">
          {/* 头部 */}
          <div className="flex items-center justify-between bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">小漫客服</p>
                <p className="text-[11px] text-white/80">AI 智能助手 · 在线</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 演示模式标记 */}
          {showDemo && (
            <div className="px-4 pt-2">
              <DemoBadge variant="banner" className="!text-[11px]">
                当前为演示模式，回复为模板占位内容，配置 LLM Key 后将对接真实 AI。
              </DemoBadge>
            </div>
          )}

          {/* 消息列表 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-neutral-50">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-indigo-500 text-white rounded-br-md'
                      : 'bg-white text-neutral-700 border border-neutral-200 rounded-bl-md'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* 加载动画 */}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 border border-neutral-200">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-300" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-300" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-300" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {/* 常见问题快捷入口（仅首轮显示） */}
            {messages.length === 1 && faqs.length > 0 && !loading && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-medium text-neutral-400">常见问题</p>
                {faqs.map((faq) => (
                  <button
                    key={faq.id}
                    onClick={() => handleFaqClick(faq)}
                    className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm text-neutral-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    <span>{faq.q}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 输入区 */}
          <div className="border-t border-neutral-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage(input)
                  }
                }}
                placeholder="输入你的问题..."
                className="flex-1 rounded-xl border border-neutral-200 px-3.5 py-2 text-sm outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                disabled={loading}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="发送"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-neutral-400">
              人工客服：13372729368@163.com
            </p>
          </div>
        </div>
      )}
    </>
  )
}
