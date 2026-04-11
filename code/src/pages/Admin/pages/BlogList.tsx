import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaPlus, FaEdit, FaTrash, FaEye, FaSearch, FaCalendar } from 'react-icons/fa';
import { api } from '../api';

interface BlogPost {
  id: number;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  image_url: string;
  status: string;
  created_at: string;
}

export default function BlogList() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const response = await api.get('/blog');
      setPosts(response.data.data || []);
    } catch (error) {
      console.error('获取文章列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除这篇文章吗？')) return;
    
    try {
      await api.delete(`/blog/${id}`);
      setPosts(posts.filter(p => p.id !== id));
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败，请重试');
    }
  };

  const toggleStatus = async (post: BlogPost) => {
    const newStatus = post.status === 'published' ? 'draft' : 'published';
    try {
      await api.put(`/blog/${post.id}`, { status: newStatus });
      setPosts(posts.map(p => p.id === post.id ? { ...p, status: newStatus } : p));
    } catch (error) {
      console.error('更新状态失败:', error);
    }
  };

  const filteredPosts = posts.filter(post => 
    post.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      '设计教程': 'bg-green-500/20 text-green-400',
      '行业洞察': 'bg-blue-500/20 text-blue-400',
      '工作室动态': 'bg-purple-500/20 text-purple-400',
    };
    return colors[category] || 'bg-gray-500/20 text-gray-400';
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">博客管理</h1>
          <p className="text-gray-400 mt-1">管理所有博客文章</p>
        </div>
        <Link
          to="/admin/blog/new"
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-teal-600 rounded-lg text-white hover:opacity-90 transition-opacity"
        >
          <FaPlus />
          发布文章
        </Link>
      </div>

      {/* 搜索 */}
      <div className="relative max-w-md mb-6">
        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="搜索文章..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
        />
      </div>

      {/* 文章列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map(post => (
            <div
              key={post.id}
              className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 flex gap-6"
            >
              {/* 封面图 */}
              <div className="w-48 h-32 flex-shrink-0 rounded-lg overflow-hidden">
                {post.image_url ? (
                  <img
                    src={post.image_url}
                    alt={post.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                    <span className="text-gray-500 text-sm">暂无封面</span>
                  </div>
                )}
              </div>

              {/* 内容 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-white truncate">{post.title}</h3>
                    <p className="text-gray-400 text-sm mt-2 line-clamp-2">{post.excerpt}</p>
                  </div>
                  <span className={`flex-shrink-0 px-3 py-1 text-xs rounded-full ${
                    post.status === 'published' 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {post.status === 'published' ? '已发布' : '草稿'}
                  </span>
                </div>

                <div className="flex items-center gap-4 mt-4 text-sm text-gray-400">
                  <span className={`px-2 py-1 rounded ${getCategoryColor(post.category)}`}>
                    {post.category}
                  </span>
                  <span className="flex items-center gap-1">
                    <FaCalendar className="text-xs" />
                    {new Date(post.created_at).toLocaleDateString('zh-CN')}
                  </span>
                  <span>作者：{post.author}</span>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={() => toggleStatus(post)}
                    className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    <FaEye />
                    {post.status === 'published' ? '转为草稿' : '发布'}
                  </button>
                  <Link
                    to={`/admin/blog/edit/${post.id}`}
                    className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <FaEdit />
                    编辑
                  </Link>
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    <FaTrash />
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filteredPosts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">暂无文章，点击右上角发布</p>
        </div>
      )}
    </div>
  );
}
