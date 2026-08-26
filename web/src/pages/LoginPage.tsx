// 登录/注册页面 — MankTV
//
// 品牌主色主题，与全站一致
// 支持登录/注册切换

import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import logo from '../assets/logo.svg'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, register, loading, error, clearError, user } = useAuthStore()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')

  // 已登录则跳转
  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    let ok = false
    if (mode === 'login') {
      ok = await login(email, password)
    } else {
      ok = await register(email, password, nickname || email.split('@')[0])
    }
    if (ok) {
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-brand-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <img src={logo} alt="MankTV logo" className="h-10 w-10" />
            <span className="text-2xl font-bold text-brand-600">MankTV</span>
          </Link>
        </div>

        {/* 表单卡片 */}
        <div className="bg-white rounded-2xl shadow-xl border border-brand-100 p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-6 text-center">
            {mode === 'login' ? '登录' : '注册'}
          </h1>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">密码</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="至少 6 位"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none transition"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label htmlFor="nickname" className="block text-sm font-medium text-slate-700 mb-1">昵称（可选）</label>
                <input
                  id="nickname"
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="留空则用邮箱前缀"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none transition"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 text-white font-medium hover:from-brand-600 hover:to-brand-700 disabled:opacity-50 transition shadow-md"
            >
              {loading ? '请稍候...' : mode === 'login' ? '登录' : '注册'}
            </button>
          </form>

          {/* 切换登录/注册 */}
          <div className="mt-6 text-center text-sm text-slate-500">
            {mode === 'login' ? '还没有账号？' : '已有账号？'}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                clearError()
              }}
              className="ml-1 text-brand-600 hover:text-brand-700 font-medium"
            >
              {mode === 'login' ? '去注册' : '去登录'}
            </button>
          </div>
        </div>

        {/* 返回首页 */}
        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-600">
            返回首页
          </Link>
        </div>
      </div>
    </div>
  )
}
