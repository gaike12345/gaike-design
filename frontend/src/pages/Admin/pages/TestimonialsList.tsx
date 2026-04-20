import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaPlus, FaEdit, FaTrash, FaSearch, FaStar, FaQuoteLeft, FaUser } from 'react-icons/fa';
import { api } from '../api';
import { toast } from 'sonner';

interface Testimonial {
  id: string;
  name: string;
  role: string;
  content: string;
  avatar_url: string;
  featured: boolean;
  sort_order: number;
  created_at: string;
}

export default function TestimonialsList() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFeatured, setFilterFeatured] = useState('all');

  useEffect(() => {
    fetchTestimonials();
  }, []);

  const fetchTestimonials = async () => {
    try {
      const response = await api.get('/testimonials');
      setTestimonials(response.data.data || []);
    } catch (error) {
      console.error('获取见证列表失败:', error);
      toast.error('获取见证列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这条见证吗？')) return;
    
    try {
      await api.delete(`/testimonials/${id}`);
      setTestimonials(testimonials.filter(t => t.id !== id));
      toast.success('删除成功');
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败，请重试');
    }
  };

  const toggleFeatured = async (testimonial: Testimonial) => {
    try {
      await api.put(`/testimonials/${testimonial.id}`, { featured: !testimonial.featured });
      setTestimonials(testimonials.map(t => 
        t.id === testimonial.id ? { ...t, featured: !t.featured } : t
      ));
      toast.success(testimonial.featured ? '已取消精选' : '已设为精选');
    } catch (error) {
      console.error('更新失败:', error);
      toast.error('更新失败');
    }
  };

  const filteredTestimonials = testimonials.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         t.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFeatured = filterFeatured === 'all' || 
                          (filterFeatured === 'featured' && t.featured) ||
                          (filterFeatured === 'normal' && !t.featured);
    return matchesSearch && matchesFeatured;
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">学员见证管理</h1>
          <p className="text-gray-400 mt-1">管理学员评价、成长故事、推荐语</p>
        </div>
        <Link
          to="/admin/testimonials/new"
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 rounded-lg text-white hover:opacity-90 transition-opacity"
        >
          <FaPlus />
          添加见证
        </Link>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">全部见证</p>
              <p className="text-2xl font-bold text-white mt-1">{testimonials.length}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <FaQuoteLeft className="text-2xl text-amber-400" />
            </div>
          </div>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">精选见证</p>
              <p className="text-2xl font-bold text-white mt-1">
                {testimonials.filter(t => t.featured).length}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
              <FaStar className="text-2xl text-yellow-400" />
            </div>
          </div>
        </div>
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">普通见证</p>
              <p className="text-2xl font-bold text-white mt-1">
                {testimonials.filter(t => !t.featured).length}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gray-500/20 flex items-center justify-center">
              <FaUser className="text-2xl text-gray-400" />
            </div>
          </div>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索见证..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={filterFeatured}
          onChange={(e) => setFilterFeatured(e.target.value)}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">全部</option>
          <option value="featured">精选</option>
          <option value="normal">普通</option>
        </select>
      </div>

      {/* 见证列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredTestimonials.map(testimonial => (
            <div
              key={testimonial.id}
              className={`bg-white/5 backdrop-blur-sm rounded-2xl p-6 border transition-all duration-300 ${
                testimonial.featured ? 'border-amber-500/50' : 'border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* 头像 */}
                <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-gray-600 to-gray-700 flex-shrink-0">
                  {testimonial.avatar_url ? (
                    <img src={testimonial.avatar_url} alt={testimonial.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FaUser className="text-2xl text-gray-400" />
                    </div>
                  )}
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-bold text-white">{testimonial.name}</h3>
                    {testimonial.featured && (
                      <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full flex items-center gap-1">
                        <FaStar className="w-3 h-3" />
                        精选
                      </span>
                    )}
                  </div>
                  {testimonial.role && (
                    <p className="text-gray-400 text-sm mb-3">{testimonial.role}</p>
                  )}
                  <div className="relative">
                    <FaQuoteLeft className="absolute -top-1 -left-1 text-amber-500/30 text-xl" />
                    <p className="text-gray-300 text-sm pl-4 line-clamp-4">{testimonial.content}</p>
                  </div>
                </div>
              </div>

              {/* 操作 */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                <button
                  onClick={() => toggleFeatured(testimonial)}
                  className={`flex items-center gap-2 text-sm transition-colors ${
                    testimonial.featured 
                      ? 'text-yellow-400 hover:text-yellow-300' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <FaStar className={testimonial.featured ? 'fill-current' : ''} />
                  {testimonial.featured ? '取消精选' : '设为精选'}
                </button>
                <div className="flex gap-2">
                  <Link
                    to={`/admin/testimonials/edit/${testimonial.id}`}
                    className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <FaEdit className="text-blue-400" />
                  </Link>
                  <button
                    onClick={() => handleDelete(testimonial.id)}
                    className="p-2 bg-white/5 rounded-lg hover:bg-red-500/20 transition-colors"
                  >
                    <FaTrash className="text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filteredTestimonials.length === 0 && (
        <div className="text-center py-12">
          <FaQuoteLeft className="text-6xl text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">暂无见证，点击右上角添加</p>
        </div>
      )}
    </div>
  );
}
