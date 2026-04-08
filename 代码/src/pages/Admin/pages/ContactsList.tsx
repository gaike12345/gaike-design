import { useState, useEffect } from 'react';
import { FaEnvelope, FaPhone, FaWeixin, FaSearch, FaTrash } from 'react-icons/fa';
import { api } from '../api';

interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
  wechat: string;
  service_type: string;
  message: string;
  status: string;
  created_at: string;
}

export default function ContactsList() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    try {
      const response = await api.get('/contact');
      setContacts(response.data.data || []);
    } catch (error) {
      console.error('获取咨询列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除这条咨询记录吗？')) return;
    
    try {
      await api.delete(`/contact/${id}`);
      setContacts(contacts.filter(c => c.id !== id));
      if (selectedContact?.id === id) {
        setSelectedContact(null);
      }
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败，请重试');
    }
  };

  const markAsRead = async (contact: Contact) => {
    if (contact.status === 'read') return;
    
    try {
      await api.put(`/contact/${contact.id}`, { status: 'read' });
      setContacts(contacts.map(c => c.id === contact.id ? { ...c, status: 'read' } : c));
    } catch (error) {
      console.error('更新状态失败:', error);
    }
  };

  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.message?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || contact.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getServiceTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      '3D建模': 'bg-blue-500/20 text-blue-400',
      '应用开发': 'bg-purple-500/20 text-purple-400',
      '原画设计': 'bg-pink-500/20 text-pink-400',
      '学习交友': 'bg-green-500/20 text-green-400',
      '教育咨询': 'bg-orange-500/20 text-orange-400',
    };
    return colors[type] || 'bg-gray-500/20 text-gray-400';
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">咨询管理</h1>
        <p className="text-gray-400 mt-1">查看和处理用户咨询</p>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索姓名、邮箱或内容..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-orange-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-orange-500"
        >
          <option value="all">全部状态</option>
          <option value="pending">待处理</option>
          <option value="read">已读</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 列表 */}
          <div className="lg:col-span-1 space-y-3">
            {filteredContacts.map(contact => (
              <div
                key={contact.id}
                onClick={() => {
                  setSelectedContact(contact);
                  markAsRead(contact);
                }}
                className={`p-4 rounded-xl cursor-pointer transition-all ${
                  selectedContact?.id === contact.id
                    ? 'bg-orange-500/20 border border-orange-500/50'
                    : 'bg-white/5 border border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white truncate">{contact.name}</span>
                      {contact.status === 'pending' && (
                        <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm truncate mt-1">{contact.message}</p>
                  </div>
                  <span className={`flex-shrink-0 px-2 py-1 text-xs rounded ${getServiceTypeColor(contact.service_type)}`}>
                    {contact.service_type}
                  </span>
                </div>
                <p className="text-gray-500 text-xs mt-2">
                  {new Date(contact.created_at).toLocaleString('zh-CN')}
                </p>
              </div>
            ))}

            {!loading && filteredContacts.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                暂无咨询记录
              </div>
            )}
          </div>

          {/* 详情 */}
          <div className="lg:col-span-2">
            {selectedContact ? (
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white">{selectedContact.name}</h2>
                    <span className={`inline-block mt-2 px-3 py-1 text-sm rounded-full ${getServiceTypeColor(selectedContact.service_type)}`}>
                      {selectedContact.service_type}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className={`px-3 py-1 text-sm rounded-full ${
                      selectedContact.status === 'read' 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-orange-500/20 text-orange-400'
                    }`}>
                      {selectedContact.status === 'read' ? '已读' : '待处理'}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* 联系方式 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {selectedContact.email && (
                      <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                        <FaEnvelope className="text-blue-400" />
                        <div>
                          <p className="text-gray-400 text-xs">邮箱</p>
                          <p className="text-white">{selectedContact.email}</p>
                        </div>
                      </div>
                    )}
                    {selectedContact.phone && (
                      <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                        <FaPhone className="text-green-400" />
                        <div>
                          <p className="text-gray-400 text-xs">电话</p>
                          <p className="text-white">{selectedContact.phone}</p>
                        </div>
                      </div>
                    )}
                    {selectedContact.wechat && (
                      <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                        <FaWeixin className="text-green-500" />
                        <div>
                          <p className="text-gray-400 text-xs">微信</p>
                          <p className="text-white">{selectedContact.wechat}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 咨询内容 */}
                  <div>
                    <h3 className="text-gray-400 text-sm mb-2">咨询内容</h3>
                    <div className="p-4 bg-white/5 rounded-lg">
                      <p className="text-white whitespace-pre-wrap">{selectedContact.message}</p>
                    </div>
                  </div>

                  {/* 时间 */}
                  <p className="text-gray-500 text-sm">
                    提交时间：{new Date(selectedContact.created_at).toLocaleString('zh-CN')}
                  </p>

                  {/* 操作 */}
                  <div className="flex gap-3 pt-4 border-t border-white/10">
                    <button
                      onClick={() => handleDelete(selectedContact.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                    >
                      <FaTrash />
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-12 border border-white/10 text-center">
                <FaEnvelope className="text-4xl text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400">选择左侧的咨询记录查看详情</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
