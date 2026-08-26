import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogIn, LogOut, User, Menu, X, Shield, Settings } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { getToken } from '../../services/api'
import logo from '../../assets/logo.svg'

export const NAV_ITEMS = [
  { label: '首页', to: '/' },
  { label: '小说写作', to: '/novel' },
  { label: '图像创作', to: '/image' },
  { label: '漫画创作', to: '/comic' },
  { label: '音频创作', to: '/audio' },
  { label: '视频创作', to: '/video' },
  { label: '社区', to: '/community' },
  { label: '定价', to: '/pricing' },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const { user, logout, fetchMe } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  // 有 token 但 user 未加载 → 获取用户信息（仅在挂载时执行一次）
  const hasToken = !!getToken()
  useEffect(() => {
    if (hasToken && !user) {
      fetchMe()
    }
  }, [hasToken, user, fetchMe])

  // 抽屉打开时：锁滚动 + Esc 关闭；路由变化时关闭
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [mobileOpen])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const isCreator =
    pathname.startsWith('/workspace') ||
    pathname.startsWith('/editor')

  const isActive = (to: string) => {
    if (to === '/') return pathname === '/'
    return pathname === to || pathname.startsWith(to + '/')
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <img src={logo} alt="MankTV logo" className="h-8 w-8" />
          <span className="text-[15px] tracking-tight">MankTV</span>
        </Link>

        {/* 导航（非创作页才展示） */}
        {!isCreator && (
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive(n.to)
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}

        {/* 右侧操作区 */}
        <div className="flex items-center gap-2">
          {/* 移动端汉堡菜单（非创作页才展示） */}
          {!isCreator && (
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="btn-ghost !px-2 !py-1.5 md:hidden"
              aria-label="打开菜单"
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          {isCreator ? (
            <Link to="/" className="btn-ghost">
              返回首页
            </Link>
          ) : user ? (
            /* 已登录：头像 + 退出 */
            <>
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-50 text-brand-700 text-sm font-medium">
                <User className="h-3.5 w-3.5" />
                {user.nickname}
              </div>
              <button
                onClick={logout}
                className="btn-ghost !px-3 !py-1.5 text-sm"
                title="退出登录"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
              <Link
                to="/novel"
                className="btn-primary !px-4 !py-1.5 text-sm font-semibold"
                style={{
                  background: 'linear-gradient(135deg, var(--brand-500, #3B82F6) 0%, var(--brand-400, #60A5FA) 100%)',
                }}
              >
                开始创作
              </Link>
              <Link to="/settings" className="btn-ghost !px-3 !py-1.5 text-sm" title="个人中心">
                <Settings className="h-3.5 w-3.5" />
                个人中心
              </Link>
              {user && (user.role === "admin" || user.role === "superadmin") && (
                <Link to="/admin" className="btn-ghost !px-3 !py-1.5 text-sm" title="管理后台">
                  <Shield className="h-3.5 w-3.5" />
                  管理后台
                </Link>
              )}
            </>
          ) : (
            /* 未登录：登录 + 开始创作 */
            <>
              <Link to="/about" className="btn-ghost hidden sm:inline-flex">
                关于我们
              </Link>
              <Link to="/login" className="btn-ghost !px-3 !py-1.5 text-sm font-medium">
                <LogIn className="h-3.5 w-3.5" />
                登录
              </Link>
              <Link
                to="/login"
                className="btn-primary !px-4 !py-1.5 text-sm font-semibold"
                style={{
                  background: 'linear-gradient(135deg, var(--brand-500, #3B82F6) 0%, var(--brand-400, #60A5FA) 100%)',
                }}
              >
                开始创作
              </Link>
            </>
          )}
        </div>
      </div>

      {/* 移动端抽屉 + 遮罩 */}
      {!isCreator && (
        <>
          {/* 遮罩 */}
          <div
            className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity md:hidden ${
              mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* 抽屉 */}
          <aside
            id="mobile-nav-drawer"
            className={`fixed right-0 top-0 z-50 h-full w-72 max-w-[85vw] transform bg-white shadow-xl transition-transform duration-300 ease-out md:hidden ${
              mobileOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
          >
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
              <span className="text-sm font-semibold text-slate-900">导航</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="btn-ghost !px-2 !py-1.5"
                aria-label="关闭菜单"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-col gap-0.5 overflow-y-auto p-3" aria-label="移动端主导航">
              {NAV_ITEMS.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`rounded-md px-3.5 py-2.5 text-sm font-medium transition-colors ${
                    isActive(n.to)
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>

            {/* 个人中心入口 */}
            {user && (
              <Link to="/settings" className="rounded-md px-3.5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
                <Settings className="h-4 w-4 inline mr-1.5" />
                个人中心
              </Link>
            )}

            {/* 管理员入口 */}
            {user && (user.role === "admin" || user.role === "superadmin") && (
              <Link to="/admin" className="rounded-md px-3.5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
                <Shield className="h-4 w-4 inline mr-1.5" />
                管理后台
              </Link>
            )}

            {/* 用户操作区 */}
            <div className="mt-auto border-t border-slate-200 p-3">
              {user ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-brand-50 text-brand-700 text-sm font-medium">
                    <User className="h-4 w-4" />
                    {user.nickname}
                  </div>
                  <button
                    onClick={logout}
                    className="btn-ghost w-full justify-start !px-3 !py-2 text-sm"
                  >
                    <LogOut className="h-4 w-4" />
                    退出登录
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link to="/about" className="btn-ghost w-full justify-start !px-3 !py-2 text-sm">
                    关于我们
                  </Link>
                  <Link to="/login" className="btn-ghost w-full justify-start !px-3 !py-2 text-sm">
                    <LogIn className="h-4 w-4" />
                    登录
                  </Link>
                  <Link
                    to="/login"
                    className="btn-primary w-full justify-center !px-4 !py-2 text-sm font-semibold"
                    style={{
                      background: 'linear-gradient(135deg, var(--brand-500, #3B82F6) 0%, var(--brand-400, #60A5FA) 100%)',
                    }}
                  >
                    开始创作
                  </Link>
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </header>
  )
}
