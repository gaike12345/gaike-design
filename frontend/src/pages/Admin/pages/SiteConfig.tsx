import { useState, useEffect } from 'react';
import { FaSave, FaImage, FaTextHeight, FaLink } from 'react-icons/fa';
import { configApi } from '@/lib/api';

type ConfigType = 'hero' | 'about' | 'cta' | 'site_settings' | 'case_studies';

const tabs: { key: ConfigType; label: string; icon: any }[] = [
  { key: 'hero', label: 'Hero区域', icon: FaTextHeight },
  { key: 'about', label: '关于我们', icon: FaImage },
  { key: 'cta', label: 'CTA区域', icon: FaLink },
  { key: 'site_settings', label: '网站设置', icon: FaLink },
  { key: 'case_studies', label: '案例管理', icon: FaImage },
];

export default function SiteConfig() {
  const [activeTab, setActiveTab] = useState<ConfigType>('hero');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [data, setData] = useState<any[]>([]);

  useEffect(() => { fetchData(); }, [activeTab]);
  const fetchData = async () => { setLoading(true); try { const r = await configApi.getTable(activeTab); setData(r.data?.data || []); } catch {} finally { setLoading(false); } };
  const handleSave = async (id: string, updates: any) => { setSaving(true); try { await configApi.update(activeTab, id, updates); setMsg({ type: 'success', text: '保存成功' }); fetchData(); } catch { setMsg({ type: 'error', text: '保存失败' }); } finally { setSaving(false); setTimeout(() => setMsg(null), 2500); } };

  const inputCls = "w-full px-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/20 transition-all resize-none";

  const renderForm = (item: any) => {
    if (!item) return <p className="text-gray-600 text-sm">暂无数据</p>;
    return (
      <div className="space-y-4">
        {item.title !== undefined && <div><label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">标题</label><textarea defaultValue={item.title} onBlur={e => handleSave(item.id, { title: e.target.value })} className={inputCls} rows={2} /></div>}
        {item.subtitle !== undefined && <div><label className="block text-xs font-medium text-gray-400 mb-1.5">副标题</label><input type="text" defaultValue={item.subtitle} onBlur={e => handleSave(item.id, { subtitle: e.target.value })} className={inputCls} /></div>}
        {item.description !== undefined && <div><label className="block text-xs font-medium text-gray-400 mb-1.5">描述</label><textarea defaultValue={item.description} onBlur={e => handleSave(item.id, { description: e.target.value })} className={inputCls} rows={3} /></div>}
        {item.image !== undefined && <div><label className="block text-xs font-medium text-gray-400 mb-1.5">图片URL</label><input type="text" defaultValue={item.image} onBlur={e => handleSave(item.id, { image: e.target.value })} className={inputCls} /></div>}
        {item.button1_text !== undefined && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-400 mb-1.5">按钮1文字</label><input type="text" defaultValue={item.button1_text} onBlur={e => handleSave(item.id, { button1_text: e.target.value })} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-gray-400 mb-1.5">按钮1链接</label><input type="text" defaultValue={item.button1_link} onBlur={e => handleSave(item.id, { button1_link: e.target.value })} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-gray-400 mb-1.5">按钮2文字</label><input type="text" defaultValue={item.button2_text} onBlur={e => handleSave(item.id, { button2_text: e.target.value })} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-gray-400 mb-1.5">按钮2链接</label><input type="text" defaultValue={item.button2_link} onBlur={e => handleSave(item.id, { button2_link: e.target.value })} className={inputCls} /></div>
          </div>
        )}
        {item.features !== undefined && <div><label className="block text-xs font-medium text-gray-400 mb-1.5">特性（逗号分隔）</label><input type="text" defaultValue={Array.isArray(item.features) ? item.features.join(', ') : ''} onBlur={e => handleSave(item.id, { features: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })} className={inputCls} /></div>}
        {item.status !== undefined && <div><label className="block text-xs font-medium text-gray-400 mb-1.5">状态</label><select defaultValue={item.status} onChange={e => handleSave(item.id, { status: e.target.value })} className={inputCls}><option value="active">启用</option><option value="inactive">停用</option></select></div>}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">网站配置</h1>
        <p className="text-sm text-gray-500 mt-0.5">修改后自动保存（失焦即保存）</p>
      </div>

      {/* 提示 */}
      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${msg.type === 'success' ? 'bg-teal-500/15 text-teal-400 border border-teal-500/30' : 'bg-red-500/15 text-red-400 border border-red-500/30'}`}>
          {msg.text}
        </div>
      )}

      {/* Tab切换 */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
            activeTab === tab.key ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-[#0D0D1A] border border-white/5 text-gray-500 hover:text-gray-300 hover:border-white/10'
          }`}>
            <tab.icon size={13} />{tab.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="bg-[#0D0D1A] border border-white/5 rounded-2xl p-6">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-white/5 rounded w-24" />
            <div className="h-10 bg-white/5 rounded-xl" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8">暂无配置数据</p>
        ) : (
          renderForm(data[0])
        )}
      </div>
    </div>
  );
}
