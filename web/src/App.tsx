import { Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import Workspace from './pages/Workspace'

// —— 登录/注册 ——
import LoginPage from './pages/LoginPage'
import { AuthGuard } from './components/AuthGuard'

// —— 功能区：预览 Landing 页（点击进入后才进入工作区）——
import NovelLanding from './pages/NovelLanding'
import ImageLanding from './pages/ImageLanding'
import ComicLanding from './pages/ComicLanding'
import AudioLanding from './pages/AudioLanding'
import VideoLanding from './pages/VideoLanding'
import CommunityLanding from './pages/CommunityLanding'

// —— 功能区：真实工作区 ——
import WritingPage from './pages/WritingPage'
import ImagePage from './pages/ImagePage'
import ComicPage from './pages/ComicPage'
import AudioPage from './pages/AudioPage'
import VideoPage from './pages/VideoPage'
import CommunityPage from './pages/CommunityPage'

import PricingPage from './pages/PricingPage'
import AboutPage from './pages/AboutPage'
import AdminPage from './pages/AdminPage'
import SettingsPage from './pages/SettingsPage'

function App() {
  return (
    <Routes>
      {/* 首页 */}
      <Route path="/" element={<HomePage />} />

      {/* 登录/注册 */}
      <Route path="/login" element={<LoginPage />} />

      {/* ========= 功能预览页（Landing，对标参考UI「先预览 → 再点进入」） ========= */}
      <Route path="/novel" element={<NovelLanding />} />
      <Route path="/image" element={<ImageLanding />} />
      <Route path="/comic" element={<ComicLanding />} />
      <Route path="/audio" element={<AudioLanding />} />
      <Route path="/video" element={<VideoLanding />} />
      <Route path="/community" element={<CommunityLanding />} />

      {/* ========= 功能工作区（真正的 IDE 页面）—— 需登录 ========= */}
      <Route path="/workspace/writing" element={<AuthGuard><WritingPage /></AuthGuard>} />
      <Route path="/workspace/image" element={<AuthGuard><ImagePage /></AuthGuard>} />
      <Route path="/workspace/comic" element={<AuthGuard><ComicPage /></AuthGuard>} />
      <Route path="/workspace/audio" element={<AuthGuard><AudioPage /></AuthGuard>} />
      <Route path="/workspace/video" element={<AuthGuard><VideoPage /></AuthGuard>} />
      <Route path="/workspace/community" element={<AuthGuard><CommunityPage /></AuthGuard>} />

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

      {/* 404 → 首页 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
