import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaPlus, FaEdit, FaTrash, FaSearch, FaCalendar, FaMapMarker, FaUsers } from 'react-icons/fa';
import { api } from '../api';
import { toast } from 'sonner';

interface Event {
  id: string;
  title: string;
  description: string;
  event_type: string;
  event_date: string;
  location: string;
  image_url: string;
  max_participants: number;
  status: string;
  created_at: string;
}

export default function EventsList() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const statusOptions = [
    { value: 'all', label: '全部状态' },
    { value: 'upcoming', label: '即将开始' },
    { value: 'ongoing', label: '进行中' },
    { value: 'ended', label: '已结束' },
    { value: 'cancelled', label: '已取消' },
  ];

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await api.get('/events');
      setEvents(response.data.data || []);
    } catch (error) {
      console.error('获取活动列表失败:', error);
      toast.error('获取活动列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这个活动吗？')) return;
    
    try {
      await api.delete(`/events/${id}`);
      setEvents(events.filter(e => e.id !== id));
      toast.success('删除成功');
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败，请重试');
    }
  };

  const updateStatus = async (event: Event, newStatus: string) => {
    try {
      await api.put(`/events/${event.id}`, { status: newStatus });
      setEvents(events.map(e => e.id === event.id ? { ...e, status: newStatus } : e));
      toast.success('状态更新成功');
    } catch (error) {
      console.error('更新状态失败:', error);
      toast.error('更新状态失败');
    }
  };

  const filteredEvents = events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || event.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      upcoming: 'bg-blue-500/20 text-blue-400',
      ongoing: 'bg-green-500/20 text-green-400',
      ended: 'bg-gray-500/20 text-gray-400',
      cancelled: 'bg-red-500/20 text-red-400',
    };
    const labels: Record<string, string> = {
      upcoming: '即将开始',
      ongoing: '进行中',
      ended: '已结束',
      cancelled: '已取消',
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${styles[status] || styles.upcoming}`}>
        {labels[status] || status}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">社群活动管理</h1>
          <p className="text-gray-400 mt-1">管理线上线下活动、分享会、工作坊等</p>
        </div>
        <Link
          to="/admin/events/new"
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-green-600 rounded-lg text-white hover:opacity-90 transition-opacity"
        >
          <FaPlus />
          添加活动
        </Link>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索活动..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* 活动列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEvents.map(event => (
            <div
              key={event.id}
              className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300"
            >
              <div className="flex flex-col md:flex-row gap-6">
                {/* 活动图片 */}
                <div className="w-full md:w-48 h-32 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-gray-700 to-gray-800">
                  {event.image_url ? (
                    <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FaCalendar className="text-4xl text-gray-500" />
                    </div>
                  )}
                </div>

                {/* 活动信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-white truncate">{event.title}</h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <FaCalendar className="w-4 h-4" />
                          {formatDate(event.event_date)}
                        </span>
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <FaMapMarker className="w-4 h-4" />
                            {event.location}
                          </span>
                        )}
                        {event.max_participants && (
                          <span className="flex items-center gap-1">
                            <FaUsers className="w-4 h-4" />
                            {event.max_participants}人
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {getStatusBadge(event.status)}
                    </div>
                  </div>

                  <p className="text-gray-400 text-sm mt-3 line-clamp-2">{event.description}</p>

                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded">
                        {event.event_type === 'online' ? '线上' : event.event_type === 'offline' ? '线下' : event.event_type === 'workshop' ? '工作坊' : '分享会'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={event.status}
                        onChange={(e) => updateStatus(event, e.target.value)}
                        className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none"
                      >
                        {statusOptions.filter(s => s.value !== 'all').map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <Link
                        to={`/admin/events/edit/${event.id}`}
                        className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        <FaEdit className="text-blue-400" />
                      </Link>
                      <button
                        onClick={() => handleDelete(event.id)}
                        className="p-2 bg-white/5 rounded-lg hover:bg-red-500/20 transition-colors"
                      >
                        <FaTrash className="text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filteredEvents.length === 0 && (
        <div className="text-center py-12">
          <FaCalendar className="text-6xl text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">暂无活动，点击右上角添加</p>
        </div>
      )}
    </div>
  );
}
