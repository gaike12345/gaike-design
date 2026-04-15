import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaImage, FaCalendar, FaMapMarker, FaUsers } from 'react-icons/fa';
import { api, createEvent, updateEvent } from '../api';
import { toast } from 'sonner';

interface EventFormData {
  title: string;
  description: string;
  event_type: string;
  event_date: string;
  location: string;
  image_url: string;
  max_participants: string;
  status: string;
}

export default function EventForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    event_type: 'online',
    event_date: '',
    location: '',
    image_url: '',
    max_participants: '',
    status: 'upcoming',
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditing);

  useEffect(() => {
    if (isEditing && id) {
      fetchEvent(id);
    }
  }, [id]);

  const fetchEvent = async (eventId: string) => {
    try {
      const response = await api.get(`/events/${eventId}`);
      const event = response.data;
      setFormData({
        title: event.title || '',
        description: event.description || '',
        event_type: event.event_type || 'online',
        event_date: event.event_date ? event.event_date.slice(0, 16) : '',
        location: event.location || '',
        image_url: event.image_url || '',
        max_participants: event.max_participants?.toString() || '',
        status: event.status || 'upcoming',
      });
    } catch (error) {
      console.error('获取活动失败:', error);
      toast.error('获取活动信息失败');
    } finally {
      setFetching(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast.error('请输入活动标题');
      return;
    }
    if (!formData.event_date) {
      toast.error('请选择活动时间');
      return;
    }

    setLoading(true);
    try {
      const submitData = {
        ...formData,
        max_participants: formData.max_participants ? parseInt(formData.max_participants) : null,
      };

      if (isEditing && id) {
        await updateEvent(id, submitData);
        toast.success('活动更新成功');
      } else {
        await createEvent(submitData);
        toast.success('活动创建成功');
      }
      navigate('/admin/events');
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
          to="/admin/events"
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
        >
          <FaArrowLeft />
          返回列表
        </Link>
        <h1 className="text-3xl font-bold text-white">
          {isEditing ? '编辑活动' : '添加活动'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 space-y-6">
        {/* 标题 */}
        <div>
          <label className="block text-gray-300 mb-2">活动标题 *</label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            placeholder="请输入活动标题"
          />
        </div>

        {/* 活动类型和时间 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-gray-300 mb-2">活动类型</label>
            <select
              name="event_type"
              value={formData.event_type}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500"
            >
              <option value="online">线上活动</option>
              <option value="offline">线下活动</option>
              <option value="workshop">工作坊</option>
              <option value="sharing">分享会</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-300 mb-2">
              <FaCalendar className="inline mr-2" />
              活动时间 *
            </label>
            <input
              type="datetime-local"
              name="event_date"
              value={formData.event_date}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* 地点和人数 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-gray-300 mb-2">
              <FaMapMarker className="inline mr-2" />
              活动地点
            </label>
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              placeholder="线上链接或线下地址"
            />
          </div>
          <div>
            <label className="block text-gray-300 mb-2">
              <FaUsers className="inline mr-2" />
              最大参与人数
            </label>
            <input
              type="number"
              name="max_participants"
              value={formData.max_participants}
              onChange={handleChange}
              min="1"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              placeholder="不限制请留空"
            />
          </div>
        </div>

        {/* 状态 */}
        <div>
          <label className="block text-gray-300 mb-2">活动状态</label>
          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500"
          >
            <option value="upcoming">即将开始</option>
            <option value="ongoing">进行中</option>
            <option value="ended">已结束</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>

        {/* 图片 */}
        <div>
          <label className="block text-gray-300 mb-2">
            <FaImage className="inline mr-2" />
            活动封面图片 URL
          </label>
          <input
            type="url"
            name="image_url"
            value={formData.image_url}
            onChange={handleChange}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            placeholder="https://example.com/image.jpg"
          />
          {formData.image_url && (
            <div className="mt-3">
              <img
                src={formData.image_url}
                alt="预览"
                className="w-full max-h-48 rounded-xl object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        {/* 描述 */}
        <div>
          <label className="block text-gray-300 mb-2">活动描述</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={4}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
            placeholder="请输入活动详细描述..."
          />
        </div>

        {/* 提交按钮 */}
        <div className="flex justify-end gap-4 pt-4">
          <Link
            to="/admin/events"
            className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10 transition-colors"
          >
            取消
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-teal-500 to-green-600 rounded-xl text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? '保存中...' : isEditing ? '保存修改' : '创建活动'}
          </button>
        </div>
      </form>
    </div>
  );
}
