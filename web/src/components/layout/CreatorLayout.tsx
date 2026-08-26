import { Link } from 'react-router-dom'
import { ChevronLeft, Settings2, Save, Share2, Home } from 'lucide-react'
import Navbar from './Navbar'
import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  children: ReactNode
  projectName?: string
  /** 右侧顶部操作按钮（可选扩展） */
  extraActions?: ReactNode
}

/**
 * 创作类独立页面的统一外层布局
 * - 顶部 Navbar（已自动显示"返回首页"）
 * - 项目头（面包屑/标题/保存状态/发布/设置）
 * - 子内容区
 */
export default function CreatorLayout({ title, subtitle, children, projectName = '未命名项目', extraActions }: Props) {
  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <Navbar />

      {/* 项目头 */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="btn-ghost !px-2 !py-1 text-xs"
            title="返回首页"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <Home className="ml-0.5 h-3 w-3" />
          </Link>
          <div className="flex flex-col">
            <div className="text-[11px] leading-none text-slate-400">{subtitle || title}</div>
            <input
              defaultValue={projectName}
              className="w-[260px] border-none bg-transparent text-sm font-medium text-slate-900 outline-none focus:bg-slate-50 focus:px-2 focus:py-1 focus:rounded"
            />
          </div>
          <span className="chip bg-brand-50 text-brand-600 text-[10px]">
            <Save className="h-2.5 w-2.5" /> 自动保存
          </span>
        </div>
        <div className="flex items-center gap-2">
          {extraActions}
          <button className="btn-ghost !px-2.5 !py-1.5 text-xs">
            <Share2 className="h-3.5 w-3.5" /> 发布到广场
          </button>
          <button className="btn-ghost !px-2 !py-1.5 text-xs">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}
