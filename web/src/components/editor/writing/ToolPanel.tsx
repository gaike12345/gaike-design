// WR 工具集弹层 - 大纲/世界观/Lorebook/Prompt/DeepSeek/文风/消痕
import { useState } from 'react'
import {
  Layers, X, Wand2, Loader2, Send, Brain,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { WritingPaneState } from '../../../store/useScriptStore'
import { useStudioStore as studioStoreHook } from '../../../store/useStudioStore'

type ToolKey = 'outline' | 'worldview' | 'lorebook' | 'prompt' | 'deepseek' | 'style' | 'erase'

const TOOL_TABS: Array<{ id: ToolKey; label: string; wr: string }> = [
  { id: 'outline', label: '大纲生成', wr: 'WR-01' },
  { id: 'worldview', label: '世界观', wr: 'WR-05' },
  { id: 'lorebook', label: 'Lorebook', wr: 'WR-12' },
  { id: 'prompt', label: 'Prompt 助手', wr: 'WR-19' },
  { id: 'deepseek', label: 'DeepSeek 推理', wr: 'WR-15' },
  { id: 'style', label: '文风模仿', wr: 'WR-14' },
  { id: 'erase', label: 'AI 消痕', wr: 'WR-18' },
]

interface ToolPanelModalProps {
  s: WritingPaneState
  onClose: () => void
  onJumpToImage: () => void
}

/**
 * WR 工具集弹层
 * 7 个旧版写作工具：大纲/世界观/Lorebook/Prompt/DeepSeek/文风/消痕
 */
export function ToolPanelModal({ s, onClose, onJumpToImage }: ToolPanelModalProps) {
  const [tool, setTool] = useState<ToolKey>('outline')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-[90vw] max-w-4xl flex-col rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-ink-200 px-4 py-2">
          <Layers className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-semibold">写作工具集</span>
          <div className="ml-2 flex gap-0.5">
            {TOOL_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                className={cn(
                  'rounded px-2 py-1 text-[10px]',
                  tool === t.id ? 'bg-violet-600 text-white' : 'bg-ink-100 text-ink-600'
                )}
              >
                {t.label}
                <span className="ml-0.5 text-[8px] opacity-60">{t.wr}</span>
              </button>
            ))}
          </div>
          <button onClick={onClose} className="btn-ghost ml-auto !p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tool === 'outline' && <MiniOutline s={s} />}
          {tool === 'worldview' && <MiniWorldview s={s} />}
          {tool === 'lorebook' && <MiniLorebook s={s} />}
          {tool === 'prompt' && <MiniPrompt s={s} onJumpToImage={onJumpToImage} />}
          {tool === 'deepseek' && <MiniDeepseek s={s} />}
          {tool === 'style' && <MiniStyle s={s} />}
          {tool === 'erase' && <MiniErase s={s} />}
        </div>
      </div>
    </div>
  )
}

// ==================== Mini 组件 ====================

function MiniOutline({ s }: { s: WritingPaneState }) {
  return (
    <div>
      <button
        onClick={s.runOutline}
        disabled={!s.topic.trim() || s.outlineStatus === 'running'}
        className="btn-primary mb-3 px-3 py-1.5 text-xs"
      >
        {s.outlineStatus === 'running' ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Wand2 className="h-3 w-3" />
        )}{' '}
        生成大纲
      </button>
      {s.outline && (
        <div className="space-y-2">
          {s.outline.acts.map((act) => (
            <div key={act.id} className="card p-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-violet-600 text-[9px] font-bold text-white">
                  {act.id}
                </span>
                <span className="text-xs font-medium">{act.name}</span>
              </div>
              <p className="mt-1 text-[11px] text-ink-600">{act.summary}</p>
              <ul className="mt-1 space-y-0.5">
                {act.beats.map((b, i) => (
                  <li key={i} className="text-[10px] text-ink-500">
                    • {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MiniWorldview({ s }: { s: WritingPaneState }) {
  return (
    <div>
      <button
        onClick={s.runWorldview}
        disabled={!s.topic.trim() || s.worldviewStatus === 'running'}
        className="btn-primary mb-3 px-3 py-1.5 text-xs"
      >
        {s.worldviewStatus === 'running' ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Wand2 className="h-3 w-3" />
        )}{' '}
        构建世界观
      </button>
      {s.worldview && (
        <div className="space-y-2 text-xs">
          <div className="card p-2">
            <span className="font-medium">{s.worldview.name}</span>{' '}
            <span className="chip bg-violet-50 text-violet-700 text-[10px]">
              {s.worldview.genre}
            </span>
          </div>
          {[
            ['地理', s.worldview.geography],
            ['历史', s.worldview.history],
            ['文化', s.worldview.culture],
            ['矛盾', s.worldview.conflicts],
          ].map(([l, v]) => (
            <div key={l} className="card p-2">
              <div className="text-[10px] uppercase text-ink-400">{l}</div>
              <p className="text-ink-600">{v}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MiniLorebook({ s }: { s: WritingPaneState }) {
  return (
    <div>
      <div className="mb-2 text-[10px] text-ink-500">{s.lorebook.length} 条词条</div>
      <div className="space-y-1">
        {s.lorebook.map((e, i) => (
          <div key={i} className="card p-2">
            <span className="text-xs font-medium">{e.key}</span>
            <span className="chip ml-1 bg-ink-100 text-[10px]">{e.category}</span>
            <p className="mt-0.5 text-[10px] text-ink-500">{e.content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniPrompt({ s, onJumpToImage }: { s: WritingPaneState; onJumpToImage: () => void }) {
  return (
    <div>
      <textarea
        value={s.promptInput}
        onChange={(e) => s.setPromptInput(e.target.value)}
        rows={2}
        placeholder="自然语言描述"
        className="input mb-2 text-xs"
      />
      <button
        onClick={s.runPromptHelper}
        disabled={!s.promptInput.trim() || s.promptStatus === 'running'}
        className="btn-primary px-3 py-1.5 text-xs"
      >
        {s.promptStatus === 'running' ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Wand2 className="h-3 w-3" />
        )}{' '}
        生成 Prompt
      </button>
      {s.promptResult && (
        <div className="card mt-2 p-2">
          <p className="text-[11px] text-ink-700">{s.promptResult}</p>
          <button
            onClick={() => {
              studioStoreHook.getState().setPrompt(s.promptResult || '')
              onJumpToImage()
            }}
            className="btn-outline mt-1 w-full !py-1 text-[10px]"
          >
            <Send className="h-2.5 w-2.5" /> 送入图像
          </button>
        </div>
      )}
    </div>
  )
}

function MiniDeepseek({ s }: { s: WritingPaneState }) {
  return (
    <div>
      <textarea
        value={s.deepseekSituation}
        onChange={(e) => s.setDeepseekSituation(e.target.value)}
        rows={2}
        placeholder="剧情节点"
        className="input mb-2 text-xs"
      />
      <button
        onClick={s.runDeepseek}
        disabled={!s.deepseekSituation.trim() || s.deepseekStatus === 'running'}
        className="btn-primary px-3 py-1.5 text-xs"
      >
        {s.deepseekStatus === 'running' ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Brain className="h-3 w-3" />
        )}{' '}
        推理路径
      </button>
      {s.deepseek && (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-ink-600">{s.deepseek.analysis}</p>
          {s.deepseek.paths.map((p) => (
            <div key={p.id} className="card p-2">
              <div className="flex items-center gap-1">
                <span className="font-medium text-xs">{p.title}</span>
                <span className="chip ml-auto bg-amber-50 text-amber-700 text-[10px]">
                  张力 {p.drama}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-ink-500">{p.development}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MiniStyle({ s }: { s: WritingPaneState }) {
  return (
    <div>
      <textarea
        value={s.styleSample}
        onChange={(e) => s.setStyleSample(e.target.value)}
        rows={3}
        placeholder="样本文本"
        className="input mb-2 text-xs"
      />
      <input
        value={s.styleTopic}
        onChange={(e) => s.setStyleTopic(e.target.value)}
        placeholder="新主题"
        className="input mb-2 text-xs"
      />
      <button
        onClick={s.runStyleClone}
        disabled={!s.styleSample.trim() || !s.styleTopic.trim() || s.styleStatus === 'running'}
        className="btn-primary px-3 py-1.5 text-xs"
      >
        {s.styleStatus === 'running' ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Wand2 className="h-3 w-3" />
        )}{' '}
        模仿生成
      </button>
      {s.styleResult && (
        <div className="card mt-2 p-2">
          <p className="text-[11px] text-ink-700">{s.styleResult}</p>
        </div>
      )}
    </div>
  )
}

function MiniErase({ s }: { s: WritingPaneState }) {
  return (
    <div>
      <textarea
        value={s.eraseInput}
        onChange={(e) => s.setEraseInput(e.target.value)}
        rows={3}
        placeholder="AI 生成文本"
        className="input mb-2 text-xs"
      />
      <div className="mb-2 flex gap-1">
        {(['light', 'medium', 'heavy'] as const).map((l) => (
          <button
            key={l}
            onClick={() => s.setEraseIntensity(l)}
            className={cn(
              'rounded border px-2 py-0.5 text-[10px]',
              s.eraseIntensity === l
                ? 'border-violet-400 bg-violet-50 text-violet-700'
                : 'border-ink-200'
            )}
          >
            {{ light: '轻度', medium: '中度', heavy: '深度' }[l]}
          </button>
        ))}
      </div>
      <button
        onClick={s.runAIErase}
        disabled={!s.eraseInput.trim() || s.eraseStatus === 'running'}
        className="btn-primary px-3 py-1.5 text-xs"
      >
        {s.eraseStatus === 'running' ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Wand2 className="h-3 w-3" />
        )}{' '}
        消痕改写
      </button>
      {s.eraseResult && (
        <div className="card mt-2 p-2">
          <p className="text-[11px] text-ink-700">{s.eraseResult}</p>
        </div>
      )}
    </div>
  )
}
