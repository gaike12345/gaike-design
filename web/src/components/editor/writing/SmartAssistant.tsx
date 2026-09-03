// 智能助手 - AI对话 + 灵感卡片
import { useState } from 'react'
import {
  Bot, Sparkles, Send, Loader2, Copy,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { WritingPaneState } from '../../../store/useScriptStore'
import { useStudioStore as studioStoreHook } from '../../../store/useStudioStore'

interface SmartAssistantProps {
  s: WritingPaneState
  onJumpToImage: () => void
}

/**
 * 智能助手右栏
 * - AI 对话：与小 Man 聊天获取创作建议
 * - 灵感卡片：书名候选、导语、灵感、Prompt 结果等
 */
export function SmartAssistant({ s, onJumpToImage }: SmartAssistantProps) {
  const [tab, setTab] = useState<'chat' | 'cards'>('chat')

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-ink-200">
        <button
          onClick={() => setTab('chat')}
          className={cn(
            'flex-1 py-2 text-xs font-medium',
            tab === 'chat' ? 'bg-violet-50 text-violet-700' : 'text-ink-500'
          )}
        >
          <Bot className="mr-1 inline h-3 w-3" /> AI对话
        </button>
        <button
          onClick={() => setTab('cards')}
          className={cn(
            'flex-1 py-2 text-xs font-medium',
            tab === 'cards' ? 'bg-violet-50 text-violet-700' : 'text-ink-500'
          )}
        >
          <Sparkles className="mr-1 inline h-3 w-3" /> 灵感卡片
        </button>
      </div>

      {tab === 'chat' ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {s.chatMessages.length === 0 && (
              <div className="py-8 text-center text-[10px] text-ink-400">
                向小Man提问，获取创作建议
              </div>
            )}
            {s.chatMessages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'flex',
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px]',
                    m.role === 'user' ? 'bg-violet-600 text-white' : 'bg-ink-100 text-ink-700'
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {s.chatStatus === 'running' && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-ink-100 px-2.5 py-1.5 text-[11px] text-ink-500">
                  <Loader2 className="inline h-3 w-3 animate-spin" /> 思考中…
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-ink-200 p-2">
            <div className="flex items-center gap-1">
              <input
                value={s.chatInput}
                onChange={(e) => s.setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    s.runSmartChat()
                  }
                }}
                placeholder="问小Man…"
                className="input flex-1 !py-1 text-[11px]"
              />
              <button
                onClick={s.runSmartChat}
                disabled={!s.chatInput.trim() || s.chatStatus === 'running'}
                className="btn-primary !px-2 !py-1"
              >
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {/* 书名候选 */}
          {s.bookTitles.length > 0 && (
            <div className="card p-2">
              <div className="mb-1 text-[10px] font-medium text-ink-500">书名候选</div>
              {s.bookTitles.map((t, i) => (
                <button
                  key={i}
                  onClick={() => navigator.clipboard?.writeText(t)}
                  className="block w-full rounded px-2 py-1 text-left text-[11px] text-ink-700 hover:bg-ink-50"
                >
                  {t} <Copy className="ml-1 inline h-2.5 w-2.5 text-ink-400" />
                </button>
              ))}
            </div>
          )}
          {/* 导语 */}
          {s.openingLineResult && (
            <div className="card p-2">
              <div className="mb-1 text-[10px] font-medium text-ink-500">导语</div>
              <p className="text-[11px] italic text-ink-700">{s.openingLineResult}</p>
            </div>
          )}
          {/* 灵感 */}
          {s.inspirationData?.ideas.map((idea, i) => (
            <div key={i} className="card p-2">
              <div className="text-[11px] font-medium text-ink-800">{idea.title}</div>
              <p className="mt-0.5 text-[10px] text-ink-500">{idea.synopsis}</p>
              <div className="mt-1 flex flex-wrap gap-0.5">
                {idea.tags.map((t, j) => (
                  <span key={j} className="chip bg-violet-50 text-violet-700 text-[9px]">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {/* Prompt 助手结果 */}
          {s.promptResult && (
            <div className="card p-2">
              <div className="mb-1 text-[10px] font-medium text-ink-500">绘图 Prompt</div>
              <p className="text-[10px] text-ink-700">{s.promptResult}</p>
              <button
                onClick={() => {
                  studioStoreHook.getState().setPrompt(s.promptResult || '')
                  onJumpToImage()
                }}
                className="btn-outline mt-1 w-full !py-0.5 text-[10px]"
              >
                <Send className="h-2.5 w-2.5" /> 送入图像
              </button>
            </div>
          )}
          {s.bookTitles.length === 0 && !s.openingLineResult && !s.inspirationData && (
            <div className="py-8 text-center text-[10px] text-ink-400">
              点击 AI 工具栏的"书名/导语/灵感"生成卡片
            </div>
          )}
        </div>
      )}
    </div>
  )
}
