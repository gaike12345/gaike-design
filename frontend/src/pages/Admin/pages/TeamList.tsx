import { useState, useEffect } from 'react'; import { Link } from 'react-router-dom'; import { FaPlus, FaEdit, FaTrash, FaUsers, FaUser } from 'react-icons/fa'; import { api, deleteTeam } from '../api';
export default function TeamList() {
  const [members, setMembers] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { (async()=>{try{const r=await api.get('/team');setMembers(r.data?.data||[]);}catch{/*s*/}finally{setLoading(false);}})(); }, []);
  const del = async (id: number) => { if(!confirm('删除�?))return; try{await deleteTeam(id);setMembers(m=>m.filter(x=>x.id!==id));}catch{alert('失败');} };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white tracking-tight">团队成员</h1><p className="text-sm text-gray-500 mt-0.5">{members.length} 名成�?/p></div>
        <Link to="/admin/team/new" className={`flex items-center gap-2 ${btnPrimary}`}><FaPlus size={14}/>添加成员</Link>
      </div>
      {loading ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i=><div key={i} className={cardCls+" h-40 animate-pulse"} />)}</div>
      : members.length===0 ? <div className={cardCls+" text-center py-12"}><FaUsers className="mx-auto text-gray-700 mb-3" size={28}/><p className="text-gray-600 text-sm">暂无成员</p><Link to="/admin/team/new" className="mt-3 inline-block text-sm text-purple-400 hover:text-purple-300">添加第一�?/Link></div>
      : <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{members.map(m=>(
        <div key={m.id} className={cardCls+" overflow-hidden group"}>
          {m.avatar ? <img src={m.avatar} alt="" className="w-full h-28 object-cover rounded-lg mb-3 bg-white/5"/> : <div className="w-full h-28 bg-gradient-to-br from-purple-600/20 to-teal-500/10 rounded-lg mb-3 flex items-center justify-center"><FaUser className="text-gray-700" size={32}/></div>}
          <h3 className="text-sm font-semibold text-white">{m.name}</h3>
          <p className="text-xs text-gray-600 mt-0.5">{m.role||m.position}</p>
          <div className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <Link to={`/admin/team/${m.id}`} className="flex-1 py-1.5 text-center bg-white/5 rounded-lg hover:bg-purple-500/10 transition-colors"><FaEdit className="inline text-purple-400" size={12}/></Link>
            <button onClick={()=>del(m.id)} className="flex-1 py-1.5 text-center bg-white/5 rounded-lg hover:bg-red-500/10 transition-colors"><FaTrash className="inline text-red-400/60" size={12}/></button>
          </div>
        </div>
      ))}</div>}
    </div>
  );
}