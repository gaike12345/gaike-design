import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, ArrowLeft, Search } from 'lucide-react'
import logo from '../assets/logo.png'

/**
 * 404 页面（未匹配路由的兜底）
 * - 显示用户友好的"页面不存在"提示
 * - 携带用户尝试访问的 URL 路径，便于反馈
 * - 快捷入口：返回首页 / 返回上一页
 */
export default function NotFoundPage() {
  const location = useLocation()

  // 404 埋点：记录在控制台便于排障（不打扰用户）
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.info('[404] 未匹配路由:', location.pathname + location.search)
  }, [location.pathname, location.search])

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-violet-50 via-white to-cyan-50">
      {/* 背景装饰光斑 */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-violet-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-cyan-300/30 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
        {/* Logo */}
        <Link to="/" className="mb-8 inline-flex items-center gap-2 group">
          <img src={logo} alt="logo" className="h-9 w-9 transition-transform group-hover:rotate-6" />
          <span className="text-lg font-bold tracking-tight text-neutral-800 group-hover:text-violet-700 transition-colors">
            Man TV
          </span>
        </Link>

        {/* 404 大号数字 */}
        <div className="relative mb-4">
          <h1 className="select-none text-[160px] md:text-[200px] font-black leading-none bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-500 bg-clip-text text-transparent drop-shadow-sm">
            404
          </h1>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 w-2/3 rounded-full bg-gradient-to-r from-transparent via-violet-300/50 to-transparent blur-md" />
        </div>

        <h2 className="mb-3 text-2xl md:text-3xl font-bold text-neutral-900">
          抱歉，这个页面走丢了
        </h2>
        <p className="mb-2 text-sm md:text-base text-neutral-500 max-w-md">
          你访问的路径可能已被移除、重命名，或者从未存在。别担心，我们带你回到正轨。
        </p>

        {/* 尝试访问的路径（便于用户检查/反馈） */}
        <div className="mt-4 mb-8 flex max-w-lg items-center gap-2 rounded-xl border border-neutral-200 bg-white/70 px-4 py-3 backdrop-blur-sm shadow-sm">
          <Search className="h-4 w-4 text-neutral-400 shrink-0" />
          <code className="truncate text-xs md:text-sm text-neutral-600 font-mono">
            {location.pathname}
            {location.search && (
              <span className="text-violet-500">{location.search}</span>
            )}
          </code>
        </div>

        {/* 操作按钮组 */}
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
          <Link
            to="/"
            className="group inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:bg-violet-700 hover:shadow-xl hover:shadow-violet-500/30 transition-all"
          >
            <Home className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
            返回首页
          </Link>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="group inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-6 py-3 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 hover:border-neutral-300 transition-all"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            返回上一页
          </button>
        </div>

        {/* 快捷导航 */}
        <div className="mt-12 grid w-full max-w-lg grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { to: '/novel', label: '小说写作' },
            { to: '/canvas', label: '创作画布' },
            { to: '/community', label: '社区广场' },
            { to: '/pricing', label: '定价方案' },
          ].map((it) => (
            <Link
              key={it.to}
              to={it.to}
              className="rounded-lg border border-transparent px-3 py-2 text-xs md:text-sm text-neutral-600 hover:border-violet-200 hover:bg-white hover:text-violet-700 transition-colors"
            >
              {it.label}
            </Link>
          ))}
        </div>

        {/* 页脚提示 */}
        <p className="mt-16 text-xs text-neutral-400">
          错误编号：HTTP 404 · 页面未找到
        </p>
      </div>
    </div>
  )
}
