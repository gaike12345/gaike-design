import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaImage, FaStar } from 'react-icons/fa';
import { api, createTestimonial, updateTestimonial } from '../api';
import { toast } from 'sonner';

interface TestimonialFormData {
  name: string;
  role: string;
  content: string;
  avatar_url: string;
  featured: boolean;
  sort_order: string;
}

export default function TestimonialForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState<TestimonialFormData>({
    name: '',
    role: '',
    content: '',
    avatar_url: '',
    featured: false,
    sort_order: '0',
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditing);

  useEffect(() => {
    if (isEditing && id) {
      fetchTestimonial(id);
    }
  }, [id]);

  const fetchTestimonial = async (testimonialId: string) => {
    try {
      const response = await api.get(`/testimonials/${testimonialId}`);
      const testimonial = response.data;
      setFormData({
        name: testimonial.name || '',
        role: testimonial.role || '',
        content: testimonial.content || '',
        avatar_url: testimonial.avatar_url || '',
        featured: testimonial.featured || false,
        sort_order: testimonial.sort_order?.toString() || '0',
      });
    } catch (error) {
      console.error('获取见证失败:', error);
      toast.error('获取见证信息失败');
    } finally {
      setFetching(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value 
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('请输入姓�?);
      return;
    }
    if (!formData.content.trim()) {
      toast.error('请输入见证内�?);
      return;
    }

    setLoading(true);
    try {
      const submitData = {
        name: formData.name.trim(),
        role: formData.role.trim() || null,
        content: formData.content.trim(),
        avatar_url: formData.avatar_url.trim() || null,
        featured: formData.featured,
        sort_order: parseInt(formData.sort_order) || 0,
      };

      if (isEditing && id) {
        await updateTestimonial(id, submitData);
        toast.success('见证更新成功');
      } else {
        await createTestimonial(submitData);
        toast.success('见证创建成功');
      }
      navigate('/admin/testimonials');
    } catch (error) {
      console.error('保存失败:', error);
      toast.error('保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          to="/admin/testimonials"
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
        >
          <FaArrowLeft />
          返回列表
        </Link>
        <h1 className="text-3xl font-bold text-white">
          {isEditing ? '编辑见证' : '添加见证'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 space-y-6">
        {/* 姓名 */}
        <div>
          <label className="block text-gray-300 mb-2">姓名 *</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            placeholder="请输入学员姓�?
          />
        </div>

        {/* 角色 */}
        <div>
          <label className="block text-gray-300 mb-2">身份/职位</label>
          <input
            type="text"
            name="role"
            value={formData.role}
            onChange={handleChange}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            placeholder="如：UI设计师、自由插画师、学习学�?
          />
        </div>

        {/* 见证内容 */}
        <div>
          <label className="block text-gray-300 mb-2">见证内容 *</label>
          <textarea
            name="content"
            value={formData.content}
            onChange={handleChange}
            rows={6}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
            placeholder="请输入学员的评价、感言或成长故�?.."
          />
          <p className="text-gray-500 text-sm mt-2">建议内容�?50-500 字之间，越真实越�?/p>
        </div>

        {/* 头像 */}
        <div>
          <label className="block text-gray-300 mb-2">
            <FaImage className="inline mr-2" />
            头像图片 URL
          </label>
          <input
            type="url"
            name="avatar_url"
            value={formData.avatar_url}
            onChange={handleChange}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            placeholder="https://example.com/avatar.jpg"
          />
          {formData.avatar_url && (
            <div className="mt-3">
              <img
                src={formData.avatar_url}
                alt="预览"
                className="w-24 h-24 rounded-full object-cover border-2 border-white/20"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        {/* 精选和排序 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="featured"
                checked={formData.featured}
                onChange={handleChange}
                className="w-5 h-5 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
              />
              <span className="text-gray-300 flex items-center gap-2">
                <FaStar className="text-yellow-400" />
                设为精选见�?              </span>
            </label>
            <p className="text-gray-500 text-sm mt-2">精选见证会优先展示在网站首�?/p>
          </div>
          <div>
            <label className="block text-gray-300 mb-2">排序权重</label>
            <input
              type="number"
              name="sort_order"
              value={formData.sort_order}
              onChange={handleChange}
              min="0"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500"
              placeholder="数字越小越靠�?
            />
          </div>
        </div>

        {/* 提交按钮 */}
        <div className="flex justify-end gap-4 pt-4">
          <Link
            to="/admin/testimonials"
            className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10 transition-colors"
          >
            取消
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? '保存�?..' : isEditing ? '保存修改' : '创建见证'}
          </button>
        </div>
      </form>
    </div>
  );
}
