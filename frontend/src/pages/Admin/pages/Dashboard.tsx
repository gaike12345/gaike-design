import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaNewspaper, FaImages, FaUsers, FaEnvelope, FaCog, FaCalendarAlt, FaQuoteLeft, FaArrowRight } from 'react-icons/fa';
import { api } from '../api';

interface Stats {
  works: number;
  blogPosts: number;
  contacts: number;
  teamMembers: number;
  events: number;
  testimonials: number;
}

const statCards = [
  { key: 'works', label: '作品', icon: FaImages, accent: '#A855F7', bg: 'from-purple-600/20 to-purple-900/10', border: 'border-purple-500/20', iconBg: 'bg-purple-500/15', iconColor: 'text-purple-400' },
  { key: 'blogPosts', label: '文章', icon: FaNewspaper, accent: '#22C55E', bg: 'from-green-600/20 to-green-900/10', border: 'border-green-500/20', iconBg: 'bg-green-500/15', iconColor: 'text-green-400' },
  { key: 'contacts', label: '咨询', icon: FaEnvelope, accent: '#F97316', bg: 'from-orange-600/20 to-orange-900/10', border: 'border-orange-500/20', iconBg: 'bg-orange-500/15', iconColor: 'text-orange-400' },
  { key: 'teamMembers', label: '成员', icon: FaUsers, accent: '#EC4899', bg: 'from-pink-600/20 to-pink-900/10', border: 'border-pink-500/20', iconBg: 'bg-pink-500/15', iconColor: 'text-pink-400' },
  { key: 'events', label: '活动', icon: FaCalendarAlt, accent: '#06B6D4', bg: 'from-cyan-600/20 to-cyan-900/10', border: 'border-cyan-500/20', iconBg: 'bg-cyan-500/15', iconColor: 'text-cyan-400' },
  { key: 'testimonials', label: '见证', icon: FaQuoteLeft, accent: '#EAB308', bg: 'from-yellow-600/20 to-yellow-900/10', border: 'border-yellow-500/20', iconBg: 'bg-yellow-500/15', iconColor: 'text-yellow-400' },
];

const quickActions = [
  { label: '添加作品', icon: FaImages, href: '/admin/works/new', accent: 'text-purple-400', bg: 'hover:bg-purple-500/10' },
  { label: '发布文章', icon: FaNewspaper, href: '/admin/blog/new', accent: 'text-green-400', bg: 'hover:bg-green-500/10' },
  { label: '服务管理', icon: FaCog, href: '/admin/services', accent: 'text-cyan-400', bg: 'hover:bg-cyan-500/10' },
  { label: '案例管理', icon: FaImages, href: '/admin/portfolio', accent: 'text-pink-400', bg: 'hover:bg-pink-500/10' },
  { label: '添加成员', icon: FaUsers, href: '/admin/team/new', accent: 'text-orange-400', bg: 'hover:bg-orange-500/10' },
  { label: '网站设置', icon: FaCog, href: '/admin/settings', accent: 'text-gray-400', bg: 'hover:bg-white/5' },
];

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ works: 0, blogPosts: 0, contacts: 0, teamMembers: 0, events: 0, testimonials: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    try {
      const [w, b, c, t, e, s] = await Promise.all([
        api.get('/works?limit=1'), api.get('/blog?limit=1'), api.get('/contact?limit=1'),
        api.get('/team?limit=1'), api.get('/events?limit=1'), api.get('/testimonials?limit=1'),
      ]);
      setStats({
        works: w.data?.total || 0, blogPosts: b.data?.total || 0, contacts: c.data?.total || 0,
        teamMembers: t.data?.total || 0, events: e.data?.total || 0, testimonials: s.data?.total || 0,
      });
    } catch { /* silent */ } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">控制台</h1>
        <p className="text-sm text-gray-500 mt-0.5">盖可设计圈 · 管理后台</p>
      </div>

      {/* 统计卡片 */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-[#0D0D1A] border border-white/5 rounded-2xl p-5 animate-pulse">
              <div className="w-8 h-8 bg-white/5 rounded-xl mb-3" />
              <div className="h-4 bg-white/5 rounded w-12 mb-1.5" />
              <div className="h-7 bg-white/5 rounded w-8" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {statCards.map(card => {
            const val = (stats as any)[card.key];
            return (
              <Link
                key={card.key}
                to={'/admin/' + card.key.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}
                className={`group bg-gradient-to-b ${card.bg} border ${card.border} rounded-2xl p-5 hover:scale-[1.02] transition-all duration-200`}
              >
                <div className={`w-9 h-9 ${card.iconBg} rounded-xl flex items-center justify-center mb-3`}>
                  <card.icon className={`${card.iconColor}`} size={16} />
                </div>
                <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                <p className="text-2xl font-bold text-white mt-0.5 tracking-tight">{val}</p>
              </Link>
            );
          })}
        </div>
      )}

      {/* 快捷操作 + 系统状态 */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* 快捷操作 */}
        <div className="lg:col-span-2 bg-[#0D0D1A] border border-white/5 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">快捷操作</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {quickActions.map(action => (
              <Link
                key={action.label}
                to={action.href}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl ${action.bg} transition-colors group`}
              >
                <action.icon className={`${action.accent}`} size={16} />
                <span className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors">{action.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* 系统状态 */}
        <div className="bg-[#0D0D1A] border border-white/5 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">系统状态</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">后端服务</span>
              <span className="flex items-center gap-1.5 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400">运行中</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">数据库</span>
              <span className="flex items-center gap-1.5 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-green-400">正常</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">版本</span>
              <span className="text-xs text-gray-600">v1.0.0</span>
            </div>
            <div className="pt-2 border-t border-white/5">
              <Link to="/" className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/4 hover:bg-white/8 text-xs text-gray-500 hover:text-gray-300 transition-all">
                查看前台 <FaArrowRight size={10} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
