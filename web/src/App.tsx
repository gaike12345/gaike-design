import { Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import Workspace from './pages/Workspace'

// —— 登录弹窗（全局，点击任意位置触发；登录不再单独跳转页面） ——
import LoginModal from './pages/LoginPage'
import { AuthGuard } from './components/AuthGuard'
import { useAuthStore } from './store/useAuthStore'
import QuotaModal from './components/QuotaModal'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

// /login /register 路由触发器：打开登录弹窗 + 回首页
function LoginTrigger({ mode = 'login' }: { mode?: 'login' }) {
  const openLoginModal = useAuthStore((s) => s.openLoginModal)
  const navigate = useNavigate()
  useEffect(() => {
    openLoginModal(mode)
    navigate('/', { replace: true })
  }, [openLoginModal, mode, navigate])
  return null
}

// —— 功能区：预览 Landing 页（点击进入后才进入工作区）——
import NovelLanding from './pages/NovelLanding'
import AudioLanding from './pages/AudioLanding'
import CanvasLanding from './pages/CanvasLanding'

// —— 功能区：真实工作区 ——
import WritingPage from './pages/WritingPage'
import AudioPage from './pages/AudioPage'
import CommunityPage from './pages/CommunityPage'
import CanvasPage from './pages/CanvasPage'

import PricingPage from './pages/PricingPage'
import AboutPage from './pages/AboutPage'
import AdminPage from './pages/AdminPage'
import SettingsPage from './pages/SettingsPage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  return (
    <>
    <Routes>
      {/* 首页 */}
      <Route path="/" element={<HomePage />} />

      {/* 登录/注册：不再单独页面，打开弹窗后回首页 */}
      <Route path="/login" element={<LoginTrigger mode="login" />} />
      <Route path="/register" element={<LoginTrigger mode="register" />} />

      {/* ========= 功能预览页（Landing，对标参考UI「先预览 → 再点进入」） ========= */}
      <Route path="/novel" element={<NovelLanding />} />
      <Route path="/image" element={<Navigate to="/canvas" replace />} />
      <Route path="/video" element={<Navigate to="/canvas" replace />} />
      <Route path="/audio" element={<AudioLanding />} />
      <Route path="/canvas" element={<CanvasLanding />} />

      {/* 社区：直接进广场（公开访问，跳过 Landing 预览页） */}
      <Route path="/community" element={<CommunityPage />} />

      {/* ========= 功能工作区（真正的 IDE 页面）—— 需登录 ========= */}
      <Route path="/workspace/writing" element={<AuthGuard><WritingPage /></AuthGuard>} />
      <Route path="/workspace/image" element={<Navigate to="/workspace/canvas" replace />} />
      <Route path="/workspace/video" element={<Navigate to="/workspace/canvas" replace />} />
      <Route path="/workspace/canvas" element={<AuthGuard><CanvasPage /></AuthGuard>} />
      <Route path="/workspace/audio" element={<AuthGuard><AudioPage /></AuthGuard>} />
      <Route path="/workspace/community" element={<Navigate to="/community" replace />} />

      {/* 公共信息页 */}
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/about" element={<AboutPage />} />

      {/* 全局工作台 */}
      <Route path="/workspace" element={<AuthGuard><Workspace /></AuthGuard>} />

      {/* 管理后台 — 需登录 + admin 角色 */}
      <Route path="/admin" element={<AuthGuard><AdminPage /></AuthGuard>} />

      {/* 个人中心 — 需登录 */}
      <Route path="/settings" element={<AuthGuard><SettingsPage /></AuthGuard>} />

      {/* 旧编辑器入口 — 兼容重定向到预览页 */}
      <Route path="/editor/:projectId" element={<Navigate to="/novel" replace />} />
      <Route path="/editor" element={<Navigate to="/novel" replace />} />

      {/* 404：展示 NotFoundPage 而不是跳首页（SEO + 用户体验友好） */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    {/* 全局登录弹窗（任意位置可触发） */}
    <LoginModal />
    {/* 全局积分不足弹窗（API 402 / 前端预检触发） */}
    <QuotaModal />
    </>
  )
}

export default App
