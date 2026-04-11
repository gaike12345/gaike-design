import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaSave, FaImage, FaTextHeight, FaPalette, FaLink } from 'react-icons/fa';
import { configApi } from '@/lib/api';

type ConfigType = 'hero' | 'about' | 'cta' | 'site_settings' | 'case_studies';

const tabs: { key: ConfigType; label: string; icon: any }[] = [
  { key: 'hero', label: 'Hero区域', icon: FaTextHeight },
  { key: 'about', label: '关于我们', icon: FaImage },
  { key: 'cta', label: 'CTA区域', icon: FaLink },
  { key: 'site_settings', label: '网站设置', icon: FaPalette },
  { key: 'case_studies', label: '案例管理', icon: FaPalette },
];

export default function SiteConfig() {
  const [activeTab, setActiveTab] = useState<ConfigType>('hero');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await configApi.getTable(activeTab);
      setData(response.data?.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (id: string, updates: any) => {
    setSaving(true);
    try {
      await configApi.update(activeTab, id, updates);
      setMessage({ type: 'success', text: '保存成功！' });
      fetchData();
    } catch (error) {
      setMessage({ type: 'error', text: '保存失败，请重试' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const renderHeroForm = (item: any) => (
    <div className="space-y-6">
      <div>
        <label className="block text-gray-300 mb-2">主标题</label>
        <textarea
          defaultValue={item.title}
          onBlur={(e) => handleSave(item.id, { title: e.target.value })}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
          rows={2}
        />
      </div>
      <div>
        <label className="block text-gray-300 mb-2">副标题</label>
        <input
          type="text"
          defaultValue={item.subtitle}
          onBlur={(e) => handleSave(item.id, { subtitle: e.target.value })}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-gray-300 mb-2">描述文字</label>
        <textarea
          defaultValue={item.description}
          onBlur={(e) => handleSave(item.id, { description: e.target.value })}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-gray-300 mb-2">按钮1文字</label>
          <input
            type="text"
            defaultValue={item.button1_text}
            onBlur={(e) => handleSave(item.id, { button1_text: e.target.value })}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-gray-300 mb-2">按钮1链接</label>
          <input
            type="text"
            defaultValue={item.button1_link}
            onBlur={(e) => handleSave(item.id, { button1_link: e.target.value })}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-gray-300 mb-2">按钮2文字</label>
          <input
            type="text"
            defaultValue={item.button2_text}
            onBlur={(e) => handleSave(item.id, { button2_text: e.target.value })}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-gray-300 mb-2">按钮2链接</label>
          <input
            type="text"
            defaultValue={item.button2_link}
            onBlur={(e) => handleSave(item.id, { button2_link: e.target.value })}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
    </div>
  );

  const renderAboutForm = (item: any) => (
    <div className="space-y-6">
      <div>
        <label className="block text-gray-300 mb-2">标题</label>
        <textarea
          defaultValue={item.title}
          onBlur={(e) => handleSave(item.id, { title: e.target.value })}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
          rows={2}
        />
      </div>
      <div>
        <label className="block text-gray-300 mb-2">描述</label>
        <textarea
          defaultValue={item.description}
          onBlur={(e) => handleSave(item.id, { description: e.target.value })}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
          rows={3}
        />
      </div>
      <div>
        <label className="block text-gray-300 mb-2">配图URL</label>
        <input
          type="text"
          defaultValue={item.image_url}
          onBlur={(e) => handleSave(item.id, { image_url: e.target.value })}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />
        {item.image_url && (
          <img
            src={item.image_url}
            alt="预览"
            className="mt-4 w-full max-w-md rounded-xl"
          />
        )}
      </div>
    </div>
  );

  const renderCTAForm = (item: any) => (
    <div className="space-y-6">
      <div>
        <label className="block text-gray-300 mb-2">标题</label>
        <textarea
          defaultValue={item.title}
          onBlur={(e) => handleSave(item.id, { title: e.target.value })}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
          rows={2}
        />
      </div>
      <div>
        <label className="block text-gray-300 mb-2">描述</label>
        <textarea
          defaultValue={item.description}
          onBlur={(e) => handleSave(item.id, { description: e.target.value })}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-gray-300 mb-2">按钮1文字</label>
          <input
            type="text"
            defaultValue={item.button1_text}
            onBlur={(e) => handleSave(item.id, { button1_text: e.target.value })}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-gray-300 mb-2">按钮1链接</label>
          <input
            type="text"
            defaultValue={item.button1_link}
            onBlur={(e) => handleSave(item.id, { button1_link: e.target.value })}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-gray-300 mb-2">按钮2文字</label>
          <input
            type="text"
            defaultValue={item.button2_text}
            onBlur={(e) => handleSave(item.id, { button2_text: e.target.value })}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-gray-300 mb-2">按钮2链接</label>
          <input
            type="text"
            defaultValue={item.button2_link}
            onBlur={(e) => handleSave(item.id, { button2_link: e.target.value })}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
    </div>
  );

  const renderSiteSettings = () => (
    <div className="space-y-6">
      {data.map((item: any) => (
        <div key={item.id} className="bg-white/5 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-gray-300 font-medium">{item.label || item.key}</label>
            <span className="text-xs text-gray-500">{item.type}</span>
          </div>
          {item.type === 'color' ? (
            <div className="flex items-center gap-3">
              <input
                type="color"
                defaultValue={item.value}
                onChange={(e) => handleSave(item.id, { value: e.target.value })}
                className="w-12 h-10 rounded cursor-pointer"
              />
              <input
                type="text"
                defaultValue={item.value}
                onBlur={(e) => handleSave(item.id, { value: e.target.value })}
                className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          ) : (
            <input
              type="text"
              defaultValue={item.value}
              onBlur={(e) => handleSave(item.id, { value: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          )}
        </div>
      ))}
    </div>
  );

  const renderCaseStudies = () => (
    <div className="space-y-6">
      {data.map((item: any) => (
        <div key={item.id} className="bg-white/5 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium">{item.title}</h3>
            <span className="px-3 py-1 bg-[#4A5BFF]/20 text-[#00F5FF] text-xs rounded-full">
              {item.category}
            </span>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-1">标题</label>
              <input
                type="text"
                defaultValue={item.title}
                onBlur={(e) => handleSave(item.id, { title: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">客户</label>
              <input
                type="text"
                defaultValue={item.client}
                onBlur={(e) => handleSave(item.id, { client: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">配图URL</label>
              <input
                type="text"
                defaultValue={item.image_url}
                onBlur={(e) => handleSave(item.id, { image_url: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">挑战</label>
              <textarea
                defaultValue={item.challenge}
                onBlur={(e) => handleSave(item.id, { challenge: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500 resize-none"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">解决方案</label>
              <textarea
                defaultValue={item.solution}
                onBlur={(e) => handleSave(item.id, { solution: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500 resize-none"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">成果</label>
              <textarea
                defaultValue={item.result}
                onBlur={(e) => handleSave(item.id, { result: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500 resize-none"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-1">客户评价</label>
              <textarea
                defaultValue={item.testimonial}
                onBlur={(e) => handleSave(item.id, { testimonial: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500 resize-none"
                rows={2}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      );
    }

    if (data.length === 0) {
      return (
        <div className="text-center py-20 text-gray-400">
          暂无数据
        </div>
      );
    }

    switch (activeTab) {
      case 'hero':
        return renderHeroForm(data[0]);
      case 'about':
        return renderAboutForm(data[0]);
      case 'cta':
        return renderCTAForm(data[0]);
      case 'site_settings':
        return renderSiteSettings();
      case 'case_studies':
        return renderCaseStudies();
      default:
        return null;
    }
  };

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-white mb-2">网站配置</h1>
        <p className="text-gray-400">管理首页各个区域的内容和样式</p>
      </motion.div>

      {/* 提示消息 */}
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-6 px-4 py-3 rounded-xl ${
            message.type === 'success' 
              ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
              : 'bg-red-500/20 text-red-400 border border-red-500/30'
          }`}
        >
          {message.text}
        </motion.div>
      )}

      {/* 标签页 */}
      <div className="flex flex-wrap gap-2 mb-8">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
              activeTab === tab.key
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容 */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
      >
        {renderContent()}
      </motion.div>

      {/* 提示 */}
      <div className="mt-6 p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
        <p className="text-blue-400 text-sm">
          💡 提示：编辑完成后会自动保存。修改会在刷新后生效。
        </p>
      </div>
    </div>
  );
}
