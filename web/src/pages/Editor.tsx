// 编辑器主页（6 板块切换 Tab 容器）
//
// v1.2 路由骨架：/editor/:projectId
// 顶部 Tab：写作 | 图像 | 漫画 | 音频 | 视频 | 社区
// 写作/图像/漫画为完整板块（按 v1.2 决策第 1 项顺序优先实施）
// 音频/视频/社区先做占位骨架（UI/状态/兜底逻辑就绪，API 后续接入）

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  BookOpen,
  Image as ImageIcon,
  Layout as LayoutIcon,
  Music,
  Video,
  Users,
  ChevronLeft,
  Settings2,
  Save,
  Share2,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import WritingPane from '../components/editor/WritingPane'
import ImagePane from '../components/editor/ImagePane'
import ComicPane from '../components/editor/ComicPane'
import PlaceholderPane from '../components/editor/PlaceholderPane'
import { useProjectStore } from '../store/useProjectStore'
import { cn } from '../lib/utils'

type PaneId = 'writing' | 'image' | 'comic' | 'audio' | 'video' | 'community'

const PANES: { id: PaneId; label: string; icon: typeof BookOpen; desc: string; ready: boolean }[] = [
  { id: 'writing', label: '写作', icon: BookOpen, desc: '脚本 / 分镜 / 角色卡 / Lorebook', ready: true },
  { id: 'image', label: '图像', icon: ImageIcon, desc: '文生图 / 图生图 / LoRA / ControlNet', ready: true },
  { id: 'comic', label: '漫画', icon: LayoutIcon, desc: '自动排版 / 多页管理 / 导出', ready: true },
  { id: 'audio', label: '音频', icon: Music, desc: 'TTS / BGM / 音轨合成', ready: false },
  { id: 'video', label: '视频', icon: Video, desc: '图生视频 / 文生视频 / 拼接', ready: false },
  { id: 'community', label: '社区', icon: Users, desc: '作品广场 / 模型市场 / 做同款', ready: false },
]

export default function Editor() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  // 使用 selector 避免订阅整个 store 导致 useEffect 死循环
  const projectList = useProjectStore((s) => s.projects)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const [activePane, setActivePane] = useState<PaneId>('writing')

  // 初始化：从 localStorage 读取项目（仅执行一次）
  useEffect(() => {
    useProjectStore.getState().hydrate()
  }, [])

  // 如果没有 projectId 或项目不存在，自动创建一个
  useEffect(() => {
    if (projectId === 'new' || !projectId) {
      useProjectStore.getState().createProject('未命名项目').then((id) => {
        if (id) navigate(`/editor/${id}`, { replace: true })
      })
      return
    }
    const exists = useProjectStore.getState().projects.find((p) => p.id === projectId)
    if (!exists) {
      // 项目不存在 → 回到工作台
      navigate('/workspace', { replace: true })
    } else {
      useProjectStore.getState().setActiveProject(projectId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const activeProject = projectList.find((p) => p.id === activeProjectId) ?? null

  return (
    <div className="flex h-screen flex-col bg-ink-50">
      <Navbar />

      {/* 编辑器顶部：项目名 + 操作 */}
      <div className="flex items-center justify-between border-b border-ink-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/workspace')}
            className="btn-ghost !px-2 !py-1 text-xs"
            title="返回工作台"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <input
            value={activeProject?.name ?? ''}
            onChange={(e) => activeProject && useProjectStore.getState().renameProject(activeProject.id, e.target.value)}
            className="border-none bg-transparent text-sm font-medium text-ink-900 outline-none focus:bg-ink-50 focus:px-2 focus:py-1 focus:rounded"
            placeholder="未命名项目"
          />
          <span className="chip bg-green-50 text-green-600">
            <Save className="h-2.5 w-2.5" /> 自动保存
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost !px-2.5 !py-1.5 text-xs">
            <Share2 className="h-3.5 w-3.5" /> 发布到广场
          </button>
          <button className="btn-ghost !px-2 !py-1.5 text-xs">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 6 板块 Tab 切换器 */}
      <div className="flex items-center gap-1 border-b border-ink-200 bg-white px-4 py-2">
        {PANES.map((p) => {
          const Icon = p.icon
          return (
            <button
              key={p.id}
              onClick={() => setActivePane(p.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                activePane === p.id
                  ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                  : 'text-ink-500 hover:bg-ink-50 hover:text-ink-700'
              )}
              title={p.desc}
            >
              <Icon className="h-3.5 w-3.5" />
              {p.label}
              {!p.ready && (
                <span className="chip bg-ink-100 px-1 py-0 text-[9px] text-ink-500">待接入</span>
              )}
            </button>
          )
        })}
        <div className="ml-auto text-[10px] text-ink-400">
          {PANES.find((p) => p.id === activePane)?.desc}
        </div>
      </div>

      {/* 板块内容区 */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {activePane === 'writing' && <WritingPane onJumpTo={(p) => setActivePane(p)} />}
        {activePane === 'image' && <ImagePane onJumpTo={(p) => setActivePane(p)} />}
        {activePane === 'comic' && <ComicPane onJumpTo={(p) => setActivePane(p)} />}
        {activePane === 'audio' && (
          <PlaceholderPane
            paneId="audio"
            title="音频板块"
            desc="TTS 配音 / BGM 情绪生成 / 音轨合成 / 唇形同步"
            todo={['多角色 TTS（每角色固定音色）', 'BGM 情绪驱动生成', '音轨混音编辑器', '与视频板块音视频合成']}
          />
        )}
        {activePane === 'video' && (
          <PlaceholderPane
            paneId="video"
            title="视频板块"
            desc="图生视频 / 文生视频 / 多镜头 Storyboarding / 拼接配乐"
            todo={['图生视频（静图→5-15s）', '起止帧控制', '多镜头组合', '导演台（P2）']}
          />
        )}
        {activePane === 'community' && (
          <PlaceholderPane
            paneId="community"
            title="社区板块"
            desc="作品广场 / 模型市场 / 创作者主页 / 做同款"
            todo={['作品广场（图文/漫画/视频/音频）', '模型市场（LoRA/Checkpoint/工作流）', '创作者主页', '做同款一键填充参数']}
          />
        )}
      </main>
    </div>
  )
}
