// 路由守卫 — 未登录时弹出全局登录弹窗（不再跳转 /login 页面）
//
// 用法：<AuthGuard><WritingPage /></AuthGuard>
// 放在需要登录的路由组件外层
// 未登录 → 打开 LoginModal + 记录当前路径为跳转目标；登录成功 → 自动跳转
//
// 验证策略（乐观优先）：
//   有 token → 立即放行显示内容，后台静默拉取用户信息
//              若验证失败（token 失效），再弹出登录窗
//   无 token → 直接显示未登录占位 + 弹出登录窗
//
// 开发模式自动登录说明：
//   仅在 Vite 开发模式 (import.meta.env.DEV) 下生效，
//   生产构建时该代码块会被 dead-code elimination 完全移除。
//   手动启用：在浏览器控制台执行 localStorage.setItem('mank_tv_dev_auth', '1') 后刷新。

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { getToken, setToken } from '../services/api'
import logger from '../utils/logger'

export function AuthGuard({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const openLoginModal = useAuthStore((s) => s.openLoginModal)
  const closeLoginModal = useAuthStore((s) => s.closeLoginModal)

  // 状态：检查中 / 未登录 / 已登录
  const [state, setState] = useState<'checking' | 'guest' | 'authed'>('checking')
  const hasFetchedRef = useRef(false)
  const verifiedRef = useRef(false)

  // 获取当前路径（登录后跳转目标）
  const getRedirectTo = () =>
    window.location.pathname + window.location.search + window.location.hash

  useEffect(() => {
    // —— 开发模式自动登录（仅开发构建，生产构建会被完全移除）——
    if (import.meta.env.DEV) {
      const devBypass = localStorage.getItem('mank_tv_dev_auth')
      if (devBypass === '1') {
        const DEV_USER = {
          id: 'dev-user-001',
          uid: 10000,
          email: 'dev@mank.tv',
          nickname: '漫剧圈开发者',
          avatar: null,
          bio: '本地开发模式自动注入的演示账号',
          role: 'user' as const,
        }
        if (!getToken()) setToken('dev-token-local-injected')
        const store = useAuthStore.getState()
        if (!store.user) {
          useAuthStore.setState({ user: DEV_USER })
        }
        logger.warn(
          'AuthGuard',
          '[DEV MODE] 已启用开发模式自动登录',
          '禁用：localStorage.removeItem("mank_tv_dev_auth")'
        )
        setState('authed')
        verifiedRef.current = true
        return
      }
    }

    const token = getToken()
    if (!token) {
      // 无 token → 未登录，打开弹窗
      setState('guest')
      openLoginModal('login', getRedirectTo())
      return
    }

    // 有 token
    if (user) {
      // 已有用户信息 → 直接放行
      setState('authed')
      verifiedRef.current = true
    } else {
      // 有 token 但无 user 信息 → 乐观放行 + 后台静默验证
      // 先显示内容，避免用户看到加载页
      setState('authed')
      hasFetchedRef.current = true

      fetchMe().then(() => {
        verifiedRef.current = true
        // 验证完成后检查 user 是否存在
        // 如果 fetchMe 失败，它内部会清除 token 并把 user 设为 null
        if (!useAuthStore.getState().user) {
          setState('guest')
          openLoginModal('login', getRedirectTo())
        }
      })

      // 超时兜底（8 秒）：如果 fetchMe 一直没返回，认为网络异常，弹出登录窗
      const timer = setTimeout(() => {
        if (!useAuthStore.getState().user) {
          setState('guest')
          openLoginModal('login', getRedirectTo())
        }
      }, 8000)

      return () => clearTimeout(timer)
    }
  }, [])

  // 监听 user 从有到无（token 失效 / 主动登出）→ 弹出登录窗
  useEffect(() => {
    if (!user && state === 'authed' && verifiedRef.current) {
      setState('guest')
      openLoginModal('login', getRedirectTo())
    }
  }, [user, state])

  // 未登录 → 显示占位 + 登录弹窗
  if (state === 'guest') {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-white cursor-pointer select-none"
        onClick={() => {
          openLoginModal('login', getRedirectTo())
        }}
      >
        <div className="text-center">
          <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-lg">
            <svg className="h-7 w-7 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 2.25H6a2.25 2.25 0 00-2.25 2.25v15A2.25 2.25 0 006 21.75h12a2.25 2.25 0 002.25-2.25V8.25L15.75 2.25z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 2.25v6h6M12 11.25h.008v.008H12v-.008zm0 2.25h.008v.008H12v-.008zm0 2.25h.008v.008H12v-.008zm-2.25-2.25h.008v.008H9.75v-.008zm0 2.25h.008v.008H9.75v-.008zm0 2.25h.008v.008H9.75v-.008zm4.5-2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-neutral-800">请先登录后继续</p>
          <p className="mt-1.5 text-sm text-neutral-500">点击任意位置打开登录弹窗</p>
        </div>
      </div>
    )
  }

  // checking 状态（极少出现，仅在无 token 时的短暂瞬间）→ 轻量占位，不阻塞
  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-white">
        <div className="text-center">
          <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-lg">
            <svg className="h-7 w-7 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-neutral-800">加载中...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
