import { useState, useEffect } from 'react'; import { Link } from 'react-router-dom'; import { FaPlus, FaEdit, FaTrash, FaCalendarAlt } from 'react-icons/fa'; import { api, deleteEvent } from '../api';
export default function EventsList() {
  const [events, setEvents] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { (async()=>{try{const r=await api.get('/events');setEvents(r.data?.data||[]);}catch{/*s*/}finally{setLoading(false);}})(); }, []);
  const del = async (id: number) => { if(!confirm('删除？'))return; try{await deleteEvent(id);setEvents(e=>e.filter(x=>x.id!==id));}catch{alert('失败');} };
  const card = 'bg-[#0D0D1A] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-all';
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white tracking-tight">社群活动</h1><p className="text-sm text-gray-500 mt-0.5">{events.length} 个活动</p></div>
        <Link to="/admin/events/new" className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-teal-500 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-all shadow-lg shadow-purple-600/20"><FaPlus size={14}/>添加活动</Link>
      </div>
      {loading ? <div className="space-y-2">{[1,2].map(i=><div key={i} className={card+" h-20 animate-pulse"}/>)}</div>
      : events.length===0 ? <div className={card+" text-center py-12"}><FaCalendarAlt className="mx-auto text-gray-700 mb-3" size={28}/><p className="text-gray-600 text-sm">暂无活动</p></div>
      : <div className="space-y-2">{events.map(ev=>(
        <div key={ev.id} className={card+" flex items-center gap-4"}>
          <div className="flex-1 min-w-0"><h3 className="text-sm font-semibold text-white truncate">{ev.title}</h3><p className="text-xs text-gray-600 mt-0.5">{ev.date} · {ev.location||'线上'}</p></div>
          <div className="flex gap-1 flex-shrink-0">
            <Link to={`/admin/events/${ev.id}`} className="p-2 rounded-lg hover:bg-purple-500/10 transition-colors"><FaEdit className="text-purple-400" size={14}/></Link>
            <button onClick={()=>del(ev.id)} className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"><FaTrash className="text-red-400/60 hover:text-red-400" size={14}/></button>
          </div>
        </div>
      ))}</div>}
    </div>
  );
}