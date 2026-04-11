import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaSave, FaArrowLeft } from 'react-icons/fa';
import { api } from '../api';

interface FormData {
  title: string;
  description: string;
  category: string;
  image_url: string;
  tags: string[];
  status: string;
}

const categories = ['3D建模', '应用开发', '原画设计', '其他'];

export default function WorkForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    category: '3D建模',
    image_url: '',
    tags: [],
    status: 'draft',
  });
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (isEdit && id) {
      fetchWork();
    }
  }, [id]);

  const fetchWork = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/works/${id}`);
      setFormData(response.data);
    } catch (error) {
      console.error('获取作品失败:', error);
      alert('获取作品失败');
      navigate('/admin/works');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      alert('请输入作品标题');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/works/${id}`, formData);
      } else {
        await api.post('/works', formData);
      }
      navigate('/admin/works');
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...formData.tags, tagInput.trim()] });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/admin/works')}
          className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <FaArrowLeft className="text-gray-400" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-white">
            {isEdit ? '编辑作品' : '添加作品'}
          </h1>
          <p className="text-gray-400 mt-1">
            {isEdit ? '修改作品信息' : '创建新的作品展示'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 基本信息 */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <h2 className="text-xl font-bold text-white mb-4">基本信息</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-gray-300 mb-2">作品标题 *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                placeholder="输入作品标题"
              />
            </div>

            <div>
              <label className="block text-gray-300 mb-2">作品描述</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
                placeholder="描述作品内容、技术栈、设计理念等"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-300 mb-2">分类</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-300 mb-2">状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* 图片设置 */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <h2 className="text-xl font-bold text-white mb-4">封面图片</h2>
          
          <div>
            <label className="block text-gray-300 mb-2">图片链接</label>
            <input
              type="text"
              value={formData.image_url}
              onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              placeholder="https://example.com/image.jpg"
            />
          </div>

          {formData.image_url && (
            <div className="mt-4">
              <p className="text-gray-400 text-sm mb-2">预览</p>
              <img
                src={formData.image_url}
                alt="预览"
                className="w-full max-w-md rounded-lg"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="%23374151" width="400" height="300"/><text fill="%239CA3AF" x="50%" y="50%" text-anchor="middle" dy=".3em">图片加载失败</text></svg>';
                }}
              />
            </div>
          )}
        </div>

        {/* 标签 */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <h2 className="text-xl font-bold text-white mb-4">标签</h2>
          
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              placeholder="输入标签后按回车添加"
            />
            <button
              type="button"
              onClick={addTag}
              className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
            >
              添加
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {formData.tags.map(tag => (
              <span
                key={tag}
                className="flex items-center gap-1 px-3 py-1 bg-white/10 text-gray-300 rounded-full text-sm"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-gray-400 hover:text-red-400"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* 提交按钮 */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/admin/works')}
            className="px-6 py-2 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? (
              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <FaSave />
            )}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}
