// 路由守卫 — 未登录时跳转到登录页
//
// 用法：<AuthGuard><WritingPage /></AuthGuard>
// 放在需要登录的路由组件外层

import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { getToken } from '../services/api'

export function AuthGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { user, fetchMe } = useAuthStore()
  // 在挂载时读取一次 token，避免 render 阶段调用 navigate
  //（render 阶段 navigate 在 React 19 下会抛错且 URL 不更新）
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    // 有 token 但 user 未加载 → 尝试获取用户信息
    if (token && !user) {
      fetchMe()
    }
    setReady(true)
  }, [])

  if (!ready) {
    // 渲染空白占位，等 useEffect 决定是跳走还是放行
    return null
  }

  return <>{children}</>
}
