// 写作板块 - 小说编辑器 IDE（主容器）
//
// 布局：顶栏 | 左栏(章节树/作品信息) | 中栏(AI工具栏+编辑器) | 右栏(智能助手)
// 引导流程：一句话灵感 → 故事梗概3选1 → 大纲角色 → 正文
//
// 子组件拆分到 writing/ 目录：
//   WritingWizard  - 引导式创作向导（4步）
//   ChapterSidebar - 左侧栏（作品信息 + 章节树）
//   EditorArea     - 中间编辑区（AI工具栏 + 编辑器 + 底部工具栏）
//   SmartAssistant - 右侧智能助手（AI对话 + 灵感卡片）
//   ToolPanel      - WR工具集弹层（7个旧版工具）

import { useState, useEffect } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useScriptStore } from '../../store/useScriptStore'
import { useNovelStore } from '../../store/useNovelStore'
import { useModelStore } from '../../store/useModelStore'
import { useProjectStore } from '../../store/useProjectStore'

import { GuidedWizard } from './writing/WritingWizard'
import { ChapterSidebar } from './writing/ChapterSidebar'
import {
  AIToolbar,
  EditorArea,
  EmptyEditor,
  BottomToolbar,
} from './writing/EditorArea'
import { SmartAssistant } from './writing/SmartAssistant'
import { ToolPanelModal } from './writing/ToolPanel'

type JumpTarget = 'writing' | 'image' | 'audio' | 'video' | 'community'

interface Props {
  onJumpTo: (target: JumpTarget) => void
}

export default function WritingPane({ onJumpTo }: Props) {
  const s = useScriptStore()
  const activeProjectId = useProjectStore((st) => st.activeProjectId)
  const [leftTab, setLeftTab] = useState<'info' | 'body'>('body')
  const [showToolPanel, setShowToolPanel] = useState(false)

  // 加载小说模型列表
  const { getModelsByType, fetchModels } = useModelStore()
  const novelModels = getModelsByType('novel')
  const novelModel = useNovelStore((st) => st.novelModel)
  const setNovelModel = useNovelStore((st) => st.setNovelModel)

  useEffect(() => {
    fetchModels('novel')
  }, [fetchModels])

  // 当前活跃章节
  const activeVolume = s.volumes.find((v) => v.id === s.activeVolumeId)
  const activeChapter = activeVolume?.chapters.find((c) => c.id === s.activeChapterId)

  const bridgeTo = (target: JumpTarget) => {
    if (activeProjectId && s.script) {
      useProjectStore.getState().updatePayload(activeProjectId, { script: s.script })
    }
    onJumpTo(target)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-ink-50">
      {/* 顶栏 */}
      <header className="flex shrink-0 items-center gap-2 border-b border-ink-200 bg-white px-3 py-1.5">
        <button
          onClick={() => (s.wizardActive ? s.exitWizard() : s.startWizard())}
          className="btn-ghost !px-2 !py-1 text-xs"
        >
          {s.wizardActive ? <X className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
          {s.wizardActive ? '退出向导' : '一句话开篇'}
        </button>
        <span className="text-xs font-medium text-ink-700">{s.topic || '未命名作品'}</span>
        <div className="flex items-center gap-1 text-[10px] text-ink-500">
          <span className="chip bg-ink-100">{s.novelGenre}</span>
          <span className="chip bg-ink-100">{s.novelAudience}</span>
          <span className="chip bg-ink-100">{s.novelPov}</span>
          <span className="chip bg-ink-100">{s.novelLength}</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-ink-500">
          <span>本章：{s.currentChapterWordCount()}字</span>
          <span>总：{s.totalWordCount()}字</span>
        </div>
      </header>

      {/* 主体三栏 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左栏：章节树 + 作品信息 */}
        <ChapterSidebar s={s} leftTab={leftTab} onTabChange={setLeftTab} />

        {/* 中栏：编辑器 */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* AI 工具栏 */}
          <AIToolbar
            s={s}
            onShowToolPanel={() => setShowToolPanel(true)}
            models={novelModels}
            activeModel={novelModel}
            onModelChange={setNovelModel}
          />
          {/* 编辑区或向导 */}
          <div className="flex-1 overflow-y-auto">
            {s.wizardActive ? (
              <GuidedWizard s={s} />
            ) : activeChapter ? (
              <EditorArea
                s={s}
                volumeId={s.activeVolumeId!}
                chapterId={activeChapter.id}
                chapter={activeChapter}
              />
            ) : (
              <EmptyEditor s={s} />
            )}
          </div>
          {/* 底部工具栏 */}
          <BottomToolbar s={s} />
        </main>

        {/* 右栏：智能助手 */}
        <aside className="hidden w-64 shrink-0 flex-col border-l border-ink-200 bg-white md:flex">
          <SmartAssistant s={s} onJumpToImage={() => bridgeTo('image')} />
        </aside>
      </div>

      {/* WR 工具集弹层 */}
      {showToolPanel && (
        <ToolPanelModal
          s={s}
          onClose={() => setShowToolPanel(false)}
          onJumpToImage={() => {
            setShowToolPanel(false)
            bridgeTo('image')
          }}
        />
      )}
    </div>
  )
}
