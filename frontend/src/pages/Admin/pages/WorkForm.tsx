import { useState } from 'react'; import { useParams, useNavigate } from 'react-router-dom'; import { FaArrowLeft, FaSave } from 'react-icons/fa'; import { api, createWork, updateWork } from '../api';
export default function WorkForm() {
  const { id } = useParams(); const navigate = useNavigate(); const isEdit = Boolean(id);
  const [form, setForm] = useState({ title:'', category:'', description:'', image:'', featured:false });
  const [saving, setSaving] = useState(false); const [msg, setMsg] = useState('');
  const save = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true);
    try { if(isEdit) await updateWork(id, form); else await createWork(form); navigate('/admin/works'); }
    catch { setMsg('保存失败'); } finally { setSaving(false); }
  };
  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={()=>navigate('/admin/works')} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-500 hover:text-white"><FaArrowLeft size={16}/></button>
        <h1 className="text-2xl font-bold text-white tracking-tight">{isEdit?'编辑作品':'添加作品'}</h1>
      </div>
      <form onSubmit={save} className="bg-[#0D0D1A] border border-white/5 rounded-2xl p-6 space-y-4">
        <div><label className="block text-xs font-medium text-gray-400 mb-1.5">标题</label><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required className={I} placeholder="作品名称"/></div>
        <div><label className="block text-xs font-medium text-gray-400 mb-1.5">分类</label><input value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className={I} placeholder="如：APP设计"/></div>
        <div><label className="block text-xs font-medium text-gray-400 mb-1.5">描述</label><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} rows={3} className={I+' resize-none'} placeholder="作品描述"/></div>
        <div><label className="block text-xs font-medium text-gray-400 mb-1.5">封面图URL</label><input value={form.image} onChange={e=>setForm({...form,image:e.target.value})} className={I} placeholder="https://..."/></div>
        <div className="flex items-center gap-3">
          <input type="checkbox" checked={form.featured} onChange={e=>setForm({...form,featured:e.target.checked})} className="accent-purple-500 w-4 h-4"/>
          <span className="text-sm text-gray-400">精选作品</span>
        </div>
        {msg&&<p className="text-red-400 text-sm">{msg}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={()=>navigate('/admin/works')} className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-400 text-sm hover:bg-white/8 transition-all">取消</button>
          <button type="submit" disabled={saving} className={BTN}>{saving?'保存中...':'保存'}</button>
        </div>
      </form>
    </div>
  );
}