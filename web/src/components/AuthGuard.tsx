// 路由守卫 — 未登录时弹出全局登录弹窗（不再跳转 /login 页面）
//
// 用法：<AuthGuard><WritingPage /></AuthGuard>
// 放在需要登录的路由组件外层
// 未登录 → 打开 LoginModal + 记录当前路径为跳转目标；登录成功 → 自动跳转

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuthStore, type AuthUser } from '../store/useAuthStore'
import { getToken, setToken } from '../services/api'

const DEV_USER: AuthUser = {
  id: 'dev-user-001',
  email: 'dev@mank.tv',
  nickname: '漫剧圈开发者',
  avatar: null,
  bio: '本地开发模式自动注入的演示账号',
  role: 'user',
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const openLoginModal = useAuthStore((s) => s.openLoginModal)

  // 状态：检查中 / 未登录 / 已登录
  const [state, setState] = useState<'checking' | 'guest' | 'authed'>('checking')
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    // Dev 模式自动登录
    const isDevBuild = import.meta.env?.DEV === true
    const devBypass = isDevBuild ? localStorage.getItem('mank_tv_dev_auth') : null
    if (devBypass === '1') {
      if (!getToken()) setToken('dev-token-local-injected')
      const store = useAuthStore.getState()
      if (!store.user) {
        const setState = (store as any).setState
        if (setState) setState({ user: DEV_USER })
        else (store as any).setUser?.(DEV_USER)
      }
      setState('authed')
      return
    }

    const token = getToken()
    if (!token) {
      // 无 token → 未登录，打开弹窗并记录当前路径为登录后跳转目标
      setState('guest')
      const redirectTo = window.location.pathname + window.location.search + window.location.hash
      openLoginModal('login', redirectTo)
      return
    }

    // 有 token
    if (user) {
      // 已有用户信息 → 直接放行
      setState('authed')
    } else {
      // 有 token 但无 user 信息 → 拉取用户信息
      hasFetchedRef.current = true
      fetchMe()
      // fetchMe 内部吞掉了错误，这里用超时兜底
      // 如果 3 秒后 user 还是 null，认为 token 失效
      const timer = setTimeout(() => {
        if (!getToken() || !useAuthStore.getState().user) {
          setState('guest')
          const redirectTo = window.location.pathname + window.location.search + window.location.hash
          openLoginModal('login', redirectTo)
        }
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [])

  // 监听 user 变化：登录成功后立即放行
  useEffect(() => {
    if (user && state !== 'authed') {
      setState('authed')
    }
  }, [user, state])

  // 未登录 / 检查中 → 显示占位 + 登录弹窗
  if (state !== 'authed') {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-white cursor-pointer select-none"
        onClick={() => {
          const redirectTo = window.location.pathname + window.location.search + window.location.hash
          openLoginModal('login', redirectTo)
        }}
      >
        <div className="text-center">
          <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-lg">
            {state === 'checking' ? (
              <svg className="h-7 w-7 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="h-7 w-7 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 2.25H6a2.25 2.25 0 00-2.25 2.25v15A2.25 2.25 0 006 21.75h12a2.25 2.25 0 002.25-2.25V8.25L15.75 2.25z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 2.25v6h6M12 11.25h.008v.008H12v-.008zm0 2.25h.008v.008H12v-.008zm0 2.25h.008v.008H12v-.008zm-2.25-2.25h.008v.008H9.75v-.008zm0 2.25h.008v.008H9.75v-.008zm0 2.25h.008v.008H9.75v-.008zm4.5-2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008z" />
              </svg>
            )}
          </div>
          <p className="text-base font-semibold text-neutral-800">
            {state === 'checking' ? '正在验证登录状态...' : '请先登录后继续'}
          </p>
          <p className="mt-1.5 text-sm text-neutral-500">
            {state === 'checking' ? '请稍候' : '点击任意位置打开登录弹窗'}
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
