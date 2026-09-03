import { Link } from 'react-router-dom'
import { ChevronLeft, Settings2, Save, Share2, Home } from 'lucide-react'
import logo from '../../assets/logo.png'
import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  children: ReactNode
  projectName?: string
  /** 右侧顶部操作按钮（可选扩展） */
  extraActions?: ReactNode
  /** 隐藏 Navbar + 项目头，纯沉浸式画布（仅内容区） */
  hideChrome?: boolean
}

/**
 * 创作类独立页面的统一外层布局
 * - 顶部 Navbar（已自动显示"返回首页"）
 * - 项目头（面包屑/标题/保存状态/发布/设置）
 * - 子内容区
 * - hideChrome=true：跳过所有头部，仅渲染内容区（占满全屏）
 */
export default function CreatorLayout({ title, subtitle, children, projectName = '未命名项目', extraActions, hideChrome = false }: Props) {
  if (hideChrome) {
    return <div className="h-screen w-full bg-black overflow-hidden">{children}</div>
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-50">
      {/* 统一顶部栏：原 Navbar + 项目头 合并 */}
      <div className="sticky top-0 z-40 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 lg:px-6">
          {/* Logo + 返回首页 */}
          <Link to="/" className="flex items-center gap-2 font-semibold text-neutral-900 shrink-0">
            <img src={logo} alt="logo" className="h-8 w-8" />
            <ChevronLeft className="h-4 w-4 text-neutral-400" />
            <Home className="h-4 w-4 text-neutral-400" />
          </Link>

          {/* 分隔 */}
          <div className="h-6 w-px bg-neutral-200 shrink-0" />

          {/* 项目信息 */}
          <div className="flex min-w-0 items-center gap-2">
            <input
              defaultValue={projectName}
              className="w-[200px] min-w-0 border-none bg-transparent text-sm font-semibold text-neutral-900 outline-none focus:bg-neutral-100 focus:px-2 focus:py-0.5 focus:rounded-md"
            />
            <span className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
              <Save className="h-2.5 w-2.5" /> 自动保存
            </span>
          </div>

          <div className="flex-1" />

          {/* 标题副标题 */}
          <div className="hidden lg:flex flex-col items-end mr-3">
            <span className="text-[11px] leading-none text-neutral-400">{subtitle || title}</span>
          </div>

          {/* 右侧操作 */}
          <div className="flex items-center gap-1.5">
            {extraActions}
            <button className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors">
              <Share2 className="h-3.5 w-3.5" /> 发布
            </button>
            <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors">
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 内容区 */}
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}
