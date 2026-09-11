// LoginModal — 全局登录/注册弹窗（左右分栏布局）
// 登录方式：UID + 密码 / 微信扫码
// 左侧：品牌视觉图 + Logo
// 右侧：Tab 切换 + 对应表单 + 底部协议勾选
// 触发方式：未登录时点击任意位置 / AuthGuard 拦截 / 导航栏「登录」按钮
// 登录/注册成功后由 store 自动关闭（loginModalOpen=false）

import { useState, useEffect, useRef } from 'react'
import { X, QrCode, Lock } from 'lucide-react'
import { useAuthStore } from '../store/useAuthStore'
import logo from '../assets/logo.png'
import { useSiteConfig, useSiteThemeVars } from '../hooks/useSiteConfig'
import LegalModal, { type LegalType } from '../components/LegalModal'
import ContactAdminModal from '../components/ContactAdminModal'

type TabType = 'password' | 'wechat'

export default function LoginModal() {
  const {
    login,
    register,
    loading,
    error,
    clearError,
    loginModalOpen,
    loginModalMode,
    closeLoginModal,
    getWechatQrcode,
    pollWechatStatus,
  } = useAuthStore()
  const { siteName, primaryColor } = useSiteThemeVars()
  const { get } = useSiteConfig()

  const freeTokens = get('login.new_user_tokens', 100_000) as number

  // 当前 Tab
  const [tab, setTab] = useState<TabType>('password')
  // 密码 Tab 下的子模式：登录 / 注册
  const [isRegister, setIsRegister] = useState(false)

  // 共用字段
  const [uid, setUid] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')

  // 微信扫码
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [sceneId, setSceneId] = useState('')
  const [qrStatus, setQrStatus] = useState<'loading' | 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'error'>('loading')
  const [qrErrorMsg, setQrErrorMsg] = useState('')
  const pollTimerRef = useRef<number | null>(null)

  // ===== 左侧展示：视频节点 17（单一循环视频） =====
  const HERO_VIDEO = '/hero-2.mp4'

  // 协议勾选
  const [agreeAll, setAgreeAll] = useState(false)
  const [legalOpen, setLegalOpen] = useState<LegalType | null>(null)
  const [agreeError, setAgreeError] = useState('')

  // 弹窗打开时同步模式
  useEffect(() => {
    if (loginModalOpen) {
      if (loginModalMode === 'register') {
        setTab('password')
        setIsRegister(true)
      } else {
        setTab('password')
        setIsRegister(false)
      }
      setAgreeError('')
      clearError()
    } else {
      setLegalOpen(null)
      // 清理定时器
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [loginModalOpen, loginModalMode, clearError])

  // 切换到微信 Tab 时加载二维码
  useEffect(() => {
    if (tab === 'wechat' && loginModalOpen && !qrCodeUrl) {
      loadQrcode()
    }
    // 离开微信 Tab 时清理轮询
    if (tab !== 'wechat' && pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [tab, loginModalOpen])

  // ESC 键关闭
  useEffect(() => {
    if (!loginModalOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLoginModal() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [loginModalOpen, closeLoginModal])

  // 锁定背景滚动（防止弹窗打开时页面跟着滚）
  useEffect(() => {
    if (!loginModalOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [loginModalOpen])

  // 加载微信二维码
  const loadQrcode = async () => {
    setQrStatus('loading')
    try {
      const res = await getWechatQrcode()
      setQrCodeUrl(res.qrCodeUrl)
      setSceneId(res.sceneId)
      setQrStatus('waiting')
      // 开始轮询
      startPolling(res.sceneId)
    } catch (e: unknown) {
      setQrErrorMsg(e instanceof Error ? e.message : '微信登录暂时不可用')
      setQrStatus('error')
    }
  }

  // 轮询扫码状态
  const startPolling = (sid: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    pollTimerRef.current = window.setInterval(async () => {
      try {
        const res = await pollWechatStatus(sid)
        if (res.status === 'scanned') setQrStatus('scanned')
        if (res.status === 'confirmed') {
          setQrStatus('confirmed')
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current)
            pollTimerRef.current = null
          }
        }
        if (res.status === 'expired') {
          setQrStatus('expired')
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current)
            pollTimerRef.current = null
          }
        }
      } catch {
        // 忽略轮询错误
      }
    }, 2000)
  }

  // 检查协议勾选
  const checkAgreement = (): boolean => {
    if (!agreeAll) {
      setAgreeError('请先阅读并勾选《用户协议》与《隐私政策》')
      return false
    }
    setAgreeError('')
    return true
  }

  // 密码登录提交
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    if (!checkAgreement()) return
    await login(uid.trim(), password)
  }

  // 注册提交 — 暂不支持自助注册，引导联系管理员
  const [showContactAdmin, setShowContactAdmin] = useState(false)
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    if (!checkAgreement()) return
    setShowContactAdmin(true)
  }

  // 主色派生物
  const btnGrad = { backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${shade(primaryColor, 18)})` }
  const inputFocus = {
    '--tw-ring-color': `color-mix(in srgb, ${primaryColor} 28%, white)`,
    outlineColor: primaryColor,
  } as React.CSSProperties

  if (!loginModalOpen) return null

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'password', label: '密码登录', icon: <Lock size={14} /> },
    { key: 'wechat', label: '微信扫码', icon: <QrCode size={14} /> },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={closeLoginModal}
    >
      {/* 左右分栏容器 */}
      <div
        className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl flex"
        style={{ aspectRatio: '16/9', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={closeLoginModal}
          className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ========== 左侧：视频 + 图片混合轮播视觉区 ========== */}
        <div
          className="relative hidden w-1/2 flex-col justify-between overflow-hidden sm:flex"
          style={{ background: `linear-gradient(135deg, ${primaryColor}15 0%, ${primaryColor}08 100%)` }}
        >
          {/* 媒体层：仅展示视频节点 17（hero-2.mp4） */}
          <div className="absolute inset-0">
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src={HERO_VIDEO}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
            />
          </div>

          {/* 渐变遮罩：半透明让 Logo 更清晰 */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.35)' }}
            aria-hidden
          />

          {/* Logo + 书法字图片 */}
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3">
            <img src={logo} alt={`${siteName} logo`} className="h-14 w-14 drop-shadow-xl opacity-90" />
            <img
              src="/brush-subtitle.png"
              alt="一个人的独立漫剧工作室"
              className="w-[42%] max-w-[180px] drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]"
            />
          </div>
        </div>

        {/* ========== 右侧：表单区 ========== */}
        <div className="flex w-full flex-col sm:w-1/2">
          <div className="flex flex-1 flex-col overflow-hidden px-8 py-6 sm:px-10">
            {/* 品牌 Logo 区 */}
            <div className="mb-5 flex items-center gap-3">
              <img src={logo} alt={`${siteName} logo`} className="h-10 w-10" />
              <div>
                <div className="text-lg font-bold leading-tight text-neutral-900">{siteName}</div>
                <div className="text-[11px] text-neutral-500">AI 漫剧创作平台</div>
              </div>
            </div>

            {/* 注册赠送提示（仅注册模式显示） */}
            {tab === 'password' && isRegister && (
              <div className="mb-4 text-center sm:text-left">
                <p
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: `${primaryColor}10`,
                    color: primaryColor,
                    border: `1px solid ${primaryColor}25`,
                  }}
                >
                  🎁 注册即赠送 {freeTokens.toLocaleString()} 积分
                </p>
              </div>
            )}

            {/* Tab 切换 */}
            <div className="mb-4 flex items-center gap-1 rounded-lg bg-neutral-100 p-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setTab(t.key); clearError(); setAgreeError('') }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                    tab === t.key
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  {t.icon}
                  <span className="hidden md:inline">{t.label}</span>
                  <span className="md:hidden">{t.label.replace('登录', '').replace('扫码', '')}</span>
                </button>
              ))}
            </div>

            {/* 错误提示 */}
            {(error || agreeError) && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">
                {error || agreeError}
              </div>
            )}

            {/* 表单内容区 */}
            <div className="flex-1">
              {/* 密码登录 / 注册 */}
              {tab === 'password' && (
                <form onSubmit={isRegister ? handleRegister : handlePasswordLogin} className="space-y-3">
                  {!isRegister && (
                    <div>
                      <label htmlFor="login-uid" className="mb-1 block text-xs font-medium text-neutral-600">UID</label>
                      <input
                        id="login-uid"
                        type="text"
                        inputMode="numeric"
                        value={uid}
                        onChange={(e) => setUid(e.target.value.replace(/\D/g, ''))}
                        required
                        placeholder="请输入 UID"
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2 text-sm outline-none transition hover:border-neutral-300 focus:border-transparent focus:bg-white focus:ring-2"
                        style={inputFocus}
                      />
                    </div>
                  )}
                  {isRegister && (
                    <div>
                      <label htmlFor="register-nickname" className="mb-1 block text-xs font-medium text-neutral-600">昵称</label>
                      <input
                        id="register-nickname"
                        type="text"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="给自己起个名字吧"
                        className="w-full rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2 text-sm outline-none transition hover:border-neutral-30 focus:border-transparent focus:bg-white focus:ring-2"
                        style={inputFocus}
                      />
                      <p className="mt-1 text-[10px] text-neutral-400">注册成功后系统将自动分配 UID</p>
                    </div>
                  )}
                  <div>
                    <label htmlFor="login-password" className="mb-1 block text-xs font-medium text-neutral-600">密码</label>
                    <input
                      id="login-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="请输入密码（至少 6 位）"
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2 text-sm outline-none transition hover:border-neutral-300 focus:border-transparent focus:bg-white focus:ring-2"
                      style={inputFocus}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-1 w-full rounded-lg py-2.5 text-sm font-medium text-white shadow-md transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                    style={btnGrad}
                  >
                    {loading ? '请稍候...' : isRegister ? '注册' : '登录'}
                  </button>
                  <p className="text-center text-xs text-neutral-500">
                    {isRegister ? '已有账号？' : '还没有账号？'}
                    <button
                      type="button"
                      onClick={() => { setIsRegister(!isRegister); clearError(); setAgreeError('') }}
                      className="ml-1 font-medium"
                      style={{ color: primaryColor }}
                    >
                      {isRegister ? '去登录' : '立即注册'}
                    </button>
                  </p>
                </form>
              )}

              {/* 微信扫码登录 */}
              {tab === 'wechat' && (
                <div className="flex flex-col items-center justify-center py-2">
                  <div className="relative mb-4 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
                    {qrStatus === 'loading' && (
                      <div className="flex h-48 w-48 items-center justify-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-200 border-t-current" style={{ color: primaryColor }} />
                      </div>
                    )}
                    {qrStatus === 'waiting' && qrCodeUrl && (
                      <img src={qrCodeUrl} alt="微信扫码登录" className="h-48 w-48" />
                    )}
                    {qrStatus === 'scanned' && (
                      <div className="absolute inset-3 flex flex-col items-center justify-center rounded-lg bg-white/90 backdrop-blur-sm">
                        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-neutral-700">扫码成功</p>
                        <p className="mt-1 text-xs text-neutral-500">请在手机上确认登录</p>
                      </div>
                    )}
                    {qrStatus === 'confirmed' && (
                      <div className="absolute inset-3 flex flex-col items-center justify-center rounded-lg bg-white/90 backdrop-blur-sm">
                        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-neutral-700">登录成功</p>
                        <p className="mt-1 text-xs text-neutral-500">正在跳转...</p>
                      </div>
                    )}
                    {qrStatus === 'expired' && (
                      <div className="absolute inset-3 flex flex-col items-center justify-center rounded-lg bg-white/90 backdrop-blur-sm">
                        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
                          <svg className="h-6 w-6 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-neutral-700">二维码已过期</p>
                        <button
                          type="button"
                          onClick={loadQrcode}
                          className="mt-2 text-xs font-medium"
                          style={{ color: primaryColor }}
                        >
                          点击刷新
                        </button>
                      </div>
                    )}
                    {qrStatus === 'error' && (
                      <div className="absolute inset-3 flex flex-col items-center justify-center rounded-lg bg-white/90 backdrop-blur-sm">
                        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                          <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-neutral-700 text-center px-4">{qrErrorMsg}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500">
                    打开微信扫一扫，关注公众号后自动登录
                  </p>
                </div>
              )}

            </div>
          </div>

          {/* ===== 底部协议勾选区 ===== */}
          <div className="border-t border-neutral-100 bg-neutral-50/60 px-8 py-3 sm:px-10">
            <label className="flex cursor-pointer items-start gap-2 text-xs text-neutral-500">
              <input
                type="checkbox"
                checked={agreeAll}
                onChange={(e) => { setAgreeAll(e.target.checked); setAgreeError('') }}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-neutral-300"
                style={{ accentColor: primaryColor }}
              />
              <span className="leading-5">
                我已阅读并同意
                <button
                  type="button"
                  onClick={() => setLegalOpen('terms')}
                  className="ml-0.5 font-medium underline-offset-2 hover:underline"
                  style={{ color: primaryColor }}
                >
                  《用户协议》
                </button>
                与
                <button
                  type="button"
                  onClick={() => setLegalOpen('privacy')}
                  className="ml-0.5 font-medium underline-offset-2 hover:underline"
                  style={{ color: primaryColor }}
                >
                  《隐私政策》
                </button>
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* 协议条款弹窗 */}
      <LegalModal
        type={legalOpen ?? 'terms'}
        open={legalOpen !== null}
        onClose={() => setLegalOpen(null)}
      />

      {/* 注册暂未开放 — 引导联系管理员 */}
      <ContactAdminModal
        open={showContactAdmin}
        onClose={() => setShowContactAdmin(false)}
        title="注册功能暂未开放"
        description="目前暂不支持自助注册，请联系管理员为您开通账号。"
        tone="blue"
      />
    </div>
  )
}

function shade(hex: string, percent: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const n = parseInt(h, 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  r = Math.round(r + (255 - r) * (percent / 100))
  g = Math.round(g + (255 - g) * (percent / 100))
  b = Math.round(b + (255 - b) * (percent / 100))
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
}
