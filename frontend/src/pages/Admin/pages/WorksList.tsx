import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaPlus, FaEdit, FaTrash, FaStar } from 'react-icons/fa';
import { api, deleteWork } from '../api';

export default function WorksList() {
  const [works, setWorks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetch(); }, []);
  const fetch = async () => { try { const r = await api.get('/works'); setWorks(r.data?.data || []); } catch {} finally { setLoading(false); } };
  const handleDelete = async (id: number) => { if (!confirm('确定删除？')) return; try { await deleteWork(id); setWorks(w => w.filter(x => x.id !== id)); } catch { alert('失败'); } };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">作品管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">{works.length} 件作品</p>
        </div>
        <Link to="/admin/works/new" className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-teal-500 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-all shadow-lg shadow-purple-600/20">
          <FaPlus size={14} /> 添加作品
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-3">{[...Array(3)].map((_, i) => <div key={i} className="bg-[#0D0D1A] border border-white/5 rounded-2xl p-5 animate-pulse"><div className="h-5 bg-white/5 rounded w-40" /></div>)}</div>
      ) : works.length === 0 ? (
        <div className="bg-[#0D0D1A] border border-white/5 rounded-2xl p-12 text-center">
          <p className="text-gray-600 text-sm">暂无作品</p>
          <Link to="/admin/works/new" className="mt-3 inline-block text-sm text-purple-400 hover:text-purple-300">添加第一个作品</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {works.map(w => (
            <div key={w.id} className="bg-[#0D0D1A] border border-white/5 rounded-xl p-4 flex items-center gap-4 hover:border-white/10 transition-all">
              {w.image && <img src={w.image} alt="" className="w-14 h-14 rounded-lg object-cover bg-white/5 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white truncate">{w.title}</h3>
                  {w.featured && <FaStar className="text-yellow-400 flex-shrink-0" size={12} />}
                </div>
                <p className="text-xs text-gray-600 mt-0.5">{w.category}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Link to={`/admin/works/${w.id}`} className="p-2 rounded-lg hover:bg-purple-500/10 transition-colors"><FaEdit className="text-purple-400" size={14} /></Link>
                <button onClick={() => handleDelete(w.id)} className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"><FaTrash className="text-red-400/60 hover:text-red-400" size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
