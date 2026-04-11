import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaSave, FaArrowLeft, FaBold, FaItalic, FaListUl, FaListOl } from 'react-icons/fa';
import { api } from '../api';

interface FormData {
  title: string;
  content: string;
  excerpt: string;
  category: string;
  author: string;
  image_url: string;
  status: string;
}

const categories = ['设计教程', '行业洞察', '工作室动态'];

export default function BlogForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    title: '',
    content: '',
    excerpt: '',
    category: '设计教程',
    author: '盖可设计圈',
    image_url: '',
    status: 'draft',
  });

  useEffect(() => {
    if (isEdit && id) {
      fetchPost();
    }
  }, [id]);

  const fetchPost = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/blog/${id}`);
      setFormData(response.data);
    } catch (error) {
      console.error('获取文章失败:', error);
      alert('获取文章失败');
      navigate('/admin/blog');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      alert('请输入文章标题');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/blog/${id}`, formData);
      } else {
        await api.post('/blog', formData);
      }
      navigate('/admin/blog');
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const insertMarkdown = (before: string, after: string = '') => {
    const textarea = document.getElementById('content-textarea') as HTMLTextAreaElement;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = formData.content;
    const selected = text.substring(start, end);
    
    const newText = text.substring(0, start) + before + selected + after + text.substring(end);
    setFormData({ ...formData, content: newText });
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/admin/blog')}
          className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <FaArrowLeft className="text-gray-400" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-white">
            {isEdit ? '编辑文章' : '发布文章'}
          </h1>
          <p className="text-gray-400 mt-1">
            {isEdit ? '修改文章内容' : '创建新的博客文章'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 主内容区 */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <h2 className="text-xl font-bold text-white mb-4">文章内容</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-2">标题 *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
                  placeholder="输入文章标题"
                />
              </div>

              <div>
                <label className="block text-gray-300 mb-2">正文内容</label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => insertMarkdown('**', '**')}
                    className="p-2 bg-white/5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    title="粗体"
                  >
                    <FaBold />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdown('*', '*')}
                    className="p-2 bg-white/5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    title="斜体"
                  >
                    <FaItalic />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdown('\n- ', '')}
                    className="p-2 bg-white/5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    title="无序列表"
                  >
                    <FaListUl />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdown('\n1. ', '')}
                    className="p-2 bg-white/5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    title="有序列表"
                  >
                    <FaListOl />
                  </button>
                </div>
                <textarea
                  id="content-textarea"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={15}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500 resize-none font-mono text-sm"
                  placeholder="支持 Markdown 格式..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* 侧边栏 */}
        <div className="space-y-6">
          {/* 发布设置 */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <h2 className="text-xl font-bold text-white mb-4">发布设置</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-2">分类</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-green-500"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-300 mb-2">作者</label>
                <input
                  type="text"
                  value={formData.author}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-gray-300 mb-2">状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-green-500"
                >
                  <option value="draft">草稿</option>
                  <option value="published">发布</option>
                </select>
              </div>
            </div>
          </div>

          {/* 摘要和封面 */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <h2 className="text-xl font-bold text-white mb-4">摘要与封面</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-2">摘要</label>
                <textarea
                  value={formData.excerpt}
                  onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500 resize-none"
                  placeholder="简短的文章摘要..."
                />
              </div>

              <div>
                <label className="block text-gray-300 mb-2">封面图片</label>
                <input
                  type="text"
                  value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-green-500"
                  placeholder="https://..."
                />
              </div>

              {formData.image_url && (
                <img
                  src={formData.image_url}
                  alt="封面预览"
                  className="w-full rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
            </div>
          </div>

          {/* 提交按钮 */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin/blog')}
              className="flex-1 px-4 py-2 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-teal-600 rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? (
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <FaSave />
              )}
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
