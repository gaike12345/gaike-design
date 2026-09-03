// 工作台首页（项目列表）
//
// v1.2 路由：/workspace
// 显示用户项目列表，新建项目跳转到 /editor/:projectId

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Image as ImageIcon, BookOpen, MoreHorizontal } from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import { useProjectStore, type ProjectType } from '../store/useProjectStore'
import { cn } from '../lib/utils'

const TEMPLATES: { type: ProjectType; label: string; icon: typeof ImageIcon; desc: string }[] = [
  { type: 'image', label: '图像项目', icon: ImageIcon, desc: '纯图像生成与精修' },
  { type: 'script', label: '写作项目', icon: BookOpen, desc: '脚本/分镜/角色卡/Lorebook' },
]

const TYPE_ICON: Record<ProjectType, typeof ImageIcon> = {
  image: ImageIcon,
  comic: ImageIcon,
  script: BookOpen,
  audio: ImageIcon,
  video: ImageIcon,
  community: ImageIcon,
}

export default function Workspace() {
  const navigate = useNavigate()
  const projectList = useProjectStore((s) => s.projects)

  useEffect(() => {
    useProjectStore.getState().hydrate()
  }, [])

  const onCreate = async (type: ProjectType, name: string) => {
    const id = await useProjectStore.getState().createProject(name, type)
    if (id) navigate(`/editor/${id}`)
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 p-6 lg:p-8">
        {/* 标题 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">我的工作台</h1>
            <p className="mt-1 text-sm text-ink-500">从模板开始或新建一个项目</p>
          </div>
        </div>

        {/* 新建模板 */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
            新建项目
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {TEMPLATES.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.type}
                  onClick={() => onCreate(t.type, `${t.label}-${new Date().toLocaleDateString()}`)}
                  className="card flex items-start gap-3 p-4 text-left transition-all hover:border-violet-300 hover:shadow-card"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-ink-900">{t.label}</span>
                      <Plus className="h-3 w-3 text-ink-400" />
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{t.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* 项目列表 */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
            最近项目 ({projectList.length})
          </h2>
          {projectList.length === 0 ? (
            <div className="card flex flex-col items-center justify-center gap-2 py-16 text-center">
              <ImageIcon className="h-8 w-8 text-ink-300" />
              <p className="text-sm text-ink-500">还没有项目，从上方模板开始吧</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {projectList.map((p) => {
                const Icon = TYPE_ICON[p.type] ?? ImageIcon
                return (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/editor/${p.id}`)}
                    className="card group flex flex-col gap-3 p-3 text-left transition-all hover:border-violet-300 hover:shadow-card"
                  >
                    <div className={cn(
                      'flex aspect-[4/3] items-center justify-center rounded-lg bg-ink-100',
                      'group-hover:bg-violet-50'
                    )}>
                      <Icon className="h-8 w-8 text-ink-400 group-hover:text-violet-500" />
                    </div>
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-ink-900">{p.name}</p>
                        <p className="mt-0.5 text-[10px] text-ink-400">
                          {new Date(p.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <MoreHorizontal className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
