import { useState } from 'react';
import { FaSave, FaGlobe, FaEnvelope, FaPalette, FaLock } from 'react-icons/fa';

export default function Settings() {
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('site');

  const tabs = [
    { id: 'site', label: '网站设置', icon: FaGlobe },
    { id: 'contact', label: '联系方式', icon: FaEnvelope },
    { id: 'appearance', label: '外观设置', icon: FaPalette },
    { id: 'security', label: '安全设置', icon: FaLock },
  ];

  const handleSave = async () => {
    setSaving(true);
    // 模拟保存
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    alert('设置已保存');
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">系统设置</h1>
        <p className="text-gray-400 mt-1">配置网站基本信息和功能</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* 侧边导航 */}
        <div className="lg:w-48 flex-shrink-0">
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-2 border border-white/10">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon className="text-lg" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 设置内容 */}
        <div className="flex-1">
          {activeTab === 'site' && (
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-bold text-white mb-6">网站设置</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-gray-300 mb-2">网站名称</label>
                  <input
                    type="text"
                    defaultValue="盖可设计圈"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 mb-2">网站描述</label>
                  <textarea
                    rows={3}
                    defaultValue="面向个人品牌的多元化创意设计与技术服务平台"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 mb-2">关键词</label>
                  <input
                    type="text"
                    defaultValue="设计, 3D建模, 应用开发, 原画设计, 学习成长"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-gray-500 text-sm mt-1">用逗号分隔</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'contact' && (
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-bold text-white mb-6">联系方式</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-gray-300 mb-2">客服微信</label>
                  <input
                    type="text"
                    placeholder="微信号"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 mb-2">联系邮箱</label>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 mb-2">联系电话</label>
                  <input
                    type="tel"
                    placeholder="138xxxx8888"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-bold text-white mb-6">外观设置</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-gray-300 mb-2">主题色</label>
                  <div className="flex gap-3">
                    <button className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 ring-2 ring-white ring-offset-2 ring-offset-[#0F0F1A]"></button>
                    <button className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-teal-600"></button>
                    <button className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600"></button>
                    <button className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600"></button>
                  </div>
                </div>
                <div>
                  <label className="block text-gray-300 mb-2">强调色</label>
                  <div className="flex gap-3">
                    <button className="w-10 h-10 rounded-lg bg-[#00F5FF] ring-2 ring-white ring-offset-2 ring-offset-[#0F0F1A]"></button>
                    <button className="w-10 h-10 rounded-lg bg-[#FF9A56]"></button>
                    <button className="w-10 h-10 rounded-lg bg-[#FF6B9D]"></button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-bold text-white mb-6">安全设置</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-gray-300 mb-2">管理员密码</label>
                  <input
                    type="password"
                    placeholder="输入新密码"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 mb-2">确认密码</label>
                  <input
                    type="password"
                    placeholder="再次输入密码"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 保存按钮 */}
          <div className="flex justify-end mt-6">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? (
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <FaSave />
              )}
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
