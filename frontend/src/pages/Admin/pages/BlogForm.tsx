import { useState } from 'react'; import { useParams, useNavigate } from 'react-router-dom'; import { FaArrowLeft } from 'react-icons/fa'; import { api } from '../api';
export default function BlogForm() {
  const { id } = useParams(); const navigate = useNavigate(); const isEdit = Boolean(id);
  const [form, setForm] = useState({ title:'', content:'', category:'设计', status:'draft', cover:'' });
  const [saving, setSaving] = useState(false); const [msg, setMsg] = useState('');
  const save = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true);
    try { if(isEdit) await api.put(`/blog/${id}`, form); else await api.post('/blog', form); navigate('/admin/blog'); }
    catch { setMsg('保存失败'); } finally { setSaving(false); }
  };
  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={()=>navigate('/admin/blog')} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-500 hover:text-white"><FaArrowLeft size={16}/></button>
        <h1 className="text-2xl font-bold text-white tracking-tight">{isEdit?'编辑文章':'写文章'}</h1>
      </div>
      <form onSubmit={save} className="bg-[#0D0D1A] border border-white/5 rounded-2xl p-6 space-y-4">
        <div><label className="block text-xs font-medium text-gray-400 mb-1.5">标题</label><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required className={I} placeholder="文章标题"/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-gray-400 mb-1.5">分类</label><input value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className={I} placeholder="分类"/></div>
          <div><label className="block text-xs font-medium text-gray-400 mb-1.5">状态</label><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className={I}><option value="draft">草稿</option><option value="published">发布</option></select></div>
        </div>
        <div><label className="block text-xs font-medium text-gray-400 mb-1.5">封面图URL</label><input value={form.cover} onChange={e=>setForm({...form,cover:e.target.value})} className={I} placeholder="https://..."/></div>
        <div><label className="block text-xs font-medium text-gray-400 mb-1.5">正文</label><textarea value={form.content} onChange={e=>setForm({...form,content:e.target.value})} required rows={8} className={I+' resize-none'} placeholder="文章内容..."/></div>
        {msg&&<p className="text-red-400 text-sm">{msg}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={()=>navigate('/admin/blog')} className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-xl text-gray-400 text-sm hover:bg-white/8 transition-all">取消</button>
          <button type="submit" disabled={saving} className={BTN}>{saving?'保存中...':'保存'}</button>
        </div>
      </form>
    </div>
  );
}