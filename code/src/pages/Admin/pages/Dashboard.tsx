import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaNewspaper, FaImages, FaUsers, FaEnvelope, FaCog, FaCalendarAlt, FaQuoteLeft } from 'react-icons/fa';
import { api } from '../api';

interface Stats {
  works: number;
  blogPosts: number;
  contacts: number;
  teamMembers: number;
  events: number;
  testimonials: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    works: 0,
    blogPosts: 0,
    contacts: 0,
    teamMembers: 0,
    events: 0,
    testimonials: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [worksRes, blogRes, contactsRes, teamRes, eventsRes, testimonialsRes] = await Promise.all([
        api.get('/works?limit=1'),
        api.get('/blog?limit=1'),
        api.get('/contact?limit=1'),
        api.get('/team?limit=1'),
        api.get('/events?limit=1'),
        api.get('/testimonials?limit=1'),
      ]);
      
      setStats({
        works: worksRes.data.total || 0,
        blogPosts: blogRes.data.total || 0,
        contacts: contactsRes.data.total || 0,
        teamMembers: teamRes.data.total || 0,
        events: eventsRes.data.total || 0,
        testimonials: testimonialsRes.data.total || 0,
      });
    } catch (error) {
      console.error('获取统计数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const cards = [
    { label: '作品数量', value: stats.works, icon: FaImages, color: 'from-blue-500 to-purple-600', link: '/admin/works' },
    { label: '博客文章', value: stats.blogPosts, icon: FaNewspaper, color: 'from-green-500 to-teal-600', link: '/admin/blog' },
    { label: '咨询记录', value: stats.contacts, icon: FaEnvelope, color: 'from-orange-500 to-red-600', link: '/admin/contacts' },
    { label: '团队成员', value: stats.teamMembers, icon: FaUsers, color: 'from-pink-500 to-rose-600', link: '/admin/team' },
    { label: '社群活动', value: stats.events, icon: FaCalendarAlt, color: 'from-teal-500 to-green-600', link: '/admin/events' },
    { label: '学员见证', value: stats.testimonials, icon: FaQuoteLeft, color: 'from-amber-500 to-orange-600', link: '/admin/testimonials' },
  ];

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">控制台</h1>
        <p className="text-gray-400 mt-2">欢迎回来，盖可设计圈管理员</p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      ) : (
        <>
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {cards.map((card) => (
              <Link
                key={card.label}
                to={card.link}
                className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 group"
              >
                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-r ${card.color} mb-4`}>
                  <card.icon className="w-6 h-6 text-white" />
                </div>
                <p className="text-gray-400 text-sm">{card.label}</p>
                <p className="text-3xl font-bold text-white mt-1">{card.value}</p>
              </Link>
            ))}
          </div>

          {/* 快捷操作 */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">快捷操作</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Link
                to="/admin/works/new"
                className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
              >
                <FaImages className="text-blue-400 text-xl" />
                <span className="text-gray-300 text-sm">添加作品</span>
              </Link>
              <Link
                to="/admin/blog/new"
                className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
              >
                <FaNewspaper className="text-green-400 text-xl" />
                <span className="text-gray-300 text-sm">发布文章</span>
              </Link>
              <Link
                to="/admin/team/new"
                className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
              >
                <FaUsers className="text-pink-400 text-xl" />
                <span className="text-gray-300 text-sm">添加成员</span>
              </Link>
              <Link
                to="/admin/events/new"
                className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
              >
                <FaCalendarAlt className="text-teal-400 text-xl" />
                <span className="text-gray-300 text-sm">添加活动</span>
              </Link>
              <Link
                to="/admin/testimonials/new"
                className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
              >
                <FaQuoteLeft className="text-amber-400 text-xl" />
                <span className="text-gray-300 text-sm">添加见证</span>
              </Link>
              <Link
                to="/admin/settings"
                className="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
              >
                <FaCog className="text-gray-400 text-xl" />
                <span className="text-gray-300 text-sm">网站设置</span>
              </Link>
            </div>
          </div>

          {/* 最近活动 */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <h2 className="text-xl font-bold text-white mb-4">系统状态</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-gray-300">后端服务</span>
                </div>
                <span className="text-green-400 text-sm">运行中</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-gray-300">数据库连接</span>
                </div>
                <span className="text-green-400 text-sm">正常</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
