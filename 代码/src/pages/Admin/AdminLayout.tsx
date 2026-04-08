import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaHome, FaCube, FaBlog, FaConciergeBell, 
  FaUsers, FaImages, FaEnvelope, FaCog, FaSignOutAlt,
  FaBars, FaTimes, FaShieldAlt, FaLock, FaUser, FaCalendarAlt, FaQuoteLeft
} from 'react-icons/fa';

const menuItems = [
  { path: '/admin', icon: FaHome, label: '仪表盘', color: 'from-blue-500 to-cyan-500' },
  { path: '/admin/works', icon: FaCube, label: '作品管理', color: 'from-purple-500 to-pink-500' },
  { path: '/admin/blog', icon: FaBlog, label: '博客文章', color: 'from-green-500 to-teal-500' },
  { path: '/admin/services', icon: FaConciergeBell, label: '服务项目', color: 'from-orange-500 to-red-500' },
  { path: '/admin/portfolio', icon: FaImages, label: '作品集', color: 'from-indigo-500 to-purple-500' },
  { path: '/admin/team', icon: FaUsers, label: '团队成员', color: 'from-pink-500 to-rose-500' },
  { path: '/admin/events', icon: FaCalendarAlt, label: '社群活动', color: 'from-teal-500 to-green-500' },
  { path: '/admin/testimonials', icon: FaQuoteLeft, label: '学员见证', color: 'from-amber-500 to-orange-500' },
  { path: '/admin/contacts', icon: FaEnvelope, label: '咨询管理', color: 'from-yellow-500 to-orange-500' },
  { path: '/admin/settings', icon: FaCog, label: '系统设置', color: 'from-gray-500 to-gray-600' },
];

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // 简单的认证检查（生产环境应使用更安全的方案）
  useEffect(() => {
    const auth = sessionStorage.getItem('admin_auth');
    if (!auth) {
      setShowLogin(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // 简单密码验证（生产环境应使用后端验证）
    if (loginForm.username === 'admin' && loginForm.password === 'gk2024') {
      sessionStorage.setItem('admin_auth', 'true');
      setShowLogin(false);
      setLoginError('');
    } else {
      setLoginError('用户名或密码错误');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth');
    setShowLogin(true);
    navigate('/admin');
  };

  // 登录页面
  if (showLogin) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <FaShieldAlt className="text-3xl text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">管理后台登录</h1>
              <p className="text-gray-400 mt-2">请输入管理员账号密码</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-2">用户名</label>
                <div className="relative">
                  <FaUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={loginForm.username}
                    onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    placeholder="请输入用户名"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 mb-2">密码</label>
                <div className="relative">
                  <FaLock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    placeholder="请输入密码"
                  />
                </div>
              </div>

              {loginError && (
                <p className="text-red-400 text-sm">{loginError}</p>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white font-medium hover:opacity-90 transition-opacity"
              >
                登录
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-white/10 text-center">
              <Link to="/" className="text-gray-400 hover:text-white text-sm">
                返回前台首页
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* 移动端顶部栏 */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#0F0F1A]/95 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-lg text-white">盖可设计圈 · 管理</span>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-gray-400">
          {mobileMenuOpen ? <FaTimes /> : <FaBars />}
        </button>
      </div>

      {/* 移动端菜单 */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: -300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -300 }}
            className="lg:hidden fixed inset-0 z-40 bg-[#0F0F1A] pt-16"
          >
            <nav className="p-4 space-y-2">
              {menuItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    location.pathname === item.path
                      ? 'bg-gradient-to-r ' + item.color + ' text-white'
                      : 'text-gray-400 hover:bg-white/5'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 桌面端侧边栏 */}
      <div className={`hidden lg:flex flex-col fixed left-0 top-0 h-screen bg-[#0F0F1A] border-r border-white/10 transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-20'}`}>
        {/* Logo 区域 */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <FaCube className="text-white text-sm" />
              </div>
              <span className="font-bold text-white">管理后台</span>
            </div>
          )}
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)} 
            className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <FaBars />
          </button>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                location.pathname === item.path
                  ? 'bg-gradient-to-r ' + item.color + ' text-white shadow-lg'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span className="font-medium">{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* 底部操作 */}
        <div className="p-4 border-t border-white/10 space-y-2">
          <Link
            to="/"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all"
          >
            <FaHome className="w-5 h-5" />
            {sidebarOpen && <span>返回前台</span>}
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all w-full"
          >
            <FaSignOutAlt className="w-5 h-5" />
            {sidebarOpen && <span>退出登录</span>}
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className={`pt-16 lg:pt-0 transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        <main className="p-6 min-h-screen">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
