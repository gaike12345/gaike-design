import { useState, useEffect } from 'react'; import { FaEnvelope, FaCheck, FaTrash } from 'react-icons/fa'; import { api, deleteContact } from '../api';
export default function ContactsList() {
  const [contacts, setContacts] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { (async()=>{try{const r=await api.get('/contact');setContacts(r.data?.data||[]);}catch{/*s*/}finally{setLoading(false);}})(); }, []);
  const del = async (id: number) => { if(!confirm('删除？'))return; try{await deleteContact(id);setContacts(c=>c.filter(x=>x.id!==id));}catch{alert('失败');} };
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-white tracking-tight">咨询管理</h1><p className="text-sm text-gray-500 mt-0.5">{contacts.length} 条咨询记录</p></div>
      {loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className={cardCls+" h-20 animate-pulse"} />)}</div>
      : contacts.length===0 ? <div className={cardCls+" text-center py-12"}><FaEnvelope className="mx-auto text-gray-700 mb-3" size={28}/><p className="text-gray-600 text-sm">暂无咨询记录</p></div>
      : <div className="space-y-2">{contacts.map(c=>(<div key={c.id} className={cardCls}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><h3 className="text-sm font-semibold text-white">{c.name||'匿名'}</h3><p className="text-xs text-purple-400 mt-0.5">{c.email}</p>{c.message&&<p className="text-xs text-gray-500 mt-1 leading-relaxed">{c.message}</p>}</div>
            <div className="flex gap-1 flex-shrink-0">
              {c.status!=='replied'&&<button className="p-2 rounded-lg hover:bg-green-500/10 transition-colors"><FaCheck className="text-green-400" size={14}/></button>}
              <button onClick={()=>del(c.id)} className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"><FaTrash className="text-red-400/60" size={14}/></button>
            </div>
          </div>
        </div>))}</div>}
    </div>
  );
}