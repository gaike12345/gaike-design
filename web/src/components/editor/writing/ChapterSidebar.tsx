// 左侧栏 - 作品信息 + 章节树
import { useState, type ReactNode, type ComponentType, SVGProps } from 'react'
import {
  FileText, BookOpen, Users, Network, ScrollText, Globe, Layers,
  Plus, Trash2, ChevronRight,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { WritingPaneState } from '../../../store/useScriptStore'

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

// ==================== 作品信息面板 ====================

function WorkInfoPanel({ s }: { s: WritingPaneState }) {
  const [open, setOpen] = useState<string | null>('synopsis')
  const toggle = (k: string) => setOpen(open === k ? null : k)

  const Section = ({
    id,
    label,
    icon: Icon,
    children,
  }: {
    id: string
    label: string
    icon: IconComponent
    children: ReactNode
  }) => (
    <div className="card overflow-hidden p-0">
      <button
        onClick={() => toggle(id)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left"
      >
        <Icon className="h-3 w-3 text-violet-600" />
        <span className="flex-1 text-[11px] font-semibold text-ink-800">{label}</span>
        <ChevronRight
          className={cn('h-3 w-3 text-ink-300 transition-transform', open === id && 'rotate-90')}
        />
      </button>
      {open === id && (
        <div className="border-t border-ink-100 p-3 text-[11px] text-ink-600">{children}</div>
      )}
    </div>
  )

  const Empty = ({ text }: { text: string }) => (
    <div className="py-3 text-center text-[10px] text-ink-400">{text}</div>
  )

  return (
    <div className="space-y-2 text-xs">
      {/* 梗概 */}
      <Section id="synopsis" label="故事梗概" icon={FileText}>
        {s.selectedSynopsis ? (
          <div>
            <div className="text-xs font-semibold text-ink-900">{s.selectedSynopsis.title}</div>
            <p className="mt-1 leading-relaxed">{s.selectedSynopsis.synopsis}</p>
            {s.selectedSynopsis.tags?.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {s.selectedSynopsis.tags.map((t) => (
                  <span key={t} className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Empty text="暂无梗概，请先用 AI 工具生成" />
        )}
      </Section>

      {/* 总纲 */}
      <Section id="master" label="总纲" icon={BookOpen}>
        {s.masterOutlineData ? (
          <div className="space-y-2">
            <div>
              <span className="text-ink-400">主题：</span>
              {s.masterOutlineData.theme}
            </div>
            <div>
              <span className="text-ink-400">前提：</span>
              {s.masterOutlineData.premise}
            </div>
            <div>
              <span className="text-ink-400">主线：</span>
              {s.masterOutlineData.mainline}
            </div>
            <div>
              <span className="text-ink-400">结局：</span>
              {s.masterOutlineData.ending}
            </div>
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
        ) : (
          <Empty text="暂无总纲，点击「生成总纲」" />
        )}
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
        ) : (
          <Empty text="暂无角色数据" />
        )}
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
                  <span className="ml-auto rounded bg-violet-100 px-1 text-[9px] text-violet-700">
                    {r.type}
                  </span>
                </div>
                {r.desc && <div className="mt-0.5 text-[10px] text-ink-500">{r.desc}</div>}
              </div>
            ))}
          </div>
        ) : (
          <Empty text="暂无关系数据，点击「角色关系」" />
        )}
      </Section>

      {/* 大纲 */}
      <Section id="outline" label="大纲" icon={ScrollText}>
        {s.outline ? (
          <div className="space-y-2">
            <div>
              <span className="text-ink-400">主题：</span>
              {s.outline.theme}
            </div>
            {s.outline.acts?.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] uppercase text-ink-400">幕</div>
                {s.outline.acts.map((a, i) => (
                  <div key={i} className="mb-1 rounded bg-ink-50 px-2 py-1">
                    <div className="font-medium text-ink-800">
                      第{i + 1}幕：{a.title}
                    </div>
                    {a.summary && <div className="text-[10px] text-ink-500">{a.summary}</div>}
                  </div>
                ))}
              </div>
            )}
            {s.outline.characters?.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] uppercase text-ink-400">角色概要</div>
                {s.outline.characters.map((c, i) => (
                  <div key={i} className="text-[10px] text-ink-600">
                    <span className="font-medium text-ink-800">{c.name}</span>（{c.role}）— {c.arc}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Empty text="暂无大纲，请用工具集生成" />
        )}
      </Section>

      {/* 世界观 */}
      <Section id="worldview" label="世界观" icon={Globe}>
        {s.worldview ? (
          <div className="space-y-1.5">
            <div>
              <span className="text-ink-400">世界：</span>
              {s.worldview.name} · {s.worldview.genre}
            </div>
            <div>
              <span className="text-ink-400">地理：</span>
              {s.worldview.geography}
            </div>
            <div>
              <span className="text-ink-400">历史：</span>
              {s.worldview.history}
            </div>
            <div>
              <span className="text-ink-400">文化：</span>
              {s.worldview.culture}
            </div>
            <div>
              <span className="text-ink-400">冲突：</span>
              {s.worldview.conflicts}
            </div>
            {s.worldview.factions?.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] uppercase text-ink-400">势力</div>
                {s.worldview.factions.map((f, i) => (
                  <div key={i} className="mb-0.5 text-[10px]">
                    <span className="font-medium text-ink-800">{f.name}</span>（{f.stance}）— {f.desc}
                  </div>
                ))}
              </div>
            )}
            {s.worldview.rules?.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] uppercase text-ink-400">规则</div>
                {s.worldview.rules.map((r, i) => (
                  <div key={i} className="text-[10px] text-ink-600">
                    · {r}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Empty text="暂无世界观，请用工具集生成" />
        )}
      </Section>

      {/* Lorebook */}
      <Section id="lorebook" label="设定库" icon={Layers}>
        {s.lorebook?.length ? (
          <div className="space-y-1">
            {s.lorebook.map((e, i) => (
              <div key={i} className="rounded bg-ink-50 px-2 py-1">
                <div className="flex items-center gap-1">
                  <span className="font-medium text-ink-800">{e.key}</span>
                  <span className="rounded bg-violet-100 px-1 text-[9px] text-violet-700">
                    {e.category}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-ink-500">{e.content}</div>
                {e.aliases?.length > 0 && (
                  <div className="text-[9px] text-ink-400">别名：{e.aliases.join('、')}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty text="暂无设定词条" />
        )}
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

      <div className="space-y-1">
        {s.volumes.map((v) => {
          const isActiveVol = v.id === s.activeVolumeId
          return (
            <div key={v.id} className="rounded border border-ink-200 bg-white">
              {/* 卷标题 */}
              <div className="flex items-center gap-1 border-b border-ink-100 px-2 py-1">
                <span
                  className={cn(
                    'flex-1 truncate text-[11px] font-medium',
                    isActiveVol ? 'text-violet-700' : 'text-ink-700'
                  )}
                >
                  {v.name}
                </span>
                <button
                  onClick={() => s.addChapter(v.id)}
                  className="rounded p-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
                  title="新增章节"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  onClick={() => s.removeVolume(v.id)}
                  className="rounded p-0.5 text-ink-300 hover:bg-red-50 hover:text-red-500"
                  title="删除卷"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {/* 章节列表 */}
              <div className="py-0.5">
                {v.chapters.length === 0 && (
                  <div className="px-2 py-1.5 text-center text-[10px] text-ink-400">暂无章节</div>
                )}
                {v.chapters.map((c) => {
                  const isActive = c.id === s.activeChapterId
                  return (
                    <button
                      key={c.id}
                      onClick={() => s.setActiveChapter(v.id, c.id)}
                      className={cn(
                        'flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] transition-colors',
                        isActive
                          ? 'bg-violet-50 text-violet-700'
                          : 'text-ink-600 hover:bg-ink-50'
                      )}
                    >
                      <span className="flex-1 truncate">{c.title || '未命名章节'}</span>
                      <span className="text-[9px] text-ink-400">
                        {(c.content || '').length}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ==================== 左侧栏容器 ====================

interface ChapterSidebarProps {
  s: WritingPaneState
  leftTab: 'info' | 'body'
  onTabChange: (tab: 'info' | 'body') => void
}

/**
 * 左侧栏：作品信息 / 章节树 tab 切换
 */
export function ChapterSidebar({ s, leftTab, onTabChange }: ChapterSidebarProps) {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-ink-200 bg-white md:flex">
      <div className="flex border-b border-ink-200 text-[10px]">
        {(['info', 'body'] as const).map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={cn(
              'flex-1 py-1.5 font-medium',
              leftTab === t ? 'bg-violet-50 text-violet-700' : 'text-ink-500'
            )}
          >
            {{ info: '作品信息', body: '正文' }[t]}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {leftTab === 'info' && <WorkInfoPanel s={s} />}
        {leftTab === 'body' && <ChapterTree s={s} />}
      </div>
    </aside>
  )
}
