import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaHome, FaCube, FaBlog, FaConciergeBell,
  FaUsers, FaImages, FaEnvelope, FaCog, FaSignOutAlt,
  FaBars, FaTimes, FaShieldAlt, FaLock, FaUser,
  FaCalendarAlt, FaQuoteLeft, FaGlobe, FaChartLine
} from 'react-icons/fa';

const menuItems = [
  { path: '/admin', icon: FaChartLine, label: '仪表盘', accent: '#A855F7' },
  { path: '/admin/site-config', icon: FaGlobe, label: '网站配置', accent: '#06B6D4' },
  { path: '/admin/works', icon: FaCube, label: '作品管理', accent: '#F97316' },
  { path: '/admin/blog', icon: FaBlog, label: '博客文章', accent: '#22C55E' },
  { path: '/admin/services', icon: FaConciergeBell, label: '服务项目', accent: '#06B6D4' },
  { path: '/admin/portfolio', icon: FaImages, label: '作品集', accent: '#EC4899' },
  { path: '/admin/team', icon: FaUsers, label: '团队成员', accent: '#F97316' },
  { path: '/admin/events', icon: FaCalendarAlt, label: '社群活动', accent: '#22C55E' },
  { path: '/admin/testimonials', icon: FaQuoteLeft, label: '学员见证', accent: '#EAB308' },
  { path: '/admin/contacts', icon: FaEnvelope, label: '咨询管理', accent: '#F97316' },
  { path: '/admin/settings', icon: FaCog, label: '系统设置', accent: '#6B7280' },
];

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    if (!sessionStorage.getItem('admin_token')) setShowLogin(true);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(
        (import.meta.env.VITE_API_URL || 'https://gaike-design-production.up.railway.app/api') + '/admin/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loginForm),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || '用户名或密码错误');
        return;
      }
      sessionStorage.setItem('admin_token', data.token);
      sessionStorage.setItem('admin_username', data.username || loginForm.username);
      setShowLogin(false);
    } catch {
      setLoginError('网络错误，请检查后端服务是否正常');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_username');
    setShowLogin(true);
    navigate('/admin');
  };

  // 登录页
  if (showLogin) {
    return (
      <div className="min-h-screen bg-[#070710] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-10">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500 to-teal-400 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <FaShieldAlt className="text-2xl text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">管理后台</h1>
            <p className="text-gray-500 mt-1 text-sm">盖可设计圈</p>
          </div>

          {/* 表单卡片 */}
          <div className="bg-[#0D0D1A] border border-white/8 rounded-2xl p-8 shadow-xl shadow-black/30">
            <h2 className="text-lg font-semibold text-white mb-1">登录</h2>
            <p className="text-gray-500 text-sm mb-6">请输入管理员账号密码</p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">用户名</label>
                <div className="relative">
                  <FaUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                  <input
                    type="text"
                    value={loginForm.username}
                    onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 transition-all"
                    placeholder="admin"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">密码</label>
                <div className="relative">
                  <FaLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {loginError && (
                <p className="text-red-400 text-xs text-center">{loginError}</p>
              )}

              <button
                type="submit"
                className="w-full py-2.5 mt-2 bg-gradient-to-r from-purple-600 to-teal-500 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-all shadow-lg shadow-purple-600/20"
              >
                登 录
              </button>
            </form>
          </div>

          <div className="mt-6 text-center">
            <Link to="/" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              ← 返回前台首页
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 主后台布局
  return (
    <div className="min-h-screen bg-[#070710] text-white">

      {/* 移动端顶部 */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#0D0D1A]/95 backdrop-blur-md border-b border-white/5 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-teal-400 flex items-center justify-center">
            <FaCube className="text-white" size={12} />
          </div>
          <span className="font-semibold text-sm tracking-tight">盖可设计圈</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 text-gray-400">
          {mobileOpen ? <FaTimes size={18} /> : <FaBars size={18} />}
        </button>
      </header>

      {/* 移动端菜单 */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="lg:hidden fixed inset-0 z-40 bg-[#070710] pt-14 px-4 pb-6 overflow-y-auto"
          >
            <nav className="space-y-1">
              {menuItems.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${
                      active
                        ? 'bg-white/8 text-white font-medium'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/4'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      active ? 'bg-gradient-to-b from-purple-500 to-teal-400' : 'bg-gray-600'
                    }`} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 桌面侧边栏 */}
      <aside className={`hidden lg:flex flex-col fixed left-0 top-0 h-screen bg-[#0D0D1A] border-r border-white/5 transition-all duration-300 ${sidebarCollapsed ? 'w-[68px]' : 'w-[220px]'}`}>
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-white/5 flex-shrink-0">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-teal-400 flex items-center justify-center flex-shrink-0 shadow-md shadow-purple-500/20">
                <FaCube className="text-white" size={13} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white tracking-tight leading-none">盖可设计圈</div>
                <div className="text-[10px] text-gray-600 mt-0.5">管理后台</div>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="w-8 h-8 mx-auto rounded-xl bg-gradient-to-br from-purple-500 to-teal-400 flex items-center justify-center">
              <FaCube className="text-white" size={13} />
            </div>
          )}
        </div>

        {/* 导航 */}
        <nav className="flex-1 py-3 px-2.5 space-y-0.5 overflow-y-auto">
          {menuItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  active
                    ? 'bg-white/8 text-white'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/4'
                }`}
                title={sidebarCollapsed ? item.label : undefined}
              >
                {/* 激活指示条 */}
                <span className={`w-[3px] h-4 rounded-full flex-shrink-0 transition-all ${
                  active ? 'bg-gradient-to-b from-purple-500 to-teal-400' : 'bg-transparent group-hover:bg-gray-600'
                }`} />

                {/* 图标 */}
                <span className={`flex-shrink-0 transition-colors ${
                  active ? 'text-purple-400' : 'text-gray-600 group-hover:text-gray-400'
                }`}>
                  <item.icon size={15} />
                </span>

                {!sidebarCollapsed && (
                  <span className={active ? 'font-medium' : ''}>{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* 底部 */}
        <div className="p-2.5 border-t border-white/5 space-y-0.5 flex-shrink-0">
          <Link
            to="/"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-gray-600 hover:text-gray-400 hover:bg-white/4 text-sm transition-all"
          >
            <FaHome size={15} />
            {!sidebarCollapsed && <span>返回前台</span>}
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-400/70 hover:text-red-400 hover:bg-red-500/8 text-sm transition-all"
          >
            <FaSignOutAlt size={15} />
            {!sidebarCollapsed && <span>退出登录</span>}
          </button>

          {/* 折叠按钮 */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-gray-700 hover:text-gray-500 hover:bg-white/4 text-xs transition-all mt-1"
          >
            <FaBars size={13} />
            {!sidebarCollapsed && <span>收起</span>}
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-[68px]' : 'lg:ml-[220px]'}`}>
        {/* 顶部栏 */}
        <header className="hidden lg:flex items-center justify-between h-14 px-6 border-b border-white/5 bg-[#070710]/80 backdrop-blur-sm sticky top-0 z-30">
          <div className="text-sm text-gray-600">
            <span className="text-gray-500">盖可设计圈</span>
            <span className="mx-1.5 text-gray-700">/</span>
            <span className="text-gray-400">
              {menuItems.find(m => m.path === location.pathname)?.label || '控制台'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-teal-400 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">GK</span>
            </div>
            <span className="text-xs text-gray-600">管理员</span>
          </div>
        </header>

        {/* 页面内容 */}
        <main className="p-4 lg:p-6 pt-[4.5rem] lg:pt-6 min-h-screen">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
