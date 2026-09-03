// 写作板块 — 蛙蛙写作对标版（小说编辑器 IDE）
//
// 布局：顶栏(元数据+字数) | 左(章节树) | 中(编辑器+AI工具栏) | 右(智能助手)
// 引导流程：一句话灵感 → 故事梗概3选1 → 大纲角色 → 正文
// AI工具栏：总纲/角色/角色关系/卷纲/章纲/续写正文/续写情节/去AI味/书名/导语/灵感/工作流
// 旧版 WR 工具（大纲/世界观/Lorebook/Prompt助手/DeepSeek/文风模仿/AI消痕）保留为"工具集"面板

import { useState, useRef, useEffect, type ReactNode, type ComponentType, type SVGProps } from 'react'
import {
  Sparkles, Wand2, Loader2, Dices, BookOpen, FileText, Users,
  Send, Layers, Brain, Type as TypeIcon,
  ChevronRight, Plus, Trash2, Copy,
  BookMarked, Network, ScrollText, Lightbulb, PenLine, Bot,
  X, ArrowRight, RefreshCw, Globe,
} from 'lucide-react'
import { useScriptStore, type WritingPaneState } from '../../store/useScriptStore'
import { useNovelStore } from '../../store/useNovelStore'
import { useModelStore } from '../../store/useModelStore'
import { useStudioStore as studioStoreHook } from '../../store/useStudioStore'
import { useProjectStore } from '../../store/useProjectStore'

import { cn } from '../../lib/utils'
import type { ChapterNode } from '../../services/textApi'

type JumpTarget = 'writing' | 'image' | 'audio' | 'video' | 'community'
type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

interface Props {
  onJumpTo: (target: JumpTarget) => void
}

const GENRES = ['言情', '现实情感', '悬疑', '惊悚', '科幻', '武侠', '脑洞', '通用']
const AUDIENCES = ['男频', '女频', '全频']
const POVS = ['第一人称', '第三人称']
const LENGTHS = ['短篇小说', '长篇小说']

const WIZARD_STEPS = [
  { id: 0, label: '一句话灵感', icon: Lightbulb },
  { id: 1, label: '故事梗概', icon: FileText },
  { id: 2, label: '大纲角色', icon: BookOpen },
  { id: 3, label: '正文', icon: PenLine },
]

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
        <button onClick={() => s.wizardActive ? s.exitWizard() : s.startWizard()} className="btn-ghost !px-2 !py-1 text-xs">
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
        {/* 左栏：章节树 */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-ink-200 bg-white md:flex">
          <div className="flex border-b border-ink-200 text-[10px]">
            {(['info', 'body'] as const).map((t) => (
              <button key={t} onClick={() => setLeftTab(t)} className={cn('flex-1 py-1.5 font-medium', leftTab === t ? 'bg-violet-50 text-violet-700' : 'text-ink-500')}>
                {{ info: '作品信息', body: '正文' }[t]}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {leftTab === 'info' && <WorkInfoPanel s={s} />}
            {leftTab === 'body' && <ChapterTree s={s} />}
          </div>
        </aside>

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
              <EditorArea s={s} volumeId={s.activeVolumeId!} chapterId={activeChapter.id} chapter={activeChapter} />
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

      {/* 旧版 WR 工具集（弹层） */}
      {showToolPanel && <ToolPanelModal s={s} onClose={() => setShowToolPanel(false)} onJumpToImage={() => bridgeTo('image')} />}
    </div>
  )
}

// ==================== 引导式创作向导 ====================

function GuidedWizard({ s }: { s: WritingPaneState }) {
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      {/* 进度导航 */}
      <nav className="mb-6 flex items-center justify-center gap-2">
        {WIZARD_STEPS.map((step, i) => {
          const Icon = step.icon
          return (
            <div key={step.id} className="flex items-center gap-2">
              <button
                onClick={() => s.setWizardStep(step.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                  s.wizardStep === step.id ? 'bg-violet-600 text-white' : s.wizardStep > step.id ? 'bg-violet-50 text-violet-700' : 'bg-ink-100 text-ink-500'
                )}
              >
                <Icon className="h-3 w-3" />
                {step.label}
              </button>
              {i < WIZARD_STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-ink-300" />}
            </div>
          )
        })}
      </nav>

      {/* Step 0: 一句话灵感 */}
      {s.wizardStep === 0 && (
        <div className="space-y-4">
          <div className="card p-6 text-center">
            <h2 className="text-lg font-semibold text-ink-900">一句话生成爆款小说</h2>
            <p className="mt-1 text-xs text-ink-500">输入你的灵感，AI 帮你展开完整故事</p>
          </div>
          <div className="card p-4">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-ink-400">小说题材</div>
            <div className="flex flex-wrap gap-1.5">
              {GENRES.map((g) => (
                <button key={g} onClick={() => s.setNovelGenre(g)} className={cn('rounded-lg border px-3 py-1 text-xs', s.novelGenre === g ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-ink-200 text-ink-600')}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="card grid grid-cols-3 gap-3 p-4 text-xs">
            <div>
              <div className="mb-1 text-[10px] uppercase text-ink-400">目标读者</div>
              <div className="flex gap-1">
                {AUDIENCES.map((a) => (
                  <button key={a} onClick={() => s.setNovelAudience(a)} className={cn('rounded px-2 py-0.5', s.novelAudience === a ? 'bg-violet-600 text-white' : 'bg-ink-100 text-ink-600')}>{a}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase text-ink-400">作品视角</div>
              <div className="flex gap-1">
                {POVS.map((p) => (
                  <button key={p} onClick={() => s.setNovelPov(p)} className={cn('rounded px-2 py-0.5', s.novelPov === p ? 'bg-violet-600 text-white' : 'bg-ink-100 text-ink-600')}>{p}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase text-ink-400">篇幅</div>
              <div className="flex gap-1">
                {LENGTHS.map((l) => (
                  <button key={l} onClick={() => s.setNovelLength(l)} className={cn('rounded px-2 py-0.5', s.novelLength === l ? 'bg-violet-600 text-white' : 'bg-ink-100 text-ink-600')}>{l}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="card p-4">
            <textarea
              value={s.topic}
              onChange={(e) => s.setTopic(e.target.value)}
              rows={3}
              placeholder="例如：一个普通外卖员发现自己拥有超能力，从此卷入一场外太空阴谋"
              className="input resize-none text-sm"
            />
            <div className="mt-2 flex items-center gap-2">
              <button onClick={s.randomTopic} className="btn-ghost px-3 py-1.5 text-xs">
                <Dices className="h-3 w-3" /> 随机灵感
              </button>
              <span className="ml-auto text-[10px] text-ink-400">{s.topic.length} / 500</span>
              <button
                onClick={async () => { await s.runSynopsisOptions(); s.setWizardStep(1) }}
                disabled={!s.topic.trim() || s.synopsisStatus === 'running'}
                className="btn-primary px-4 py-1.5 text-xs"
              >
                {s.synopsisStatus === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                开始创作
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: 故事梗概 3 选 1 */}
      {s.wizardStep === 1 && (
        <div className="space-y-3">
          <div className="card flex items-center gap-2 p-3">
            <FileText className="h-4 w-4 text-violet-600" />
            <span className="text-sm font-semibold">小Man · 故事方向</span>
            <span className="ml-auto text-[10px] text-ink-500">{s.synopsisOptions.length} 个方案</span>
          </div>
          <p className="text-xs text-ink-500">选一个你最喜欢的方向，AI 会继续生成故事总纲。</p>
          {s.synopsisStatus === 'running' && <div className="card flex items-center gap-2 p-4 text-xs text-ink-500"><Loader2 className="h-4 w-4 animate-spin" /> 生成方案中…</div>}
          {s.synopsisOptions.map((opt) => (
            <button key={opt.id} onClick={() => { s.selectSynopsis(opt); s.runMasterOutline() }} className="card block w-full p-4 text-left transition-all hover:border-violet-400 hover:shadow-md">
              <div className="mb-1 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-violet-600 text-[10px] font-bold text-white">{opt.id}</span>
                <span className="text-sm font-semibold text-ink-900">{opt.title}</span>
              </div>
              <p className="text-xs leading-relaxed text-ink-600">{opt.synopsis}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {opt.tags.map((t, i) => <span key={i} className="chip bg-violet-50 text-violet-700 text-[10px]">{t}</span>)}
              </div>
            </button>
          ))}
          <button onClick={s.runSynopsisOptions} className="btn-ghost w-full py-2 text-xs">
            <RefreshCw className="h-3 w-3" /> 换一批方向
          </button>
        </div>
      )}

      {/* Step 2: 大纲角色 */}
      {s.wizardStep === 2 && (
        <div className="space-y-3">
          {s.masterOutlineStatus === 'running' && <div className="card flex items-center gap-2 p-4 text-xs text-ink-500"><Loader2 className="h-4 w-4 animate-spin" /> 生成总纲中…</div>}
          {s.masterOutlineData && (
            <>
              <div className="card p-4">
                <div className="text-[10px] uppercase tracking-wider text-ink-400">核心设定</div>
                <p className="mt-1 text-xs text-ink-700">{s.masterOutlineData.premise}</p>
                <div className="mt-2 text-[10px] uppercase tracking-wider text-ink-400">主题</div>
                <p className="text-xs text-ink-700">{s.masterOutlineData.theme}</p>
                <div className="mt-2 text-[10px] uppercase tracking-wider text-ink-400">主线</div>
                <p className="text-xs text-ink-700">{s.masterOutlineData.mainline}</p>
              </div>
              <div className="card p-4">
                <div className="mb-2 text-[10px] uppercase tracking-wider text-ink-400">卷数规划</div>
                {s.masterOutlineData.volumes.map((v, i) => (
                  <div key={i} className="flex items-start gap-2 py-1 text-xs">
                    <span className="font-medium text-violet-700">{v.name}</span>
                    <span className="flex-1 text-ink-600">{v.summary}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => { s.setWizardStep(3); s.exitWizard() }} className="btn-primary w-full py-2 text-xs">
                <ArrowRight className="h-3.5 w-3.5" /> 进入正文编辑
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ==================== 作品信息面板 ====================

function WorkInfoPanel({ s }: { s: WritingPaneState }) {
  const [open, setOpen] = useState<string | null>('synopsis')
  const toggle = (k: string) => setOpen(open === k ? null : k)
  const Section = ({ id, label, icon: Icon, children }: { id: string; label: string; icon: IconComponent; children: ReactNode }) => (
    <div className="card overflow-hidden p-0">
      <button onClick={() => toggle(id)} className="flex w-full items-center gap-1.5 px-3 py-2 text-left">
        <Icon className="h-3 w-3 text-violet-600" />
        <span className="flex-1 text-[11px] font-semibold text-ink-800">{label}</span>
        <ChevronRight className={cn('h-3 w-3 text-ink-300 transition-transform', open === id && 'rotate-90')} />
      </button>
      {open === id && <div className="border-t border-ink-100 p-3 text-[11px] text-ink-600">{children}</div>}
    </div>
  )
  const Empty = ({ text }: { text: string }) => <div className="text-center text-[10px] text-ink-400 py-3">{text}</div>
  return (
    <div className="space-y-2 text-xs">
      {/* 梗概 */}
      <Section id="synopsis" label="故事梗概" icon={FileText}>
        {s.selectedSynopsis ? (
          <div>
            <div className="text-xs font-semibold text-ink-900">{s.selectedSynopsis.title}</div>
            <p className="mt-1 leading-relaxed">{s.selectedSynopsis.synopsis}</p>
            {s.selectedSynopsis.tags?.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">{s.selectedSynopsis.tags.map((t) => <span key={t} className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700">{t}</span>)}</div>
            )}
          </div>
        ) : <Empty text="暂无梗概，请先用 AI 工具生成" />}
      </Section>

      {/* 总纲 */}
      <Section id="master" label="总纲" icon={BookOpen}>
        {s.masterOutlineData ? (
          <div className="space-y-2">
            <div><span className="text-ink-400">主题：</span>{s.masterOutlineData.theme}</div>
            <div><span className="text-ink-400">前提：</span>{s.masterOutlineData.premise}</div>
            <div><span className="text-ink-400">主线：</span>{s.masterOutlineData.mainline}</div>
            <div><span className="text-ink-400">结局：</span>{s.masterOutlineData.ending}</div>
            {s.masterOutlineData.volumes?.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] uppercase text-ink-400">分卷</div>
                {s.masterOutlineData.volumes.map((v, i) => (
                  <div key={i} className="mb-1 rounded bg-ink-50 px-2 py-1">
                    <div className="font-medium text-ink-800">{v.name}</div>
                    <div className="text-[10px] text-ink-500">{v.summary}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : <Empty text="暂无总纲，点击「生成总纲」" />}
      </Section>

      {/* 角色 */}
      <Section id="characters" label="角色" icon={Users}>
        {s.script?.characters?.length ? (
          <div className="space-y-1.5">
            {s.script.characters.map((c, i) => (
              <div key={i} className="rounded bg-ink-50 px-2 py-1.5">
                <div className="font-medium text-ink-800">{c.name}</div>
                {c.role && <div className="text-[10px] text-violet-600">{c.role}</div>}
                {c.desc && <div className="mt-0.5 text-[10px] text-ink-500">{c.desc}</div>}
              </div>
            ))}
          </div>
        ) : <Empty text="暂无角色数据" />}
      </Section>

      {/* 角色关系 */}
      <Section id="relations" label="角色关系" icon={Network}>
        {s.characterRelationsData?.relations?.length ? (
          <div className="space-y-1">
            {s.characterRelationsData.relations.map((r, i) => (
              <div key={i} className="rounded bg-ink-50 px-2 py-1">
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="font-medium text-ink-800">{r.from}</span>
                  <span className="text-violet-500">→</span>
                  <span className="font-medium text-ink-800">{r.to}</span>
                  <span className="ml-auto rounded bg-violet-100 px-1 text-[9px] text-violet-700">{r.type}</span>
                </div>
                {r.desc && <div className="mt-0.5 text-[10px] text-ink-500">{r.desc}</div>}
              </div>
            ))}
          </div>
        ) : <Empty text="暂无关系数据，点击「角色关系」" />}
      </Section>

      {/* 大纲 */}
      <Section id="outline" label="大纲" icon={ScrollText}>
        {s.outline ? (
          <div className="space-y-2">
            <div><span className="text-ink-400">主题：</span>{s.outline.theme}</div>
            {s.outline.acts?.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] uppercase text-ink-400">幕</div>
                {s.outline.acts.map((a, i) => (
                  <div key={i} className="mb-1 rounded bg-ink-50 px-2 py-1">
                    <div className="font-medium text-ink-800">第{i + 1}幕：{a.title}</div>
                    {a.summary && <div className="text-[10px] text-ink-500">{a.summary}</div>}
                  </div>
                ))}
              </div>
            )}
            {s.outline.characters?.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] uppercase text-ink-400">角色概要</div>
                {s.outline.characters.map((c, i) => (
                  <div key={i} className="text-[10px] text-ink-600"><span className="font-medium text-ink-800">{c.name}</span>（{c.role}）— {c.arc}</div>
                ))}
              </div>
            )}
          </div>
        ) : <Empty text="暂无大纲，请用工具集生成" />}
      </Section>

      {/* 世界观 */}
      <Section id="worldview" label="世界观" icon={Globe}>
        {s.worldview ? (
          <div className="space-y-1.5">
            <div><span className="text-ink-400">世界：</span>{s.worldview.name} · {s.worldview.genre}</div>
            <div><span className="text-ink-400">地理：</span>{s.worldview.geography}</div>
            <div><span className="text-ink-400">历史：</span>{s.worldview.history}</div>
            <div><span className="text-ink-400">文化：</span>{s.worldview.culture}</div>
            <div><span className="text-ink-400">冲突：</span>{s.worldview.conflicts}</div>
            {s.worldview.factions?.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] uppercase text-ink-400">势力</div>
                {s.worldview.factions.map((f, i) => (
                  <div key={i} className="mb-0.5 text-[10px]"><span className="font-medium text-ink-800">{f.name}</span>（{f.stance}）— {f.desc}</div>
                ))}
              </div>
            )}
            {s.worldview.rules?.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] uppercase text-ink-400">规则</div>
                {s.worldview.rules.map((r, i) => <div key={i} className="text-[10px] text-ink-600">· {r}</div>)}
              </div>
            )}
          </div>
        ) : <Empty text="暂无世界观，请用工具集生成" />}
      </Section>

      {/* Lorebook */}
      <Section id="lorebook" label="设定库" icon={Layers}>
        {s.lorebook?.length ? (
          <div className="space-y-1">
            {s.lorebook.map((e, i) => (
              <div key={i} className="rounded bg-ink-50 px-2 py-1">
                <div className="flex items-center gap-1">
                  <span className="font-medium text-ink-800">{e.key}</span>
                  <span className="rounded bg-violet-100 px-1 text-[9px] text-violet-700">{e.category}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-ink-500">{e.content}</div>
                {e.aliases?.length > 0 && <div className="text-[9px] text-ink-400">别名：{e.aliases.join('、')}</div>}
              </div>
            ))}
          </div>
        ) : <Empty text="暂无设定词条" />}
      </Section>
    </div>
  )
}

// ==================== 章节树 ====================

function ChapterTree({ s }: { s: WritingPaneState }) {
  return (
    <div className="space-y-2">
      <button
        onClick={() => s.addVolume()}
        className="btn-primary flex w-full items-center justify-center gap-1 !py-1.5 text-[11px] font-semibold"
      >
        <Plus className="h-3 w-3" /> 新增卷
      </button>
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-400">细纲管理</div>
      {s.volumes.length === 0 && (
        <div className="rounded-lg border border-dashed border-ink-200 p-4 text-center text-[10px] text-ink-400">
          暂无卷<br />点击上方按钮新增，或用"一句话开篇"引导生成
        </div>
      )}
      {s.volumes.map((vol) => (
        <div key={vol.id} className="rounded-lg border border-ink-200">
          <div className="flex items-center gap-1 bg-ink-50 px-2 py-1.5">
            <BookMarked className="h-3 w-3 text-violet-600" />
            <input
              value={vol.name}
              onChange={(e) => { const newName = e.target.value; useNovelStore.setState((st) => ({ volumes: st.volumes.map((v) => v.id === vol.id ? { ...v, name: newName } : v) })) }}
              className="flex-1 bg-transparent text-[11px] font-medium text-ink-800 outline-none"
            />
          </div>
          <div className="flex items-center gap-1 border-t border-ink-100 px-2 py-1">
            <button onClick={() => s.addChapter(vol.id)} className="flex flex-1 items-center justify-center gap-1 rounded bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-700 hover:bg-violet-100">
              <Plus className="h-2.5 w-2.5" /> 新增章
            </button>
            <button
              onClick={() => { if (confirm(`确定删除整卷「${vol.name}」？此操作不可撤销。`)) s.removeVolume(vol.id) }}
              className="flex items-center justify-center gap-1 rounded border border-red-200 px-2 py-1 text-[10px] font-medium text-red-500 hover:bg-red-50"
              title="删除整卷"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </div>
          {vol.chapters.length > 0 && (
            <div className="space-y-0.5 p-1">
              {vol.chapters.map((ch, ci) => (
                <button
                  key={ch.id}
                  onClick={() => s.setActiveChapter(vol.id, ch.id)}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-all',
                    s.activeChapterId === ch.id ? 'bg-violet-50 text-violet-700' : 'text-ink-600 hover:bg-ink-50'
                  )}
                >
                  <span className="text-[9px] text-ink-400">{ci + 1}.</span>
                  <span className="flex-1 truncate">{ch.title}</span>
                  <span className="text-[9px] text-ink-400">{ch.wordCount}字</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ==================== AI 工具栏 ====================

function AIToolbar({
  s,
  onShowToolPanel,
  models,
  activeModel,
  onModelChange,
}: {
  s: WritingPaneState
  onShowToolPanel: () => void
  models: Array<{ id: string; name: string; displayName: string }>
  activeModel: string | null
  onModelChange: (modelId: string | null) => void
}) {
  const tools = [
    { label: '生成总纲', icon: BookOpen, action: s.runMasterOutline, busy: s.masterOutlineStatus === 'running', disabled: !s.topic.trim() },
    { label: '生成角色', icon: Users, action: () => studioStoreHook.getState(), busy: false, disabled: !s.script, isJump: 'image' as const },
    { label: '角色关系', icon: Network, action: s.runCharacterRelations, busy: s.characterRelationsStatus === 'running', disabled: !s.script?.characters?.length },
    { label: '卷纲', icon: ScrollText, action: () => s.activeVolumeId && s.runVolumeOutline(s.activeVolumeId), busy: s.volumeOutlineStatus === 'running', disabled: !s.activeVolumeId },
    { label: '章纲', icon: FileText, action: () => s.activeVolumeId && s.activeChapterId && s.runChapterOutline(s.activeVolumeId, s.activeChapterId), busy: s.chapterOutlineStatus === 'running', disabled: !s.activeChapterId },
    { label: '续写正文', icon: PenLine, action: () => s.activeVolumeId && s.activeChapterId && s.runContinueText(s.activeVolumeId, s.activeChapterId), busy: s.continueTextStatus === 'running', disabled: !activeChapterContent(s) },
    { label: '续写情节', icon: Brain, action: () => s.activeVolumeId && s.activeChapterId && s.runContinuePlot(s.activeVolumeId, s.activeChapterId), busy: s.continuePlotStatus === 'running', disabled: !activeChapterContent(s) },
    { label: '去AI味', icon: Wand2, action: () => { const c = activeChapterContent(s); if (c) s.runAIErase().then(() => { if (s.eraseResult && s.activeVolumeId && s.activeChapterId) s.updateChapter(s.activeVolumeId, s.activeChapterId, { content: s.eraseResult }) }) }, busy: s.eraseStatus === 'running', disabled: !activeChapterContent(s) },
    { label: '书名', icon: BookMarked, action: s.runBookTitle, busy: s.bookTitleStatus === 'running', disabled: !s.topic.trim() },
    { label: '导语', icon: TypeIcon, action: () => s.runOpeningLine(), busy: s.openingLineStatus === 'running', disabled: !s.topic.trim() },
    { label: '灵感', icon: Lightbulb, action: () => s.runInspiration(s.topic.slice(0, 6)), busy: s.inspirationStatus === 'running', disabled: false },
    { label: '工作流', icon: Layers, action: onShowToolPanel, busy: false, disabled: false },
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
                <option key={m.id} value={m.id}>{m.displayName || m.name}</option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  )
}

function activeChapterContent(s: WritingPaneState): string {
  const vol = s.volumes.find((v) => v.id === s.activeVolumeId)
  const ch = vol?.chapters.find((c) => c.id === s.activeChapterId)
  return ch?.content || ''
}

// ==================== 编辑区 ====================

function EditorArea({ s, volumeId, chapterId, chapter }: {
  s: WritingPaneState
  volumeId: string
  chapterId: string
  chapter: ChapterNode
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fontPx = { '小': 14, '标准': 16, '大': 18, '特大': 20, '超大': 22 }[s.editorFontSize] || 16
  const fontMap: Record<string, string> = { '默认': 'inherit', '宋体': '"SimSun"', '黑体': '"SimHei"', '楷体': '"KaiTi"', '微软雅黑': '"Microsoft YaHei"' }

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <input
        value={chapter.title}
        onChange={(e) => s.updateChapter(volumeId, chapterId, { title: e.target.value })}
        className="w-full bg-transparent text-lg font-semibold text-ink-900 outline-none"
      />
      {chapter.chapterOutline && (
        <div className="mt-2 rounded-lg border-l-2 border-violet-400 bg-violet-50/50 p-2 text-[11px] text-ink-600">
          <span className="font-medium">章纲：</span>{chapter.chapterOutline.summary}
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
            <span className="chip ml-auto bg-amber-100 text-amber-700 text-[10px]">张力 {s.continuePlotData.tension}/10</span>
          </div>
          <p className="mt-1 text-amber-800">{s.continuePlotData.development}</p>
          <p className="mt-1 text-[11px] text-amber-600">下一场景：{s.continuePlotData.nextScene}</p>
        </div>
      )}
    </div>
  )
}

function EmptyEditor({ s }: { s: WritingPaneState }) {
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

function BottomToolbar({ s }: { s: WritingPaneState }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-ink-200 bg-white px-3 py-1 text-[10px] text-ink-500">
      <span>字数：{s.currentChapterWordCount()}</span>
      <div className="flex items-center gap-1">
        <span>字体：</span>
        <select value={s.editorFont} onChange={(e) => s.setEditorFont(e.target.value)} className="rounded border border-ink-200 px-1 py-0.5 text-[10px]">
          <option>默认</option><option>宋体</option><option>黑体</option><option>楷体</option><option>微软雅黑</option>
        </select>
      </div>
      <div className="flex items-center gap-1">
        <span>字号：</span>
        <select value={s.editorFontSize} onChange={(e) => s.setEditorFontSize(e.target.value)} className="rounded border border-ink-200 px-1 py-0.5 text-[10px]">
          <option>小</option><option>标准</option><option>大</option><option>特大</option><option>超大</option>
        </select>
      </div>
      <label className="flex items-center gap-1"><input type="checkbox" checked={s.editorIndent} onChange={(e) => s.setEditorIndent(e.target.checked)} /> 段首缩进</label>
      <label className="flex items-center gap-1"><input type="checkbox" checked={s.editorSpacing} onChange={(e) => s.setEditorSpacing(e.target.checked)} /> 段落空行</label>
    </div>
  )
}

// ==================== 智能助手 ====================

function SmartAssistant({ s, onJumpToImage }: { s: WritingPaneState; onJumpToImage: () => void }) {
  const [tab, setTab] = useState<'chat' | 'cards'>('chat')
  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-ink-200">
        <button onClick={() => setTab('chat')} className={cn('flex-1 py-2 text-xs font-medium', tab === 'chat' ? 'bg-violet-50 text-violet-700' : 'text-ink-500')}>
          <Bot className="mr-1 inline h-3 w-3" /> AI对话
        </button>
        <button onClick={() => setTab('cards')} className={cn('flex-1 py-2 text-xs font-medium', tab === 'cards' ? 'bg-violet-50 text-violet-700' : 'text-ink-500')}>
          <Sparkles className="mr-1 inline h-3 w-3" /> 灵感卡片
        </button>
      </div>
      {tab === 'chat' ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {s.chatMessages.length === 0 && <div className="text-center text-[10px] text-ink-400 py-8">向小Man提问，获取创作建议</div>}
            {s.chatMessages.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px]', m.role === 'user' ? 'bg-violet-600 text-white' : 'bg-ink-100 text-ink-700')}>
                  {m.content}
                </div>
              </div>
            ))}
            {s.chatStatus === 'running' && <div className="flex justify-start"><div className="bg-ink-100 rounded-lg px-2.5 py-1.5 text-[11px] text-ink-500"><Loader2 className="inline h-3 w-3 animate-spin" /> 思考中…</div></div>}
          </div>
          <div className="border-t border-ink-200 p-2">
            <div className="flex items-center gap-1">
              <input
                value={s.chatInput}
                onChange={(e) => s.setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); s.runSmartChat() } }}
                placeholder="问小Man…"
                className="input flex-1 !py-1 text-[11px]"
              />
              <button onClick={s.runSmartChat} disabled={!s.chatInput.trim() || s.chatStatus === 'running'} className="btn-primary !px-2 !py-1">
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
                <button key={i} onClick={() => navigator.clipboard?.writeText(t)} className="block w-full rounded px-2 py-1 text-left text-[11px] text-ink-700 hover:bg-ink-50">
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
              <div className="mt-1 flex flex-wrap gap-0.5">{idea.tags.map((t, j) => <span key={j} className="chip bg-violet-50 text-violet-700 text-[9px]">{t}</span>)}</div>
            </div>
          ))}
          {/* Prompt 助手结果 */}
          {s.promptResult && (
            <div className="card p-2">
              <div className="mb-1 text-[10px] font-medium text-ink-500">绘图 Prompt</div>
              <p className="text-[10px] text-ink-700">{s.promptResult}</p>
              <button onClick={() => { studioStoreHook.getState().setPrompt(s.promptResult || ''); onJumpToImage() }} className="btn-outline mt-1 w-full !py-0.5 text-[10px]">
                <Send className="h-2.5 w-2.5" /> 送入图像
              </button>
            </div>
          )}
          {s.bookTitles.length === 0 && !s.openingLineResult && !s.inspirationData && (
            <div className="text-center text-[10px] text-ink-400 py-8">点击 AI 工具栏的"书名/导语/灵感"生成卡片</div>
          )}
        </div>
      )}
    </div>
  )
}

// ==================== 旧版工具集弹层 ====================

function ToolPanelModal({ s, onClose, onJumpToImage }: {
  s: WritingPaneState
  onClose: () => void
  onJumpToImage: () => void
}) {
  const [tool, setTool] = useState<'outline' | 'worldview' | 'lorebook' | 'prompt' | 'deepseek' | 'style' | 'erase'>('outline')
  const tools = [
    { id: 'outline' as const, label: '大纲生成', wr: 'WR-01' },
    { id: 'worldview' as const, label: '世界观', wr: 'WR-05' },
    { id: 'lorebook' as const, label: 'Lorebook', wr: 'WR-12' },
    { id: 'prompt' as const, label: 'Prompt 助手', wr: 'WR-19' },
    { id: 'deepseek' as const, label: 'DeepSeek 推理', wr: 'WR-15' },
    { id: 'style' as const, label: '文风模仿', wr: 'WR-14' },
    { id: 'erase' as const, label: 'AI 消痕', wr: 'WR-18' },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="flex h-[80vh] w-[90vw] max-w-4xl flex-col rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-ink-200 px-4 py-2">
          <Layers className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-semibold">写作工具集</span>
          <div className="ml-2 flex gap-0.5">
            {tools.map((t) => (
              <button key={t.id} onClick={() => setTool(t.id)} className={cn('rounded px-2 py-1 text-[10px]', tool === t.id ? 'bg-violet-600 text-white' : 'bg-ink-100 text-ink-600')}>
                {t.label}<span className="ml-0.5 text-[8px] opacity-60">{t.wr}</span>
              </button>
            ))}
          </div>
          <button onClick={onClose} className="btn-ghost ml-auto !p-1"><X className="h-4 w-4" /></button>
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

function MiniOutline({ s }: { s: WritingPaneState }) {
  return (
    <div>
      <button onClick={s.runOutline} disabled={!s.topic.trim() || s.outlineStatus === 'running'} className="btn-primary mb-3 px-3 py-1.5 text-xs">
        {s.outlineStatus === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} 生成大纲
      </button>
      {s.outline && (
        <div className="space-y-2">
          {s.outline.acts.map((act) => (
            <div key={act.id} className="card p-2">
              <div className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded bg-violet-600 text-[9px] font-bold text-white">{act.id}</span><span className="text-xs font-medium">{act.name}</span></div>
              <p className="mt-1 text-[11px] text-ink-600">{act.summary}</p>
              <ul className="mt-1 space-y-0.5">{act.beats.map((b, i) => <li key={i} className="text-[10px] text-ink-500">• {b}</li>)}</ul>
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
      <button onClick={s.runWorldview} disabled={!s.topic.trim() || s.worldviewStatus === 'running'} className="btn-primary mb-3 px-3 py-1.5 text-xs">
        {s.worldviewStatus === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} 构建世界观
      </button>
      {s.worldview && (
        <div className="space-y-2 text-xs">
          <div className="card p-2"><span className="font-medium">{s.worldview.name}</span> <span className="chip bg-violet-50 text-violet-700 text-[10px]">{s.worldview.genre}</span></div>
          {[['地理', s.worldview.geography], ['历史', s.worldview.history], ['文化', s.worldview.culture], ['矛盾', s.worldview.conflicts]].map(([l, v]) => (
            <div key={l} className="card p-2"><div className="text-[10px] uppercase text-ink-400">{l}</div><p className="text-ink-600">{v}</p></div>
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
      <textarea value={s.promptInput} onChange={(e) => s.setPromptInput(e.target.value)} rows={2} placeholder="自然语言描述" className="input mb-2 text-xs" />
      <button onClick={s.runPromptHelper} disabled={!s.promptInput.trim() || s.promptStatus === 'running'} className="btn-primary px-3 py-1.5 text-xs">
        {s.promptStatus === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} 生成 Prompt
      </button>
      {s.promptResult && (
        <div className="card mt-2 p-2">
          <p className="text-[11px] text-ink-700">{s.promptResult}</p>
          <button onClick={() => { studioStoreHook.getState().setPrompt(s.promptResult || ''); onJumpToImage() }} className="btn-outline mt-1 w-full !py-1 text-[10px]"><Send className="h-2.5 w-2.5" /> 送入图像</button>
        </div>
      )}
    </div>
  )
}

function MiniDeepseek({ s }: { s: WritingPaneState }) {
  return (
    <div>
      <textarea value={s.deepseekSituation} onChange={(e) => s.setDeepseekSituation(e.target.value)} rows={2} placeholder="剧情节点" className="input mb-2 text-xs" />
      <button onClick={s.runDeepseek} disabled={!s.deepseekSituation.trim() || s.deepseekStatus === 'running'} className="btn-primary px-3 py-1.5 text-xs">
        {s.deepseekStatus === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />} 推理路径
      </button>
      {s.deepseek && (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-ink-600">{s.deepseek.analysis}</p>
          {s.deepseek.paths.map((p) => (
            <div key={p.id} className="card p-2">
              <div className="flex items-center gap-1"><span className="font-medium text-xs">{p.title}</span><span className="chip ml-auto bg-amber-50 text-amber-700 text-[10px]">张力 {p.drama}</span></div>
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
      <textarea value={s.styleSample} onChange={(e) => s.setStyleSample(e.target.value)} rows={3} placeholder="样本文本" className="input mb-2 text-xs" />
      <input value={s.styleTopic} onChange={(e) => s.setStyleTopic(e.target.value)} placeholder="新主题" className="input mb-2 text-xs" />
      <button onClick={s.runStyleClone} disabled={!s.styleSample.trim() || !s.styleTopic.trim() || s.styleStatus === 'running'} className="btn-primary px-3 py-1.5 text-xs">
        {s.styleStatus === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} 模仿生成
      </button>
      {s.styleResult && <div className="card mt-2 p-2"><p className="text-[11px] text-ink-700">{s.styleResult}</p></div>}
    </div>
  )
}

function MiniErase({ s }: { s: WritingPaneState }) {
  return (
    <div>
      <textarea value={s.eraseInput} onChange={(e) => s.setEraseInput(e.target.value)} rows={3} placeholder="AI 生成文本" className="input mb-2 text-xs" />
      <div className="mb-2 flex gap-1">
        {(['light', 'medium', 'heavy'] as const).map((l) => (
          <button key={l} onClick={() => s.setEraseIntensity(l)} className={cn('rounded border px-2 py-0.5 text-[10px]', s.eraseIntensity === l ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-ink-200')}>
            {{ light: '轻度', medium: '中度', heavy: '深度' }[l]}
          </button>
        ))}
      </div>
      <button onClick={s.runAIErase} disabled={!s.eraseInput.trim() || s.eraseStatus === 'running'} className="btn-primary px-3 py-1.5 text-xs">
        {s.eraseStatus === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} 消痕改写
      </button>
      {s.eraseResult && <div className="card mt-2 p-2"><p className="text-[11px] text-ink-700">{s.eraseResult}</p></div>}
    </div>
  )
}
