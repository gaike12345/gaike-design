import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaPlus, FaEdit, FaTrash, FaEye, FaSearch } from 'react-icons/fa';
import { api } from '../api';

interface Work {
  id: number;
  title: string;
  description: string;
  category: string;
  image_url: string;
  status: string;
  created_at: string;
}

export default function WorksList() {
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  const categories = ['全部', '3D建模', '应用开发', '原画设计', '其他'];

  useEffect(() => {
    fetchWorks();
  }, []);

  const fetchWorks = async () => {
    try {
      const response = await api.get('/works');
      setWorks(response.data.data || []);
    } catch (error) {
      console.error('获取作品列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除这个作品吗？')) return;
    
    try {
      await api.delete(`/works/${id}`);
      setWorks(works.filter(w => w.id !== id));
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败，请重试');
    }
  };

  const toggleStatus = async (work: Work) => {
    const newStatus = work.status === 'published' ? 'draft' : 'published';
    try {
      await api.put(`/works/${work.id}`, { status: newStatus });
      setWorks(works.map(w => w.id === work.id ? { ...w, status: newStatus } : w));
    } catch (error) {
      console.error('更新状态失败:', error);
    }
  };

  const filteredWorks = works.filter(work => {
    const matchesSearch = work.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || work.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">作品管理</h1>
          <p className="text-gray-400 mt-1">管理所有展示作品</p>
        </div>
        <Link
          to="/admin/works/new"
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white hover:opacity-90 transition-opacity"
        >
          <FaPlus />
          添加作品
        </Link>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索作品..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          {categories.map(cat => (
            <option key={cat} value={cat === '全部' ? 'all' : cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* 作品列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredWorks.map(work => (
            <div
              key={work.id}
              className="bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 transition-all duration-300 group"
            >
              <div className="aspect-video relative overflow-hidden">
                {work.image_url ? (
                  <img
                    src={work.image_url}
                    alt={work.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                    <span className="text-gray-500">暂无图片</span>
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-2">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    work.status === 'published' 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {work.status === 'published' ? '已发布' : '草稿'}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <h3 className="text-lg font-bold text-white truncate">{work.title}</h3>
                <p className="text-gray-400 text-sm mt-1 line-clamp-2">{work.description}</p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded">
                    {work.category}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                  <button
                    onClick={() => toggleStatus(work)}
                    className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    <FaEye />
                    {work.status === 'published' ? '隐藏' : '发布'}
                  </button>
                  <div className="flex gap-2">
                    <Link
                      to={`/admin/works/edit/${work.id}`}
                      className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <FaEdit className="text-blue-400" />
                    </Link>
                    <button
                      onClick={() => handleDelete(work.id)}
                      className="p-2 bg-white/5 rounded-lg hover:bg-red-500/20 transition-colors"
                    >
                      <FaTrash className="text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filteredWorks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">暂无作品，点击右上角添加</p>
        </div>
      )}
    </div>
  );
}
