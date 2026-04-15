import { useState, useEffect } from 'react'; import { Link } from 'react-router-dom'; import { FaPlus, FaEdit, FaTrash, FaBlog } from 'react-icons/fa'; import { api, deleteBlog } from '../api';
export default function BlogList() {
  const [posts, setPosts] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { (async()=>{try{const r=await api.get('/blog');setPosts(r.data?.data||[]);}catch{/*s*/}finally{setLoading(false);}})(); }, []);
  const del = async (id: number) => { if(!confirm('删除�?))return; try{await deleteBlog(id);setPosts(p=>p.filter(x=>x.id!==id));}catch{alert('失败');} };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white tracking-tight">博客文章</h1><p className="text-sm text-gray-500 mt-0.5">{posts.length} 篇文�?/p></div>
        <Link to="/admin/blog/new" className={`flex items-center gap-2 ${btnPrimary}`}><FaPlus size={14} />写文�?/Link>
      </div>
      {loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className={cardCls+" h-16 animate-pulse"} />)}</div>
      : posts.length===0 ? <div className={cardCls+" text-center py-12"}><FaBlog className="mx-auto text-gray-700 mb-3" size={28} /><p className="text-gray-600 text-sm">暂无文章</p><Link to="/admin/blog/new" className="mt-3 inline-block text-sm text-purple-400 hover:text-purple-300">写第一�?/Link></div>
      : <div className="space-y-2">{posts.map(p=>(<div key={p.id} className={cardCls+" flex items-center gap-4"}>
          {p.cover&&<img src={p.cover} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-white/5"/>}
          <div className="flex-1 min-w-0"><h3 className="text-sm font-semibold text-white truncate">{p.title}</h3><p className="text-xs text-gray-600 mt-0.5">{p.status||'草稿'} · {p.category}</p></div>
          <div className="flex gap-1 flex-shrink-0">
            <Link to={`/admin/blog/${p.id}`} className="p-2 rounded-lg hover:bg-purple-500/10 transition-colors"><FaEdit className="text-purple-400" size={14}/></Link>
            <button onClick={()=>del(p.id)} className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"><FaTrash className="text-red-400/60 hover:text-red-400" size={14}/></button>
          </div>
        </div>))}</div>}
    </div>
  );
}