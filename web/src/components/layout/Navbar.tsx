import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogIn, LogOut, User, Menu, X, Shield, Settings, Bell, ExternalLink } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { getToken } from '../../services/api'
import { useSiteThemeVars } from '../../hooks/useSiteConfig'
import logo from '../../assets/logo.png'

export const NAV_ITEMS = [
  { label: '首页', to: '/' },
  { label: '小说写作', to: '/novel' },
  { label: '创作画布', to: '/canvas' },
  { label: '音频创作', to: '/audio' },
  { label: '社区', to: '/community' },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const { user, logout, fetchMe, openLoginModal } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { siteName, primaryColor, announcement, announcementLink } = useSiteThemeVars()

  // 把品牌主色注入到 :root 的 CSS 变量（全局生效）
  useEffect(() => {
    const s = document.documentElement.style
    s.setProperty('--site-primary', primaryColor)
    // 生成强调色衍生（hover / light）
    const h = hexToRgb(primaryColor)
    if (h) {
      s.setProperty('--site-primary-rgb', `${h.r}, ${h.g}, ${h.b}`)
      s.setProperty('--site-primary-light', `rgba(${h.r}, ${h.g}, ${h.b}, 0.12)`)
      s.setProperty('--site-primary-ring', `rgba(${h.r}, ${h.g}, ${h.b}, 0.28)`)
    }
  }, [primaryColor])

  // 有 token 但 user 未加载 → 获取用户信息
  const hasToken = !!getToken()
  useEffect(() => {
    if (hasToken && !user) fetchMe()
  }, [hasToken, user, fetchMe])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [mobileOpen])

  useEffect(() => { setMobileOpen(false) }, [pathname])

  const isCreator =
    pathname.startsWith('/workspace') ||
    pathname.startsWith('/editor')

  const isActive = (to: string) => {
    if (to === '/') return pathname === '/'
    return pathname === to || pathname.startsWith(to + '/')
  }

  // 用内联 style 合成渐变色值，替换硬编码 violet
  const primaryBgGradient = { backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${lighten(primaryColor, 18)})` }
  const primaryShadow = { boxShadow: `0 4px 14px -2px rgba(var(--site-primary-rgb, 124,58,237), 0.35)` }
  const activeStyle = (active: boolean) =>
    active
      ? { backgroundColor: 'var(--site-primary-light)', color: primaryColor, boxShadow: 'inset 0 0 0 1px var(--site-primary-ring)' }
      : undefined

  const Announcement = announcement && announcement.trim() ? (
    <div className="w-full" style={{ backgroundColor: primaryColor }}>
      <div className="container-page flex items-center justify-center gap-2 py-1.5 text-[12px] font-medium text-white/95">
        <Bell className="h-3.5 w-3.5" />
        {announcementLink ? (
          <a href={announcementLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
            {announcement}
            <ExternalLink className="h-3 w-3 opacity-80" />
          </a>
        ) : (
          <span>{announcement}</span>
        )}
      </div>
    </div>
  ) : null

  return (
    <div className="sticky top-0 z-40">
      {Announcement}
      <header className="border-b border-neutral-200/80 bg-white/85 backdrop-blur-md">
        <div className="container-page flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-semibold text-neutral-900">
            <img src={logo} alt={`${siteName} logo`} className="h-8 w-8" />
            <span className="text-[15px] tracking-tight">{siteName}</span>
          </Link>

          {/* 桌面导航（非创作页才展示） */}
          {!isCreator && (
            <nav className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  style={activeStyle(isActive(n.to))}
                  className="rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          )}

          {/* 右侧操作区 */}
          <div className="flex items-center gap-2">
            {!isCreator && (
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="btn-ghost !px-2 !py-1.5 md:hidden text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors"
                aria-label="打开菜单"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            {isCreator ? (
              <Link to="/" className="btn-ghost text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100">返回首页</Link>
            ) : user ? (
              <>
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border"
                  style={{
                    backgroundColor: 'var(--site-primary-light)',
                    color: primaryColor,
                    borderColor: 'var(--site-primary-ring)',
                    boxShadow: 'inset 0 0 0 1px var(--site-primary-light)',
                  }}
                >
                  <User className="h-3.5 w-3.5" />
                  {user.nickname}
                </div>
                <button
                  onClick={logout}
                  className="btn-ghost !px-3 !py-1.5 text-sm text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100"
                  title="退出登录"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
                <Link
                  to="/novel"
                  style={{ ...primaryBgGradient, ...primaryShadow }}
                  className="inline-flex items-center gap-1 rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:brightness-105"
                >
                  开始创作
                </Link>
                <Link to="/settings" className="btn-ghost !px-3 !py-1.5 text-sm text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100" title="个人中心">
                  <Settings className="h-3.5 w-3.5" />
                  个人中心
                </Link>
                {(user.role === 'admin' || user.role === 'superadmin') && (
                  <Link to="/admin" className="btn-ghost !px-3 !py-1.5 text-sm text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100" title="管理后台">
                    <Shield className="h-3.5 w-3.5" />
                    管理后台
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link to="/about" className="btn-ghost hidden sm:inline-flex text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100">关于我们</Link>
                <button type="button" onClick={() => openLoginModal('login')} className="btn-ghost !px-3 !py-1.5 text-sm font-medium text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100">
                  <LogIn className="h-3.5 w-3.5" />
                  登录
                </button>
                <button
                  type="button"
                  onClick={() => openLoginModal('register', '/workspace/writing')}
                  style={{ ...primaryBgGradient, ...primaryShadow }}
                  className="inline-flex items-center gap-1 rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:brightness-105"
                >
                  开始创作
                </button>
              </>
            )}
          </div>
        </div>

        {/* 移动端抽屉 + 遮罩 */}
        {!isCreator && (
          <>
            <div
              className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity md:hidden ${mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <aside
              className={`fixed right-0 top-0 z-50 h-full w-72 max-w-[85vw] transform bg-white shadow-xl border-l border-neutral-200 transition-transform duration-300 ease-out md:hidden ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
              role="dialog" aria-modal="true" aria-label="导航菜单"
            >
              <div className="flex h-16 items-center justify-between border-b border-neutral-200 px-4">
                <span className="text-sm font-semibold text-neutral-900">导航</span>
                <button
                  type="button" onClick={() => setMobileOpen(false)}
                  className="btn-ghost !px-2 !py-1.5 text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100"
                  aria-label="关闭菜单"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex flex-col gap-0.5 overflow-y-auto p-3" aria-label="移动端主导航">
                {NAV_ITEMS.map((n) => (
                  <Link
                    key={n.to} to={n.to}
                    style={activeStyle(isActive(n.to))}
                    className="rounded-md px-3.5 py-2.5 text-sm font-medium transition-colors text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
              {user && (
                <Link to="/settings" className="block mx-3 mt-1 rounded-md px-3.5 py-2.5 text-sm font-medium" style={{ color: primaryColor, backgroundColor: 'var(--site-primary-light)' }}>
                  <Settings className="h-4 w-4 inline mr-1.5" />个人中心
                </Link>
              )}
              {user && (user.role === 'admin' || user.role === 'superadmin') && (
                <Link to="/admin" className="block mx-3 mt-1 rounded-md px-3.5 py-2.5 text-sm font-medium" style={{ color: primaryColor, backgroundColor: 'var(--site-primary-light)' }}>
                  <Shield className="h-4 w-4 inline mr-1.5" />管理后台
                </Link>
              )}
              <div className="absolute bottom-0 left-0 right-0 border-t border-neutral-200 p-3">
                {user ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium"
                      style={{ color: primaryColor, backgroundColor: 'var(--site-primary-light)', boxShadow: 'inset 0 0 0 1px var(--site-primary-ring)' }}
                    >
                      <User className="h-4 w-4" />{user.nickname}
                    </div>
                    <button onClick={logout} className="btn-ghost w-full justify-start !px-3 !py-2 text-sm text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100">
                      <LogOut className="h-4 w-4" /> 退出登录
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Link to="/about" className="btn-ghost w-full justify-start !px-3 !py-2 text-sm text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100">关于我们</Link>
                    <button type="button" onClick={() => openLoginModal('login')} className="btn-ghost w-full justify-start !px-3 !py-2 text-sm text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100">
                      <LogIn className="h-4 w-4" /> 登录
                    </button>
                    <button
                      type="button"
                      onClick={() => openLoginModal('register', '/workspace/writing')}
                      style={{ ...primaryBgGradient, ...primaryShadow }}
                      className="inline-flex items-center justify-center w-full rounded-lg !px-4 !py-2 text-sm font-semibold text-white"
                    >
                      开始创作
                    </button>
                  </div>
                )}
              </div>
            </aside>
          </>
        )}
      </header>
    </div>
  )
}

// ============== 颜色辅助 ==============
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (h.length !== 6) return null
  const num = parseInt(h, 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}
function lighten(hex: string, percent: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const mix = (c: number) => Math.round(c + (255 - c) * (percent / 100))
  return '#' + [rgb.r, rgb.g, rgb.b].map(mix).map(n => n.toString(16).padStart(2, '0')).join('')
}
