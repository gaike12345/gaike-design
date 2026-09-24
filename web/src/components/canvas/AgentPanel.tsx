// 小漫（创作画布 AI 助手）面板（对话 + 确认制命令卡片；右侧停靠抽屉）
//
// ADR「模型提议，应用裁决」：
// - 助手只产出命令建议（契约无 model 字段），模型由用户在卡片内选择
// - 每条命令必须点「执行」确认才生成；执行走 agentExecutor → 画布既有 runImageGen/runVideoGen
// - 参考图仅支持「引用当前选中的图片节点」（v1 设计边界）

import { useEffect, useMemo, useRef, useState } from 'react'
import { Film, Image as ImageIcon, Loader2, Send, Sparkles, Trash2, X, Zap } from 'lucide-react'
import { cn, errMsg } from '../../lib/utils'
import { toast } from '../community/types'
import { useImageModels } from '../../config/imageModels'
import { useVideoModels } from '../../config/videoModels'
import {
  estimateAgentCost, executeAgentCommand, resolveImageCommand, resolveVideoCommand,
} from '../../services/agentExecutor'
import type { AgentCommand } from '../../services/textApi'
import { useAgentStore, type AgentMessage } from '../../store/useAgentStore'
import { useUnifiedCanvasStore } from '../../store/useUnifiedCanvasStore'

// ==================== 命令卡片 ====================

function CommandCard({ cmd, refAvailable }: { cmd: AgentCommand; refAvailable: boolean }) {
  const imageModels = useImageModels()
  const videoModels = useVideoModels()
  const isVideo = cmd.type === 'video'
  const [modelId, setModelId] = useState<string>(() =>
    isVideo ? videoModels.defaultModel : imageModels.defaultModel,
  )
  const [useRefImage, setUseRefImage] = useState(!!cmd.useReference && refAvailable)
  const [executing, setExecuting] = useState(false)

  const models = isVideo ? videoModels.models : imageModels.models
  const resolved = useMemo(() => {
    try {
      return isVideo ? resolveVideoCommand(cmd, modelId) : resolveImageCommand(cmd, modelId)
    } catch {
      return null
    }
  }, [cmd, modelId, isVideo])

  const estimatedCost = useMemo(() => {
    try {
      return estimateAgentCost(cmd, modelId, useRefImage && refAvailable)
    } catch {
      return 0
    }
  }, [cmd, modelId, useRefImage, refAvailable])

  const onExecute = () => {
    if (executing) return
    setExecuting(true)
    try {
      const plan = executeAgentCommand(cmd, modelId, useRefImage && refAvailable)
      toast(`已在画布创建节点并开始生成 · 预估 ${plan.estimatedCost} 积分`, 'success')
    } catch (e) {
      toast(errMsg(e, '执行失败'), 'error')
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="self-start rounded-xl border border-neutral-700/70 bg-[#181818] p-2.5">
      {/* 类型徽标 + 提示词 */}
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
            isVideo ? 'bg-amber-500/15 text-amber-300' : 'bg-cyan-500/15 text-cyan-300',
          )}
        >
          {isVideo ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
          {isVideo ? '视频命令' : '图片命令'}
        </span>
        <span className="text-[10px] text-neutral-600">待确认</span>
      </div>
      <p className="mt-1.5 line-clamp-4 text-[12px] leading-relaxed text-neutral-200 break-words">{cmd.prompt}</p>

      {/* 参数摘要（已按所选模型校验后的实际值） */}
      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10.5px] text-neutral-400">
        {resolved && 'batch' in resolved && (
          <>
            <span>比例 {resolved.ratio}</span>
            <span>张数 {resolved.batch}</span>
            <span>{resolved.resolution}</span>
          </>
        )}
        {resolved && !('batch' in resolved) && (
          <>
            <span>时长 {resolved.durationSec}s</span>
            <span>比例 {resolved.ratio}</span>
            <span>{resolved.resolution}</span>
          </>
        )}
        {cmd.negativePrompt?.trim() && (
          <span className="basis-full truncate text-neutral-500">反向词：{cmd.negativePrompt.trim()}（已填入节点参数）</span>
        )}
      </div>

      {/* 模型选择 + 预估积分 */}
      <div className="mt-2 flex items-center gap-2">
        <select
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-neutral-700/80 bg-[#0f0f0f] px-2 py-1.5 text-[11.5px] text-neutral-200 focus:border-violet-500/50 focus:outline-none"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}（{m.costTokens}积分）
            </option>
          ))}
        </select>
        <span className="shrink-0 text-[10.5px] font-medium text-amber-300/90 tabular-nums">预估 {estimatedCost}</span>
      </div>

      {/* 引用 + 执行 */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <label
          className={cn(
            'flex min-w-0 items-center gap-1.5 text-[10.5px]',
            refAvailable ? 'cursor-pointer text-neutral-400' : 'cursor-not-allowed text-neutral-600',
          )}
          title={refAvailable ? '用选中图片节点作为参考图' : '先在画布选中一个有成果的图片节点'}
        >
          <input
            type="checkbox"
            checked={useRefImage && refAvailable}
            disabled={!refAvailable}
            onChange={(e) => setUseRefImage(e.target.checked)}
            className="h-3 w-3 shrink-0 accent-violet-500"
          />
          <span className="truncate">引用选中节点</span>
        </label>
        <button
          type="button"
          onClick={onExecute}
          disabled={executing || !models.length}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11.5px] font-medium text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {executing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          执行
        </button>
      </div>
    </div>
  )
}

// ==================== 消息气泡 ====================

function MessageBubble({ msg, refAvailable }: { msg: AgentMessage; refAvailable: boolean }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-violet-600 px-3 py-2 text-[12.5px] leading-relaxed text-white">
          {msg.content}
        </div>
      </div>
    )
  }

  const pending = !msg.content && !msg.commands?.length
  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[92%] self-start whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm border border-neutral-700/60 bg-[#1f1f1f] px-3 py-2 text-[12.5px] leading-relaxed text-neutral-100">
        {msg.content || (
          <span className="flex items-center gap-1.5 text-neutral-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            思考中…
          </span>
        )}
        {msg.degraded && msg.content && (
          <div className="mt-1.5 text-[10px] text-amber-400/80">后端降级回复（LLM 暂不可用，无命令建议）</div>
        )}
        {msg.blocked && msg.content && <div className="mt-1.5 text-[10px] text-red-400/80">内容未通过安全审核</div>}
      </div>
      {msg.commands?.map((cmd, i) => (
        <CommandCard key={`${msg.id}-${i}`} cmd={cmd} refAvailable={refAvailable} />
      ))}
    </div>
  )
}

// ==================== 主面板 ====================

export default function AgentPanel() {
  const open = useAgentStore((s) => s.open)
  const setOpen = useAgentStore((s) => s.setOpen)
  const messages = useAgentStore((s) => s.messages)
  const sending = useAgentStore((s) => s.sending)
  const send = useAgentStore((s) => s.send)
  const clearSession = useAgentStore((s) => s.clearSession)

  const selectedNodeId = useUnifiedCanvasStore((s) => s.selectedNodeId)
  const nodes = useUnifiedCanvasStore((s) => s.nodes)

  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)
  const selectedNodeType =
    selectedNode?.type === 'image' || selectedNode?.type === 'video' ? selectedNode.type : undefined
  // 与 agentExecutor.resolveReferenceSource 的判定保持一致
  const refAvailable =
    !!selectedNode &&
    selectedNode.type === 'image' &&
    (selectedNode.data.imageResults ?? []).some((r) => r.status === 'done' && r.originalUrl)

  // 新消息自动滚动到底部
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, open])

  const onSend = () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    void send(text, selectedNodeType)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="小漫"
        className="absolute right-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-1.5 rounded-l-xl border border-r-0 border-neutral-700/80 bg-[#141414]/95 py-2.5 pl-2.5 pr-3 shadow-[0_4px_16px_rgba(0,0,0,0.45)] backdrop-blur transition-colors hover:bg-[#1c1c1c]"
      >
        <Sparkles className="h-4 w-4 text-violet-300" />
        <span className="text-[12px] font-medium text-neutral-200">小漫</span>
      </button>
    )
  }

  return (
    <div className="absolute bottom-0 right-0 top-16 z-40 flex w-[380px] flex-col overflow-hidden rounded-l-2xl border border-r-0 border-neutral-700/80 bg-[#141414]/95 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-md">
      {/* 头部 */}
      <div className="flex items-center gap-2 border-b border-neutral-700/70 px-3.5 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
          <Sparkles className="h-3.5 w-3.5 text-violet-300" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-tight text-neutral-100">小漫</div>
          <div className="truncate text-[10px] text-neutral-500">
            {refAvailable
              ? '执行时可引用选中的图片节点'
              : selectedNodeType === 'image'
                ? '已选中图片节点'
                : selectedNodeType === 'video'
                  ? '已选中视频节点'
                  : '命令建议 · 确认后才会执行'}
          </div>
        </div>
        <button
          type="button"
          onClick={clearSession}
          title="清空会话"
          className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="收起"
          className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 消息列表 */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="rounded-xl border border-neutral-700/60 bg-[#181818] p-3 text-[12px] leading-relaxed text-neutral-400">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-neutral-200">
              <Sparkles className="h-3.5 w-3.5 text-violet-300" />
              你好，我是小漫
            </div>
            <p>把想法告诉我，我会整理成图片/视频命令建议（含提示词与参数）。</p>
            <p className="mt-1.5 text-[11px] text-neutral-600">试试：「生成一张赛博朋克风格的城市夜景，16:9，2 张」</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} refAvailable={refAvailable} />
        ))}
      </div>

      {/* 输入区 */}
      <div className="border-t border-neutral-700/70 p-2.5">
        <div className="flex items-end gap-2 rounded-xl border border-neutral-700/80 bg-[#0f0f0f] px-2.5 py-2 transition-colors focus-within:border-violet-500/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="描述你想生成的内容，如：一只在月球上骑车的橘猫，视频 5 秒"
            className="min-w-0 flex-1 resize-none bg-transparent text-[12.5px] leading-relaxed text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!input.trim() || sending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
            title="发送"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="mt-1.5 px-0.5 text-[10px] text-neutral-600">
          Enter 发送 · Shift+Enter 换行 · 命令仅供参考，点击「执行」后才开始生成
        </div>
      </div>
    </div>
  )
}
