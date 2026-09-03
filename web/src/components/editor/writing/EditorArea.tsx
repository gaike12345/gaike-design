// 编辑区 - AI工具栏 + 编辑器 + 底部工具栏
import { useRef } from 'react'
import {
  Loader2, BookOpen, Users, Network, ScrollText, FileText,
  PenLine, Brain, Wand2, BookMarked, Type as TypeIcon, Lightbulb, Layers,
  Sparkles, Plus,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { WritingPaneState } from '../../../store/useScriptStore'
import type { ChapterNode } from '../../../services/textApi'
import { useStudioStore as studioStoreHook } from '../../../store/useStudioStore'

// ==================== AI 工具栏 ====================

export interface AIToolbarProps {
  s: WritingPaneState
  onShowToolPanel: () => void
  models: Array<{ id: string; name: string; displayName: string }>
  activeModel: string | null
  onModelChange: (modelId: string | null) => void
}

export function AIToolbar({
  s,
  onShowToolPanel,
  models,
  activeModel,
  onModelChange,
}: AIToolbarProps) {
  const tools = [
    {
      label: '生成总纲',
      icon: BookOpen,
      action: s.runMasterOutline,
      busy: s.masterOutlineStatus === 'running',
      disabled: !s.topic.trim(),
    },
    {
      label: '生成角色',
      icon: Users,
      action: () => studioStoreHook.getState(),
      busy: false,
      disabled: !s.script,
      isJump: 'image' as const,
    },
    {
      label: '角色关系',
      icon: Network,
      action: s.runCharacterRelations,
      busy: s.characterRelationsStatus === 'running',
      disabled: !s.script?.characters?.length,
    },
    {
      label: '卷纲',
      icon: ScrollText,
      action: () => s.activeVolumeId && s.runVolumeOutline(s.activeVolumeId),
      busy: s.volumeOutlineStatus === 'running',
      disabled: !s.activeVolumeId,
    },
    {
      label: '章纲',
      icon: FileText,
      action: () =>
        s.activeVolumeId && s.activeChapterId && s.runChapterOutline(s.activeVolumeId, s.activeChapterId),
      busy: s.chapterOutlineStatus === 'running',
      disabled: !s.activeChapterId,
    },
    {
      label: '续写正文',
      icon: PenLine,
      action: () =>
        s.activeVolumeId && s.activeChapterId && s.runContinueText(s.activeVolumeId, s.activeChapterId),
      busy: s.continueTextStatus === 'running',
      disabled: !activeChapterContent(s),
    },
    {
      label: '续写情节',
      icon: Brain,
      action: () =>
        s.activeVolumeId && s.activeChapterId && s.runContinuePlot(s.activeVolumeId, s.activeChapterId),
      busy: s.continuePlotStatus === 'running',
      disabled: !activeChapterContent(s),
    },
    {
      label: '去AI味',
      icon: Wand2,
      action: () => {
        const c = activeChapterContent(s)
        if (c)
          s.runAIErase().then(() => {
            if (s.eraseResult && s.activeVolumeId && s.activeChapterId)
              s.updateChapter(s.activeVolumeId, s.activeChapterId, { content: s.eraseResult })
          })
      },
      busy: s.eraseStatus === 'running',
      disabled: !activeChapterContent(s),
    },
    {
      label: '书名',
      icon: BookMarked,
      action: s.runBookTitle,
      busy: s.bookTitleStatus === 'running',
      disabled: !s.topic.trim(),
    },
    {
      label: '导语',
      icon: TypeIcon,
      action: () => s.runOpeningLine(),
      busy: s.openingLineStatus === 'running',
      disabled: !s.topic.trim(),
    },
    {
      label: '灵感',
      icon: Lightbulb,
      action: () => s.runInspiration(s.topic.slice(0, 6)),
      busy: s.inspirationStatus === 'running',
      disabled: false,
    },
    {
      label: '工作流',
      icon: Layers,
      action: onShowToolPanel,
      busy: false,
      disabled: false,
    },
  ]

  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-ink-200 bg-white px-2 py-1">
      <span className="text-[10px] font-medium text-ink-400">AI工具</span>
      {tools.map((t) => {
        const Icon = t.icon
        return (
          <button
            key={t.label}
            onClick={() => t.action()}
            disabled={t.disabled || t.busy}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all',
              t.disabled ? 'text-ink-300' : 'text-ink-600 hover:bg-violet-50 hover:text-violet-700'
            )}
          >
            {t.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
            {t.label}
          </button>
        )
      })}

      {/* 模型选择器（有可用模型时才显示） */}
      {models.length > 0 && (
        <>
          <div className="mx-1 h-4 w-px bg-ink-200" aria-hidden />
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-medium text-ink-400">模型</span>
            <select
              value={activeModel || ''}
              onChange={(e) => onModelChange(e.target.value || null)}
              className="rounded border border-ink-200 bg-white px-1.5 py-0.5 text-[10px] text-ink-600 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200"
              title="选择 AI 模型"
            >
              <option value="">默认</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName || m.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  )
}

// ==================== 工具函数 ====================

export function activeChapterContent(s: WritingPaneState): string {
  const vol = s.volumes.find((v) => v.id === s.activeVolumeId)
  const ch = vol?.chapters.find((c) => c.id === s.activeChapterId)
  return ch?.content || ''
}

// ==================== 编辑区 ====================

interface EditorAreaProps {
  s: WritingPaneState
  volumeId: string
  chapterId: string
  chapter: ChapterNode
}

export function EditorArea({ s, volumeId, chapterId, chapter }: EditorAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fontPx =
    { 小: 14, 标准: 16, 大: 18, 特大: 20, 超大: 22 }[s.editorFontSize] || 16
  const fontMap: Record<string, string> = {
    默认: 'inherit',
    宋体: '"SimSun"',
    黑体: '"SimHei"',
    楷体: '"KaiTi"',
    微软雅黑: '"Microsoft YaHei"',
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <input
        value={chapter.title}
        onChange={(e) => s.updateChapter(volumeId, chapterId, { title: e.target.value })}
        className="w-full bg-transparent text-lg font-semibold text-ink-900 outline-none"
      />
      {chapter.chapterOutline && (
        <div className="mt-2 rounded-lg border-l-2 border-violet-400 bg-violet-50/50 p-2 text-[11px] text-ink-600">
          <span className="font-medium">章纲：</span>
          {chapter.chapterOutline.summary}
          <span className="ml-2 text-ink-400">悬念：{chapter.chapterOutline.cliffhanger}</span>
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={chapter.content}
        onChange={(e) => s.updateChapter(volumeId, chapterId, { content: e.target.value })}
        placeholder="开始写作…（可使用上方 AI 工具续写）"
        className="mt-3 w-full resize-none bg-transparent text-ink-800 outline-none"
        style={{
          fontFamily: fontMap[s.editorFont] || 'inherit',
          fontSize: `${fontPx}px`,
          lineHeight: 1.8,
          textIndent: s.editorIndent ? '2em' : 0,
          whiteSpace: s.editorSpacing ? 'pre-wrap' : 'pre',
          minHeight: '60vh',
        }}
      />
      {/* 续写情节结果 */}
      {s.continuePlotData && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
          <div className="flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-amber-600" />
            <span className="font-medium text-amber-800">情节推演</span>
            <span className="chip ml-auto bg-amber-100 text-amber-700 text-[10px]">
              张力 {s.continuePlotData.tension}/10
            </span>
          </div>
          <p className="mt-1 text-amber-800">{s.continuePlotData.development}</p>
          <p className="mt-1 text-[11px] text-amber-600">下一场景：{s.continuePlotData.nextScene}</p>
        </div>
      )}
    </div>
  )
}

// ==================== 空编辑器 ====================

export function EmptyEditor({ s }: { s: WritingPaneState }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <PenLine className="h-10 w-10 text-ink-300" />
      <h2 className="text-sm font-medium text-ink-500">还没有章节</h2>
      <p className="text-xs text-ink-400">点击上方"一句话开篇"引导生成，或手动新增卷/章</p>
      <div className="flex gap-2">
        <button onClick={s.startWizard} className="btn-primary px-4 py-2 text-xs">
          <Sparkles className="h-3.5 w-3.5" /> 一句话开篇
        </button>
        <button onClick={() => s.addVolume()} className="btn-outline px-4 py-2 text-xs">
          <Plus className="h-3.5 w-3.5" /> 新增卷
        </button>
      </div>
    </div>
  )
}

// ==================== 底部工具栏 ====================

export function BottomToolbar({ s }: { s: WritingPaneState }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-ink-200 bg-white px-3 py-1 text-[10px] text-ink-500">
      <span>字数：{s.currentChapterWordCount()}</span>
      <div className="flex items-center gap-1">
        <span>字体：</span>
        <select
          value={s.editorFont}
          onChange={(e) => s.setEditorFont(e.target.value)}
          className="rounded border border-ink-200 px-1 py-0.5 text-[10px]"
        >
          <option>默认</option>
          <option>宋体</option>
          <option>黑体</option>
          <option>楷体</option>
          <option>微软雅黑</option>
        </select>
      </div>
      <div className="flex items-center gap-1">
        <span>字号：</span>
        <select
          value={s.editorFontSize}
          onChange={(e) => s.setEditorFontSize(e.target.value)}
          className="rounded border border-ink-200 px-1 py-0.5 text-[10px]"
        >
          <option>小</option>
          <option>标准</option>
          <option>大</option>
          <option>特大</option>
          <option>超大</option>
        </select>
      </div>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={s.editorIndent}
          onChange={(e) => s.setEditorIndent(e.target.checked)}
        />{' '}
        段首缩进
      </label>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={s.editorSpacing}
          onChange={(e) => s.setEditorSpacing(e.target.checked)}
        />{' '}
        段落空行
      </label>
    </div>
  )
}
