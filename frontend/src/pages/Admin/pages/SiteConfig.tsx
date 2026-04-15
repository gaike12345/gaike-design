import { useState, useEffect } from 'react';
import {
  FaSave, FaImage, FaTextHeight, FaLink, FaCog,
  FaPlus, FaEdit, FaTrash, FaServer, FaUsers,
  FaQuoteLeft, FaEnvelope, FaQuestionCircle, FaCalendarAlt, FaFileAlt
} from 'react-icons/fa';
import { api, createRecord, updateRecord, deleteRecord } from '../api';

// 全部 13 张配置表
type TableKey =
  | 'hero_config' | 'about_config' | 'cta_config'
  | 'site_settings' | 'case_studies'
  | 'services' | 'team_members' | 'testimonials'
  | 'contact_config' | 'faq_items' | 'workflow_steps'
  | 'booking_services' | 'page_contents';

const ALL_TABS: { key: TableKey; label: string; icon: any; fields: string[] }[] = [
  { key: 'hero_config',    label: 'Hero区域',     icon: FaTextHeight,      fields: ['title','subtitle','description','image','button1_text','button1_link','button2_text','button2_link','features'] },
  { key: 'about_config',   label: '关于我们',      icon: FaImage,            fields: ['title','subtitle','description','image','values','team_intro'] },
  { key: 'cta_config',     label: 'CTA区域',       icon: FaLink,            fields: ['title','subtitle','description','button_text','button_link'] },
  { key: 'site_settings',  label: '网站设置',      icon: FaCog,             fields: ['key','value'] },
  { key: 'case_studies',   label: '案例管理',      icon: FaImage,           fields: ['title','description','image','featured','sort_order'] },
  { key: 'services',       label: '服务项目',       icon: FaServer,          fields: ['name','description','price','duration','status','sort_order'] },
  { key: 'team_members',   label: '团队成员',      icon: FaUsers,           fields: ['name','role','bio','image','status','sort_order'] },
  { key: 'testimonials',   label: '学员见证',      icon: FaQuoteLeft,        fields: ['name','role','content','avatar','rating','featured'] },
  { key: 'contact_config', label: '联系方式',      icon: FaEnvelope,        fields: ['type','label','value','sort_order'] },
  { key: 'faq_items',      label: '常见问题',       icon: FaQuestionCircle,   fields: ['question','answer','sort_order'] },
  { key: 'workflow_steps', label: '工作流程',      icon: FaCalendarAlt,      fields: ['step_number','title','description','icon'] },
  { key: 'booking_services',label:'预约服务',      icon: FaCalendarAlt,      fields: ['name','description','price','duration','sort_order'] },
  { key: 'page_contents',  label: '页面内容',       icon: FaFileAlt,          fields: ['page_key','section_key','content','sort_order'] },
];

export default function SiteConfig() {
  const [activeTab, setActiveTab] = useState<TableKey>('hero_config');
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const tab = ALL_TABS.find(t => t.key === activeTab)!;

  useEffect(() => { fetchRecords(); }, [activeTab]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/config/${activeTab}`);
      setRecords(r.data?.data || []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const payload: any = {};
      Object.entries(formValues).forEach(([k, v]) => {
        // 特殊字段：数组字段用逗号分隔
        if (['features','values','tools','benefits'].includes(k)) {
          payload[k] = v.split(',').map((s: string) => s.trim()).filter(Boolean);
        } else if (['featured','active','inactive'].includes(k) && (v === 'true' || v === 'false')) {
          payload[k] = v === 'true';
        } else if (['sort_order'].includes(k)) {
          payload[k] = parseInt(v) || 0;
        } else {
          payload[k] = v;
        }
      });
      if (editingId === '__NEW__') {
        await createRecord(activeTab, payload);
        showMsg('success', '创建成功');
      } else {
        await updateRecord(activeTab, editingId, payload);
        showMsg('success', '保存成功');
      }
      setEditingId(null);
      setFormValues({});
      fetchRecords();
    } catch {
      showMsg('error', '保存失败，请检查表单');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定删除？')) return;
    try {
      await deleteRecord(activeTab, id);
      showMsg('success', '删除成功');
      fetchRecords();
    } catch {
      showMsg('error', '删除失败');
    }
  };

  const startEdit = (item: any) => {
    const vals: Record<string, string> = {};
    tab.fields.forEach(f => {
      const v = item[f];
      vals[f] = v === undefined ? '' : (Array.isArray(v) ? v.join(', ') : String(v));
    });
    setFormValues(vals);
    setEditingId(String(item.id));
  };

  const startNew = () => {
    const vals: Record<string, string> = {};
    tab.fields.forEach(f => { vals[f] = ''; });
    setFormValues(vals);
    setEditingId('__NEW__');
  };

  const cancelEdit = () => { setEditingId(null); setFormValues({}); };

  // 通用字段渲染
  const renderField = (field: string, value: string) => {
    if (field === 'image' || field === 'avatar') {
      return (
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">{field}</label>
          <input value={value} onChange={e => setFormValues({ ...formValues, [field]: e.target.value })}
            className="w-full px-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500/60" />
          {value && <img src={value} alt="" className="mt-2 h-20 rounded object-cover bg-white/5" onError={e => (e.target as HTMLImageElement).style.display='none'} />}
        </div>
      );
    }
    if (field === 'status') {
      return (
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">{field}</label>
          <select value={value || 'active'} onChange={e => setFormValues({ ...formValues, [field]: e.target.value })}
            className="w-full px-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500/60">
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </div>
      );
    }
    if (field === 'featured') {
      return (
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">{field}</label>
          <select value={value || 'false'} onChange={e => setFormValues({ ...formValues, [field]: e.target.value })}
            className="w-full px-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500/60">
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
        </div>
      );
    }
    if (['description','bio','content','answer','values','features','tools','benefits'].includes(field)) {
      return (
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">
            {field}{['features','values','tools','benefits'].includes(field) ? '（逗号分隔）' : ''}
          </label>
          <textarea value={value} onChange={e => setFormValues({ ...formValues, [field]: e.target.value })}
            rows={3} placeholder={field}
            className="w-full px-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/60 resize-none" />
        </div>
      );
    }
    if (field === 'sort_order') {
      return (
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">{field}</label>
          <input type="number" value={value} onChange={e => setFormValues({ ...formValues, [field]: e.target.value })}
            className="w-full px-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500/60" />
        </div>
      );
    }
    return (
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">{field}</label>
        <input value={value} onChange={e => setFormValues({ ...formValues, [field]: e.target.value })}
          className="w-full px-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/60" />
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">网站配置</h1>
        <p className="text-sm text-gray-500 mt-0.5">管理前端所有内容数据</p>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${msg.type === 'success' ? 'bg-teal-500/15 text-teal-400 border border-teal-500/30' : 'bg-red-500/15 text-red-400 border border-red-500/30'}`}>
          {msg.text}
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {ALL_TABS.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setEditingId(null); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === t.key
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                : 'bg-[#0D0D1A] border border-white/5 text-gray-500 hover:text-gray-300 hover:border-white/10'
            }`}>
            <t.icon size={12} />{t.label}
          </button>
        ))}
      </div>

      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{records.length} 条记录</span>
        <button onClick={startNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-500 transition-colors">
          <FaPlus size={12} />新增
        </button>
      </div>

      {/* 编辑 / 新建表单 */}
      {editingId && (
        <div className="bg-[#0D0D1A] border border-purple-500/30 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">{editingId === '__NEW__' ? `新增 — ${tab.label}` : `编辑 — ${tab.label}`}</h3>
            <div className="flex gap-2">
              <button onClick={cancelEdit} className="px-3 py-1.5 text-gray-400 text-sm hover:text-white transition-colors">取消</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-500 disabled:opacity-50 flex items-center gap-1.5">
                <FaSave size={12} />{saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {tab.fields.map(field => (
              <div key={field} className={['description','bio','content','answer','values'].includes(field) ? 'sm:col-span-2' : ''}>
                {renderField(field, formValues[field] || '')}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 记录列表 */}
      <div className="bg-[#0D0D1A] border border-white/5 rounded-2xl p-6">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl" />)}
          </div>
        ) : records.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8">暂无数据，点击右上角新增</p>
        ) : (
          <div className="space-y-3">
            {records.map(item => (
              <div key={item.id} className="flex items-start justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-all gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-2 mb-1">
                    {tab.fields.filter(f => item[f] !== undefined && item[f] !== null && item[f] !== '').slice(0, 3).map(f => (
                      <span key={f} className="inline-block text-xs px-2 py-0.5 bg-white/5 rounded text-gray-400 truncate max-w-[200px]" title={`${f}: ${item[f]}`}>
                        {f}: {String(item[f]).slice(0, 40)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(item)}
                    className="p-2 text-gray-500 hover:text-purple-400 hover:bg-white/5 rounded-lg transition-colors">
                    <FaEdit size={13} />
                  </button>
                  <button onClick={() => handleDelete(String(item.id))}
                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                    <FaTrash size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
