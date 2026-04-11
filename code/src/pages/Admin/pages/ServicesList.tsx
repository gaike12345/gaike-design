import { useState, useEffect } from 'react';
import { FaPlus, FaEdit, FaTrash, FaCog } from 'react-icons/fa';
import { api } from '../api';

interface Service {
  id: number;
  title: string;
  description: string;
  icon: string;
  features: string[];
  sort_order: number;
  status: string;
}

const defaultIcons = [
  { value: 'cube', label: '立方体 (3D建模)' },
  { value: 'code', label: '代码 (开发)' },
  { value: 'palette', label: '调色板 (设计)' },
  { value: 'users', label: '用户 (社交)' },
  { value: 'graduation-cap', label: '毕业帽 (教育)' },
];

export default function ServicesList() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const response = await api.get('/services');
      setServices(response.data.data || []);
    } catch (error) {
      console.error('获取服务列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除这个服务项目吗？')) return;
    
    try {
      await api.delete(`/services/${id}`);
      setServices(services.filter(s => s.id !== id));
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败，请重试');
    }
  };

  const toggleStatus = async (service: Service) => {
    const newStatus = service.status === 'active' ? 'inactive' : 'active';
    try {
      await api.put(`/services/${service.id}`, { status: newStatus });
      setServices(services.map(s => s.id === service.id ? { ...s, status: newStatus } : s));
    } catch (error) {
      console.error('更新状态失败:', error);
    }
  };

  const handleSave = async (data: Partial<Service>) => {
    try {
      if (editingService?.id) {
        await api.put(`/services/${editingService.id}`, data);
      } else {
        await api.post('/services', data);
      }
      setShowForm(false);
      setEditingService(null);
      fetchServices();
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">服务管理</h1>
          <p className="text-gray-400 mt-1">管理展示的服务项目</p>
        </div>
        <button
          onClick={() => {
            setEditingService(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-white hover:opacity-90 transition-opacity"
        >
          <FaPlus />
          添加服务
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {services.map(service => (
            <div
              key={service.id}
              className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                    <FaCog className="text-white text-xl" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-bold text-white">{service.title}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        service.status === 'active' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {service.status === 'active' ? '启用' : '停用'}
                      </span>
                    </div>
                    <p className="text-gray-400 mt-2">{service.description}</p>
                    
                    {/* 特性列表 */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {service.features?.map((feature, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-cyan-500/10 text-cyan-400 rounded text-sm"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => toggleStatus(service)}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {service.status === 'active' ? '停用' : '启用'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingService(service);
                      setShowForm(true);
                    }}
                    className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <FaEdit className="text-cyan-400" />
                  </button>
                  <button
                    onClick={() => handleDelete(service.id)}
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

      {!loading && services.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">暂无服务项目，点击右上角添加</p>
        </div>
      )}

      {/* 编辑表单弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F0F1A] rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-white mb-4">
              {editingService ? '编辑服务' : '添加服务'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                const features = (formData.get('features') as string)?.split('\n').map(s => s.trim()).filter(Boolean);
                handleSave({
                  title: formData.get('title') as string,
                  description: formData.get('description') as string,
                  icon: formData.get('icon') as string,
                  features,
                  status: formData.get('status') as string,
                  sort_order: parseInt(formData.get('sort_order') as string) || 0,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-gray-300 mb-2">服务名称 *</label>
                <input
                  name="title"
                  defaultValue={editingService?.title}
                  required
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">描述</label>
                <textarea
                  name="description"
                  defaultValue={editingService?.description}
                  rows={3}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">图标</label>
                <select
                  name="icon"
                  defaultValue={editingService?.icon || 'cube'}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  {defaultIcons.map(icon => (
                    <option key={icon.value} value={icon.value}>{icon.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-300 mb-2">服务特性（每行一个）</label>
                <textarea
                  name="features"
                  defaultValue={editingService?.features?.join('\n')}
                  rows={4}
                  placeholder="角色建模&#10;场景建模&#10;产品可视化"
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 mb-2">排序</label>
                  <input
                    name="sort_order"
                    type="number"
                    defaultValue={editingService?.sort_order || 0}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 mb-2">状态</label>
                  <select
                    name="status"
                    defaultValue={editingService?.status || 'active'}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="active">启用</option>
                    <option value="inactive">停用</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingService(null);
                  }}
                  className="flex-1 px-4 py-2 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-white hover:opacity-90 transition-opacity"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
