// 引导式创作向导 - 一句话灵感 → 故事梗概 → 大纲角色 → 正文
import type { ReactNode, ComponentType, SVGProps } from 'react'
import {
  Sparkles, Dices, Loader2, ArrowRight, RefreshCw,
  FileText, BookOpen, Lightbulb, PenLine, ChevronRight,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { WritingPaneState } from '../../../store/useScriptStore'

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

export const GENRES = ['言情', '现实情感', '悬疑', '惊悚', '科幻', '武侠', '脑洞', '通用']
export const AUDIENCES = ['男频', '女频', '全频']
export const POVS = ['第一人称', '第三人称']
export const LENGTHS = ['短篇小说', '长篇小说']

export const WIZARD_STEPS = [
  { id: 0, label: '一句话灵感', icon: Lightbulb },
  { id: 1, label: '故事梗概', icon: FileText },
  { id: 2, label: '大纲角色', icon: BookOpen },
  { id: 3, label: '正文', icon: PenLine },
]

/**
 * 引导式创作向导
 * 4 步：灵感 → 梗概3选1 → 大纲角色 → 进入正文
 */
export function GuidedWizard({ s }: { s: WritingPaneState }) {
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
                  s.wizardStep === step.id
                    ? 'bg-violet-600 text-white'
                    : s.wizardStep > step.id
                    ? 'bg-violet-50 text-violet-700'
                    : 'bg-ink-100 text-ink-500'
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
                <button
                  key={g}
                  onClick={() => s.setNovelGenre(g)}
                  className={cn(
                    'rounded-lg border px-3 py-1 text-xs',
                    s.novelGenre === g
                      ? 'border-violet-400 bg-violet-50 text-violet-700'
                      : 'border-ink-200 text-ink-600'
                  )}
                >
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
                  <button
                    key={a}
                    onClick={() => s.setNovelAudience(a)}
                    className={cn(
                      'rounded px-2 py-0.5',
                      s.novelAudience === a ? 'bg-violet-600 text-white' : 'bg-ink-100 text-ink-600'
                    )}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase text-ink-400">作品视角</div>
              <div className="flex gap-1">
                {POVS.map((p) => (
                  <button
                    key={p}
                    onClick={() => s.setNovelPov(p)}
                    className={cn(
                      'rounded px-2 py-0.5',
                      s.novelPov === p ? 'bg-violet-600 text-white' : 'bg-ink-100 text-ink-600'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase text-ink-400">篇幅</div>
              <div className="flex gap-1">
                {LENGTHS.map((l) => (
                  <button
                    key={l}
                    onClick={() => s.setNovelLength(l)}
                    className={cn(
                      'rounded px-2 py-0.5',
                      s.novelLength === l ? 'bg-violet-600 text-white' : 'bg-ink-100 text-ink-600'
                    )}
                  >
                    {l}
                  </button>
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
                onClick={async () => {
                  await s.runSynopsisOptions()
                  s.setWizardStep(1)
                }}
                disabled={!s.topic.trim() || s.synopsisStatus === 'running'}
                className="btn-primary px-4 py-1.5 text-xs"
              >
                {s.synopsisStatus === 'running' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
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
          {s.synopsisStatus === 'running' && (
            <div className="card flex items-center gap-2 p-4 text-xs text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 生成方案中…
            </div>
          )}
          {s.synopsisOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                s.selectSynopsis(opt)
                s.runMasterOutline()
              }}
              className="card block w-full p-4 text-left transition-all hover:border-violet-400 hover:shadow-md"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-violet-600 text-[10px] font-bold text-white">
                  {opt.id}
                </span>
                <span className="text-sm font-semibold text-ink-900">{opt.title}</span>
              </div>
              <p className="text-xs leading-relaxed text-ink-600">{opt.synopsis}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {opt.tags.map((t, i) => (
                  <span key={i} className="chip bg-violet-50 text-violet-700 text-[10px]">
                    {t}
                  </span>
                ))}
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
          {s.masterOutlineStatus === 'running' && (
            <div className="card flex items-center gap-2 p-4 text-xs text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 生成总纲中…
            </div>
          )}
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
              <button
                onClick={() => {
                  s.setWizardStep(3)
                  s.exitWizard()
                }}
                className="btn-primary w-full py-2 text-xs"
              >
                <ArrowRight className="h-3.5 w-3.5" /> 进入正文编辑
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
