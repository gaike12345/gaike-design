import { useState, useEffect } from 'react';
import { FaPlus, FaEdit, FaTrash, FaToggleOn, FaToggleOff, FaCog } from 'react-icons/fa';
import { api, createService, updateService, deleteService } from '../api';

interface Service { id: number; title: string; description: string; icon: string; features: string[]; sort_order: number; status: string; }

export default function ServicesList() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Service | null>(null);
  const [form, setForm] = useState({ title: '', description: '', icon: 'cube', features: '', sort_order: 99, status: 'active' });

  useEffect(() => { fetchServices(); }, []);

  const fetchServices = async () => {
    try { const r = await api.get('/services'); setServices(r.data.data || []); }
    catch { /* silent */ } finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除�?)) return;
    try { await deleteService(id); setServices(s => s.filter(sv => sv.id !== id)); }
    catch { alert('删除失败'); }
  };

  const toggleStatus = async (svc: Service) => {
    const next = svc.status === 'active' ? 'inactive' : 'active';
    try { await updateService(svc.id, { status: next }); setServices(s => s.map(x => x.id === svc.id ? { ...x, status: next } : x)); }
    catch { /* silent */ }
  };

  const openEdit = (svc: Service) => { setEditTarget(svc); setForm({ title: svc.title, description: svc.description, icon: svc.icon, features: (svc.features || []).join(', '), sort_order: svc.sort_order, status: svc.status }); setShowForm(true); };
  const openNew = () => { setEditTarget(null); setForm({ title: '', description: '', icon: 'cube', features: '', sort_order: 99, status: 'active' }); setShowForm(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, features: form.features.split(',').map(f => f.trim()).filter(Boolean) };
    try {
      if (editTarget) { await updateService(editTarget.id, payload); }
      else { await createService(payload); }
      setShowForm(false); fetchServices();
    } catch { alert('保存失败'); }
  };

  const statusLabel = { active: '启用', inactive: '停用' };
  const statusColor = { active: 'bg-teal-500/15 text-teal-400 border-teal-500/30', inactive: 'bg-gray-500/10 text-gray-500 border-gray-500/20' };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">服务项目</h1>
          <p className="text-sm text-gray-500 mt-0.5">{services.length} 个服�?· 实时同步至前�?/p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-teal-500 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-all shadow-lg shadow-purple-600/20">
          <FaPlus size={14} /> 添加服务
        </button>
      </div>

      {loading ? (
        <div className="grid gap-3">{[...Array(3)].map((_, i) => <div key={i} className="bg-[#0D0D1A] border border-white/5 rounded-2xl p-6 animate-pulse"><div className="h-5 bg-white/5 rounded w-32" /></div>)}</div>
      ) : services.length === 0 ? (
        <div className="bg-[#0D0D1A] border border-white/5 rounded-2xl p-12 text-center">
          <FaCog className="mx-auto text-gray-700 mb-3" size={32} />
          <p className="text-gray-600 text-sm">暂无服务项目</p>
          <button onClick={openNew} className="mt-3 text-sm text-purple-400 hover:text-purple-300">添加第一�?/button>
        </div>
      ) : (
        <div className="grid gap-3">
          {services.map(svc => (
            <div key={svc.id} className="bg-[#0D0D1A] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-600/30 to-teal-500/20 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <FaCog className="text-purple-400" size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-white">{svc.title}</h3>
                    <span className={`px-2 py-0.5 text-[11px] rounded-full border font-medium ${statusColor[svc.status as keyof typeof statusColor]}`}>{statusLabel[svc.status as keyof typeof statusLabel]}</span>
                    <span className="text-[11px] text-gray-700">排序 {svc.sort_order}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">{svc.description}</p>
                  {svc.features?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {svc.features.map((f, i) => <span key={i} className="px-2 py-0.5 bg-teal-500/10 text-teal-400/80 rounded text-[11px]">{f}</span>)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => toggleStatus(svc)} className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-600 hover:text-white" title={svc.status === 'active' ? '停用' : '启用'}>
                    {svc.status === 'active' ? <FaToggleOn className="text-teal-400" size={18} /> : <FaToggleOff className="text-gray-600" size={18} />}
                  </button>
                  <button onClick={() => openEdit(svc)} className="p-2 rounded-lg hover:bg-purple-500/10 transition-colors"><FaEdit className="text-purple-400" size={15} /></button>
                  <button onClick={() => handleDelete(svc.id)} className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"><FaTrash className="text-red-400/60 hover:text-red-400" size={15} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 表单弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0D0D1A] border border-white/10 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-5">{editTarget ? '编辑服务' : '添加服务'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">名称</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required className="w-full px-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/20 transition-all" placeholder="服务名称" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">描述</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required rows={2} className="w-full px-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/60 resize-none transition-all" placeholder="简短描�? />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">排序�?/label>
                  <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 99 })} className="w-full px-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500/60 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">状�?/label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500/60 transition-all">
                    <option value="active">启用</option><option value="inactive">停用</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">特性标签（逗号分隔�?/label>
                <input value={form.features} onChange={e => setForm({ ...form, features: e.target.value })} className="w-full px-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-purple-500/60 transition-all" placeholder="标签1, 标签2" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-400 text-sm hover:bg-white/8 transition-all">取消</button>
                <button type="submit" className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-teal-500 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-all shadow-lg shadow-purple-600/20">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
