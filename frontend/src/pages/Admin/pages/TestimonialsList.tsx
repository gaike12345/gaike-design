import { useState, useEffect } from 'react'; import { Link } from 'react-router-dom'; import { FaPlus, FaEdit, FaTrash, FaQuoteLeft, FaUser } from 'react-icons/fa'; import { api } from '../api';
export default function TestimonialsList() {
  const [items, setItems] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { (async()=>{try{const r=await api.get('/testimonials');setItems(r.data?.data||[]);}catch{/*s*/}finally{setLoading(false);}})(); }, []);
  const del = async (id: number) => { if(!confirm('删除？'))return; try{await api.delete(`/testimonials/${id}`);setItems(i=>i.filter(x=>x.id!==id));}catch{alert('失败');} };
  const card = 'bg-[#0D0D1A] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-all';
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white tracking-tight">学员见证</h1><p className="text-sm text-gray-500 mt-0.5">{items.length} 条见证</p></div>
        <Link to="/admin/testimonials/new" className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-teal-500 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-all shadow-lg shadow-purple-600/20"><FaPlus size={14}/>添加见证</Link>
      </div>
      {loading ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{[1,2].map(i=><div key={i} className={card+" h-32 animate-pulse"}/>)}</div>
      : items.length===0 ? <div className={card+" text-center py-12"}><FaQuoteLeft className="mx-auto text-gray-700 mb-3" size={28}/><p className="text-gray-600 text-sm">暂无见证</p></div>
      : <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{items.map(t=>(
        <div key={t.id} className={card}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600/30 to-teal-500/20 border border-purple-500/20 flex items-center justify-center flex-shrink-0"><FaUser className="text-purple-400" size={14}/></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white">{t.name||'匿名'}</h3><span className="text-xs text-gray-600">{t.role||''}</span></div>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-3">"{t.content||t.text||''}"</p>
            </div>
          </div>
          <div className="flex gap-1 mt-3 pt-3 border-t border-white/5">
            <Link to={`/admin/testimonials/${t.id}`} className="flex-1 py-1.5 text-center bg-white/5 rounded-lg hover:bg-purple-500/10 transition-colors text-xs text-purple-400">编辑</Link>
            <button onClick={()=>del(t.id)} className="flex-1 py-1.5 text-center bg-white/5 rounded-lg hover:bg-red-500/10 transition-colors text-xs text-red-400/60 hover:text-red-400">删除</button>
          </div>
        </div>
      ))}</div>}
    </div>
  );
}