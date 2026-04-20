import { useState } from 'react'; import { FaSave, FaKey, FaDatabase } from 'react-icons/fa';
const inputCls = 'w-full px-4 py-2.5 bg-[#070710] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/20 transition-all';
export default function Settings() {
  const [saved, setSaved] = useState(false);
  const handleSave = (e: React.FormEvent) => { e.preventDefault(); setSaved(true); setTimeout(()=>setSaved(false),2500); };
  return (
    <div className="space-y-6 max-w-2xl">
      <div><h1 className="text-2xl font-bold text-white tracking-tight">系统设置</h1><p className="text-sm text-gray-500 mt-0.5">管理后台配置信息</p></div>
      <form onSubmit={handleSave} className="space-y-5">
        <div className="bg-[#0D0D1A] border border-white/5 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2"><FaDatabase size={13} className="text-purple-400"/> 数据库配置</h2>
          <div><label className="block text-xs font-medium text-gray-400 mb-1.5">Supabase URL</label><input defaultValue="https://fooiwffgxqwacwsnmkco.supabase.co" readOnly className={inputCls+" opacity-60 cursor-not-allowed"}/></div>
          <div><label className="block text-xs font-medium text-gray-400 mb-1.5">项目 ID</label><input defaultValue="fooiwffgxqwacwsnmkco" readOnly className={inputCls+" opacity-60 cursor-not-allowed"}/></div>
        </div>
        <div className="bg-[#0D0D1A] border border-white/5 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2"><FaKey size={13} className="text-teal-400"/> 后端服务</h2>
          <div><label className="block text-xs font-medium text-gray-400 mb-1.5">Railway URL</label><input defaultValue="https://gaike-design-production.up.railway.app" readOnly className={inputCls+" opacity-60 cursor-not-allowed"}/></div>
          <div><label className="block text-xs font-medium text-gray-400 mb-1.5">版本</label><input defaultValue="v1.0.0" readOnly className={inputCls+" opacity-60 cursor-not-allowed"}/></div>
        </div>
        {saved&&<div className="flex items-center gap-2 px-4 py-3 bg-teal-500/15 text-teal-400 border border-teal-500/30 rounded-xl text-sm">保存成功</div>}
        <button type="submit" className={`flex items-center gap-2 ${btnPrimary}`}><FaSave size={14}/>保存设置</button>
      </form>
    </div>
  );
}